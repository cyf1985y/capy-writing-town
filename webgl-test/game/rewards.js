// v17 星星兌換：家長自訂的實體獎勵（最多 3 個），孩子用「各字最佳星數加總」來換。
// 星星是推導值（由作品算），這裡只記「獎勵」和「兌換紀錄」，不改作品、不改獎勵帳本。
// 存在 localStorage `capy_rewards_<profileId>`；兌換紀錄存名稱與星數的快照，之後改獎勵不影響舊紀錄；紀錄永不刪。
export const rewardsKey = profileId => 'capy_rewards_' + profileId;
export const MAX_ACTIVE = 3;
export const TITLE_MAX = 20;

const newId = p => p + '_' + (globalThis.crypto?.randomUUID?.() ?? Date.now().toString(36) + Math.random().toString(36).slice(2, 10));
const isInt = n => Number.isInteger(n) && n >= 1;
export const emptyRewards = () => ({ version: 1, rewards: [], redemptions: [] });

/** 把讀進來的東西整理成合法結構；壞掉的項目丟掉（不丟錯） */
export function normalizeRewards(obj) {
  const out = emptyRewards();
  if (!obj || typeof obj !== 'object') return out;
  for (const r of Array.isArray(obj.rewards) ? obj.rewards : []) if (r && typeof r.id === 'string' && typeof r.title === 'string' && isInt(r.cost)) out.rewards.push({ id: r.id, title: r.title, cost: r.cost, updatedAt: String(r.updatedAt || ''), archived: r.archived === true });
  for (const x of Array.isArray(obj.redemptions) ? obj.redemptions : []) if (x && typeof x.id === 'string' && isInt(x.cost)) out.redemptions.push({ id: x.id, rewardId: String(x.rewardId ?? ''), title: String(x.title ?? ''), cost: x.cost, redeemedAt: String(x.redeemedAt || '') });
  return out;
}
export function loadRewards(key) { try { return normalizeRewards(JSON.parse(localStorage.getItem(key) || 'null')); } catch { return emptyRewards(); } }
export function saveRewards(key, data) { try { localStorage.setItem(key, JSON.stringify(data)); return true; } catch { return false; } }

/**
 * 由總星數與獎勵資料算出狀態（純函式）。
 * total＝目前總星數；maxTotal＝全部寫字任務都 3 星的星數；balance 可以是負的（合併備份後超支＝預支）。
 */
export function rewardState({ total, maxTotal, data }) {
  const active = data.rewards.filter(r => !r.archived), spent = data.redemptions.reduce((s, x) => s + x.cost, 0), balance = total - spent, maxBalance = maxTotal - spent;
  return { total, maxTotal, spent, balance, maxBalance, advance: Math.max(0, -balance), canAdd: active.length < MAX_ACTIVE, overLimit: active.length > MAX_ACTIVE,
    items: active.map(r => ({ ...r, canRedeem: balance >= r.cost, unreachable: maxBalance < r.cost, need: Math.max(0, r.cost - balance) })) };
}

/** 孩子端那一行字；回傳 null＝不顯示 */
export function childStatus(st) {
  if (!st.items.length) return null;
  const ok = st.items.filter(r => r.canRedeem);
  if (ok.length) return `可以換${ok.reduce((a, b) => (b.cost > a.cost ? b : a)).title}了！請爸爸媽媽幫忙`;
  if (st.balance < 0) return st.maxBalance >= 0 ? `已經先換過了，再拿 ${-st.balance} 顆星就補回來` : null;
  const r = st.items.reduce((a, b) => (b.cost < a.cost ? b : a));
  return st.maxBalance >= r.cost ? `再 ${r.need} 顆可以換${r.title}` : '星星都收集完了！';
}

const cleanTitle = t => String(t ?? '').trim().slice(0, TITLE_MAX);
function check(title, cost, maxTotal) {
  if (!title) return '請輸入獎勵名稱';
  if (!isInt(cost) || cost > maxTotal) return `星數請填 1 到 ${maxTotal} 的整數`;
  return null;
}
/** 以下操作都回傳 { data, error }；有 error 時 data 不變。now 可注入（測試用）。 */
export function addReward(data, { title, cost }, { maxTotal, now = new Date() }) {
  title = cleanTitle(title);
  if (data.rewards.filter(r => !r.archived).length >= MAX_ACTIVE) return { data, error: `最多 ${MAX_ACTIVE} 個獎勵` };
  const error = check(title, cost, maxTotal); if (error) return { data, error };
  return { data: { ...data, rewards: [...data.rewards, { id: newId('rw'), title, cost, updatedAt: now.toISOString(), archived: false }] } };
}
export function editReward(data, id, { title, cost }, { maxTotal, now = new Date() }) {
  title = cleanTitle(title);
  const error = data.rewards.some(r => r.id === id && !r.archived) ? check(title, cost, maxTotal) : '找不到這個獎勵'; if (error) return { data, error };
  return { data: { ...data, rewards: data.rewards.map(r => (r.id === id ? { ...r, title, cost, updatedAt: now.toISOString() } : r)) } };
}
/** 刪除＝封存（紀錄留著） */
export function archiveReward(data, id, { now = new Date() } = {}) {
  if (!data.rewards.some(r => r.id === id && !r.archived)) return { data, error: '找不到這個獎勵' };
  return { data: { ...data, rewards: data.rewards.map(r => (r.id === id ? { ...r, archived: true, updatedAt: now.toISOString() } : r)) } };
}
export function redeemReward(data, id, { total, now = new Date() }) {
  const r = data.rewards.find(x => x.id === id && !x.archived); if (!r) return { data, error: '找不到這個獎勵' };
  const spent = data.redemptions.reduce((s, x) => s + x.cost, 0);
  if (total - spent < r.cost) return { data, error: '星星還不夠' };
  return { data: { ...data, redemptions: [...data.redemptions, { id: newId('rd'), rewardId: r.id, title: r.title, cost: r.cost, redeemedAt: now.toISOString() }] } };
}

/** 備份還原用的合併：兌換紀錄依 id 聯集；獎勵依 id 合併，同 id 取 updatedAt 較新的（一樣新就留本機的）。 */
export function mergeRewards(cur, inc) {
  const a = normalizeRewards(cur), b = normalizeRewards(inc), rewards = a.rewards.map(r => ({ ...r })), at = new Map(rewards.map((r, i) => [r.id, i]));
  for (const r of b.rewards) { const i = at.get(r.id); if (i == null) { at.set(r.id, rewards.length); rewards.push({ ...r }); } else if (r.updatedAt > rewards[i].updatedAt) rewards[i] = { ...r }; }
  const have = new Set(a.redemptions.map(x => x.id));
  return { version: 1, rewards, redemptions: [...a.redemptions, ...b.redemptions.filter(x => !have.has(x.id))] };
}
/** 給 backup.js 用：兩邊都是 localStorage 的字串；備份那份壞掉就維持本機的 */
export function mergeRewardsJSON(curStr, incStr) {
  let inc; try { inc = JSON.parse(incStr); } catch { return curStr; }
  let cur = null; try { cur = JSON.parse(curStr ?? 'null'); } catch { /* 本機壞掉就當空的 */ }
  return JSON.stringify(mergeRewards(cur, inc));
}

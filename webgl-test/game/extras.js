// v50 額外內容的存檔與規則（只管資料，不碰畫面；比照 shop.js、rewards.js）：
// - 區域全三星彩蛋：哪些課已經慶祝過。
// - 朋友首次互動禮物：每位朋友只送一次（星星或一件配件）。
// - 額外星星：禮物的星星只記在 gifts[object].stars（單一來源）；bonusStars 留給之後的來源（魔王關）。
// 存在 localStorage `capy_extras_<profileId>`：
//   { version:1, mastery:{<lesson>:{at}}, gifts:{<resident object>:{at,stars,itemId}}, bonusStars:[{id,kind,stars,at}] }
// 不認得的頂層欄位原樣保留（之後階段向前相容）。設計文件：docs/plans/2026-11-12-phase1-area-mastery-and-friend-gifts.md
export const extrasKey = profileId => 'capy_extras_' + profileId;
export const emptyExtras = () => ({ version: 1, mastery: {}, gifts: {}, bonusStars: [] });
const isObj = o => !!o && typeof o === 'object' && !Array.isArray(o);
const starOk = n => Number.isInteger(n) && n >= 1 && n <= 5;

/** 把讀進來的東西整理成合法結構；壞掉的項目丟掉（不丟錯） */
export function normalizeExtras(obj) {
  const out = emptyExtras();
  if (!isObj(obj)) return out;
  for (const [k, v] of Object.entries(obj)) if (!(k in out)) out[k] = v; // 之後階段的欄位（boss／season／quests）原樣保留
  if (isObj(obj.mastery)) for (const [l, v] of Object.entries(obj.mastery)) if (/^\d+$/.test(l) && isObj(v)) out.mastery[l] = { at: String(v.at || '') };
  if (isObj(obj.gifts)) for (const [who, g] of Object.entries(obj.gifts)) {
    if (!isObj(g)) continue;
    const itemId = typeof g.itemId === 'string' && g.itemId ? g.itemId : null, stars = !itemId && starOk(g.stars) ? g.stars : 0;
    if (!itemId && !stars) continue; // 兩種都沒有＝壞資料，當作沒領過
    out.gifts[who] = { at: String(g.at || ''), stars, itemId };
  }
  const seen = new Map();
  for (const b of Array.isArray(obj.bonusStars) ? obj.bonusStars : []) {
    if (!isObj(b) || typeof b.id !== 'string' || !b.id || typeof b.kind !== 'string' || !starOk(b.stars)) continue;
    const r = { id: b.id, kind: b.kind, stars: b.stars, at: String(b.at || '') }, old = seen.get(r.id);
    if (!old || (r.at && r.at < old.at)) seen.set(r.id, r);
  }
  out.bonusStars = [...seen.values()];
  return out;
}
export function loadExtras(key) { try { return normalizeExtras(JSON.parse(localStorage.getItem(key) || 'null')); } catch { return emptyExtras(); } }
export function saveExtras(key, data) { try { localStorage.setItem(key, JSON.stringify(data)); return true; } catch { return false; } }

/** 額外星星合計：朋友送的＋其他來源 */
export function bonusTotal(data) {
  return Object.values(data.gifts).reduce((s, g) => s + (g.stars || 0), 0) + data.bonusStars.reduce((s, b) => s + b.stars, 0);
}

/** 每個寫字任務最高星數都是 3 的課（回傳 lesson 數字陣列，照 order 順序）。best＝stars.js 的 bestStars() */
export function masteredLessons({ order, modes, best }) {
  const out = [];
  for (const id of order) { const m = modes[id], ids = m?.writingTaskIds ?? []; if (ids.length && ids.every(t => best.get(t) === 3)) out.push(m.lesson); }
  return out;
}
/** 全三星但還沒慶祝過的課 */
export const pendingMastery = (data, mastered) => mastered.filter(l => !data.mastery[String(l)]);
export function markMastery(data, lessons, now = new Date()) {
  const mastery = { ...data.mastery }; for (const l of lessons) if (!mastery[String(l)]) mastery[String(l)] = { at: now.toISOString() };
  return { ...data, mastery };
}

/**
 * 決定第 index 位朋友（album.residents 的索引）的首次禮物。
 * cfg＝extras.json 的 gifts；ownedIds＝已經有的配件；catalogIds＝目錄裡有的配件（null＝沒有商店）。
 */
export function planGift({ index, cfg, ownedIds = [], catalogIds = null, rand = Math.random }) {
  const itemId = cfg?.items?.[String(index)];
  if (typeof itemId === 'string' && catalogIds?.includes(itemId) && !ownedIds.includes(itemId)) return { stars: 0, itemId };
  const [a, b] = Array.isArray(cfg?.stars) && cfg.stars.length === 2 && cfg.stars.every(starOk) ? cfg.stars : [1, 2];
  return { stars: rand() < 0.5 ? a : b, itemId: null };
}
/** 領禮物；已領過回傳 null（不重複給） */
export function claimGift(data, object, gift, now = new Date()) {
  if (data.gifts[object]) return null;
  const itemId = typeof gift?.itemId === 'string' && gift.itemId ? gift.itemId : null, stars = !itemId && starOk(gift?.stars) ? gift.stars : 0;
  if (!itemId && !stars) return null;
  return { ...data, gifts: { ...data.gifts, [object]: { at: now.toISOString(), stars, itemId } } };
}

/** 備份還原用的合併：mastery、gifts 依鍵聯集，同鍵整筆留本機的（一位朋友只算一份禮物）；bonusStars 依 id 聯集 */
export function mergeExtras(cur, inc) {
  const a = normalizeExtras(cur), b = normalizeExtras(inc);
  return normalizeExtras({ ...b, ...a, mastery: { ...b.mastery, ...a.mastery }, gifts: { ...b.gifts, ...a.gifts }, bonusStars: [...a.bonusStars, ...b.bonusStars.filter(x => !a.bonusStars.some(y => y.id === x.id))] });
}
/** 給 backup.js 用：兩邊都是 localStorage 的字串；備份那份壞掉就維持本機的 */
export function mergeExtrasJSON(curStr, incStr) {
  let inc; try { inc = JSON.parse(incStr); } catch { return curStr; }
  if (!isObj(inc)) return curStr;
  let cur = null; try { cur = JSON.parse(curStr ?? 'null'); } catch { /* 本機壞掉就當空的 */ }
  return JSON.stringify(mergeExtras(cur, inc));
}

/** extras.json 的台詞：每句 zy 數量要等於非標點字數，不合的丟掉。回傳 { lines, dropped } */
const PUNCT = /[！!？?，。]/; // 和 writing-panel.js 的 wordHTML 同一組標點（標點不佔注音位置）
export const lineOk = l => isObj(l) && typeof l.t === 'string' && Array.isArray(l.zy) && [...l.t].filter(c => !PUNCT.test(c)).length === l.zy.length && l.zy.every(z => typeof z === 'string' && z);
export function validLines(lines) {
  const all = Array.isArray(lines) ? lines : [], ok = all.filter(lineOk);
  return { lines: ok, dropped: all.length - ok.length };
}

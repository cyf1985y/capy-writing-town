// v50 額外內容的存檔與規則（只管資料，不碰畫面；比照 shop.js、rewards.js）：
// - 區域全三星彩蛋：哪些課已經慶祝過。
// - 朋友首次互動禮物：每位朋友只送一次（星星或一件配件）。
// - 額外星星：禮物的星星只記在 gifts[object].stars（單一來源）；bonusStars 留給之後的來源（魔王關）。
// 存在 localStorage `capy_extras_<profileId>`：
//   { version:1, mastery:{<lesson>:{at}}, gifts:{<resident object>:{at,stars,itemId}}, bonusStars:[{id,kind,stars,at}] }
// 不認得的頂層欄位原樣保留（之後階段向前相容）。設計文件：docs/plans/2026-11-12-phase1-area-mastery-and-friend-gifts.md
export const extrasKey = profileId => 'capy_extras_' + profileId;
export const emptyExtras = () => ({ version: 1, mastery: {}, gifts: {}, bonusStars: [], boss: { cleared: 0, history: [] }, season: { current: null, currentAt: '', unlocked: {} }, quests: {}, repeat: {}, strokes: {} });
export const BOSS_STAGES = 8;
const intIn = (n, a, b) => Number.isInteger(n) && n >= a && n <= b;
const isObj = o => !!o && typeof o === 'object' && !Array.isArray(o);
const starOk = n => Number.isInteger(n) && n >= 1 && n <= 5;
export const SEASON_ID = /^[a-z_]+$/;

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
  // v51 守門員：cleared 0..8；history 依 stage 去重（留較早的）
  const b = isObj(obj.boss) ? obj.boss : {}, hs = new Map();
  for (const h of Array.isArray(b.history) ? b.history : []) {
    if (!isObj(h) || !intIn(h.stage, 1, BOSS_STAGES)) continue;
    const r = { stage: h.stage, at: String(h.at || ''), chars: (Array.isArray(h.chars) ? h.chars : []).filter(c => typeof c === 'string'), perfect: intIn(h.perfect, 0, 5) ? h.perfect : 0 }, old = hs.get(r.stage);
    if (!old || (r.at && r.at < old.at)) hs.set(r.stage, r);
  }
  out.boss = { cleared: intIn(b.cleared, 0, BOSS_STAGES) ? b.cleared : 0, history: [...hs.values()].sort((x, y) => x.stage - y.stage) };
  // 用星星紀錄補回關數：v50 的備份合併會留本機的 boss、卻把對方的 boss:k 星星併進來（關數倒退）。boss:1..k 都在就表示真的過了第 k 關
  let k = out.boss.cleared; const ids = new Map(out.bonusStars.map(x => [x.id, x]));
  while (k < BOSS_STAGES && ids.has('boss:' + (k + 1))) { k += 1; if (!hs.has(k)) out.boss.history.push({ stage: k, at: ids.get('boss:' + k).at, chars: [], perfect: 0 }); }
  if (k > out.boss.cleared) { out.boss.cleared = k; out.boss.history.sort((x, y) => x.stage - y.stage); }
  // v52 季節：current 只檢查格式（季節存不存在由套用時檢查，設定檔可能暫時讀不到）
  const se = isObj(obj.season) ? obj.season : {};
  out.season = { current: typeof se.current === 'string' && SEASON_ID.test(se.current) ? se.current : null, currentAt: String(se.currentAt || ''), unlocked: {} };
  if (isObj(se.unlocked)) for (const [id, v] of Object.entries(se.unlocked)) if (SEASON_ID.test(id) && isObj(v)) out.season.unlocked[id] = { at: String(v.at || '') };
  if (isObj(obj.quests)) for (const [id, q] of Object.entries(obj.quests)) {
    if (!SEASON_ID.test(id) || !isObj(q)) continue;
    const chars = {}; if (isObj(q.chars)) for (const [c, n] of Object.entries(q.chars)) if ([...c].length === 1 && Number.isInteger(n) && n >= 1) chars[c] = Math.min(n, 9999);
    out.quests[id] = { firstAt: String(q.firstAt || ''), runs: intIn(q.runs, 0, 9999) ? q.runs : 0, chars };
  }
  out.repeat = cleanRepeat(obj.repeat);
  out.strokes = cleanStrokes(obj.strokes);
  return out;
}
export function loadExtras(key) { try { return normalizeExtras(JSON.parse(localStorage.getItem(key) || 'null')); } catch { return emptyExtras(); } }
export function saveExtras(key, data) { try { localStorage.setItem(key, JSON.stringify(data)); return true; } catch { return false; } }

/** 額外星星合計：朋友送的＋其他來源（守門員、季節小考）＋v56 三星字重複練習 */
export function bonusTotal(data) {
  return Object.values(data.gifts).reduce((s, g) => s + (g.stars || 0), 0) + data.bonusStars.reduce((s, b) => s + b.stars, 0) + repeatTotal(data);
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
  return normalizeExtras({ ...b, ...a, mastery: { ...b.mastery, ...a.mastery }, gifts: { ...b.gifts, ...a.gifts }, bonusStars: [...a.bonusStars, ...b.bonusStars.filter(x => !a.bonusStars.some(y => y.id === x.id))],
    boss: { cleared: Math.max(a.boss.cleared, b.boss.cleared), history: [...a.boss.history, ...b.boss.history.filter(x => !a.boss.history.some(y => y.stage === x.stage))] }, // 守門員：關數取大的、紀錄依關聯集（星星 boss:k 依 id 聯集，每關只有一筆）
    season: mergeSeason(a.season, b.season), quests: mergeQuests(a.quests, b.quests), repeat: mergeRepeat(a.repeat, b.repeat), strokes: mergeStrokes(a.strokes, b.strokes) });
}
/** v52：解鎖依鍵聯集（留較早的）；current 留 currentAt 較新的，一樣新留本機的 */
function mergeSeason(a, b) {
  const unlocked = { ...b.unlocked }; for (const [id, v] of Object.entries(a.unlocked)) if (!unlocked[id] || !unlocked[id].at || (v.at && v.at < unlocked[id].at)) unlocked[id] = v;
  const useB = b.currentAt > a.currentAt; return { current: useB ? b.current : a.current, currentAt: useB ? b.currentAt : a.currentAt, unlocked };
}
/** v52：同一季 runs 取大的、每字次數取大的、firstAt 取較早的（非空） */
function mergeQuests(a, b) {
  const out = { ...b };
  for (const [id, q] of Object.entries(a)) {
    const o = out[id]; if (!o) { out[id] = q; continue; }
    const chars = { ...o.chars }; for (const [c, n] of Object.entries(q.chars)) chars[c] = Math.max(n, chars[c] || 0);
    const fa = [q.firstAt, o.firstAt].filter(Boolean).sort()[0] ?? '';
    out[id] = { firstAt: fa, runs: Math.max(q.runs, o.runs), chars };
  }
  return out;
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

// ======== v51 守門員總複習關 ========
/** 第 k 關的門檻：學會的字數 ≥ ⌈k × n ÷ stages⌉ */
export const bossThresholds = (n, stages = BOSS_STAGES) => Array.from({ length: stages }, (_, i) => Math.ceil(((i + 1) * n) / stages));
/** { cleared, next, need, ready, done }：next＝下一關（全部過完是 null）；need＝還要學幾個字（0＝可以挑戰） */
export function bossStatus({ data, passedCount, total, stages = BOSS_STAGES }) {
  const cleared = Math.min(data.boss.cleared, stages), done = cleared >= stages, next = done ? null : cleared + 1;
  const need = done ? 0 : Math.max(0, bossThresholds(total, stages)[next - 1] - passedCount);
  return { cleared, stages, next, need, ready: !done && need === 0, done };
}
/** 過第 stage 關：只能是下一關；進度、紀錄、星星在同一個物件（呼叫端一次存檔）。不合規則回傳 null */
export function clearBossStage(data, { stage, chars = [], perfect = 0, stars = 5, now = new Date() }) {
  if (stage !== data.boss.cleared + 1 || !intIn(stage, 1, BOSS_STAGES) || !starOk(stars)) return null;
  const at = now.toISOString();
  return { ...data, boss: { cleared: stage, history: [...data.boss.history.filter(h => h.stage !== stage), { stage, at, chars: chars.slice(), perfect }] },
    bonusStars: [...data.bonusStars.filter(b => b.id !== 'boss:' + stage), { id: 'boss:' + stage, kind: 'boss', stars, at }] };
}

// ======== v52 季節主題與季節小考（設計：docs/plans/2026-11-12-phase3-seasons-and-side-quests.md） ========
const posInt = n => Number.isInteger(n) && n >= 1;
/** 讀 seasons.json 後整理：不合法的季節整個丟掉；小考詞不夠就 quest＝null（季節照常）。回傳 { seasons, dropped } */
export function validSeasons(cfg) {
  const out = [], seen = new Set(); let dropped = 0;
  for (const s of Array.isArray(cfg?.seasons) ? cfg.seasons : []) {
    const p = s?.particles, ok = isObj(s) && typeof s.id === 'string' && SEASON_ID.test(s.id) && !seen.has(s.id) && typeof s.label === 'string' && s.label
      && posInt(s.unlockStars) && posInt(s.price) && s.price < s.unlockStars
      && isObj(p) && (p.kind === 'snow' || p.kind === 'petal') && intIn(p.n, 0, 20) && intIn(p.nSmall, 0, 20)
      && (s.tint == null || typeof s.tint === 'string') && (s.bgFilter == null || typeof s.bgFilter === 'string');
    if (!ok) { dropped++; continue; }
    seen.add(s.id);
    const q = s.quest; let quest = null;
    if (isObj(q) && Array.isArray(q.at) && q.at.length === 2 && q.at.every(Number.isFinite) && intIn(q.questions, 3, 5) && starOk(q.stars)) {
      const words = (Array.isArray(q.words) ? q.words : []).filter(w => isObj(w) && typeof w.char === 'string' && [...w.char].length === 1 && typeof w.zhuyin === 'string' && w.zhuyin && typeof w.word === 'string' && w.word.includes(w.char));
      if (words.length >= q.questions) quest = { ...q, words };
    }
    out.push({ ...s, short: typeof s.short === 'string' && s.short ? s.short : s.label, icon: typeof s.icon === 'string' ? s.icon : '', unlockLine: lineOk(s.unlockLine) ? s.unlockLine : null, quest });
  }
  return { seasons: out, dropped };
}
export const seasonItemId = id => 'season:' + id;
/** 已解鎖＝星數解鎖記過，或商店買過 */
export const seasonUnlocked = ({ data, shop, id }) => !!data.season.unlocked[id] || !!shop?.purchases?.some(p => p.itemId === seasonItemId(id));
/** 總星數達到門檻、而且兩條路都還沒解鎖的季節記下來；沒有新的回傳 null */
export function markSeasonUnlocks(data, { seasons, total, shop, now = new Date() }) {
  const add = seasons.filter(s => total >= s.unlockStars && !seasonUnlocked({ data, shop, id: s.id })).map(s => s.id);
  if (!add.length) return null;
  const unlocked = { ...data.season.unlocked }; for (const id of add) unlocked[id] = { at: now.toISOString() };
  return { ...data, season: { ...data.season, unlocked } };
}
/** 換季節（id＝null＝不用季節）；和目前一樣回傳 null。呼叫端先確認 id 已解鎖 */
export function setSeason(data, id, now = new Date()) {
  if (id !== null && !(typeof id === 'string' && SEASON_ID.test(id))) return null;
  if (data.season.current === id) return null;
  return { ...data, season: { ...data.season, current: id, currentAt: now.toISOString() } };
}
/** 做完一次季節小考：次數、每字次數；第一次（bonusStars 還沒有 quest:<id>）才給星。回傳 { data, first } */
export function finishQuest(data, { id, chars = [], stars = 3, now = new Date() }) {
  const at = now.toISOString(), old = data.quests[id] ?? { firstAt: '', runs: 0, chars: {} }, cs = { ...old.chars };
  for (const c of chars) cs[c] = Math.min((cs[c] || 0) + 1, 9999);
  const bid = 'quest:' + id, first = starOk(stars) && !data.bonusStars.some(b => b.id === bid);
  return { first, data: { ...data, quests: { ...data.quests, [id]: { firstAt: old.firstAt || at, runs: Math.min(old.runs + 1, 9999), chars: cs } }, bonusStars: first ? [...data.bonusStars, { id: bid, kind: 'quest', stars, at }] : data.bonusStars } };
}

// ======== v56 三星字重複練習給星（設計：docs/plans/2026-11-13-lesson-limit-repeat-stars-clip-size.md §4） ========
// repeat：{ 'YYYY-MM-DD': { <taskId>: { <作品 id 前 8 碼>: 星數 } } }。每一筆給過的星都記下來，總數＝相加（和設定檔、上限無關）；上限只在給的時候檢查。
const DAY = /^\d{4}-\d{2}-\d{2}$/;
export const repeatKey = artifactId => String(artifactId ?? '').slice(0, 8);
function cleanRepeat(r) {
  const out = {};
  if (!isObj(r)) return out;
  for (const [day, tasks] of Object.entries(r)) {
    if (!DAY.test(day) || !isObj(tasks)) continue;
    const t2 = {};
    for (const [tid, arts] of Object.entries(tasks)) {
      if (!tid || !isObj(arts)) continue;
      const a2 = {}; for (const [k, n] of Object.entries(arts)) if (k.length >= 1 && k.length <= 36 && starOk(n)) a2[k] = n;
      if (Object.keys(a2).length) t2[tid] = a2;
    }
    if (Object.keys(t2).length) out[day] = t2;
  }
  return out;
}
const sumObj = o => Object.values(o ?? {}).reduce((s, n) => s + n, 0);
/** 重複練習拿到的星星合計（不套上限） */
export const repeatTotal = data => Object.values(data.repeat ?? {}).reduce((s, tasks) => s + Object.values(tasks).reduce((t, arts) => t + sumObj(arts), 0), 0);
/** 某一天的 { day: 全部字加總, char: 這個字加總 } */
export function repeatDay(data, day, taskId = null) {
  const tasks = data.repeat?.[day] ?? {};
  return { day: Object.values(tasks).reduce((t, arts) => t + sumObj(arts), 0), char: taskId ? sumObj(tasks[taskId]) : 0 };
}
/** 合併：日期、字、作品鍵三層聯集；同一個作品鍵兩邊都有就留本機的 */
function mergeRepeat(a, b) {
  const out = structuredClone(b ?? {});
  for (const [day, tasks] of Object.entries(a ?? {})) for (const [tid, arts] of Object.entries(tasks)) out[day] = { ...out[day], [tid]: { ...out[day]?.[tid], ...arts } };
  return out;
}
/** extras.json 的 repeat：不合法回傳 null（功能關閉） */
export function validRepeat(c) {
  const ok = isObj(c) && intIn(c.stars, 1, 5) && intIn(c.perChar, 1, 50) && intIn(c.perDay, 1, 500) && c.stars <= c.perChar && c.perChar <= c.perDay;
  return ok ? { stars: c.stars, perChar: c.perChar, perDay: c.perDay } : null;
}
/**
 * 給一次重複練習星。呼叫端先確認：這個字之前已經 3 星、這次也 3 星。
 * 回傳 { data, add, leftChar, leftDay }；給不了 data＝null、reason＝'dup'（這個作品給過了）｜'char'（這個字今天滿了）｜'day'（今天全部滿了）｜'bad'。
 */
export function awardRepeat(data, { taskId, artifactId, day, cfg }) {
  const key = repeatKey(artifactId);
  if (!cfg || !taskId || !key || !DAY.test(day)) return { data: null, reason: 'bad' };
  if (data.repeat?.[day]?.[taskId]?.[key] != null) return { data: null, reason: 'dup' };
  const { day: sum, char: n } = repeatDay(data, day, taskId), add = Math.min(cfg.stars, cfg.perChar - n, cfg.perDay - sum);
  if (add <= 0) return { data: null, reason: n >= cfg.perChar ? 'char' : 'day' };
  const repeat = { ...data.repeat, [day]: { ...data.repeat?.[day], [taskId]: { ...data.repeat?.[day]?.[taskId], [key]: add } } };
  return { data: { ...data, repeat }, add, leftChar: cfg.perChar - n - add, leftDay: cfg.perDay - sum - add };
}

// ======== v57 基本筆畫練習（設計：docs/plans/2026-11-13-basic-strokes-practice.md §4.4） ========
// strokes：{ <筆畫 id>: { firstAt, runs, good, lastGood } }。lastGood＝最近一次描得好的本機日期（和星星分開記：星星拿滿了也照樣記）
export const STROKE_ID = /^[a-z]+$/;
const localDayOf = d => d.toLocaleDateString('sv');
function cleanStrokes(o) {
  const out = {};
  if (!isObj(o)) return out;
  for (const [id, v] of Object.entries(o)) {
    if (!STROKE_ID.test(id) || !isObj(v) || !intIn(v.runs, 0, 9999) || !intIn(v.good, 0, 9999) || v.good > v.runs) continue;
    out[id] = { firstAt: String(v.firstAt || ''), runs: v.runs, good: v.good, lastGood: typeof v.lastGood === 'string' && DAY.test(v.lastGood) ? v.lastGood : '' };
  }
  return out;
}
/** 合併：runs、good 取大的，firstAt 取較早的非空值，lastGood 取較晚的 */
function mergeStrokes(a, b) {
  const out = { ...b };
  for (const [id, x] of Object.entries(a ?? {})) {
    const y = out[id]; if (!y) { out[id] = x; continue; }
    const runs = Math.max(x.runs, y.runs);
    out[id] = { firstAt: [x.firstAt, y.firstAt].filter(Boolean).sort()[0] ?? '', runs, good: Math.min(runs, Math.max(x.good, y.good)), lastGood: x.lastGood > y.lastGood ? x.lastGood : y.lastGood };
  }
  return out;
}
/** 練完一輪（走到「看字」）：runs+1；描得好 good+1、lastGood＝今天 */
export function finishStroke(data, { id, good = false, now = new Date() }) {
  if (!STROKE_ID.test(id)) return data;
  const at = now.toISOString(), old = data.strokes?.[id] ?? { firstAt: '', runs: 0, good: 0, lastGood: '' };
  const runs = Math.min(old.runs + 1, 9999), g = good ? Math.min(old.good + 1, runs) : old.good;
  return { ...data, strokes: { ...data.strokes, [id]: { firstAt: old.firstAt || at, runs, good: g, lastGood: good ? localDayOf(now) : old.lastGood } } };
}
/** 筆畫練習的重複星用的 taskId（和寫字任務 W0011／NA001 分開） */
export const strokeTaskId = id => 'stroke:' + id;
/** 某一天筆畫練習拿到的星星合計 */
export const strokeStarsOn = (data, day) => Object.entries(data.repeat?.[day] ?? {}).filter(([t]) => t.startsWith('stroke:')).reduce((s, [, arts]) => s + sumObj(arts), 0);

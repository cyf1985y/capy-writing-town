// v72「得到過的只會多不會少」（設計 docs/plans/2026-11-17-appstore-app-web-flavors.md §4）。純函式，Node 可測。
// 圖鑑朋友、地圖區域彩度、影子朋友、雲都是「這一課寫到幾成」即時算的；App 改了分組以後，同一課的字不一樣了，
// 舊存檔裡已經解鎖的朋友、已經變彩色的區域可能變回去。所以把每一課「曾經寫到幾成」記在 extras.earned，顯示時取較大的。
// extras.earned＝{ v:1, lessons:{ '<課號>': 0..1 }, legacyAt:'' }；legacyAt＝App 上一次用舊（課本）分組補算的時間，'' 表示還沒補算。
const isObj = o => !!o && typeof o === 'object' && !Array.isArray(o);
export const emptyEarned = () => ({ v: 1, lessons: {}, legacyAt: '' });

/** 整理成合法結構：課號是整數字串、值 0～1（壞的丟掉） */
export function normalizeEarned(e) {
  const out = emptyEarned(); if (!isObj(e)) return out;
  if (isObj(e.lessons)) for (const [l, r] of Object.entries(e.lessons)) if (/^\d+$/.test(l) && typeof r === 'number' && Number.isFinite(r) && r > 0) out.lessons[l] = Math.min(1, r);
  out.legacyAt = typeof e.legacyAt === 'string' && e.legacyAt.length <= 40 ? e.legacyAt : '';
  return out;
}
/** 備份合併：每一課取較大的；legacyAt 取較新的 */
export function mergeEarned(a0, b0) {
  const a = normalizeEarned(a0), b = normalizeEarned(b0), lessons = { ...b.lessons };
  for (const [l, r] of Object.entries(a.lessons)) lessons[l] = Math.max(r, lessons[l] ?? 0);
  return { v: 1, lessons, legacyAt: a.legacyAt > b.legacyAt ? a.legacyAt : b.legacyAt };
}
/** 每一課寫到幾成：groups＝{ '<課號>': [taskId…] }；passed＝已過關的 taskId（陣列或 Set） */
export function lessonRatios(groups, passed) {
  const set = passed instanceof Set ? passed : new Set(passed), out = {};
  for (const [l, ids] of Object.entries(groups)) out[l] = ids.length ? ids.filter(id => set.has(id)).length / ids.length : 0;
  return out;
}
/** 契約的分組：{ '<課號>': writingTaskIds } */
export const contractGroups = contract => Object.fromEntries(Object.values(contract.modes).filter(m => Number.isInteger(m.lesson)).map(m => [String(m.lesson), m.writingTaskIds]));
/** App 契約的 legacyGroups（題號範圍 [起, 迄]）展開成題號：allIds＝題庫所有題號。範圍壞掉的那一課略過 */
export function expandLegacy(legacyGroups, allIds) {
  const out = {}; if (!isObj(legacyGroups)) return out;
  for (const [l, r] of Object.entries(legacyGroups)) {
    if (!/^\d+$/.test(l) || !Array.isArray(r) || r.length !== 2 || typeof r[0] !== 'string' || typeof r[1] !== 'string' || r[0] > r[1]) continue;
    out[l] = allIds.filter(id => id >= r[0] && id <= r[1]);
  }
  return out;
}
/** 把新的完成度併進 earned（取大）；回傳 { earned, changed } */
export function raiseEarned(earned0, ratios) {
  const e = normalizeEarned(earned0); let changed = false;
  for (const [l, r] of Object.entries(ratios)) if (r > 0 && r > (e.lessons[l] ?? 0)) { e.lessons[l] = Math.min(1, r); changed = true; }
  return { earned: e, changed };
}
/** 顯示用：這一課的完成度＝max(目前, 記下來的) */
export const floorRatio = (earned, lesson, current) => Math.max(current, earned?.lessons?.[String(lesson)] ?? 0);

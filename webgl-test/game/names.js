// v60 朋友名字（家長面板改，每個主題分開）：設計 docs/plans/2026-11-14-friend-names-and-card-label.md §2.2
// 存在 localStorage `capy_names`（整台裝置共用，不分課程）：{ version:1, themes:{ <主題 id>:{ <朋友代號>: 名字 } } }，只存改過的。
export const NAMES_KEY = 'capy_names', NAME_MAX = 4;
const isObj = o => !!o && typeof o === 'object' && !Array.isArray(o);
const graphemes = s => {
  try { if (typeof Intl !== 'undefined' && Intl.Segmenter) return [...new Intl.Segmenter('zh-Hant', { granularity: 'grapheme' }).segment(s)].map(x => x.segment); } catch { /* 舊瀏覽器 */ }
  return Array.from(s);
};
/** 清理名字：去掉控制字元和 <>&"'、前後空白，最多 NAME_MAX 個「看到的字」；全空回傳 '' */
export function cleanName(s) {
  if (typeof s !== 'string') return '';
  const t = s.replace(/[\u0000-\u001f\u007f<>&"']/g, '').trim();
  return graphemes(t).slice(0, NAME_MAX).join('').trim();
}
export const emptyNames = () => ({ version: 1, themes: {} });
export function normalizeNames(obj) {
  const out = emptyNames();
  if (!isObj(obj) || !isObj(obj.themes)) return out;
  for (const [th, m] of Object.entries(obj.themes)) {
    if (!isObj(m)) continue; const r = {};
    for (const [who, n] of Object.entries(m)) { const c = cleanName(n); if (c) r[who] = c; }
    if (Object.keys(r).length) out.themes[th] = r;
  }
  return out;
}
export function loadNames() { try { return normalizeNames(JSON.parse(localStorage.getItem(NAMES_KEY) || 'null')); } catch { return emptyNames(); } }
export function saveNames(data) { try { localStorage.setItem(NAMES_KEY, JSON.stringify(data)); return true; } catch { return false; } }
export const namesFor = (data, theme) => ({ ...(normalizeNames(data).themes[theme] ?? {}) });
/** 改一位朋友的名字；清理後是空的＝刪掉（恢復主題預設）。回傳新物件 */
export function setName(data, theme, object, name) {
  const d = normalizeNames(data), c = cleanName(name), m = { ...(d.themes[theme] ?? {}) };
  if (c) m[object] = c; else delete m[object];
  const themes = { ...d.themes }; if (Object.keys(m).length) themes[theme] = m; else delete themes[theme];
  return { version: 1, themes };
}
/** 備份還原：依「主題＋朋友」聯集，兩邊都有時留本機的；備份壞掉就維持本機 */
export function mergeNamesJSON(curStr, incStr) {
  let inc; try { inc = JSON.parse(incStr); } catch { return curStr; }
  let cur = null; try { cur = JSON.parse(curStr ?? 'null'); } catch { /* 本機壞掉就當空的 */ }
  const a = normalizeNames(cur), b = normalizeNames(inc), themes = {};
  for (const th of new Set([...Object.keys(a.themes), ...Object.keys(b.themes)])) themes[th] = { ...(b.themes[th] ?? {}), ...(a.themes[th] ?? {}) };
  return JSON.stringify({ version: 1, themes });
}

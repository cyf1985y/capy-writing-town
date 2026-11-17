// v72 備份檔裡的課程代號（設計 docs/plans/2026-11-17-appstore-app-web-flavors.md §6）。純函式，Node 可測。
// 裝置裡的資料不改名：課程 2 的存檔後綴還是 '@nani_1a'、curriculumId 還是 'nani_grade1_vol1'。
// 備份檔是給人看得到的檔案，匯出時換成中性的新代號（toPublic），還原時換回來（toInternal）。舊備份（內部代號）原樣通過。
// 課程 1 沒有後綴，curriculumId 'grade1_vol1' 本來就中性，不用換。
export const PAIRS = { suffix: [['@nani_1a', '@course2']], curriculum: [['nani_grade1_vol1', 'course2_grade1_vol1']], book: [['kangxuan_1a', 'course1'], ['nani_1a', 'course2']],
  // 課程 2 第 9 位朋友的代號：存在 extras.gifts、商店的 outfits、朋友名字（兩個課程共用）的鍵裡（Codex 審核 r1）
  object: [['Resident_extra_nani_7', 'Resident_extra_course2_7']] };

const plain = o => !!o && typeof o === 'object' && !Array.isArray(o);
/** dir＝0：內部→新代號；1：新代號→內部 */
const pick = (list, dir) => list.map(p => (dir ? [p[1], p[0]] : p));
const endSwap = (s, list, dir) => { if (typeof s !== 'string') return s; for (const [a, b] of pick(list, dir)) if (s.endsWith(a)) return s.slice(0, -a.length) + b; return s; };
const exact = (s, list, dir) => { for (const [a, b] of pick(list, dir)) if (s === a) return b; return s; };
/** profileId：後綴在最後面 */
const prof = (s, dir) => endSwap(s, PAIRS.suffix, dir);
/** progressKey＝`${profileId}:${taskId}`（taskId 不會有冒號） */
function progKey(s, dir) { if (typeof s !== 'string') return s; const i = s.lastIndexOf(':'); return i < 0 ? s : prof(s.slice(0, i), dir) + s.slice(i); }
/** rewardKey＝四段各自 encodeURIComponent，用冒號接起來（store.js rewardKeyFor）：第 1 段 profileId、第 2 段 curriculumId */
function rewKey(s, dir) {
  if (typeof s !== 'string') return s; const parts = s.split(':'); if (parts.length !== 4) return s;
  try {
    const p0 = prof(decodeURIComponent(parts[0]), dir), p1 = exact(decodeURIComponent(parts[1]), PAIRS.curriculum, dir);
    return [encodeURIComponent(p0), encodeURIComponent(p1), parts[2], parts[3]].join(':');
  } catch { return s; }
}
/** localStorage 值裡的朋友代號：JSON 物件的鍵、或剛好等於代號的字串都換（遞迴）。不是 JSON 或沒有要換的就原樣回傳 */
function objectIds(v, dir) {
  if (typeof v !== 'string' || !PAIRS.object.some(p => v.includes(p[dir]))) return v;
  let o; try { o = JSON.parse(v); } catch { return v; }
  const walk = x => Array.isArray(x) ? x.map(walk) : plain(x) ? Object.fromEntries(Object.entries(x).map(([k, y]) => [exact(k, PAIRS.object, dir), walk(y)])) : typeof x === 'string' ? exact(x, PAIRS.object, dir) : x;
  return JSON.stringify(walk(o));
}
/** capy_settings 的 lessonMax 鍵是課程 id：舊 id 換成新 id（新 id 已經有值就留新的） */
function settingsValue(v) {
  if (typeof v !== 'string') return v;
  let o; try { o = JSON.parse(v); } catch { return v; }
  if (!plain(o) || !plain(o.lessonMax)) return v;
  const lm = {}; for (const [k, x] of Object.entries(o.lessonMax)) { const nk = exact(k, PAIRS.book, 0); if (!(nk in lm) || nk === k) lm[nk] = x; }
  return JSON.stringify({ ...o, lessonMax: lm });
}
/**
 * 只複製真的要換的地方，其他照原樣傳下去（同一個物件）。不整份深拷貝：
 * 深拷貝會把資料列裡不能存進資料庫的值（例如函式）默默丟掉，還原時本來會失敗、整個取消的壞資料就會被寫進去（v69 save_safety B6）。
 */
function convert(obj, dir) {
  if (!plain(obj)) return obj;
  const out = { ...obj };
  if (typeof out.profileId === 'string') out.profileId = prof(out.profileId, dir);
  if (plain(out.data)) {
    out.data = { ...out.data };
    for (const n of ['progress', 'artifacts', 'rewardLedger']) {
      if (!Array.isArray(out.data[n])) continue;
      out.data[n] = out.data[n].map(r => {
        if (!plain(r)) return r;
        const pid = typeof r.profileId === 'string' ? prof(r.profileId, dir) : r.profileId;
        const pk = n === 'progress' && typeof r.progressKey === 'string' ? progKey(r.progressKey, dir) : r.progressKey;
        const rw = typeof r.rewardKey === 'string' ? rewKey(r.rewardKey, dir) : r.rewardKey;
        if (pid === r.profileId && pk === r.progressKey && rw === r.rewardKey) return r;
        const x = { ...r }; if ('profileId' in r) x.profileId = pid; if ('progressKey' in r) x.progressKey = pk; if ('rewardKey' in r) x.rewardKey = rw; return x;
      });
    }
  }
  if (plain(out.local)) {
    const local = {};
    for (const [k, v] of Object.entries(out.local)) { const nk = endSwap(k, PAIRS.suffix, dir); local[nk] = objectIds(k === 'capy_settings' && dir === 0 ? settingsValue(v) : v, dir); } // 設定裡的課程 id：遊戲本身新舊都認（parent.js lessonMaxOf），只在匯出時換成新的
    out.local = local;
  }
  return out;
}
/** 匯出前：內部代號 → 新代號 */
export const toPublic = obj => convert(obj, 0);
/** 還原前：新代號 → 內部代號（舊備份本來就是內部代號，原樣通過） */
export const toInternal = obj => convert(obj, 1);

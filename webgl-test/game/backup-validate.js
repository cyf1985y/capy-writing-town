// v69 備份／存檔資料的檢查（純函式，沒有 DOM、沒有 IndexedDB，Node 可測）。
// 設計：docs/plans/2026-11-16-save-safety-backup-tw-appversion.md §B
// 只檢查「缺了會讓遊戲出錯或寫不進資料庫」的欄位；其他補充欄位不管（舊版本存的資料欄位比較少）。
export const BACKUP_FORMAT = 'capy-writing-backup';
export const STORES = ['progress', 'artifacts', 'rewardLedger'];
export const KEY_OF = { progress: 'progressKey', artifacts: 'artifactId', rewardLedger: 'rewardKey' };
// 大小只有一個上限，匯出和還原共用（備份檔的位元組數）。不另外限制筆數、筆畫數、點數：遊戲自己存的每一筆都必須能被還原。
export const LIMITS = { fileBytes: 256 * 1024 * 1024 };

const plain = o => !!o && typeof o === 'object' && !Array.isArray(o);
const num = n => typeof n === 'number' && Number.isFinite(n);
const optNum = n => n === undefined || n === null || num(n);
/** 識別字串（artifactId、taskId、rewardKey、progressKey）：非空、不太長、沒有 HTML 符號和控制字元 */
export const idOk = s => typeof s === 'string' && s !== '' && s.length <= 300 && !/[<>&"\u0000-\u001f]/.test(s);
/** 日期字串：ISO 格式開頭（遊戲存的都是 toISOString()）而且解析得出來。只用 Date.parse 不夠——V8 對亂七八糟的字串也可能解析出數字。 */
export const dateOk = s => typeof s === 'string' && s.length <= 40 && /^\d{4}-\d{2}-\d{2}(T[\d:.]+(Z|[+-]\d{2}:?\d{2})?)?$/.test(s) && Number.isFinite(Date.parse(s));
/** 剛好一個漢字（兩份課程的寫字任務都是單一漢字） */
export const hanOk = s => typeof s === 'string' && /^\p{Script=Han}$/u.test(s);

/** 作品（字卡）：回傳 null＝沒問題，否則回傳原因（字串）。缺的補充欄位不管；有給但型別不對的算壞的。 */
export function artifactProblem(a) {
  if (!plain(a)) return 'not an object';
  if (!idOk(a.artifactId)) return 'bad artifactId';
  if (!idOk(a.taskId)) return 'bad taskId';
  if (!hanOk(a.char)) return 'bad char';
  if (!dateOk(a.createdAt)) return 'bad createdAt';
  if (!Array.isArray(a.drawnPaths)) return 'drawnPaths is not an array';
  for (const pts of a.drawnPaths) {
    if (!Array.isArray(pts)) return 'a path is not an array';
    for (const p of pts) if (!plain(p) || !num(p.x) || !num(p.y)) return 'bad point';
  }
  if (!optNum(a.mistakes) || !optNum(a.hints)) return 'bad mistakes/hints';
  const m = a.meta;
  if (m !== undefined && m !== null) {
    if (!plain(m)) return 'bad meta';
    if (!optNum(m.level) || !optNum(m.panelOpenMs) || !optNum(m.durationMs)) return 'bad meta number';
    if (m.mistakesByStroke !== undefined && m.mistakesByStroke !== null && (!Array.isArray(m.mistakesByStroke) || !m.mistakesByStroke.every(optNum))) return 'bad meta.mistakesByStroke';
    if (m.glyphSource !== undefined && m.glyphSource !== null && typeof m.glyphSource !== 'string') return 'bad meta.glyphSource';
  }
  return null;
}
export const validArtifact = a => artifactProblem(a) === null;

/** 進度：progressKey 要等於 `${profileId}:${taskId}`（和 store.js 的 progressKey() 同一個算法） */
export function progressProblem(r, profileId) {
  if (!plain(r)) return 'not an object';
  if (!idOk(r.taskId)) return 'bad taskId';
  if (typeof r.status !== 'string' || r.status === '') return 'bad status';
  if (r.progressKey !== `${profileId}:${r.taskId}`) return 'bad progressKey';
  return null;
}
export const validProgress = (r, profileId) => progressProblem(r, profileId) === null;

export function ledgerProblem(r) {
  if (!plain(r)) return 'not an object';
  if (!idOk(r.rewardKey)) return 'bad rewardKey';
  if (r.taskId !== undefined && r.taskId !== null && typeof r.taskId !== 'string') return 'bad taskId';
  return null;
}
export const validLedger = r => ledgerProblem(r) === null;

const PROBLEM = { progress: progressProblem, artifacts: a => artifactProblem(a), rewardLedger: r => ledgerProblem(r) };
/** 一筆資料有沒有問題（給讀檔、匯出時用）：profileId 也要對 */
export function rowProblem(store, r, profileId) {
  const p = PROBLEM[store](r, profileId); if (p) return p;
  return r.profileId === profileId ? null : 'bad profileId';
}

/**
 * 整份備份的檢查。不碰資料庫、不改傳進來的物件。
 * 格式不對、是別的孩子的、混了別的孩子的資料、整份都是壞的 → 丟錯（訊息開頭 BACKUP_FORMAT／BACKUP_PROFILE／BACKUP_ROWS）。
 * 個別壞掉的資料列挑出來不還原：回傳 { rows, skipped, reasons }。
 */
export function validateBackup(obj, { profileId }) {
  if (!plain(obj) || obj.format !== BACKUP_FORMAT || obj.version !== 1 || !plain(obj.data)) throw new Error('BACKUP_FORMAT');
  if (obj.profileId !== profileId) throw new Error('BACKUP_PROFILE:' + obj.profileId);
  const rows = {}, skipped = {}, reasons = []; let good = 0, bad = 0;
  for (const n of STORES) if (!Array.isArray(obj.data[n])) throw new Error('BACKUP_ROWS:' + n);
  for (const n of STORES) for (const r of obj.data[n]) if (plain(r) && typeof r.profileId === 'string' && r.profileId !== profileId) throw new Error('BACKUP_ROWS:' + n); // 別的孩子的資料：整份拒絕
  for (const n of STORES) {
    rows[n] = []; skipped[n] = 0; const seen = new Set();
    obj.data[n].forEach((r, i) => {
      let why = rowProblem(n, r, profileId);
      if (!why && seen.has(r[KEY_OF[n]])) why = 'duplicate key';
      if (why) { skipped[n] += 1; bad += 1; if (reasons.length < 20) reasons.push(`${n}[${i}]: ${why}`); return; }
      seen.add(r[KEY_OF[n]]); rows[n].push(r); good += 1;
    });
  }
  if (!good && bad) throw new Error('BACKUP_ROWS:all');
  return { rows, skipped, reasons };
}

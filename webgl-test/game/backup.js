// v14 存檔保護：
// - requestPersist()：請瀏覽器把本站資料標成「持久保存」（Safari 一般網頁 7 天沒開可能清掉資料；加到主畫面的 App 不受此限）。
// - exportBackup() / importBackup()：把 IndexedDB 三個 store（本 profile）＋複習紀錄、家長設定打包成 JSON 檔；
//   還原採「合併」：作品、獎勵帳本只補沒有的；進度同一字以「已通過」優先，其次較新的。不會刪掉現有資料。
//   v17：家長自訂獎勵（localStorage）由呼叫端給 localMerge 合併函式，備份格式 version 仍是 1。
// 注意：iPhone「加入主畫面」後的 App 和 Safari 是兩份分開的存檔，搬家要用備份檔。
import { BACKUP_FORMAT, STORES, LIMITS, validateBackup, rowProblem } from './backup-validate.js?v=72'; // v69
export { BACKUP_FORMAT, LIMITS };
const wrap = req => new Promise((res, rej) => { req.onsuccess = () => res(req.result); req.onerror = () => rej(req.error); });
const done = tx => new Promise((res, rej) => { tx.oncomplete = () => res(); tx.onerror = () => rej(tx.error); tx.onabort = () => rej(tx.error || new Error('IDB_TX_ABORT')); });

import { shareTextFile } from './app-env.js?v=72';
import { bumpIndexGen } from './artifact-index.js?v=72';
import { toPublic, toInternal } from './backup-codes.js?v=72'; // v72：備份檔裡用中性的課程代號
export async function requestPersist() {
  const st = navigator.storage;
  const info = { supported: !!st?.persist, persisted: false, standalone: matchMedia?.('(display-mode: standalone)').matches || navigator.standalone === true, usage: null };
  try { if (st?.persisted) info.persisted = await st.persisted(); if (!info.persisted && st?.persist) info.persisted = await st.persist(); } catch { /* 不支援就算了 */ }
  try { if (st?.estimate) { const e = await st.estimate(); info.usage = e.usage ?? null; } } catch { /* ignore */ }
  return info;
}

export async function exportBackup(db, { profileId, localKeys = [] }) {
  const tx = db.transaction(STORES, 'readonly'), data = {}, skipped = {};
  await Promise.all(STORES.map(async n => { data[n] = await wrap(tx.objectStore(n).index('profileId').getAll(profileId)); }));
  // v69：壞掉的資料列不放進備份（這樣做出來的備份一定通過還原時的檢查）；資料庫裡的不動
  for (const n of STORES) { const all = data[n]; data[n] = all.filter(r => rowProblem(n, r, profileId) === null); skipped[n] = all.length - data[n].length; }
  const local = {}; for (const k of localKeys) { try { const v = localStorage.getItem(k); if (v != null) local[k] = v; } catch { /* ignore */ } }
  const out = toPublic({ format: BACKUP_FORMAT, version: 1, exportedAt: new Date().toISOString(), profileId, data, local }); // v72：內部代號 → 新代號
  Object.defineProperty(out, 'skipped', { value: skipped, enumerable: false }); // 不寫進檔案，只給呼叫端記 log
  return out;
}

const rank = r => (r.status === 'passed' ? 2 : 1);
const stamp = r => r.updatedAt || r.completedAt || r.startedAt || '';

/**
 * 回傳 { added: {progress, artifacts, rewardLedger}, kept, local, skipped: {progress, artifacts, rewardLedger}, skippedLocal }。
 * v69：先整份檢查（validateBackup，格式不對就丟錯、什麼都不寫；個別壞掉的資料列挑掉不還原），再用一個交易寫入；
 * 交易中任何例外都明確 abort（前面寫的一起回滾）——以前例外發生時交易沒有取消，會留下半套資料。
 */
export async function importBackup(db, obj0, { profileId, localKeys = [], localMerge = {} }) {
  const obj = toInternal(obj0); // v72：新代號 → 內部代號（舊備份原樣）
  const v = validateBackup(obj, { profileId });
  const tx = db.transaction(STORES, 'readwrite'), added = { progress: 0, artifacts: 0, rewardLedger: 0 }; let kept = 0;
  const finished = done(tx); finished.catch(() => {}); // 先掛上監聽：abort 之後才 await 也不會變成沒人處理的 rejection
  try {
    for (const n of STORES) {
      const s = tx.objectStore(n), key = s.keyPath;
      for (const r of v.rows[n]) {
        const cur = await wrap(s.get(r[key]));
        if (!cur) { s.put(r); added[n] += 1; continue; }
        if (n === 'progress' && (rank(r) > rank(cur) || (rank(r) === rank(cur) && stamp(r) > stamp(cur)))) { s.put(r); added[n] += 1; } else kept += 1;
      }
    }
  } catch (e) { try { tx.abort(); } catch { /* 已經結束或已經取消 */ } await finished.catch(() => {}); throw e; }
  await finished;
  await bumpIndexGen(); // v71：還原之後作品的摘要快取整個重做（設計 docs/plans/2026-11-16-longterm-perf.md §3.2）
  // localStorage 的鍵：預設「本機已有就不覆蓋」；localMerge[k](本機字串|null, 備份字串) 有給就用它合併（v17 獎勵與兌換紀錄）。舊備份沒有的鍵就跳過。
  // v69：備份裡的值不是字串 → 跳過那個鍵（不另外限制長度：匯出得出來的就要還原得回去，大小只看整個檔的上限）
  const src = obj.local && typeof obj.local === 'object' && !Array.isArray(obj.local) ? obj.local : {};
  let local = 0, skippedLocal = 0; for (const k of localKeys) if (src[k] != null) {
    if (typeof src[k] !== 'string') { skippedLocal += 1; continue; }
    try {
      const cur = localStorage.getItem(k), next = localMerge[k] ? localMerge[k](cur, src[k]) : cur ?? src[k];
      if (next != null && next !== cur) { localStorage.setItem(k, next); local += 1; }
    } catch { /* ignore */ }
  }
  return { added, kept, local, skipped: v.skipped, skippedLocal };
}

/** 存成檔案：iOS 有分享面板就用（可存到「檔案」或 AirDrop），否則一般下載 */
export async function saveBackupFile(obj, log) {
  // v54：網站版行為不變；App 裡改用原生存檔＋分享（外掛拿不到時回傳 unavailable，不假裝成功）
  // v69：大小上限和還原共用（LIMITS.fileBytes）。超過就不存檔——存出一份之後還原不了的備份，比當下告訴家長更糟。
  const text = JSON.stringify(obj), bytes = new Blob([text]).size;
  if (bytes > LIMITS.fileBytes) { const e = new Error('BACKUP_TOO_BIG:' + bytes); e.bytes = bytes; throw e; }
  return shareTextFile(`小一寫字備份_${obj.exportedAt.slice(0, 10)}.json`, text, { log });
}

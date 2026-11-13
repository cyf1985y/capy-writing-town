// v14 存檔保護：
// - requestPersist()：請瀏覽器把本站資料標成「持久保存」（Safari 一般網頁 7 天沒開可能清掉資料；加到主畫面的 App 不受此限）。
// - exportBackup() / importBackup()：把 IndexedDB 三個 store（本 profile）＋複習紀錄、家長設定打包成 JSON 檔；
//   還原採「合併」：作品、獎勵帳本只補沒有的；進度同一字以「已通過」優先，其次較新的。不會刪掉現有資料。
//   v17：家長自訂獎勵（localStorage）由呼叫端給 localMerge 合併函式，備份格式 version 仍是 1。
// 注意：iPhone「加入主畫面」後的 App 和 Safari 是兩份分開的存檔，搬家要用備份檔。
const STORES = ['progress', 'artifacts', 'rewardLedger'];
export const BACKUP_FORMAT = 'capy-writing-backup';
const wrap = req => new Promise((res, rej) => { req.onsuccess = () => res(req.result); req.onerror = () => rej(req.error); });
const done = tx => new Promise((res, rej) => { tx.oncomplete = () => res(); tx.onerror = () => rej(tx.error); tx.onabort = () => rej(tx.error || new Error('IDB_TX_ABORT')); });

import { shareTextFile } from './app-env.js?v=57';
export async function requestPersist() {
  const st = navigator.storage;
  const info = { supported: !!st?.persist, persisted: false, standalone: matchMedia?.('(display-mode: standalone)').matches || navigator.standalone === true, usage: null };
  try { if (st?.persisted) info.persisted = await st.persisted(); if (!info.persisted && st?.persist) info.persisted = await st.persist(); } catch { /* 不支援就算了 */ }
  try { if (st?.estimate) { const e = await st.estimate(); info.usage = e.usage ?? null; } } catch { /* ignore */ }
  return info;
}

export async function exportBackup(db, { profileId, localKeys = [] }) {
  const tx = db.transaction(STORES, 'readonly'), data = {};
  await Promise.all(STORES.map(async n => { data[n] = await wrap(tx.objectStore(n).index('profileId').getAll(profileId)); }));
  const local = {}; for (const k of localKeys) { try { const v = localStorage.getItem(k); if (v != null) local[k] = v; } catch { /* ignore */ } }
  return { format: BACKUP_FORMAT, version: 1, exportedAt: new Date().toISOString(), profileId, data, local };
}

const rank = r => (r.status === 'passed' ? 2 : 1);
const stamp = r => r.updatedAt || r.completedAt || r.startedAt || '';

/** 回傳 { added: {progress, artifacts, rewardLedger}, kept, local }；格式不對就丟錯（不寫入任何東西） */
export async function importBackup(db, obj, { profileId, localKeys = [], localMerge = {} }) {
  if (obj?.format !== BACKUP_FORMAT || obj.version !== 1 || !obj.data) throw new Error('BACKUP_FORMAT');
  if (obj.profileId !== profileId) throw new Error('BACKUP_PROFILE:' + obj.profileId);
  for (const n of STORES) if (!Array.isArray(obj.data[n]) || obj.data[n].some(r => r?.profileId !== profileId)) throw new Error('BACKUP_ROWS:' + n);
  const tx = db.transaction(STORES, 'readwrite'), added = { progress: 0, artifacts: 0, rewardLedger: 0 }; let kept = 0;
  for (const n of STORES) {
    const s = tx.objectStore(n), key = s.keyPath;
    for (const r of obj.data[n]) {
      const cur = await wrap(s.get(r[key]));
      if (!cur) { s.put(r); added[n] += 1; continue; }
      if (n === 'progress' && (rank(r) > rank(cur) || (rank(r) === rank(cur) && stamp(r) > stamp(cur)))) { s.put(r); added[n] += 1; } else kept += 1;
    }
  }
  await done(tx);
  // localStorage 的鍵：預設「本機已有就不覆蓋」；localMerge[k](本機字串|null, 備份字串) 有給就用它合併（v17 獎勵與兌換紀錄）。舊備份沒有的鍵就跳過。
  let local = 0; for (const k of localKeys) if (obj.local?.[k] != null) { try {
    const cur = localStorage.getItem(k), next = localMerge[k] ? localMerge[k](cur, obj.local[k]) : cur ?? obj.local[k];
    if (next != null && next !== cur) { localStorage.setItem(k, next); local += 1; }
  } catch { /* ignore */ } }
  return { added, kept, local };
}

/** 存成檔案：iOS 有分享面板就用（可存到「檔案」或 AirDrop），否則一般下載 */
export async function saveBackupFile(obj, log) {
  // v54：網站版行為不變；App 裡改用原生存檔＋分享（外掛拿不到時回傳 unavailable，不假裝成功）
  return shareTextFile(`甜點寫字備份_${obj.exportedAt.slice(0, 10)}.json`, JSON.stringify(obj), { log });
}

// 存檔（第 4 步）：IndexedDB `capy_writing`，三個 store（progress / artifacts / rewardLedger）在同一個 readwrite 交易寫入；
// localStorage 只放摘要。rewardKey 格式照 contract_v1.json（各段 encodeURIComponent，冒號分隔，不含 attemptId／mode／contentVersion）。
// 同 rewardKey 已在 ledger → 不重發（rewardNew=false）。缺字形資料的字寫 status=deferred，不算 passed。
// crashAt（測試用）：'afterArtifact' | 'afterProgress' | 'afterLedger'（交易內，reload 後交易被 IndexedDB 丟棄，三者一致回滾）、
//                   'afterCommit'（交易 complete 後、效果播放前 reload，驗證重開由帳本推導且不重發）。
export const DB_NAME = 'capy_writing';
export const DB_VERSION = 1;
export const SCHEMA_VERSION = 1;
const STORES = ['progress', 'artifacts', 'rewardLedger'];

export function rewardKeyFor(contract, profileId, taskId, kind = 'char_written') {
  return [profileId, contract.reward.curriculumId, taskId, kind].map(encodeURIComponent).join(':');
}
export const progressKey = (profileId, taskId) => `${profileId}:${taskId}`;

export function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('progress')) { const s = db.createObjectStore('progress', { keyPath: 'progressKey' }); s.createIndex('profileId', 'profileId'); }
      if (!db.objectStoreNames.contains('artifacts')) { const s = db.createObjectStore('artifacts', { keyPath: 'artifactId' }); s.createIndex('profileId', 'profileId'); s.createIndex('taskId', 'taskId'); }
      if (!db.objectStoreNames.contains('rewardLedger')) { const s = db.createObjectStore('rewardLedger', { keyPath: 'rewardKey' }); s.createIndex('profileId', 'profileId'); }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error || new Error('IDB_OPEN_FAILED'));
    req.onblocked = () => reject(new Error('IDB_OPEN_BLOCKED'));
  });
}
const wrap = req => new Promise((res, rej) => { req.onsuccess = () => res(req.result); req.onerror = () => rej(req.error); });

export class Store {
  constructor({ contract, contentSha256, profileId, mode = 'demo3', crashAt = null, log = () => {} }) {
    Object.assign(this, { contract, contentSha256, profileId, mode, crashAt, log }); this.db = null;
    // v55：題庫換成中性版本後，契約的 legacySha256（舊題庫的雜湊，只增不減）寫的紀錄照樣算數
    this.okSha = new Set([contentSha256, ...(contract?.content?.legacySha256 ?? [])]);
  }
  isCurrent(r) { return !!r && this.okSha.has(r.contentSha256); }
  async open() { this.db = await openDB(); return this; }

  /** 讀出本 profile 的全部狀態（重開時推導固定終點用） */
  async load() {
    const tx = this.db.transaction(STORES, 'readonly');
    const [progress, artifacts, ledger] = await Promise.all([
      wrap(tx.objectStore('progress').index('profileId').getAll(this.profileId)),
      wrap(tx.objectStore('artifacts').index('profileId').getAll(this.profileId)),
      wrap(tx.objectStore('rewardLedger').index('profileId').getAll(this.profileId)),
    ]);
    const current = r => this.isCurrent(r); // 題庫版本不同的舊紀錄不計入；legacySha256 列出的舊版本照樣算（v55）
    const passedTaskIds = progress.filter(r => current(r) && r.status === 'passed').map(r => r.taskId);
    return { progress, artifacts, ledger, passedTaskIds, committedRewardKeys: ledger.map(l => l.rewardKey) };
  }

  _baseProgress(task, attemptId, status, extra = {}) {
    return { progressKey: progressKey(this.profileId, task.id), schemaVersion: SCHEMA_VERSION, contentVersion: this.contract.content.contentVersion, contentSha256: this.contentSha256,
      profileId: this.profileId, mode: this.mode, taskId: task.id, attemptId, status, passedAt: null, hintCount: 0, mistakeCount: 0, artifactId: null, artifactSaveStatus: 'none', rewardKey: null, rewardCommittedAt: null, updatedAt: new Date().toISOString(), ...extra };
  }

  /** 開始寫：status=in_progress（已 passed 的字重玩不降級，只更新 attemptId） */
  async markInProgress(task, attemptId) {
    const tx = this.db.transaction(['progress'], 'readwrite'); const s = tx.objectStore('progress');
    const old = await wrap(s.get(progressKey(this.profileId, task.id)));
    const rec = old && old.status === 'passed' && this.isCurrent(old) ? { ...old, attemptId, lastReplayAt: new Date().toISOString() } : this._baseProgress(task, attemptId, 'in_progress');
    s.put(rec); await txDone(tx); return rec;
  }
  /** 缺字形資料：status=deferred，不算 passed、不發獎勵 */
  async markDeferred(task, attemptId, reason) {
    const tx = this.db.transaction(['progress'], 'readwrite'); const s = tx.objectStore('progress');
    const old = await wrap(s.get(progressKey(this.profileId, task.id)));
    if (old && old.status === 'passed' && this.isCurrent(old)) { await txDone(tx); return old; }
    const rec = this._baseProgress(task, attemptId, 'deferred', { deferredReason: reason }); s.put(rec); await txDone(tx); return rec;
  }

  /**
   * 完成一字：作品、進度、獎勵帳本 **同一交易**。回傳 {rewardKey, rewardNew, progress}。
   * 同 rewardKey 已 committed → rewardNew=false（重送事件、重玩都不重發）。
   */
  async commitCompletion(task, artifact) {
    if (!this.contract.modes[this.mode].writingTaskIds.includes(task.id)) throw new Error('TASK_NOT_IN_WHITELIST:' + task.id);
    const key = rewardKeyFor(this.contract, this.profileId, task.id);
    const now = new Date().toISOString();
    const tx = this.db.transaction(STORES, 'readwrite');
    const sA = tx.objectStore('artifacts'), sP = tx.objectStore('progress'), sL = tx.objectStore('rewardLedger');
    const result = { rewardKey: key, rewardNew: false, progress: null };
    const run = async () => {
      sA.put({ ...artifact, profileId: this.profileId, savedAt: now });
      await wrap(sA.get(artifact.artifactId)); // 確認作品已在交易內寫入
      this._crash('afterArtifact', tx);
      const existing = await wrap(sL.get(key));
      const old = await wrap(sP.get(progressKey(this.profileId, task.id)));
      const rec = this._baseProgress(task, artifact.attemptId, 'passed', {
        passedAt: old?.status === 'passed' && this.isCurrent(old) ? old.passedAt : now, // 首次通過時間不被重玩覆蓋
        hintCount: artifact.hints ?? 0, mistakeCount: artifact.mistakes ?? 0, artifactId: artifact.artifactId, artifactSaveStatus: 'saved',
        rewardKey: key, rewardCommittedAt: existing ? existing.committedAt : now, replayCount: (old?.replayCount ?? 0) + (old?.status === 'passed' ? 1 : 0),
      });
      sP.put(rec); await wrap(sP.get(rec.progressKey));
      result.progress = rec;
      this._crash('afterProgress', tx);
      if (!existing) { sL.add({ rewardKey: key, profileId: this.profileId, taskId: task.id, rewardKind: 'char_written', committedAt: now, artifactId: artifact.artifactId, status: 'committed' }); result.rewardNew = true; }
      this._crash('afterLedger', tx);
    };
    await run();
    await txDone(tx);                 // complete 才算 committed
    this._crash('afterCommit');
    this.writeSummary();
    return result;
  }

  _crash(point, tx = null) {
    if (this.crashAt !== point) return;
    this.log(`CRASH SIMULATION at ${point}: ${tx ? 'abort tx + ' : ''}reloading`);
    sessionStorage.setItem('capy_crash_fired', point);
    // 交易內的中斷：真正的程序崩潰會讓 IndexedDB 丟棄未 commit 的交易；單靠 location.reload() 不夠，
    // 因為 reload 是非同步的，交易在沒有待處理請求時會先自動 commit（實測會留下只寫了作品的半套狀態）。
    // 所以這裡明確 abort 交易再 reload，等價於交易中途斷電。
    if (tx) { try { tx.abort(); } catch { /* ignore */ } }
    location.reload();
    throw new Error('CRASH_SIMULATED:' + point);
  }

  /** localStorage 只放摘要快取（不是真相來源） */
  async writeSummary() {
    try {
      const { passedTaskIds, ledger } = await this.load();
      localStorage.setItem('capy_writing_summary', JSON.stringify({ schemaVersion: SCHEMA_VERSION, profileId: this.profileId, contentSha256: this.contentSha256, passedTaskIds, rewards: ledger.length, updatedAt: new Date().toISOString() }));
    } catch (e) { this.log('summary write failed: ' + e); }
  }
  readSummary() { try { return JSON.parse(localStorage.getItem('capy_writing_summary') || 'null'); } catch { return null; } }
}

export function txDone(tx) {
  return new Promise((res, rej) => { tx.oncomplete = () => res(); tx.onerror = () => rej(tx.error || new Error('IDB_TX_ERROR')); tx.onabort = () => rej(tx.error || new Error('IDB_TX_ABORT')); });
}

/** 測試用：清空本 profile 的資料（不刪整個 DB） */
export async function clearProfile(db, profileId) {
  const tx = db.transaction(STORES, 'readwrite');
  for (const name of STORES) { const s = tx.objectStore(name); const rows = await wrap(s.index('profileId').getAll(profileId)); for (const r of rows) s.delete(r[s.keyPath]); }
  await txDone(tx); localStorage.removeItem('capy_writing_summary');
}

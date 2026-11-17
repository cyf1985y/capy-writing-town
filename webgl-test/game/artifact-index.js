// v71 字卡摘要索引（設計 docs/plans/2026-11-16-longterm-perf.md §3）
// 作品（字卡）每一筆都帶著整個筆跡 drawnPaths，很大；但遊戲大部分地方只用到小欄位（哪個字、幾顆星、哪天寫的…）。
// 這裡把「去掉筆跡的摘要」另外存在一個小資料庫 capy_writing_index，開遊戲只讀摘要，要畫字卡／重播才去主資料庫拿整筆。
// 重點：這個資料庫只是快取——刪掉、讀不到、寫不進去、內容壞掉都沒關係（退回成從主資料庫分批讀，只是慢）。主資料庫 capy_writing 才是真相，這裡只讀它、不寫它。
// 一致性靠三件事：
//   1. 每次都對帳：主資料庫有哪些 artifactId（只讀主鍵，很快）對上記憶體裡有哪些；缺的補、多的刪。
//   2. 快取列拿來用之前再檢查一次（版本、世代、是不是這個孩子的、欄位過不過得了和主資料同一套檢查）；不能用的當成沒有，從主資料庫重做。
//   （快取資料庫用不了的頁面不沿用記憶體裡的摘要：每次對帳都從主資料庫重讀，因為它收不到下面第 3 點的通知。）
//   3. 世代（generation）：清存檔、還原備份之後整個快取作廢重做（bumpIndexGen）。因為對帳只看 id——同一個 id 被刪掉又放回不同內容，光看 id 看不出來。
//      世代的數字和摘要放在同一個資料庫、用同一個交易更新（清空摘要＋數字加 1），所以不管別的分頁什麼時候開、什麼時候讀，都不會把作廢前的摘要當成能用的。
// 壞掉的作品（檢查不過的）只記在這次頁面的記憶體裡，不寫進快取：下次開頁面會重新檢查一次。
// 前提：除了清存檔／還原備份，作品寫進去之後內容不會再變（新作品都是新的 id）。直接改資料庫內容的測試要自己 await bumpIndexGen()。
export const INDEX_DB = 'capy_writing_index', INDEX_DB_VERSION = 2, INDEX_STORE = 'artifactSummary', META_STORE = 'meta', GEN_KEY = 'capy_writing_index_gen', BATCH = 200, OPEN_TIMEOUT_MS = 4000, BUMP_TIMEOUT_MS = 15000;
/** 摘要格式／檢查規則的版本：改了 summarize() 或作品的檢查規則（backup-validate.js artifactProblem）就加 1，舊的快取列會自動重做 */
export const INDEX_FMT = 1;

/** 摘要＝去掉筆跡、記下筆數；其他欄位原樣（純函式，不改傳進來的物件） */
export function summarize(a) {
  const { drawnPaths, ...rest } = a;
  return { ...rest, strokes: Array.isArray(drawnPaths) ? drawnPaths.length : 0 };
}

/** 對帳要做的事（純函式）：keys＝主資料庫現在的主鍵；have＝目前有的（Map 或 Set）。miss 照 keys 的順序 */
export function planSync(keys, have) {
  const want = new Set(keys);
  return { miss: keys.filter(k => !have.has(k)), gone: [...have.keys()].filter(k => !want.has(k)) };
}

/** 快取列能不能用（純函式）：版本、世代、孩子都要對；id 要和裡面的摘要一致；摘要要通過主資料同一套檢查（筆跡以空陣列代入） */
export function usableRow(r, { profileId, gen, problem }) {
  if (!r || typeof r !== 'object' || r.fmt !== INDEX_FMT || r.gen !== gen || r.profileId !== profileId) return false;
  const s = r.s; if (!s || typeof s !== 'object' || Array.isArray(s) || s.artifactId !== r.artifactId || 'drawnPaths' in s || !Number.isInteger(s.strokes) || s.strokes < 0) return false;
  try { return problem({ ...s, drawnPaths: [] }) === null; } catch { return false; }
}

const wrap = req => new Promise((res, rej) => { req.onsuccess = () => res(req.result); req.onerror = () => rej(req.error); });
const done = tx => new Promise((res, rej) => { tx.oncomplete = () => res(); tx.onerror = () => rej(tx.error || new Error('IDB_TX_ERROR')); tx.onabort = () => rej(tx.error || new Error('IDB_TX_ABORT')); });

/** 開快取資料庫；開不起來、被擋住、太久沒回應、少了該有的 store 都算失敗（呼叫端退回只用記憶體） */
function openCache(timeoutMs = OPEN_TIMEOUT_MS) {
  return new Promise((resolve, reject) => {
    let settled = false;
    const ok = db => {
      if (settled) { try { db.close(); } catch { /* ignore */ } return; }
      settled = true; clearTimeout(timer);
      if (!db.objectStoreNames.contains(INDEX_STORE) || !db.objectStoreNames.contains(META_STORE)) { try { db.close(); } catch { /* ignore */ } reject(new Error('INDEX_SCHEMA')); return; }
      resolve(db);
    };
    const fail = e => { if (settled) return; settled = true; clearTimeout(timer); reject(e); };
    const timer = setTimeout(() => fail(new Error('INDEX_OPEN_TIMEOUT')), timeoutMs);
    let req; try { req = indexedDB.open(INDEX_DB, INDEX_DB_VERSION); } catch (e) { fail(e); return; }
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(INDEX_STORE)) db.createObjectStore(INDEX_STORE, { keyPath: 'artifactId' }).createIndex('profileId', 'profileId');
      if (!db.objectStoreNames.contains(META_STORE)) db.createObjectStore(META_STORE, { keyPath: 'key' });
    };
    req.onsuccess = () => ok(req.result);
    req.onerror = () => fail(req.error || new Error('INDEX_OPEN_FAILED'));
    req.onblocked = () => fail(new Error('INDEX_OPEN_BLOCKED'));
  });
}
const genOf = row => (Number.isInteger(row?.value) && row.value >= 0 ? row.value : 0);

// 世代的「退路」部分：正常情況世代數字在快取資料庫裡（見 bumpIndexGen）。只有快取資料庫寫不進去時才用到這兩個：
//   localStorage 的數字（同一台裝置所有分頁共用，寫得進去就夠了）；連 localStorage 也寫不進去時，這個頁面的計數 memGen＋用 BroadcastChannel 通知其他開著的分頁。
let memGen = 0, channel = null;
try { channel = new BroadcastChannel(GEN_KEY); channel.onmessage = () => { memGen += 1; }; channel.unref?.(); /* Node：不要因為這個頻道讓程式不結束 */ } catch { channel = null; }
const lsGen = () => { try { return parseInt(localStorage.getItem(GEN_KEY) || '0', 10) || 0; } catch { return 0; } };
/** 世代裡不在快取資料庫的那一部分（字串）。完整的世代＝`<快取資料庫的數字>:<這個字串>` */
export const indexGen = () => lsGen() + ':' + memGen;

/**
 * 讓整個快取作廢（之後每個分頁下一次對帳都從主資料庫重做）。清存檔、還原備份之後呼叫（要 await）；直接改資料庫內容的測試也要呼叫。
 * 正常：在快取資料庫的一個交易裡「清空所有摘要＋世代數字加 1」——和摘要同一個資料庫、同一個交易，別的分頁不管什麼時候讀都不會拿到作廢前的摘要。回傳 true。
 * 快取資料庫寫不進去（回傳 false）：localStorage 的數字加 1（寫完讀回來確認）；連這個也不行，就這個頁面的計數加 1、廣播給其他開著的分頁、並試著把整個快取資料庫刪掉。
 * 兩種儲存都寫不進去的裝置上，「之後才開的分頁」有極短的時間可能讀到還沒刪掉的舊快取——那種裝置還原備份本身也寫不進去，不再往下處理。
 */
export async function bumpIndexGen() {
  let db = null;
  try {
    db = await openCache(BUMP_TIMEOUT_MS);
    const tx = db.transaction([INDEX_STORE, META_STORE], 'readwrite'), fin = done(tx), meta = tx.objectStore(META_STORE); fin.catch(() => {});
    const cur = await wrap(meta.get('gen'));
    tx.objectStore(INDEX_STORE).clear(); meta.put({ key: 'gen', value: genOf(cur) + 1 });
    await fin; return true;
  } catch { /* 走退路 */ } finally { try { db?.close(); } catch { /* ignore */ } }
  const before = lsGen(); let saved = false;
  try { localStorage.setItem(GEN_KEY, String(before + 1)); saved = lsGen() === before + 1; } catch { /* 下面 */ }
  if (!saved) {
    memGen += 1;
    try { channel?.postMessage('bump'); } catch { /* 沒有別的分頁可通知 */ }
    try { indexedDB.deleteDatabase(INDEX_DB); } catch { /* ignore */ }
  }
  return false;
}

export class ArtifactIndex {
  /**
   * @param {IDBDatabase} o.db        已經開好的主資料庫（capy_writing）；這裡只開 readonly 交易
   * @param {string} o.profileId
   * @param {(row)=>string|null} o.problem  一筆作品有沒有問題（null＝沒問題）；store.js 傳 row => rowProblem('artifacts', row, profileId)
   */
  constructor({ db, profileId, problem, log = () => {} }) {
    Object.assign(this, { db, profileId, problem, log });
    this.map = null;      // artifactId → { bad: false, s: 摘要 } 或 { bad: true, why }；第一次對帳（或世代變了）才從快取資料庫讀進來
    this.gen = null;      // this.map 是在哪個世代建立的（完整的世代字串）
    this.cache = null;    // 快取資料庫；null＝還沒開或不能用
    this.cacheTried = false;
    this.stats = { cache: null, reason: null, gen: null, keys: 0, miss: 0, gone: 0, bad: 0, dropped: 0, syncs: 0, firstMiss: null };
    this._q = Promise.resolve();
  }

  /** 對帳並回傳 { artifacts: 摘要[]（每次都是新的淺拷貝）, bad: 壞掉的 artifactId[], stats }。同時只跑一個（排隊）。onProgress(已處理, 全部) 只在補資料時呼叫 */
  sync(opts = {}) {
    const run = () => this._sync(opts), p = this._q.then(run, run);
    this._q = p.catch(() => {});
    return p;
  }

  /** 照 ids 的順序回傳整筆作品（含筆跡）。不存在的、壞掉的略過；壞掉的同時從摘要裡拿掉（設計 §3.3） */
  async full(ids) {
    const out = [];
    for (let i = 0; i < ids.length; i += BATCH) {
      const part = ids.slice(i, i + BATCH), rows = await this._getMany(part), drop = [];
      rows.forEach((a, j) => {
        if (a === undefined) return;
        const why = this._why(a);
        if (why) { if (this.map) this.map.set(part[j], { bad: true, why }); drop.push(part[j]); return; }
        out.push(a);
      });
      if (drop.length) await this._del(drop);
    }
    return out;
  }

  _why(a) { try { const w = this.problem(a); return w ? String(w) : null; } catch (e) { return 'check failed: ' + (e?.message || e); } }
  _noCache(e) {
    try { this.cache?.close(); } catch { /* ignore */ }
    const first = this.stats.cache !== false;
    this.cache = null; this.stats.cache = false; this.stats.reason = String(e?.message || e);
    if (first) this.log('artifact index: cache unavailable (' + this.stats.reason + '), reading everything from the main database on every load');
  }

  /** 現在的世代（完整字串）。快取能用就讀它裡面的數字（一次很小的讀取）；不能用就是 x */
  async _curGen() {
    if (this.cache) {
      try { return genOf(await wrap(this.cache.transaction([META_STORE], 'readonly').objectStore(META_STORE).get('gen'))) + ':' + indexGen(); }
      catch (e) { this._noCache(e); }
    }
    return 'x:' + indexGen();
  }

  /** 建立記憶體的 Map：世代數字和摘要在同一個交易裡讀（兩者一定對得上）。快取不能用就只用記憶體 */
  async _init() {
    this.map = new Map();
    try {
      if (!this.cache && !this.cacheTried) {
        this.cacheTried = true; this.cache = await openCache();
        this.cache.onversionchange = () => { try { this.cache?.close(); } catch { /* ignore */ } this.cache = null; this.stats.cache = false; this.stats.reason = 'INDEX_CACHE_CLOSED'; }; // 別的分頁要升級或刪掉這個資料庫時讓路
      }
      if (!this.cache) throw new Error(this.stats.reason || 'INDEX_CACHE_CLOSED');
      const tx = this.cache.transaction([INDEX_STORE, META_STORE], 'readonly');
      const [metaRow, rows] = await Promise.all([wrap(tx.objectStore(META_STORE).get('gen')), wrap(tx.objectStore(INDEX_STORE).index('profileId').getAll(this.profileId))]);
      const gen = genOf(metaRow) + ':' + indexGen(), drop = [];
      for (const r of rows) { if (usableRow(r, { profileId: this.profileId, gen, problem: this.problem })) this.map.set(r.artifactId, { bad: false, s: r.s }); else if (r && r.artifactId !== undefined) drop.push(r.artifactId); }
      this.gen = gen; this.stats.gen = gen; this.stats.cache = true; this.stats.reason = null; this.stats.dropped += drop.length;
      if (drop.length) { this.log('artifact index: ' + drop.length + ' cache rows not usable, rebuilding them'); await this._del(drop); }
    } catch (e) {
      this._noCache(e); this.map = new Map(); this.gen = 'x:' + indexGen(); this.stats.gen = this.gen;
    }
  }

  async _sync({ onProgress } = {}) {
    // 什麼時候重建 Map：第一次；世代變了（清過存檔、還原過備份）；或這個頁面用不了快取資料庫——那樣就讀不到別的分頁把世代加 1，
    // 所以不跨次沿用記憶體裡的東西，每次都從主資料庫分批重讀（和 v70 每次整份讀一樣慢，但一定正確）。
    if (!this.map || !this.cache || (await this._curGen()) !== this.gen) await this._init();
    const gen = this.gen;
    const keys = await wrap(this.db.transaction(['artifacts'], 'readonly').objectStore('artifacts').index('profileId').getAllKeys(this.profileId));
    const { miss, gone } = planSync(keys, this.map);
    for (let i = 0; i < miss.length; i += BATCH) { // 分批：第一次建立時記憶體裡不會同時有幾千筆筆跡
      const part = miss.slice(i, i + BATCH), rows = await this._getMany(part), recs = [];
      rows.forEach((a, j) => {
        if (a === undefined) return; // 剛好被刪掉，下次對帳就不在主鍵裡了
        const why = this._why(a);
        if (why) { this.map.set(part[j], { bad: true, why }); return; } // 壞的只記在記憶體
        const s = summarize(a); this.map.set(part[j], { bad: false, s }); recs.push({ artifactId: part[j], profileId: this.profileId, fmt: INDEX_FMT, gen, s });
      });
      await this._put(recs); // 這時世代如果剛被別的分頁加 1：這些列帶的是舊世代，之後沒有人會用
      try { onProgress?.(Math.min(i + BATCH, miss.length), miss.length); } catch { /* 顯示進度失敗不影響對帳 */ }
    }
    if (gone.length) { for (const k of gone) this.map.delete(k); await this._del(gone); }
    const artifacts = [], bad = [];
    for (const k of keys) { const r = this.map.get(k); if (!r) continue; if (r.bad) bad.push(k); else artifacts.push({ ...r.s }); } // 淺拷貝：呼叫端改了欄位不會影響下一次
    const st = this.stats; st.keys = keys.length; st.miss = miss.length; st.gone = gone.length; st.bad = bad.length; st.syncs += 1; if (st.firstMiss === null) st.firstMiss = miss.length;
    return { artifacts, bad, stats: { ...st } };
  }

  async _getMany(ids) {
    if (!ids.length) return [];
    const s = this.db.transaction(['artifacts'], 'readonly').objectStore('artifacts');
    return Promise.all(ids.map(id => wrap(s.get(id))));
  }
  async _put(recs) {
    if (!this.cache || !recs.length) return;
    try { const tx = this.cache.transaction([INDEX_STORE], 'readwrite'), s = tx.objectStore(INDEX_STORE), fin = done(tx); fin.catch(() => {}); for (const r of recs) s.put(r); await fin; }
    catch (e) { this.log('artifact index: cache write failed (' + (e?.message || e) + ')'); }
  }
  async _del(keys) {
    if (!this.cache || !keys.length) return;
    try { const tx = this.cache.transaction([INDEX_STORE], 'readwrite'), s = tx.objectStore(INDEX_STORE), fin = done(tx); fin.catch(() => {}); for (const k of keys) s.delete(k); await fin; }
    catch (e) { this.log('artifact index: cache delete failed (' + (e?.message || e) + ')'); }
  }
}

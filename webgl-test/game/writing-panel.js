// 田字格寫字面板（第 2 步）。
// - Hanzi Writer 固定版本 3.7.3，ESM 由 vendor-v2/hanzi-writer/lib 載入；字形資料只讀本機 data/<字>.json，不向 CDN 取。
// - quiz 回呼 onCorrectStroke/onMistake/onComplete 收 drawnPath 原始軌跡（character 座標，1024 字身、y 向上）。
// - 支援：正常完成、取消、重試、看示範、字形檔缺失（顯示訊息並回報 deferred）。
// - 面板是全螢幕覆層：pointer/wheel/touch/key 事件在覆層層級 stopPropagation，不穿透到 3D 場景。
import HanziWriter from '../vendor-v2/hanzi-writer/lib/dist/index.esm.js';
import { sha256Hex } from './content.js?v=7';
import { bravo, flash, spark } from './fx.js?v=7'; // 契約 v3 feedback：筆畫閃光、完成慶祝（音效由 o.sound 提供，可省略）；v4 加星光尾巴

export const WRITER_VERSION = 'hanzi-writer@3.7.3';
export const DATA_VERSION = 'hanzi-writer-data@2.0.1';

// 九字核對表 quizConfig 欄位與此一致；改這裡必須同步改核對表。
export const QUIZ_CONFIG = Object.freeze({
  leniency: 1,
  showHintAfterMisses: 3,
  highlightOnComplete: true,
  acceptBackwardsStrokes: false,
  markStrokeCorrectAfterMisses: false,
  quizStartStrokeNum: 0,
  renderer: 'svg',
  drawingWidth: 14,
  strokeWidth: 2,
  padding: 20,
});

// v4 起筆提示（面板自己的提示，不改 QUIZ_CONFIG，九字核對表的 quizConfig 維持一致）：
// - 每一筆開始前在起點放一個會閃的點；
// - 同一筆錯滿 EARLY_HINT_AFTER 次，就自動閃示範這一筆並畫出方向箭頭（Hanzi Writer 自己的提示仍在第 3 次）。
export const EARLY_HINT_AFTER = 2;

const CSS = `
.wp-overlay{position:fixed;inset:0;z-index:1000;background:rgba(40,52,48,.72);display:flex;align-items:center;justify-content:center;font:16px system-ui,"Noto Sans TC",sans-serif;color:#344b45;touch-action:none;overscroll-behavior:contain}
.wp-dialog{position:relative;background:#fffdf7;border-radius:20px;box-shadow:0 20px 60px rgba(0,0,0,.35);padding:18px 22px 20px;width:min(92vw,520px);max-height:96vh;overflow:auto;box-sizing:border-box;outline:none}
.wp-head{display:flex;align-items:baseline;gap:12px;margin-bottom:8px}
.wp-head h2{margin:0;font-size:22px}
.wp-head .wp-zhuyin{font-size:16px;color:#6c7d77}
.wp-head .wp-hint{margin-left:auto;font-size:14px;color:#6c7d77}
.wp-grid{position:relative;width:min(80vw,360px);aspect-ratio:1;margin:6px auto 10px;background:#fff;border:3px solid #c49a6c;border-radius:12px;overflow:hidden;touch-action:none;user-select:none;-webkit-user-select:none}
.wp-grid svg.wp-lines{position:absolute;inset:0;width:100%;height:100%;pointer-events:none}
.wp-grid .wp-target{position:absolute;inset:0;width:100%;height:100%}
.wp-grid .wp-target svg{display:block;width:100%;height:100%;touch-action:none}
.wp-msg{min-height:1.5em;text-align:center;font-size:17px;margin:4px 0 10px}
.wp-msg.wp-ok{color:#2b8a3e}.wp-msg.wp-err{color:#c92a2a}
.wp-actions{display:flex;flex-wrap:wrap;gap:10px;justify-content:center}
.wp-actions button{font:inherit;font-size:18px;padding:12px 18px;min-width:96px;border-radius:12px;border:2px solid #aab7a8;background:#fff;cursor:pointer;touch-action:manipulation}
.wp-actions button.wp-primary{background:#386c56;border-color:#386c56;color:#fff}
.wp-actions button:disabled{opacity:.45;cursor:default}
.wp-progress{display:flex;gap:6px;justify-content:center;margin:0 0 6px}
.wp-progress span{width:14px;height:14px;border-radius:50%;background:#e3ddd0;display:inline-block}
.wp-progress span.wp-done{background:#386c56}.wp-progress span.wp-now{background:#d9480f}
.wp-grid svg.wp-guide{position:absolute;inset:0;width:100%;height:100%;pointer-events:none;z-index:2;overflow:visible}
.wp-guide .wp-dot{fill:#f08c00;stroke:#fff;animation:wp-pulse 1s ease-in-out infinite;transform-box:fill-box;transform-origin:center}
.wp-guide .wp-arrow{fill:none;stroke:#f08c00;stroke-linecap:round;stroke-linejoin:round;opacity:.85;stroke-dasharray:8 6;animation:wp-dash .8s linear infinite}
@keyframes wp-pulse{0%,100%{transform:scale(.75);opacity:.95}50%{transform:scale(1.25);opacity:.6}}
@keyframes wp-dash{to{stroke-dashoffset:-14}}
.wp-say{font:inherit;font-size:20px;line-height:1;background:#fff;border:2px solid #c49a6c;border-radius:10px;padding:3px 7px;cursor:pointer;touch-action:manipulation}
.wp-card{display:inline-block;background:#fff;border:2px solid #c49a6c;border-radius:10px;padding:6px}
`;

function injectCss() {
  if (document.getElementById('wp-style')) return;
  const s = document.createElement('style'); s.id = 'wp-style'; s.textContent = CSS; document.head.append(s);
}

const uuid = () => (crypto.randomUUID ? crypto.randomUUID() : 'id-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2));

/** 只讀本機字形資料；回傳 {data, bytes, sha256}。檔案缺失或壞 JSON 會 throw。 */
export async function loadCharData(char, dataBase) {
  const url = dataBase + encodeURIComponent(char) + '.json';
  const response = await fetch(url, { cache: 'no-store' });
  if (!response.ok) { const e = new Error('CHAR_DATA_MISSING'); e.detail = { char, url, status: response.status }; throw e; }
  const bytes = new Uint8Array(await response.arrayBuffer());
  let data;
  try { data = JSON.parse(new TextDecoder().decode(bytes)); } catch (err) { const e = new Error('CHAR_DATA_INVALID'); e.detail = { char, url, cause: String(err) }; throw e; }
  if (!Array.isArray(data.strokes) || !Array.isArray(data.medians) || data.strokes.length !== data.medians.length || !data.strokes.length) {
    const e = new Error('CHAR_DATA_INVALID'); e.detail = { char, url, cause: 'strokes/medians 結構不符' }; throw e;
  }
  return { data, bytes, sha256: await sha256Hex(bytes) };
}

/** 作品卡：用孩子的 drawnPaths（character 座標）渲染，不用標準字。 */
export function renderArtifactCard(artifact, { size = 160, color = '#2f3e46', width = 10, grid = true } = {}) {
  const pad = Math.round(size * 0.06);
  const t = HanziWriter.getScalingTransform(size, size, pad);
  const lines = grid ? `<line x1="${size / 2}" y1="0" x2="${size / 2}" y2="${size}" stroke="#e8e1d2" stroke-dasharray="4 4"/><line x1="0" y1="${size / 2}" x2="${size}" y2="${size / 2}" stroke="#e8e1d2" stroke-dasharray="4 4"/>` : '';
  const paths = artifact.drawnPaths.map(pts => `<polyline points="${pts.map(p => `${p.x},${p.y}`).join(' ')}" fill="none" stroke="${color}" stroke-width="${width / t.scale}" stroke-linecap="round" stroke-linejoin="round"/>`).join('');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}"><rect width="${size}" height="${size}" fill="#fff"/>${lines}<g transform="${t.transform}">${paths}</g></svg>`;
  const wrap = document.createElement('div'); wrap.className = 'wp-card'; wrap.innerHTML = svg; wrap.title = `${artifact.char} ${artifact.createdAt}`;
  return wrap;
}

export class WritingPanel {
  /**
   * @param {object} o
   * @param {string} o.dataBase   字形資料目錄（相對頁面），例如 './vendor-v2/hanzi-writer/data/'
   * @param {(artifact)=>Promise<void>|void} o.onArtifact  完成一字時交出作品（含 drawnPaths）
   * @param {(info)=>void} o.onDeferred  字形缺失：{taskId,char,attemptId,reason}
   * @param {(info)=>void} o.onCancel    取消：{taskId,char,attemptId}
   * @param {()=>void} o.onOpen / o.onClose  供大廳暫停／恢復 RAF
   * @param {import('./fx.js').Sound} [o.sound]  v3：筆畫／完成音效
   */
  constructor(o) {
    injectCss();
    this.o = o;
    this.dataBase = o.dataBase;
    this.open = false;
    this.state = null;
    this.el = null;
    this.log = o.log || (() => {});
    this._onKey = e => this._key(e);
    this.voice = o.voice || null; // v4：fx.js 的 Voice，可省略
  }

  /** v4：唸「字，詞的字」。在 start() 內同步呼叫（仍在按鈕手勢內），iOS 才肯出聲。 */
  _say(kind = 'intro') {
    const s = this.state; if (!s || !this.voice) return false;
    const w = s.task.hint_word;
    const text = kind === 'done' ? s.char : (w && w !== s.char ? `${s.char}，${w}的${s.char}` : s.char);
    const ok = this.voice.say(text); this.log(`say(${kind}) ${text} -> ${ok}`); return ok;
  }

  isOpen() { return this.open; }

  /** 開啟面板寫一個任務。已開啟時忽略（滑鼠／觸控／鍵盤都只能開一次）。 */
  async start(task, { attemptId = uuid(), index = 0, total = 1 } = {}) {
    if (this.open) { this.log('ignored: panel already open'); return false; }
    this.open = true;
    this.state = { task, char: task.char, attemptId, index, total, drawnPaths: [], mistakes: 0, hints: 0, demoViews: 0, writer: null, done: false, startedAt: performance.now() };
    this._build();
    this._say('intro');
    this.o.onOpen?.();
    try {
      const { data, sha256 } = await loadCharData(task.char, this.dataBase);
      if (!this.open) return false; // 載入中被取消
      this.state.dataSha256 = sha256;
      this._mountWriter(data);
      this._setMsg(`請照筆順寫「${task.char}」`);
      this._startQuiz();
    } catch (err) {
      if (!this.open) return false;
      this._deferred(err);
    }
    return true;
  }

  close(reason = 'close') {
    if (!this.open) return;
    const s = this.state;
    try { s.writer?.cancelQuiz(); } catch { /* ignore */ }
    this.voice?.stop();
    document.removeEventListener('keydown', this._onKey, true);
    this.el?.remove(); this.el = null;
    this.open = false;
    if (!s.done && reason === 'cancel') this.o.onCancel?.({ taskId: s.task.id, char: s.char, attemptId: s.attemptId });
    this.o.onClose?.({ reason, taskId: s.task.id });
    this.state = null;
  }

  // ---------- UI ----------
  _build() {
    const s = this.state;
    const el = document.createElement('div'); el.className = 'wp-overlay'; el.setAttribute('role', 'dialog'); el.setAttribute('aria-modal', 'true'); el.setAttribute('aria-label', `寫字：${s.char}`);
    el.innerHTML = `
      <div class="wp-dialog" tabindex="-1">
        <div class="wp-head"><h2>${s.char}</h2><span class="wp-zhuyin">${s.task.zhuyin ?? ''}　${s.task.hint_word ?? ''}</span><button type="button" class="wp-say" aria-label="再唸一次">🔈</button><span class="wp-hint">第 ${s.index + 1} / ${s.total} 字</span></div>
        <div class="wp-progress"></div>
        <div class="wp-grid">
          <svg class="wp-lines" viewBox="0 0 100 100" preserveAspectRatio="none"><line x1="50" y1="0" x2="50" y2="100" stroke="#e8c9a8" stroke-width=".6" stroke-dasharray="2 2"/><line x1="0" y1="50" x2="100" y2="50" stroke="#e8c9a8" stroke-width=".6" stroke-dasharray="2 2"/></svg>
          <div class="wp-target"></div>
          <svg class="wp-guide" aria-hidden="true"></svg>
        </div>
        <div class="wp-msg">載入字形…</div>
        <div class="wp-actions">
          <button type="button" data-act="demo">看示範</button>
          <button type="button" data-act="retry">重試</button>
          <button type="button" data-act="cancel">取消</button>
          <button type="button" data-act="next" class="wp-primary" hidden>去小鎮看看 ▶</button>
        </div>
      </div>`;
    // 輸入隔離：覆層以下的 3D 場景收不到任何指標起始／移動／滾輪／鍵盤事件。
    // 注意：不攔 mouseup/touchend/pointerup——Hanzi Writer 的筆畫結束監聽掛在 document 上（index.esm.js:1751），
    // 攔了會讓筆畫永遠結束不了；而場景（OrbitControls）從未收到對應的 start 事件，end 事件對它無作用。
    for (const type of ['pointerdown', 'pointermove', 'mousedown', 'mousemove', 'click', 'dblclick', 'contextmenu', 'wheel', 'touchstart', 'touchmove']) {
      el.addEventListener(type, e => { e.stopPropagation(); if (type === 'wheel' || type === 'contextmenu') e.preventDefault(); }, { passive: type !== 'wheel' && type !== 'contextmenu' });
    }
    el.querySelector('.wp-say').addEventListener('click', () => this._say('intro'));
    // v4：手指／滑鼠寫字時留下星光尾巴（純裝飾，不影響判定）
    const grid = el.querySelector('.wp-grid'); let drawing = false, lastSpark = 0;
    grid.addEventListener('pointerdown', () => { drawing = true; });
    el.addEventListener('pointerup', () => { drawing = false; }); el.addEventListener('pointercancel', () => { drawing = false; });
    grid.addEventListener('pointermove', e => {
      if (!drawing || !this.state || this.state.done) return; const now = performance.now(); if (now - lastSpark < 28) return; lastSpark = now;
      const r = grid.getBoundingClientRect(); spark(grid, e.clientX - r.left, e.clientY - r.top); this.state.sparks = (this.state.sparks ?? 0) + 1;
    });
    el.querySelector('.wp-actions').addEventListener('click', e => { const b = e.target.closest('button[data-act]'); if (b) this._act(b.dataset.act); });
    document.body.append(el);
    this.el = el;
    document.addEventListener('keydown', this._onKey, true);
    el.querySelector('.wp-dialog').focus();
  }

  _key(e) {
    if (!this.open) return;
    e.stopPropagation();
    if (e.key === 'Escape') { e.preventDefault(); this._act('cancel'); }
    else if (e.key === 'Enter' && this.state.done) { e.preventDefault(); this._act('next'); }
    // 其餘按鍵不處理也不傳給場景（含方向鍵、空白鍵，避免捲動）
    if ([' ', 'ArrowUp', 'ArrowDown', 'PageUp', 'PageDown'].includes(e.key) && e.target === this.el.querySelector('.wp-dialog')) e.preventDefault();
  }

  _setMsg(text, cls = '') { const m = this.el?.querySelector('.wp-msg'); if (m) { m.textContent = text; m.className = 'wp-msg ' + cls; } }
  _btn(act) { return this.el?.querySelector(`button[data-act="${act}"]`); }
  _setButtons({ demo = true, retry = true, cancel = true, next = false } = {}) {
    this._btn('demo').disabled = !demo; this._btn('retry').disabled = !retry; this._btn('cancel').disabled = !cancel;
    this._btn('next').hidden = !next; if (next) this._btn('next').focus();
  }
  _progress(total, done) {
    const p = this.el.querySelector('.wp-progress'); p.innerHTML = '';
    for (let i = 0; i < total; i++) { const d = document.createElement('span'); if (i < done) d.className = 'wp-done'; else if (i === done) d.className = 'wp-now'; p.append(d); }
  }

  // ---------- Hanzi Writer ----------
  _mountWriter(data) {
    const s = this.state;
    const target = this.el.querySelector('.wp-target');
    const size = target.clientWidth || 360;
    s.writer = HanziWriter.create(target, s.char, {
      width: size, height: size, padding: QUIZ_CONFIG.padding,
      renderer: QUIZ_CONFIG.renderer,
      showOutline: true, showCharacter: false,
      strokeColor: '#2f3e46', outlineColor: '#dcd5c6', drawingColor: '#1c5d99', highlightColor: '#f08c00', highlightCompleteColor: '#2b8a3e',
      drawingWidth: QUIZ_CONFIG.drawingWidth, strokeWidth: QUIZ_CONFIG.strokeWidth,
      strokeAnimationSpeed: 1, delayBetweenStrokes: 350,
      // 只讀本機、已載入的資料；絕不走預設 CDN loader
      charDataLoader: (char, onLoad, onError) => { if (char === s.char) onLoad(data); else onError(new Error('UNEXPECTED_CHAR:' + char)); },
      onLoadCharDataError: err => this._deferred(err),
    });
    s.totalStrokes = data.strokes.length;
    s.medians = data.medians; s.guideSize = size;
    s.guideXf = HanziWriter.getScalingTransform(size, size, QUIZ_CONFIG.padding);
    this._progress(s.totalStrokes, 0);
  }

  /** v4：畫第 n 筆的起筆點；arrow=true 時再沿筆畫中線畫方向箭頭。n 超出範圍就清掉。 */
  _guide(n, { arrow = false } = {}) {
    const s = this.state, g = this.el?.querySelector('.wp-guide'); if (!g) return;
    const med = s?.medians?.[n];
    if (!med || s.done) { g.innerHTML = ''; s && (s.guide = null); return; }
    const t = s.guideXf, sz = s.guideSize, k = 1 / t.scale, [x0, y0] = med[0];
    let h = `<g transform="${t.transform}">`;
    if (arrow && med.length > 1) {
      const pts = med.map(([x, y]) => `${x},${y}`).join(' ');
      const [ax, ay] = med[med.length - 1], [bx, by] = med[Math.max(0, med.length - 2)], a = Math.atan2(ay - by, ax - bx), L = 34 * k;
      const w1 = `${ax - L * Math.cos(a - 0.5)},${ay - L * Math.sin(a - 0.5)}`, w2 = `${ax - L * Math.cos(a + 0.5)},${ay - L * Math.sin(a + 0.5)}`;
      h += `<polyline class="wp-arrow" points="${pts}" stroke-width="${7 * k}" style="stroke-dasharray:${8 * k} ${6 * k}"/><polyline class="wp-arrow" points="${w1} ${ax},${ay} ${w2}" stroke-width="${7 * k}" style="stroke-dasharray:none"/>`;
    }
    h += `<circle class="wp-dot" cx="${x0}" cy="${y0}" r="${11 * k}" stroke-width="${3 * k}"/></g>`;
    g.setAttribute('viewBox', `0 0 ${sz} ${sz}`); g.innerHTML = h;
    s.guide = { stroke: n, arrow };
  }

  _startQuiz() {
    const s = this.state;
    // 每次 quiz 開始＝一個 attempt：重試、看示範後都換新 attemptId、計數歸零（契約 progressRecord 以 attempt 為單位）
    if (s.quizRuns) { s.previousAttemptIds.push(s.attemptId); s.attemptId = uuid(); this.o.onAttempt?.({ taskId: s.task.id, char: s.char, attemptId: s.attemptId, reason: s.nextAttemptReason ?? 'retry' }); }
    s.previousAttemptIds ??= []; s.nextAttemptReason = null;
    s.drawnPaths = []; s.mistakes = 0; s.hints = 0; s.demoViews = 0; s.done = false; s.quizStartedAt = performance.now(); s.quizRuns = (s.quizRuns ?? 0) + 1;
    this._progress(s.totalStrokes, 0);
    this._setButtons({ demo: true, retry: true, cancel: true, next: false });
    s.earlyHints = 0; this._guide(0);
    s.writer.quiz({
      leniency: QUIZ_CONFIG.leniency,
      showHintAfterMisses: QUIZ_CONFIG.showHintAfterMisses,
      highlightOnComplete: QUIZ_CONFIG.highlightOnComplete,
      acceptBackwardsStrokes: QUIZ_CONFIG.acceptBackwardsStrokes,
      markStrokeCorrectAfterMisses: QUIZ_CONFIG.markStrokeCorrectAfterMisses,
      quizStartStrokeNum: QUIZ_CONFIG.quizStartStrokeNum,
      onCorrectStroke: d => {
        s.drawnPaths.push(d.drawnPath.points.map(p => ({ x: p.x, y: p.y })));
        this._progress(s.totalStrokes, d.strokeNum + 1);
        this._setMsg(d.strokesRemaining ? `對了！還有 ${d.strokesRemaining} 筆` : '全部寫完了！', 'wp-ok');
        this.o.sound?.stroke(d.strokeNum); const g = this.el?.querySelector('.wp-grid'); if (g) flash(g);
        const tg = this.el?.querySelector('.wp-target'); if (tg) flash(tg, 'fx-squash');
        this._guide(d.strokesRemaining ? d.strokeNum + 1 : -1);
        this.log(`correct stroke ${d.strokeNum + 1}/${s.totalStrokes}, points=${d.drawnPath.points.length}`);
      },
      onMistake: d => {
        s.mistakes += 1;
        if (QUIZ_CONFIG.showHintAfterMisses !== false && d.mistakesOnStroke >= QUIZ_CONFIG.showHintAfterMisses) s.hints += 1; // 此次會閃示範筆
        else if (d.mistakesOnStroke === EARLY_HINT_AFTER) { // v4：錯第 2 次就示範這一筆＋方向箭頭（算一次提示）
          s.hints += 1; s.earlyHints += 1; this._guide(d.strokeNum, { arrow: true });
          try { s.writer.highlightStroke(d.strokeNum); } catch { /* ignore */ }
        }
        this._setMsg(d.isBackwards ? '方向反了，從橘色點開始寫' : d.mistakesOnStroke >= EARLY_HINT_AFTER ? '照著橘色箭頭寫這一筆' : '再試一次，從橘色點開始', 'wp-err');
        this.o.sound?.mistake(); const g = this.el?.querySelector('.wp-grid'); if (g) flash(g, 'fx-shake');
        this.log(`mistake on stroke ${d.strokeNum + 1} (onStroke=${d.mistakesOnStroke}, backwards=${d.isBackwards})`);
      },
      onComplete: summary => this._complete(summary),
    });
  }

  async _complete(summary) {
    const s = this.state;
    s.done = true; this._guide(-1);
    const artifact = {
      artifactId: uuid(), taskId: s.task.id, attemptId: s.attemptId, char: s.char,
      drawnPaths: s.drawnPaths, mistakes: s.mistakes, hints: s.hints + s.demoViews,
      createdAt: new Date().toISOString(), writerVersion: WRITER_VERSION, dataSha256: s.dataSha256,
      // 補充欄位（不在契約最小格式內，但對驗收有用）
      meta: { dataVersion: DATA_VERSION, pointSpace: 'hanzi-writer character coords (1024 em, y-up)', totalStrokes: s.totalStrokes, durationMs: Math.round(performance.now() - s.quizStartedAt), earlyHints: s.earlyHints ?? 0, panelOpenMs: Math.round(performance.now() - s.startedAt), attemptIndex: s.quizRuns, previousAttemptIds: s.previousAttemptIds, demoViews: s.demoViews, quizConfig: QUIZ_CONFIG },
    };
    this._setButtons({ demo: false, retry: false, cancel: false, next: false });
    this._setMsg('寫得好！正在保存…', 'wp-ok');
    this.o.sound?.complete(); setTimeout(() => { if (this.state === s) this._say('done'); }, 700); { const d = this.el?.querySelector('.wp-dialog'); if (d) bravo(d, s.mistakes === 0 ? '太棒了！' : '好棒！'); }
    try {
      await this.o.onArtifact?.(artifact);
      this._setMsg(`「${s.char}」寫好了！去小鎮看看卡比巴拉！`, 'wp-ok');
      this._setButtons({ demo: false, retry: true, cancel: false, next: true });
    } catch (err) {
      this.log('save failed: ' + err);
      this._setMsg('保存失敗：' + (err?.message || err) + '，按「重試保存」再試', 'wp-err');
      const b = this._btn('next'); b.hidden = false; b.textContent = '重試保存'; b.dataset.act = 'resave'; this._pendingArtifact = artifact; this._btn('cancel').disabled = false;
    }
  }

  _deferred(err) {
    const s = this.state;
    const reason = err?.message || String(err);
    this.log('deferred: ' + reason + ' ' + JSON.stringify(err?.detail ?? {}));
    this._setMsg(`「${s.char}」的筆順資料還沒準備好，先跳過，之後再補寫。`, 'wp-err');
    this._setButtons({ demo: false, retry: false, cancel: true, next: false });
    this._btn('cancel').textContent = '返回';
    s.done = true; // 不再觸發 onCancel
    this.o.onDeferred?.({ taskId: s.task.id, char: s.char, attemptId: s.attemptId, reason, detail: err?.detail ?? null });
  }

  async _act(act) {
    const s = this.state; if (!s) return;
    if (act === 'cancel') { this.close(s.done ? 'close' : 'cancel'); return; }
    if (act === 'retry') { if (!s.writer) return; s.writer.cancelQuiz(); this._setMsg(`再寫一次「${s.char}」`); s.nextAttemptReason = 'retry'; this._startQuiz(); return; }
    if (act === 'demo') {
      if (!s.writer) return;
      s.writer.cancelQuiz(); s.nextAttemptReason = 'demo'; const demoViews = s.demoViews + 1; this._guide(-1);
      this._setButtons({ demo: false, retry: false, cancel: true, next: false });
      this._setMsg('看看怎麼寫…');
      await s.writer.animateCharacter();
      if (!this.open || this.state !== s) return;
      await s.writer.hideCharacter({ duration: 200 });
      if (!this.open || this.state !== s) return;
      this._setMsg(`換你寫「${s.char}」`);
      this._startQuiz(); s.demoViews = demoViews; // 看示範算進新 attempt 的 hints
      return;
    }
    if (act === 'resave') {
      const b = this._btn('resave'); b.disabled = true;
      try { await this.o.onArtifact?.(this._pendingArtifact); this._setMsg(`「${s.char}」寫好了！`, 'wp-ok'); b.textContent = '去小鎮看看 ▶'; b.dataset.act = 'next'; b.disabled = false; this._btn('retry').disabled = false; }
      catch (err) { b.disabled = false; this._setMsg('保存仍失敗：' + (err?.message || err), 'wp-err'); }
      return;
    }
    if (act === 'next') { this.close('done'); return; }
  }
}

// 回饋特效（契約 v3 feedback）：WebAudio 即時合成音效（無音檔）＋ DOM 星星／「好棒！」。
// iOS 規定 AudioContext 要在使用者手勢內啟動：呼叫 sound.unlock()（綁在「開始寫字」按鈕）。
const PENTA = [523.25, 587.33, 659.25, 783.99, 880.0, 1046.5, 1174.66, 1318.51, 1567.98, 1760.0];

export class Sound {
  constructor() {
    this.ctx = null;
    try { this.muted = localStorage.getItem('capy_muted') === '1'; } catch { this.muted = false; }
  }
  unlock() {
    try {
      if (!this.ctx) { const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return; this.ctx = new AC(); }
      if (this.ctx.state === 'suspended') this.ctx.resume();
      // iOS：在手勢內播一個無聲 buffer 才真正解鎖
      const b = this.ctx.createBuffer(1, 1, 22050), s = this.ctx.createBufferSource(); s.buffer = b; s.connect(this.ctx.destination); s.start(0);
    } catch { /* 沒有聲音也不影響遊戲 */ }
  }
  setMuted(m) { this.muted = m; try { localStorage.setItem('capy_muted', m ? '1' : '0'); } catch { /* ignore */ } }
  _tone(freq, { at = 0, dur = 0.18, type = 'sine', gain = 0.18, slide = 0 } = {}) {
    const c = this.ctx; if (!c || this.muted || c.state !== 'running') return;
    const t = c.currentTime + at, o = c.createOscillator(), g = c.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t); if (slide) o.frequency.exponentialRampToValueAtTime(freq * slide, t + dur);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(gain, t + 0.012); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(c.destination); o.start(t); o.stop(t + dur + 0.05);
  }
  /** 寫對第 i 筆：音高隨筆序上升 */
  stroke(i) { const f = PENTA[Math.min(i, PENTA.length - 1)]; this._tone(f, { dur: 0.22, type: 'triangle', gain: 0.2 }); this._tone(f * 2, { at: 0.02, dur: 0.12, gain: 0.05 }); }
  /** 寫錯：柔和低音 */
  mistake() { this._tone(220, { dur: 0.22, type: 'sine', gain: 0.12, slide: 0.85 }); }
  /** 完成一字：上行琶音 */
  complete() { [0, 2, 4, 5, 7].forEach((k, j) => this._tone(PENTA[k], { at: j * 0.09, dur: 0.3, type: 'triangle', gain: 0.18 })); this._tone(PENTA[9], { at: 0.5, dur: 0.6, type: 'sine', gain: 0.12 }); }
  /** 卡比巴拉跳：短促「啾」 */
  squeak(pitch = 1) { this._tone(700 * pitch, { dur: 0.14, type: 'square', gain: 0.05, slide: 1.6 }); this._tone(1100 * pitch, { at: 0.1, dur: 0.1, type: 'sine', gain: 0.06, slide: 1.3 }); }
  /** v5 點水豚：低頻「噗嚕」氣泡音（兩顆泡泡） */
  puru() {
    const c = this.ctx; if (!c || this.muted || c.state !== 'running') return;
    [0, 0.13].forEach((at, i) => {
      const t = c.currentTime + at, o = c.createOscillator(), g = c.createGain(), lfo = c.createOscillator(), lg = c.createGain();
      o.type = 'sine'; o.frequency.setValueAtTime(i ? 150 : 190, t); o.frequency.exponentialRampToValueAtTime(i ? 95 : 120, t + 0.16);
      lfo.frequency.value = 38; lg.gain.value = 22; lfo.connect(lg).connect(o.frequency);
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.32, t + 0.015); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.2);
      o.connect(g).connect(c.destination); o.start(t); lfo.start(t); o.stop(t + 0.25); lfo.stop(t + 0.25);
    });
  }
  /** v5 點兔子：高頻「Boing！」彈簧音 */
  boing() {
    const c = this.ctx; if (!c || this.muted || c.state !== 'running') return;
    const t = c.currentTime, o = c.createOscillator(), g = c.createGain(), lfo = c.createOscillator(), lg = c.createGain();
    o.type = 'triangle'; o.frequency.setValueAtTime(320, t); o.frequency.exponentialRampToValueAtTime(980, t + 0.12); o.frequency.exponentialRampToValueAtTime(620, t + 0.4);
    lfo.frequency.setValueAtTime(18, t); lfo.frequency.linearRampToValueAtTime(7, t + 0.4); lg.gain.setValueAtTime(90, t); lg.gain.linearRampToValueAtTime(10, t + 0.4); lfo.connect(lg).connect(o.frequency);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.2, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.42);
    o.connect(g).connect(c.destination); o.start(t); lfo.start(t); o.stop(t + 0.45); lfo.stop(t + 0.45);
  }
  /** 鏡頭飛過去：輕柔滑音 */
  whoosh() { this._tone(330, { dur: 0.5, type: 'sine', gain: 0.06, slide: 2 }); }
}

/** v4：瀏覽器內建語音唸字（不用音檔）。優先 zh-TW 語音；沒有中文語音時 say() 回傳 false，遊戲照常。靜音鍵同時關掉語音。 */
export class Voice {
  constructor(sound) {
    this.sound = sound; this.ok = typeof window !== 'undefined' && 'speechSynthesis' in window && typeof SpeechSynthesisUtterance === 'function';
    this.voice = null; this.spoken = []; this._saidAt = -1e9; this._u = null;
    if (this.ok) { this._pick(); try { speechSynthesis.addEventListener('voiceschanged', () => this._pick()); } catch { /* 舊版 Safari */ } }
  }
  _pick() {
    const vs = speechSynthesis.getVoices(), L = v => (v.lang || '').replace('_', '-').toLowerCase();
    this.voice = vs.find(v => L(v) === 'zh-tw') || vs.find(v => L(v) === 'zh-cn') || vs.find(v => L(v).startsWith('zh') && !/hk|yue/.test(L(v))) || null;
  }
  /** 必須至少一次在使用者手勢內呼叫（iOS 規定）；開始寫字按鈕的 click 會同步呼叫到這裡。 */
  say(text, { rate = 0.75, onEnd = null } = {}) {
    if (!this.ok || !text || this.sound?.muted) return false;
    try {
      speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(text); u.lang = this.voice?.lang || 'zh-TW'; if (this.voice) u.voice = this.voice; u.rate = rate; u.pitch = 1.1;
      if (onEnd) { let fired = false; u.onend = u.onerror = () => { if (!fired) { fired = true; onEnd(); } }; } // v17：唸完或被切掉都通知一次
      this._u = u; // 留著參考，Chrome 才不會在唸完前把 utterance 回收而漏發 end
      speechSynthesis.speak(u); this.spoken.push(text); this._saidAt = performance.now(); return true;
    } catch { return false; }
  }
  /** v17：語音引擎忙碌中（正在唸，或已排入還沒出聲）。speak() 後 1 秒內一律算忙，有些瀏覽器旗標會慢一拍。 */
  get busy() { try { return this.ok && (speechSynthesis.speaking || speechSynthesis.pending || performance.now() - this._saidAt < 1000); } catch { return false; } }
  stop() { try { if (this.ok) speechSynthesis.cancel(); } catch { /* ignore */ } this._saidAt = -1e9; }
}

const FX_CSS = `
.fx-layer{position:absolute;inset:0;pointer-events:none;overflow:hidden;z-index:5}
.fx-star{position:absolute;left:0;top:0;font-size:26px;line-height:1;will-change:transform,opacity;animation:fx-fly var(--d,900ms) cubic-bezier(.2,.7,.3,1) forwards}
@keyframes fx-fly{0%{transform:translate(var(--x0),var(--y0)) scale(.3) rotate(0);opacity:1}70%{opacity:1}100%{transform:translate(var(--x1),var(--y1)) scale(1.1) rotate(var(--r));opacity:0}}
.fx-bravo{position:absolute;left:50%;top:42%;transform:translate(-50%,-50%);font:900 54px system-ui,"Noto Sans TC",sans-serif;color:#f08c00;-webkit-text-stroke:3px #fff;paint-order:stroke fill;text-shadow:0 6px 18px rgba(0,0,0,.25);animation:fx-pop 1300ms ease-out forwards;white-space:nowrap}
@keyframes fx-pop{0%{transform:translate(-50%,-50%) scale(.2);opacity:0}25%{transform:translate(-50%,-50%) scale(1.25);opacity:1}45%{transform:translate(-50%,-50%) scale(1)}80%{opacity:1}100%{transform:translate(-50%,-80%) scale(1);opacity:0}}
.fx-flash{animation:fx-flash 420ms ease-out}
@keyframes fx-flash{0%{box-shadow:0 0 0 0 rgba(43,138,62,.0)}30%{box-shadow:0 0 0 10px rgba(43,138,62,.35)}100%{box-shadow:0 0 0 0 rgba(43,138,62,0)}}
.fx-shake{animation:fx-shake 300ms}
@keyframes fx-squash{0%{transform:scale(1)}35%{transform:scale(1.035,.965)}70%{transform:scale(.985,1.015)}100%{transform:scale(1)}}
.fx-squash{animation:fx-squash 240ms ease-out}
.fx-spark-cv{position:absolute;inset:0;width:100%;height:100%;pointer-events:none}
.fx-spark{position:absolute;left:0;top:0;width:12px;height:12px;margin:-6px 0 0 -6px;border-radius:50%;pointer-events:none;background:radial-gradient(circle,#fff 0,var(--c,#ffd43b) 45%,transparent 72%);animation:fx-spark 560ms ease-out forwards}
@keyframes fx-spark{0%{transform:translate(var(--x),var(--y)) scale(1.3);opacity:1}100%{transform:translate(calc(var(--x) + var(--dx)),calc(var(--y) + var(--dy))) scale(.2);opacity:0}}
@keyframes fx-shake{0%,100%{transform:translateX(0)}25%{transform:translateX(-6px)}75%{transform:translateX(6px)}}
`;
function injectCss() { if (document.getElementById('fx-style')) return; const s = document.createElement('style'); s.id = 'fx-style'; s.textContent = FX_CSS; document.head.append(s); }

function layerIn(container) {
  injectCss();
  let l = container.querySelector(':scope > .fx-layer');
  if (!l) { l = document.createElement('div'); l.className = 'fx-layer'; if (getComputedStyle(container).position === 'static') container.style.position = 'relative'; container.append(l); }
  return l;
}

/** 在 container 內 (x,y)（px，相對 container）爆出 n 顆星星 */
export function burst(container, x, y, { n = 14, spread = 140, glyphs = ['⭐', '✨', '🌸', '💛'], duration = 900 } = {}) {
  const l = layerIn(container);
  for (let i = 0; i < n; i++) {
    const a = (Math.PI * 2 * i) / n + Math.random() * 0.5, r = spread * (0.6 + Math.random() * 0.6);
    const s = document.createElement('span'); s.className = 'fx-star'; s.textContent = glyphs[i % glyphs.length];
    s.style.setProperty('--x0', `${x - 13}px`); s.style.setProperty('--y0', `${y - 13}px`);
    s.style.setProperty('--x1', `${x - 13 + Math.cos(a) * r}px`); s.style.setProperty('--y1', `${y - 13 + Math.sin(a) * r - 30}px`);
    s.style.setProperty('--r', `${(Math.random() - 0.5) * 360}deg`); s.style.setProperty('--d', `${duration + Math.random() * 300}ms`);
    l.append(s); setTimeout(() => s.remove(), duration + 400);
  }
}

/** 面板完成慶祝：大字「好棒！」＋星星 */
export function bravo(container, text = '好棒！') {
  const l = layerIn(container);
  const b = document.createElement('div'); b.className = 'fx-bravo'; b.textContent = text; l.append(b); setTimeout(() => b.remove(), 1400);
  const r = container.getBoundingClientRect();
  burst(container, r.width / 2, r.height * 0.42, { n: 18, spread: Math.min(r.width, r.height) * 0.45 });
}

export function flash(el, cls = 'fx-flash') { injectCss(); el.classList.remove(cls); requestAnimationFrame(() => { el.classList.add(cls); setTimeout(() => el.classList.remove(cls), 450); }); } // v16：下一幀再加 class 重播動畫，不用 offsetWidth 強制重排

const CANDY = ['#FF8FAB', '#FFD166', '#7EE0B5', '#8EC5FF', '#C3A6FF', '#FFA94D'];
/** v4：手指寫字時的星光尾巴（px，相對 container）
 *  v15：改畫在同一張 canvas（一個 RAF 迴圈），不再每 28ms 新增／刪除 DOM 元素——
 *  舊做法每顆星光都觸發樣式重算＋版面重排，加上 Hanzi Writer 每次移動都讀 getScreenCTM（強制排版），寫字會頓。外觀照舊。 */
const SPARK_MS = 560, sparkLayers = new WeakMap();
export function spark(container, x, y) {
  let L = sparkLayers.get(container);
  if (!L || !L.cv.isConnected) {
    const cv = document.createElement('canvas'); cv.className = 'fx-spark-cv'; layerIn(container).append(cv);
    L = { cv, ctx: cv.getContext('2d'), ps: [], raf: 0, w: 0, h: 0 }; sparkLayers.set(container, L);
  }
  if (!L.ps.length) { // 每一串星光開始時才量一次尺寸
    const dpr = Math.min(2, devicePixelRatio || 1); L.w = container.clientWidth; L.h = container.clientHeight;
    if (L.cv.width !== Math.round(L.w * dpr)) { L.cv.width = Math.round(L.w * dpr); L.cv.height = Math.round(L.h * dpr); }
    L.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  L.ps.push({ x, y, dx: (Math.random() - 0.5) * 18, dy: Math.random() * 14 + 4, c: CANDY[(Math.random() * CANDY.length) | 0], t0: performance.now() }); // v5：彩色糖果
  if (!L.raf) L.raf = requestAnimationFrame(t => drawSparks(L, t));
}
function drawSparks(L, now) {
  const g = L.ctx; g.clearRect(0, 0, L.w, L.h);
  L.ps = L.ps.filter(p => now - p.t0 < SPARK_MS);
  for (const p of L.ps) {
    const k = Math.max(0, (now - p.t0) / SPARK_MS), e = 1 - (1 - k) * (1 - k), r = 6 * (1.3 - 1.1 * e), cx = p.x + p.dx * e, cy = p.y + p.dy * e;
    const grd = g.createRadialGradient(cx, cy, 0, cx, cy, r); grd.addColorStop(0, '#fff'); grd.addColorStop(0.45 / 0.72, p.c); grd.addColorStop(1, 'rgba(255,255,255,0)');
    g.globalAlpha = 1 - k; g.fillStyle = grd; g.beginPath(); g.arc(cx, cy, r, 0, Math.PI * 2); g.fill();
  }
  g.globalAlpha = 1;
  L.raf = L.ps.length ? requestAnimationFrame(t => drawSparks(L, t)) : 0;
}

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
  /** 鏡頭飛過去：輕柔滑音 */
  whoosh() { this._tone(330, { dur: 0.5, type: 'sine', gain: 0.06, slide: 2 }); }
}

/** v4：瀏覽器內建語音唸字（不用音檔）。優先 zh-TW 語音；沒有中文語音時 say() 回傳 false，遊戲照常。靜音鍵同時關掉語音。 */
export class Voice {
  constructor(sound) {
    this.sound = sound; this.ok = typeof window !== 'undefined' && 'speechSynthesis' in window && typeof SpeechSynthesisUtterance === 'function';
    this.voice = null; this.spoken = [];
    if (this.ok) { this._pick(); try { speechSynthesis.addEventListener('voiceschanged', () => this._pick()); } catch { /* 舊版 Safari */ } }
  }
  _pick() {
    const vs = speechSynthesis.getVoices(), L = v => (v.lang || '').replace('_', '-').toLowerCase();
    this.voice = vs.find(v => L(v) === 'zh-tw') || vs.find(v => L(v) === 'zh-cn') || vs.find(v => L(v).startsWith('zh') && !/hk|yue/.test(L(v))) || null;
  }
  /** 必須至少一次在使用者手勢內呼叫（iOS 規定）；開始寫字按鈕的 click 會同步呼叫到這裡。 */
  say(text, { rate = 0.75 } = {}) {
    if (!this.ok || !text || this.sound?.muted) return false;
    try {
      speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(text); u.lang = this.voice?.lang || 'zh-TW'; if (this.voice) u.voice = this.voice; u.rate = rate; u.pitch = 1.1;
      speechSynthesis.speak(u); this.spoken.push(text); return true;
    } catch { return false; }
  }
  stop() { try { if (this.ok) speechSynthesis.cancel(); } catch { /* ignore */ } }
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
.fx-spark{position:absolute;left:0;top:0;width:10px;height:10px;margin:-5px 0 0 -5px;border-radius:50%;pointer-events:none;background:radial-gradient(circle,#fff 0,#ffd43b 45%,rgba(255,212,59,0) 70%);animation:fx-spark 520ms ease-out forwards}
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

export function flash(el, cls = 'fx-flash') { injectCss(); el.classList.remove(cls); void el.offsetWidth; el.classList.add(cls); setTimeout(() => el.classList.remove(cls), 450); }

/** v4：手指寫字時的星光尾巴（px，相對 container） */
export function spark(container, x, y) {
  const l = layerIn(container), d = document.createElement('i'); d.className = 'fx-spark';
  d.style.setProperty('--x', x + 'px'); d.style.setProperty('--y', y + 'px');
  d.style.setProperty('--dx', (Math.random() - 0.5) * 18 + 'px'); d.style.setProperty('--dy', (Math.random() * 14 + 4) + 'px');
  l.append(d); setTimeout(() => d.remove(), 560);
}

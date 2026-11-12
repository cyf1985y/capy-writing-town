// v42 聽寫小考（全螢幕，不動寫字存檔）：一次 5 題，每題兩步——
// 1) 聽：唸「拍，拍手的拍」，不給字也不給注音；用注音磚拼出這個字的注音（符號＋聲調），干擾磚是容易混的音（ㄣ／ㄥ、ㄓ／ㄗ…）。
// 2) 寫：沒有描紅底圖，把國字默寫出來（卡住可以按提示，會記成「要再練」）。
// 要再練的字（注音第一次沒拼對、用了提示、或寫錯很多筆）記在 localStorage，下次優先出題；之後一次答對就會消掉。
// 注音磚是用點的，不是手寫（沒有注音符號的筆順資料）。語音用裝置內建的語音，輕聲、多音字唸得對不對要真人聽。
import HanziWriter from '../vendor-v2/hanzi-writer/lib/dist/index.esm.js';
import { bravo, flash } from './fx.js?v=51';
import { introText, zhuyinHTML, loadCharData, QUIZ_CONFIG, FAT_FINGER } from './writing-panel.js?v=51';

const CSS = `
.dc-overlay{position:fixed;inset:0;z-index:1000;background:rgba(91,58,74,.72);display:flex;align-items:center;justify-content:center;font:16px system-ui,"Noto Sans TC",sans-serif;color:var(--ui-ink,#5B3A4A);touch-action:manipulation}
.dc-dialog{position:relative;background:#fffdf7;border-radius:20px;box-shadow:0 20px 60px rgba(0,0,0,.35);padding:16px 16px 18px;width:min(94vw,540px);max-height:97vh;overflow:auto;box-sizing:border-box;text-align:center}
.dc-dialog h2{margin:0 0 4px;font-size:20px}
.dc-dots{display:flex;gap:6px;justify-content:center;margin:0 0 6px}
.dc-dots span{width:12px;height:12px;border-radius:50%;background:#e3ddd0}.dc-dots span.on{background:var(--ui-primaryDark,#E8665C)}
.dc-ask{font-size:19px;font-weight:700;margin:4px 0}
.dc-word{font-size:26px;min-height:1.6em;margin:2px 0 6px;display:flex;justify-content:center;align-items:center;gap:2px;flex-wrap:wrap}
.dc-word .dc-w{display:inline-flex;align-items:center;font-family:"Kaiti TC","BiauKai","DFKai-SB","Noto Serif TC",serif}
.dc-word .dc-w .zy{font-size:12px;margin-left:1px}
.dc-word .dc-mask{color:#E55A4E;font-weight:700}
.dc-speak{font:inherit;font-size:30px;width:64px;height:64px;border-radius:50%;border:3px solid #F5CBA7;background:#FFF8E7;cursor:pointer;touch-action:manipulation;margin:0 0 6px}
.dc-ans{display:flex;justify-content:center;align-items:center;gap:8px;margin:2px 0 8px;min-height:74px}
.dc-slots{display:flex;gap:6px}
.dc-slots button,.dc-tslot{font:inherit;font-size:34px;line-height:1;width:58px;height:66px;border-radius:14px;border:3px dashed #d9cfbd;background:#fff;color:#2f3e46;cursor:pointer;touch-action:manipulation;padding:0}
.dc-slots button.fill,.dc-tslot.fill{border-style:solid;border-color:#F4B6A8}
.dc-tslot{width:50px;font-size:48px;color:#E8665C}
.dc-ans.bad .fill{border-color:#c92a2a;background:#fff1f1}.dc-ans.good .fill{border-color:#2b8a3e;background:#E6F7EA}
.dc-tiles{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin:0 auto 8px;max-width:340px}
.dc-tiles button{font:inherit;font-size:32px;line-height:1;height:58px;border-radius:14px;border:3px solid #F4B6A8;background:#fff;color:#2f3e46;cursor:pointer;touch-action:manipulation;padding:0}
.dc-tiles button.used{opacity:.3}
.dc-tones{display:grid;grid-template-columns:repeat(5,1fr);gap:6px;margin:0 auto 8px;max-width:400px}
.dc-tones button{font:inherit;line-height:1.1;height:58px;border-radius:14px;border:3px solid #BFD9F2;background:#fff;color:#1c5d99;cursor:pointer;touch-action:manipulation;padding:0}
.dc-tones button b{display:block;font-size:44px;height:26px;line-height:50px}.dc-tones button small{font-size:13px}
.dc-tones button.on{background:#1c5d99;color:#fff;border-color:#1c5d99}
.dc-key{font-size:22px;margin:0 0 6px;color:#2b8a3e;display:flex;justify-content:center;align-items:center;gap:6px}
.dc-key .zy{font-size:26px}
.dc-grid{position:relative;width:min(70vw,300px,46vh);aspect-ratio:1;margin:4px auto 8px;border:3px solid #F4B6A8;border-radius:14px;background:#fff;touch-action:none;overflow:hidden}
.dc-grid::before,.dc-grid::after{content:"";position:absolute;pointer-events:none;border:0 dashed #efd9cf}
.dc-grid::before{left:50%;top:0;bottom:0;border-left-width:2px}.dc-grid::after{top:50%;left:0;right:0;border-top-width:2px}
.dc-target{position:absolute;inset:0}
.dc-msg{min-height:1.5em;font-size:17px;margin:0 0 8px}.dc-msg.ok{color:#2b8a3e}.dc-msg.err{color:#c92a2a}
.dc-actions{display:flex;gap:10px;justify-content:center;flex-wrap:wrap}
.dc-actions button{font:inherit;font-size:18px;padding:10px 16px;border-radius:12px;border:2px solid #F7C9C0;background:#fff;cursor:pointer;touch-action:manipulation}
.dc-actions button.dc-primary{background:var(--ui-primaryDark,#E8665C);border-color:var(--ui-primaryDark,#E8665C);color:#fff}
.dc-actions button:disabled{opacity:.45;cursor:default}
.dc-result{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:5px;margin:6px 0 10px}
.dc-result div{border:3px solid #BFE3C6;border-radius:14px;padding:6px 2px;background:#F3FBF4}
.dc-result div.weak{border-color:#F4B6A8;background:#FFF4F1}
.dc-result .c{font-size:clamp(24px,7vw,42px);line-height:1.1;font-family:"Kaiti TC","BiauKai","DFKai-SB","Noto Serif TC",serif;display:flex;justify-content:center;align-items:center}
.dc-result .c .zy{font-size:13px;margin-left:2px}
.dc-result small{display:block;font-size:12px;line-height:1.5}
[hidden].dc-h,.dc-dialog [hidden]{display:none!important}
@media (min-width:700px){.dc-dialog{width:min(94vw,620px);padding:22px 22px 24px}.dc-tiles{max-width:440px;gap:10px}.dc-tiles button{height:76px;font-size:40px}.dc-tones{max-width:500px}.dc-tones button{height:72px}.dc-slots button,.dc-tslot{height:80px;width:70px;font-size:42px}.dc-tslot{width:60px;font-size:54px}.dc-grid{width:min(70vw,380px,46vh)}.dc-ask{font-size:22px}.dc-word{font-size:30px}.dc-actions button{font-size:20px;padding:12px 20px}} /* 平板：磚和格子放大 */
/* v47 手機橫放（高度 ≤ 560）：左邊＝拼注音的格子／寫字格／成績，右邊＝題目、喇叭、訊息、按鈕；不用上下捲 */
@media (orientation:landscape) and (max-height:560px){
.dc-dialog{width:min(96vw,860px);max-height:calc(100vh - 10px);max-height:calc(100dvh - 10px);padding:10px 14px;display:grid;grid-template-columns:minmax(0,1.25fr) minmax(0,1fr);grid-template-rows:repeat(7,auto) 1fr;column-gap:16px;align-content:start;align-items:start}
.dc-dialog>h2,.dc-dots,.dc-ask,.dc-word,.dc-speak,.dc-key,.dc-msg,.dc-actions{grid-column:2}
.dc-zy,.dc-grid,.dc-result{grid-column:1;grid-row:1/9;align-self:center}
.dc-dialog h2{font-size:17px}.dc-ask{font-size:16px;margin:2px 0}.dc-word{font-size:22px;margin:0 0 4px}
.dc-speak{width:52px;height:52px;font-size:26px;justify-self:center;margin:0 0 4px}
.dc-ans{min-height:60px;margin:0 0 6px}
.dc-slots button,.dc-tslot{height:56px;width:50px;font-size:30px}.dc-tslot{width:44px;font-size:40px}
.dc-tiles{max-width:none;gap:6px;margin:0 0 6px}.dc-tiles button{height:48px;font-size:28px}
.dc-tones{max-width:none;gap:5px;margin:0}.dc-tones button{height:50px}.dc-tones button b{font-size:38px;height:22px;line-height:44px}.dc-tones button small{font-size:12px}
.dc-dialog>.dc-grid{width:min(calc(100vh - 46px),44vw);width:min(calc(100dvh - 46px),44vw);margin:0 auto}
.dc-key{font-size:18px}.dc-msg{font-size:15px;margin:0 0 6px}
.dc-actions{gap:6px}.dc-actions button{font-size:15px;padding:8px 12px}
.dc-result{margin:0}.dc-result .c{font-size:30px}
}
`;
const shuffle = a => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };

export const DICTATION_N = 5;
const SYMBOLS = [...'ㄅㄆㄇㄈㄉㄊㄋㄌㄍㄎㄏㄐㄑㄒㄓㄔㄕㄖㄗㄘㄙㄧㄨㄩㄚㄛㄜㄝㄞㄟㄠㄡㄢㄣㄤㄥㄦ'];
/** 容易混的音（小一常錯的）：送氣不送氣、捲舌不捲舌、前後鼻音、ㄋㄌ、ㄈㄏ…。每個符號列兩個，排前面的先當干擾磚。 */
const CONFUSE = { ㄅ: 'ㄆㄇ', ㄆ: 'ㄅㄈ', ㄇ: 'ㄋㄈ', ㄈ: 'ㄏㄆ', ㄉ: 'ㄊㄌ', ㄊ: 'ㄉㄌ', ㄋ: 'ㄌㄇ', ㄌ: 'ㄋㄖ', ㄍ: 'ㄎㄏ', ㄎ: 'ㄍㄏ', ㄏ: 'ㄈㄎ', ㄐ: 'ㄑㄒ', ㄑ: 'ㄐㄒ', ㄒ: 'ㄑㄙ',
  ㄓ: 'ㄗㄔ', ㄔ: 'ㄘㄓ', ㄕ: 'ㄙㄖ', ㄖ: 'ㄌㄕ', ㄗ: 'ㄓㄘ', ㄘ: 'ㄔㄗ', ㄙ: 'ㄕㄒ', ㄧ: 'ㄩㄝ', ㄨ: 'ㄩㄛ', ㄩ: 'ㄧㄨ',
  ㄚ: 'ㄛㄜ', ㄛ: 'ㄡㄜ', ㄜ: 'ㄛㄦ', ㄝ: 'ㄟㄧ', ㄞ: 'ㄟㄢ', ㄟ: 'ㄞㄝ', ㄠ: 'ㄡㄛ', ㄡ: 'ㄠㄛ', ㄢ: 'ㄤㄣ', ㄣ: 'ㄥㄢ', ㄤ: 'ㄢㄥ', ㄥ: 'ㄣㄤ', ㄦ: 'ㄜㄚ' };
/** 聲調磚：一聲沒有記號，磚上只寫「一聲」 */
export const TONES = Object.freeze([{ id: '1', mark: '', label: '一聲' }, { id: 'ˊ', mark: 'ˊ', label: '二聲' }, { id: 'ˇ', mark: 'ˇ', label: '三聲' }, { id: 'ˋ', mark: 'ˋ', label: '四聲' }, { id: '˙', mark: '˙', label: '輕聲' }]);

/** 「˙ㄇㄜ」→ {syms:[ㄇ,ㄜ], tone:'˙'}；「ㄆㄞ」→ tone '1'；「ㄅㄞˊ」→ tone 'ˊ' */
export function parseZhuyin(zy) {
  const light = zy.startsWith('˙'), body = zy.replace(/^˙/, ''), mark = /[ˊˇˋ]$/.test(body) ? body.slice(-1) : '';
  return { syms: [...(mark ? body.slice(0, -1) : body)], tone: light ? '˙' : mark || '1' };
}
/** 注音磚：正確的符號＋容易混的符號，補到 n 顆；照ㄅㄆㄇ順序排（好找，也不會從位置看出答案） */
export function buildTiles(syms, n = 8) {
  const set = new Set(syms);
  for (const k of [0, 1]) for (const s of syms) { const c = CONFUSE[s]?.[k]; if (c && set.size < n) set.add(c); }
  for (const s of shuffle(SYMBOLS)) { if (set.size >= n) break; set.add(s); }
  return SYMBOLS.filter(s => set.has(s));
}
/** 出題：要再練的字優先（最多 3 個），其餘從學過的字隨機補；pool＝[{char, zhuyin, word}] */
export function pickQuestions(pool, weak = {}, n = DICTATION_N) {
  const ok = pool.filter(t => t.char && t.zhuyin), w = shuffle(ok.filter(t => weak[t.char])).slice(0, Math.min(3, n)), got = new Set(w.map(t => t.char));
  return shuffle([...w, ...shuffle(ok.filter(t => !got.has(t.char))).slice(0, n - w.length)]);
}
/** 存檔 {v, weak:{字:次數≤3}, sessions, tested:{字:考過幾次}, missed:{字:沒全對幾次}, history:[{at, qs:[{c, zy, w}]}]}；w：ok／hint（看提示）／many（錯 3 筆以上）／skip */
export function loadWeak(key) { try { const o = JSON.parse(localStorage.getItem(key) || 'null'); return o && typeof o.weak === 'object' && o.weak ? o : { v: 1, weak: {}, sessions: 0 }; } catch { return { v: 1, weak: {}, sessions: 0 }; } }

export class Dictation {
  /** dataBaseFor(char) 回傳字形資料夾；wordZhuyin(word) 回傳詞語逐字注音（沒有就只顯示國字） */
  constructor({ voice, sound, log = () => {}, storageKey, dataBaseFor, wordZhuyin, onOpen, onClose }) { Object.assign(this, { voice, sound, log, storageKey, dataBaseFor, wordZhuyin, onOpen, onClose }); this.el = null; this.state = null; }
  isOpen() { return !!this.el; }
  weak() { return Object.keys(loadWeak(this.storageKey).weak); }

  // v51：抽題、標題、記成績、寫完之後，拆成可以覆寫的方法（守門員關 boss.js 重用整個流程）；聽寫小考本身的行為不變
  _pickQs(pool) { const qs = pickQuestions(pool, loadWeak(this.storageKey).weak); return qs.length < DICTATION_N ? null : qs; }
  _title() { return '👂 聽寫小考'; }
  open(pool, opts = {}) {
    if (this.el) return false;
    this._pool = pool; this._opts = opts;
    const qs = this._pickQs(pool);
    if (!qs) { this.log('dictation: pool too small ' + pool.length); return false; }
    if (!document.getElementById('dc-style')) { const s = document.createElement('style'); s.id = 'dc-style'; s.textContent = CSS; document.head.append(s); }
    const el = document.createElement('div'); el.className = 'dc-overlay'; el.setAttribute('role', 'dialog'); el.setAttribute('aria-modal', 'true'); el.setAttribute('aria-label', this._title().replace(/^\S+\s/, ''));
    el.innerHTML = `<div class="dc-dialog"><h2>${this._title()}</h2><div class="dc-dots"></div><div class="dc-ask"></div><div class="dc-word"></div>
<button type="button" class="dc-speak" data-act="again" aria-label="再聽一次">🔈</button>
<div class="dc-zy"><div class="dc-ans"><div class="dc-slots"></div><button type="button" class="dc-tslot" data-act="untone" aria-label="聲調"></button></div><div class="dc-tiles"></div><div class="dc-tones">${TONES.map(t => `<button type="button" data-tone="${t.id}" aria-label="${t.label}"><b>${t.mark}</b><small>${t.label}</small></button>`).join('')}</div></div>
<div class="dc-key" hidden></div><div class="dc-grid" hidden><div class="dc-target"></div></div><div class="dc-result" hidden></div>
<div class="dc-msg"></div><div class="dc-actions"></div></div>`;
    for (const t of ['pointerdown', 'pointermove', 'mousedown', 'mousemove', 'wheel', 'touchstart', 'touchmove']) el.addEventListener(t, e => e.stopPropagation(), { passive: true });
    el.addEventListener('click', e => {
      const b = e.target.closest('button'); if (!b || b.disabled || !this.state) return;
      if (b.dataset.sym) this._sym(b.dataset.sym); else if (b.dataset.slot != null) this._unsym(+b.dataset.slot); else if (b.dataset.tone) this._tone(b.dataset.tone); else if (b.dataset.act) this._act(b.dataset.act);
    });
    this._onKey = e => { e.stopPropagation(); if (e.key === 'Escape') this.close(); }; document.addEventListener('keydown', this._onKey, true);
    document.body.append(el); this.el = el;
    this.state = { qs: qs.map(t => ({ char: t.char, zhuyin: t.zhuyin, word: t.word || '', ...parseZhuyin(t.zhuyin), zyWrong: 0, mistakes: 0, hint: false, done: false, weak: false })), i: 0, phase: 'zy', ans: [], tone: null, writer: null, finished: false };
    this.onOpen?.(); this.log('dictation open ' + qs.map(t => t.char).join('')); this._question(0);
    return true;
  }
  close() {
    if (!this.el) return;
    this.voice?.stop(); document.removeEventListener('keydown', this._onKey, true); this._dropWriter(); this.el.remove(); this.el = null;
    const s = this.state; this.state = null; const done = s.qs.filter(q => q.done);
    this.onClose?.({ done: done.length, total: s.qs.length, weak: done.filter(q => q.weak).map(q => q.char), finished: s.finished });
  }

  _q(sel) { return this.el.querySelector(sel); }
  _msg(t, cls = '') { const m = this._q('.dc-msg'); m.textContent = t; m.className = 'dc-msg ' + cls; }
  _cur() { return this.state.qs[this.state.i]; }
  _prompt() { const q = this._cur(); if (q) this.voice?.say(introText(q.char, q.word)); }
  _show(phase) { for (const [sel, on] of [['.dc-zy', phase === 'zy'], ['.dc-key', phase === 'write'], ['.dc-grid', phase === 'write'], ['.dc-result', phase === 'result'], ['.dc-speak', phase !== 'result'], ['.dc-word', phase !== 'result']]) this._q(sel).hidden = !on; }
  /** 詞語：目標字換成○，其他字照常顯示（附注音）；目標字的注音只有在寫字那一步才給 */
  _wordHTML(q, withTarget) {
    if (!q.word) return `<span class="dc-w dc-mask">○${withTarget ? zhuyinHTML(q.zhuyin) : ''}</span>`;
    const zys = this.wordZhuyin?.(q.word); let k = 0;
    return [...q.word].map(c => {
      if (/[！!？?，。]/.test(c)) return `<span>${c}</span>`;
      const z = zys?.[k++], hide = c === q.char;
      return `<span class="dc-w${hide ? ' dc-mask' : ''}">${hide ? '○' : c}${hide ? (withTarget ? zhuyinHTML(q.zhuyin) : '') : zhuyinHTML(z)}</span>`;
    }).join('');
  }

  // ---------- 第 1 步：拼注音 ----------
  _question(i) {
    const s = this.state; s.i = i; const q = s.qs[i];
    if (!q) return this._finish();
    this._dropWriter(); s.phase = 'zy'; s.ans = []; s.tone = null; s.tiles = buildTiles(q.syms);
    this._show('zy');
    this._q('.dc-dots').innerHTML = s.qs.map((_, k) => `<span class="${k <= i ? 'on' : ''}"></span>`).join('');
    this._q('.dc-ask').textContent = `第 ${i + 1} 題：聽一聽，○ 的注音怎麼拼？`;
    this._q('.dc-word').innerHTML = this._wordHTML(q, false);
    this._q('.dc-tiles').innerHTML = s.tiles.map(c => `<button type="button" data-sym="${c}" aria-label="${c}">${c}</button>`).join('');
    this._q('.dc-actions').innerHTML = `<button type="button" data-act="check" class="dc-primary" disabled>✔ 拼好了</button><button type="button" data-act="close">回小鎮</button>`;
    this._msg('點注音符號，再點聲調'); this._paintAns(); this._prompt();
  }
  _paintAns(cls = '') {
    const s = this.state, n = Math.max(1, Math.min(3, s.ans.length + 1));
    this._q('.dc-ans').className = 'dc-ans ' + cls;
    this._q('.dc-slots').innerHTML = Array.from({ length: n }, (_, k) => s.ans[k] ? `<button type="button" class="fill" data-slot="${k}" aria-label="拿掉 ${s.ans[k]}">${s.ans[k]}</button>` : `<button type="button" disabled aria-label="空格"></button>`).slice(0, s.ans.length >= 3 ? 3 : n).join('');
    const ts = this._q('.dc-tslot'), t = TONES.find(x => x.id === s.tone); ts.className = 'dc-tslot' + (t ? ' fill' : ''); ts.innerHTML = t ? (t.mark || '<small style="font-size:13px">一聲</small>') : '';
    for (const b of this.el.querySelectorAll('.dc-tiles button')) b.classList.toggle('used', s.ans.includes(b.dataset.sym));
    for (const b of this.el.querySelectorAll('.dc-tones button')) b.classList.toggle('on', b.dataset.tone === s.tone);
    const chk = this._q('.dc-actions [data-act="check"]'); if (chk) chk.disabled = !s.ans.length || !s.tone;
  }
  _sym(c) {
    const s = this.state; if (s.phase !== 'zy') return;
    if (s.ans.includes(c)) s.ans = s.ans.filter(x => x !== c); else if (s.ans.length < 3) s.ans.push(c); else { this._msg('最多三個符號，點上面的格子可以拿掉', 'err'); return; }
    this.sound?.stroke(s.ans.length); this._paintAns();
  }
  _unsym(k) { const s = this.state; if (s.phase !== 'zy') return; s.ans.splice(k, 1); this._paintAns(); }
  _tone(t) { const s = this.state; if (s.phase !== 'zy') return; s.tone = t; this.sound?.stroke(2); this._paintAns(); }
  _check() {
    const s = this.state, q = this._cur(); if (s.phase !== 'zy' || !s.ans.length || !s.tone) return;
    const symOk = s.ans.join('') === q.syms.join(''), toneOk = s.tone === q.tone;
    if (symOk && toneOk) {
      s.phase = 'zyDone'; this._paintAns('good'); this.sound?.complete?.(); flash(this._q('.dc-ans'));
      this._msg(q.zyWrong ? '拼對了！' : '一次就拼對了！', 'ok'); this.voice?.say('拼對了！');
      this._q('.dc-actions').innerHTML = `<button type="button" data-act="write" class="dc-primary">✏️ 寫國字 ▶</button>`;
      this.log(`dictation zy ok ${q.char} wrong=${q.zyWrong}`); return;
    }
    q.zyWrong += 1; this.sound?.mistake(); this._paintAns('bad'); flash(this._q('.dc-ans'), 'fx-shake');
    const what = !symOk && !toneOk ? '注音符號和聲調都' : !symOk ? '注音符號' : '聲調';
    if (q.zyWrong >= 2) { // 錯兩次就給答案，照著拼一次（這個字會記成要再練）
      const k = this._q('.dc-key'); k.hidden = false; k.innerHTML = `正確的拼法：${zhuyinHTML(q.zhuyin)}`;
      this._msg(`${what}不對。看綠色的答案，照著拼一次`, 'err');
    } else this._msg(`${what}不對喔，再聽一次`, 'err');
    this.log(`dictation zy wrong ${q.char} got=${s.ans.join('')}${s.tone} sym=${symOk} tone=${toneOk}`);
    setTimeout(() => { if (this.state === s && s.phase === 'zy' && this._cur() === q) { if (!symOk) s.ans = []; if (!toneOk) s.tone = null; this._paintAns(); } }, 700);
    this._prompt();
  }

  // ---------- 第 2 步：默寫國字 ----------
  async _write() {
    const s = this.state, q = this._cur(); if (s.phase !== 'zyDone') return;
    s.phase = 'loading'; this._show('write');
    this._q('.dc-ask').textContent = '看注音，把 ○ 寫出來！';
    this._q('.dc-word').innerHTML = this._wordHTML(q, true);
    this._q('.dc-key').innerHTML = zhuyinHTML(q.zhuyin);
    this._q('.dc-actions').innerHTML = `<button type="button" data-act="hint">💡 提示</button><button type="button" data-act="close">回小鎮</button>`;
    this._msg('在格子裡一筆一筆寫'); this._prompt();
    let data;
    try { data = (await loadCharData(q.char, this.dataBaseFor(q.char))).data; }
    catch (e) { this.log(`dictation char data failed ${q.char}: ${e?.message || e}`); if (this.state !== s) return; this._msg('這個字的資料讀不到，先跳過', 'err'); s.phase = 'written'; q.skipped = true; this._nextBtn(); return; }
    if (this.state !== s || this._cur() !== q) return;
    const target = this._q('.dc-target'), size = target.clientWidth || 280, total = data.strokes.length, len = total >= FAT_FINGER.minStrokes ? QUIZ_CONFIG.leniency * FAT_FINGER.boost : QUIZ_CONFIG.leniency;
    s.writer = HanziWriter.create(target, q.char, {
      width: size, height: size, padding: QUIZ_CONFIG.padding, renderer: QUIZ_CONFIG.renderer, showOutline: false, showCharacter: false,
      strokeColor: '#2f3e46', outlineColor: '#dcd5c6', drawingColor: '#1c5d99', highlightColor: '#f08c00', highlightCompleteColor: '#2b8a3e',
      drawingWidth: QUIZ_CONFIG.drawingWidth, strokeWidth: QUIZ_CONFIG.strokeWidth,
      charDataLoader: (char, onLoad, onError) => { if (char === q.char) onLoad(data); else onError(new Error('UNEXPECTED_CHAR:' + char)); }, // 只讀本機資料
    });
    s.phase = 'write'; s.totalStrokes = total;
    s.writer.quiz({
      leniency: len, showHintAfterMisses: QUIZ_CONFIG.showHintAfterMisses, highlightOnComplete: QUIZ_CONFIG.highlightOnComplete,
      acceptBackwardsStrokes: QUIZ_CONFIG.acceptBackwardsStrokes, markStrokeCorrectAfterMisses: QUIZ_CONFIG.markStrokeCorrectAfterMisses,
      onCorrectStroke: d => { this.sound?.stroke(d.strokeNum); this._msg(d.strokesRemaining ? `對了！還有 ${d.strokesRemaining} 筆` : '全部寫完了！', 'ok'); },
      onMistake: d => { q.mistakes += 1; this.sound?.mistake(); flash(this._q('.dc-grid'), 'fx-shake'); this._msg(d.mistakesOnStroke >= QUIZ_CONFIG.showHintAfterMisses ? '看橘色那一筆，照著寫' : '這一筆不太對，再想一想', 'err'); },
      onComplete: () => {
        if (this.state !== s) return;
        s.phase = 'written'; this.sound?.complete?.(); bravo(this._q('.dc-dialog'), q.hint ? '寫好了！' : '好棒！');
        this._q('.dc-word').innerHTML = `<span class="dc-w">${q.char}${zhuyinHTML(q.zhuyin)}</span>` + (q.word && q.word !== q.char ? `<span style="font-size:18px;margin-left:8px">（${q.word}）</span>` : '');
        this._msg(q.hint ? '寫完了！這個字下次再考一次' : '自己寫出來了，好厲害！', 'ok'); this.voice?.say(q.hint ? '寫完了！' : '寫對了，好棒！');
        this.log(`dictation written ${q.char} mistakes=${q.mistakes} hint=${q.hint}`); this._afterWrite();
      },
    });
  }
  _hint() {
    const s = this.state, q = this._cur(); if (s.phase !== 'write' || !s.writer) return;
    q.hint = true; try { s.writer.showOutline(); } catch { /* ignore */ }
    this._msg('淡淡的字出來了，照著寫', ''); const b = this._q('.dc-actions [data-act="hint"]'); if (b) b.disabled = true; this.log(`dictation hint ${q.char}`);
  }
  /** 寫完國字之後（守門員關會在這裡多一步「認部件」） */
  _afterWrite() { this._nextBtn(); }
  /** 這一題結束：記成績、更新「要再練的字」 */
  _nextBtn() {
    const s = this.state, q = this._cur(), last = s.i === s.qs.length - 1;
    q.done = true; q.weak = q.zyWrong > 0 || q.hint || q.mistakes >= 3 || !!q.skipped;
    this._record(q, last);
    this._q('.dc-actions').innerHTML = `<button type="button" data-act="next" class="dc-primary">${last ? '看成績 ▶' : '下一題 ▶'}</button>`;
  }
  /** 把這一題的結果寫進聽寫小考的存檔 */
  _record(q, last) {
    const s = this.state;
    try {
      const o = loadWeak(this.storageKey);
      if (q.weak) o.weak[q.char] = Math.min(3, (o.weak[q.char] || 0) + 1); else if (o.weak[q.char]) { o.weak[q.char] -= 1; if (o.weak[q.char] <= 0) delete o.weak[q.char]; }
      o.tested = o.tested && typeof o.tested === 'object' ? o.tested : {}; o.tested[q.char] = (o.tested[q.char] || 0) + 1;
      o.missed = o.missed && typeof o.missed === 'object' ? o.missed : {}; if (q.weak) o.missed[q.char] = (o.missed[q.char] || 0) + 1;
      if (last) { o.sessions = (o.sessions || 0) + 1; o.history = [...(Array.isArray(o.history) ? o.history : []), { at: new Date().toISOString(), qs: s.qs.map(x => ({ c: x.char, zy: x.zyWrong === 0, w: x.skipped ? 'skip' : x.hint ? 'hint' : x.mistakes >= 3 ? 'many' : 'ok' })) }].slice(-20); }
      localStorage.setItem(this.storageKey, JSON.stringify(o));
    } catch { /* 私密模式：不記也能玩 */ }
  }
  _dropWriter() { const s = this.state; if (s?.writer) { try { s.writer.cancelQuiz(); } catch { /* ignore */ } s.writer = null; } const t = this.el?.querySelector('.dc-target'); if (t) t.innerHTML = ''; }

  _finish() {
    const s = this.state; s.phase = 'result'; s.finished = true; this._dropWriter(); this._show('result');
    const weak = s.qs.filter(q => q.weak), perfect = !weak.length;
    this._q('.dc-dots').innerHTML = '';
    this._q('.dc-ask').textContent = perfect ? '💯 聽寫小考，全部答對！' : '🎉 聽寫小考完成！';
    this._q('.dc-result').innerHTML = s.qs.map(q => `<div class="${q.weak ? 'weak' : ''}"><span class="c">${q.char}${zhuyinHTML(q.zhuyin)}</span><small>注音 ${q.zyWrong ? '✗' : '✓'}</small><small>國字 ${q.skipped ? '—' : q.hint ? '💡' : q.mistakes >= 3 ? '△' : '✓'}</small></div>`).join('');
    this._msg(perfect ? '注音和國字都自己寫出來了！' : `今天要再練的字：${weak.map(q => q.char).join('、')}（下次會先考）`, perfect ? 'ok' : '');
    this._q('.dc-actions').innerHTML = `<button type="button" data-act="replay">再考 5 題</button><button type="button" data-act="close" class="dc-primary">回小鎮</button>`;
    this.voice?.say(perfect ? '聽寫小考，全部答對！' : '聽寫小考完成，好棒！'); bravo(this._q('.dc-dialog'), perfect ? '全對！' : '完成！');
    this.log(`dictation done weak=${weak.map(q => q.char).join('')}`);
  }
  _act(a) {
    const s = this.state;
    if (a === 'close') this.close(); else if (a === 'again') this._prompt(); else if (a === 'check') this._check(); else if (a === 'write') this._write(); else if (a === 'hint') this._hint();
    else if (a === 'untone') { if (s.phase === 'zy') { s.tone = null; this._paintAns(); } }
    else if (a === 'next') { if (s.phase === 'written') this._question(s.i + 1); }
    else if (a === 'replay') { const pool = this._pool; this.close(); if (pool) this.open(pool); }
  }
}

// v12 部件小偵探（全螢幕小遊戲，不存檔）：
// - 找部件：「哪些字有『亻』？」把字卡裡有這個部件的都點出來；
// - 聽音找字：唸「上，上下的上」，從長得很像的字（上／下）裡點出對的那一個。
// 資料 game/parts_game.json（Claude 撰寫，人工核對 pending）；字庫＝孩子學過的字（＋目前這一課的字）。
import { bravo, flash } from './fx.js?v=55';
import { introText } from './writing-panel.js?v=55';

const CSS = `
.pg-overlay{position:fixed;inset:0;z-index:1000;background:rgba(91,58,74,.72);display:flex;align-items:center;justify-content:center;font:16px system-ui,"Noto Sans TC",sans-serif;color:var(--ui-ink,#5B3A4A);touch-action:manipulation}
.pg-dialog{position:relative;background:#fffdf7;border-radius:20px;box-shadow:0 20px 60px rgba(0,0,0,.35);padding:18px 18px 20px;width:min(92vw,520px);max-height:96vh;overflow:auto;box-sizing:border-box;text-align:center}
.pg-dialog h2{margin:0 0 4px;font-size:20px}
.pg-dots{display:flex;gap:6px;justify-content:center;margin:0 0 8px}
.pg-dots span{width:12px;height:12px;border-radius:50%;background:#e3ddd0}.pg-dots span.on{background:var(--ui-primaryDark,#E8665C)}
.pg-ask{font-size:19px;font-weight:700;margin:6px 0 4px}
.pg-part{display:inline-block;min-width:1.4em;font-size:44px;line-height:1.2;padding:2px 12px;margin:2px 0 10px;border-radius:16px;background:#FFF8E7;border:3px solid #F5CBA7;color:#E8665C}
.pg-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin:6px 0 12px}
.pg-grid button{font:inherit;font-size:clamp(40px,12vw,58px);line-height:1;aspect-ratio:1;border-radius:16px;border:3px solid #F4B6A8;background:#fff;color:#2f3e46;cursor:pointer;touch-action:manipulation;font-family:"Kaiti TC","BiauKai","DFKai-SB","Noto Serif TC",serif}
.pg-grid button.ok{background:#E6F7EA;border-color:#2b8a3e;color:#2b8a3e}
.pg-grid button:disabled{cursor:default}
.pg-msg{min-height:1.5em;font-size:17px;margin:0 0 10px}.pg-msg.ok{color:#2b8a3e}.pg-msg.err{color:#c92a2a}
.pg-actions{display:flex;gap:10px;justify-content:center}
.pg-actions button{font:inherit;font-size:18px;padding:10px 18px;border-radius:12px;border:2px solid #F7C9C0;background:#fff;cursor:pointer;touch-action:manipulation}
.pg-actions button.pg-primary{background:var(--ui-primaryDark,#E8665C);border-color:var(--ui-primaryDark,#E8665C);color:#fff}
/* v47 手機橫放：字卡排成一排、按鈕留在畫面裡 */
@media (orientation:landscape) and (max-height:560px){
.pg-dialog{width:min(96vw,760px);max-height:calc(100vh - 10px);max-height:calc(100dvh - 10px);padding:10px 14px 12px}
.pg-dialog h2{font-size:17px;margin:0 0 2px}.pg-dots{margin:0 0 4px}.pg-ask{font-size:16px;margin:2px 0}
.pg-part{font-size:32px;padding:0 10px;margin:0 0 6px}
.pg-grid{grid-template-columns:repeat(auto-fit,minmax(70px,104px));justify-content:center;gap:8px;margin:4px 0 8px}
.pg-grid button{font-size:clamp(30px,6vw,46px)}
.pg-msg{margin:0 0 6px;font-size:15px}
.pg-actions button{font-size:15px;padding:7px 14px}
}
`;
const shuffle = a => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };

/** 依字庫出題：最多 2 題找部件＋1 題聽音找字。字庫不夠就少出幾題。 */
export function buildRounds(data, pool, { words = {}, cards = 6, focus = null } = {}) {
  const have = new Set(pool), rounds = [];
  let partCands = shuffle(data.parts.map(p => ({ ...p, hits: p.chars.filter(c => have.has(c)) })).filter(p => p.hits.length >= 2 && pool.filter(c => !p.chars.includes(c) && !p.maybe?.includes(c)).length >= 2));
  if (focus) partCands = [...partCands.filter(p => p.hits.includes(focus)), ...partCands.filter(p => !p.hits.includes(focus))]; // v46：從字卡進來的字優先出題
  for (const p of partCands.slice(0, 2)) {
    const hits = focus && p.hits.includes(focus) ? [focus, ...shuffle(p.hits.filter(c => c !== focus))] : shuffle(p.hits), targets = hits.slice(0, Math.min(3, cards - 2)), others = shuffle(pool.filter(c => !p.chars.includes(c) && !p.maybe?.includes(c))).slice(0, cards - targets.length); // v19：maybe＝看起來像有又不太算的字，不拿來當干擾字
    rounds.push({ kind: 'part', part: p.part, say: p.say, targets, cards: shuffle([...targets, ...others]) });
  }
  const used = new Set(rounds.flatMap(r => r.targets)), overlap = g => g.filter(c => used.has(c)).length; // 優先挑和前面答案不重複的形近字組
  const alike = shuffle(data.lookalike.map(g => g.filter(c => have.has(c))).filter(g => g.length >= 2)).sort((a, b) => (focus ? b.includes(focus) - a.includes(focus) : 0) || overlap(a) - overlap(b))[0];
  if (alike) { const t = focus && alike.includes(focus) ? focus : alike[Math.floor(Math.random() * alike.length)]; rounds.push({ kind: 'listen', targets: [t], cards: shuffle(alike), prompt: introText(t, words[t]) }); }
  if (focus) { const k = rounds.findIndex(r => r.targets.includes(focus)); if (k > 0) rounds.unshift(...rounds.splice(k, 1)); } // 有這個字的那題排第一題
  return rounds;
}
/** v46：這個字在字庫裡能不能出部件題或聽音找字題（字卡視窗決定要不要顯示「部件小偵探」按鈕） */
export function canFocus(data, pool, ch) { return buildRounds(data, pool, { focus: ch }).some(r => r.targets.includes(ch)); }

export class PartsGame {
  constructor({ data, voice, sound, log = () => {}, onOpen, onClose }) { Object.assign(this, { data, voice, sound, log, onOpen, onClose }); this.el = null; this.state = null; }
  isOpen() { return !!this.el; }

  /** pool：可出題的字；words：字→提示詞（聽音找字用） */
  open(pool, words = {}, focus = null) {
    if (this.el) return false;
    const rounds = buildRounds(this.data, pool, { words, focus });
    if (!rounds.length) { this.log('parts game: pool too small ' + pool.join('')); return false; }
    if (!document.getElementById('pg-style')) { const s = document.createElement('style'); s.id = 'pg-style'; s.textContent = CSS; document.head.append(s); }
    const el = document.createElement('div'); el.className = 'pg-overlay'; el.setAttribute('role', 'dialog'); el.setAttribute('aria-modal', 'true'); el.setAttribute('aria-label', '部件小偵探');
    el.innerHTML = `<div class="pg-dialog"><h2>🧩 部件小偵探</h2><div class="pg-dots"></div><div class="pg-ask"></div><div class="pg-part"></div><div class="pg-grid"></div><div class="pg-msg"></div><div class="pg-actions"><button type="button" data-act="again">🔈 再聽一次</button><button type="button" data-act="close">回小鎮</button></div></div>`;
    for (const t of ['pointerdown', 'pointermove', 'mousedown', 'mousemove', 'wheel', 'touchstart', 'touchmove']) el.addEventListener(t, e => e.stopPropagation(), { passive: true });
    el.querySelector('.pg-grid').addEventListener('click', e => { const b = e.target.closest('button[data-c]'); if (b) this._tap(b); });
    el.querySelector('.pg-actions').addEventListener('click', e => { const b = e.target.closest('button[data-act]'); if (!b) return; if (b.dataset.act === 'close') this.close(); else if (b.dataset.act === 'next') this._round(this.state.i + 1); else this._prompt(); });
    this._onKey = e => { e.stopPropagation(); if (e.key === 'Escape') this.close(); }; document.addEventListener('keydown', this._onKey, true);
    document.body.append(el); this.el = el;
    this.state = { rounds, i: 0, taps: 0, wrong: 0, found: 0, results: [] };
    this.onOpen?.(); this._round(0); this.log('parts game open ' + rounds.map(r => r.kind === 'part' ? r.part : 'listen:' + r.targets[0]).join(','));
    return true;
  }
  close() {
    if (!this.el) return;
    this.voice?.stop(); document.removeEventListener('keydown', this._onKey, true); this.el.remove(); this.el = null;
    const s = this.state; this.state = null; this.onClose?.({ rounds: s.results.length, total: s.rounds.length, wrong: s.wrong });
  }
  _q(sel) { return this.el.querySelector(sel); }
  _msg(t, cls = '') { const m = this._q('.pg-msg'); m.textContent = t; m.className = 'pg-msg ' + cls; }
  _prompt() { const r = this.state.rounds[this.state.i]; if (r) this.voice?.say(r.kind === 'part' ? `找一找，哪些字有${r.say}？` : r.prompt); }
  _round(i) {
    const s = this.state, r = s.rounds[i]; s.i = i; s.found = 0; s.roundWrong = 0;
    if (!r) return this._finish();
    this._q('.pg-dots').innerHTML = s.rounds.map((_, k) => `<span class="${k <= i ? 'on' : ''}"></span>`).join('');
    const part = this._q('.pg-part'); part.hidden = r.kind !== 'part'; part.textContent = r.part ?? '';
    this._q('.pg-ask').textContent = r.kind === 'part' ? `哪些字有「${r.say}」？全部點出來！` : '聽一聽，是哪一個字？';
    this._q('.pg-grid').innerHTML = r.cards.map(c => `<button type="button" data-c="${c}" aria-label="${c}">${c}</button>`).join('');
    this._q('.pg-actions').innerHTML = `<button type="button" data-act="again">🔈 再聽一次</button><button type="button" data-act="close">回小鎮</button>`;
    this._msg(r.kind === 'part' ? `一共有 ${r.targets.length} 個字` : ''); this._prompt();
  }
  _tap(b) {
    const s = this.state, r = s.rounds[s.i], c = b.dataset.c; if (!r || b.disabled || s.found >= r.targets.length) return;
    s.taps += 1;
    if (r.targets.includes(c)) {
      b.classList.add('ok'); b.disabled = true; s.found += 1; this.sound?.stroke(s.found + 2); flash(b);
      if (s.found < r.targets.length) { this._msg(`對了！還有 ${r.targets.length - s.found} 個`, 'ok'); this.voice?.say(c); return; }
      s.results.push({ kind: r.kind, wrong: s.roundWrong });
      const last = s.i === s.rounds.length - 1;
      this._msg(r.kind === 'part' ? `全部找到了！${r.targets.join('、')}都有「${r.part}」` : `答對了！是「${c}」`, 'ok');
      this.voice?.say(r.kind === 'part' ? `全部找到了！` : `答對了！`); this.sound?.complete?.();
      this._q('.pg-actions').innerHTML = `<button type="button" data-act="next" class="pg-primary">${last ? '看成績 ▶' : '下一題 ▶'}</button>`;
    } else {
      s.wrong += 1; s.roundWrong += 1; this.sound?.mistake(); flash(b, 'fx-shake');
      this._msg(r.kind === 'part' ? `「${c}」裡面沒有「${r.part}」，再看看` : `不是「${c}」喔，再聽一次`, 'err');
      if (r.kind === 'listen') this._prompt();
    }
  }
  _finish() {
    const s = this.state, perfect = s.wrong === 0;
    this._q('.pg-dots').innerHTML = ''; this._q('.pg-part').hidden = true; this._q('.pg-grid').innerHTML = '';
    this._q('.pg-ask').textContent = perfect ? '🏅 部件小偵探，全對！' : '🎉 全部完成！';
    this._msg(perfect ? '一次都沒點錯，眼睛好厲害！' : `完成 ${s.results.length} 題，下次試試全對！`, 'ok');
    this._q('.pg-actions').innerHTML = `<button type="button" data-act="close" class="pg-primary">回小鎮</button>`;
    this.voice?.say(perfect ? '部件小偵探，全部答對！' : '全部完成，好棒！'); bravo(this._q('.pg-dialog'), perfect ? '全對！' : '完成！');
    this.log(`parts game done wrong=${s.wrong}`);
  }
}

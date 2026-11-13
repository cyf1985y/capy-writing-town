// v17 字卡重播：點底部字卡 → 放大、把孩子自己的筆跡依序再畫一次、唸「字＋題庫的詞」、顯示部首。
// 存檔的 drawnPaths 只有座標、沒有時間，所以是「等速」重播，不是原本的書寫速度。
// 動畫用 Web Animations，播完即停（不用無限動畫）；prefers-reduced-motion 時直接顯示完成圖。
import HanziWriter from '../vendor-v2/hanzi-writer/lib/dist/index.esm.js';
import { zhuyinHTML, wordHTML } from './writing-panel.js?v=59';

/** 重播速度：字形座標（1024 em）每毫秒走幾單位；每筆最短時間；筆與筆之間的停頓 */
export const REPLAY = Object.freeze({ unitsPerMs: 1.1, minStrokeMs: 180, gapMs: 150, startMs: 250 });
export const MAX_WORDS = 2;

const CSS = `
.cr-overlay{position:fixed;inset:0;z-index:950;background:rgba(91,58,74,.6);display:flex;align-items:center;justify-content:center;font:16px system-ui,"Noto Sans TC",sans-serif;color:var(--ui-ink,#5B3A4A)}
.cr-box{background:#fffdf7;border-radius:20px;box-shadow:0 20px 60px rgba(0,0,0,.35);padding:14px 16px 16px;width:min(92vw,360px);max-height:92vh;overflow:auto;box-sizing:border-box;text-align:center}
.cr-head{display:flex;align-items:center;gap:8px;margin-bottom:8px;text-align:left}
.cr-head h2{margin:0;font-size:30px;line-height:1;font-family:"Kaiti TC","BiauKai","DFKai-SB","Noto Serif TC",serif}
.cr-head .zy{font-size:15px}
.cr-rad{font-size:14px;color:#6E473B;background:#FFF1DC;border-radius:999px;padding:3px 10px;white-space:nowrap}
.cr-head button{margin-left:auto;font:inherit;font-size:16px;padding:6px 12px;border-radius:12px;border:2px solid #F7C9C0;background:#fff;cursor:pointer;touch-action:manipulation;color:inherit}
.cr-stage{display:inline-block;border:3px solid #F4B6A8;border-radius:14px;overflow:hidden;line-height:0;background:#fff;max-width:100%}
.cr-stage svg{display:block;width:min(72vw,260px);height:auto}
.cr-words{display:flex;flex-wrap:wrap;gap:6px 14px;justify-content:center;margin:10px 0 4px;min-height:30px;font-size:22px}
.cr-words .wz{display:inline-flex;align-items:center}
.cr-words .wz-c{font-family:"Kaiti TC","BiauKai","DFKai-SB","Noto Serif TC",serif}
.cr-words .wz .zy{font-size:12px;margin-left:1px}
.cr-note{margin:2px 0 10px;font-size:12px;color:#8a7a70}
.cr-actions{display:flex;gap:8px;justify-content:center;flex-wrap:wrap}
.cr-actions.go{margin-top:8px}
.cr-actions.go button{background:var(--ui-primaryDark,#E8665C);border-color:var(--ui-primaryDark,#E8665C);color:#fff}
.cr-actions button{font:inherit;font-size:16px;font-weight:700;padding:8px 14px;border-radius:999px;border:2px solid #F5CBA7;background:#fff;color:#6E473B;cursor:pointer;touch-action:manipulation}
#done .wp-card{cursor:pointer;touch-action:manipulation}
/* v47 手機橫放：筆跡在左、字的資料和按鈕在右，不用捲 */
@media (orientation:landscape) and (max-height:560px){
.cr-box{width:min(94vw,640px);max-height:calc(100vh - 10px);max-height:calc(100dvh - 10px);padding:10px 14px;display:grid;grid-template-columns:auto minmax(0,1fr);grid-template-rows:repeat(4,auto) 1fr;column-gap:14px;align-items:center}
.cr-head,.cr-words,.cr-note,.cr-actions{grid-column:2}
.cr-stage{grid-column:1;grid-row:1/6}
.cr-stage svg{width:min(calc(100vh - 50px),260px);width:min(calc(100dvh - 50px),260px)}
.cr-words{margin:4px 0}.cr-note{margin:0 0 6px}
.cr-actions button{font-size:15px;padding:7px 12px}
}
`;

/** 要唸、要顯示的詞：題庫 words 前 2 個 → 沒有就用 hint_word → 都沒有就空。不自行造詞。 */
export function cardWords(info) {
  const ws = (info?.words ?? []).filter(Boolean).slice(0, MAX_WORDS);
  return ws.length ? ws : info?.hint_word ? [info.hint_word] : [];
}
export const cardSayText = (char, words) => [char, ...words].join('，');

export class CardReplay {
  /**
   * @param {object} o
   * @param {(char:string)=>{zhuyin?:string, radical?:string, words?:string[], hint_word?:string}|null} o.info  題庫資料
   * @param {(word:string)=>string[]|null} o.wordZhuyin  詞的注音（zhuyin.json 有的才有）
   * @param {object} [o.voice]  fx.js 的 Voice
   */
  constructor(o) {
    this.o = o; this.log = o.log || (() => {}); this.el = null; this.anims = [];
    if (!document.getElementById('cr-style')) { const s = document.createElement('style'); s.id = 'cr-style'; s.textContent = CSS; document.head.append(s); }
  }
  isOpen() { return !!this.el; }

  open(artifact) {
    if (this.el || !artifact?.drawnPaths?.length) return false;
    const info = this.o.info?.(artifact.char) ?? {}, words = cardWords(info), size = 260, pad = Math.round(size * 0.06), n = artifact.drawnPaths.length;
    const t = HanziWriter.getScalingTransform(size, size, pad), width = size * 0.09 * (n >= 12 ? 0.62 : n >= 7 ? 0.78 : 1); // 粗細規則同 renderArtifactCard
    const paths = artifact.drawnPaths.map(pts => `<polyline points="${pts.map(p => `${p.x},${p.y}`).join(' ')}" fill="none" stroke="#2f3e46" stroke-width="${width / t.scale}" stroke-linecap="round" stroke-linejoin="round"/>`).join('');
    // v46：從字卡直接再練這個字（寫字／部件小偵探）；沒給 callback 或這個字出不了題就不顯示
    const go = [this.o.onRewrite ? '<button type="button" data-act="rewrite">✏️ 再寫一次</button>' : '', this.o.canParts?.(artifact.char) ? '<button type="button" data-act="parts">🧩 部件小偵探</button>' : ''].filter(Boolean);
    const el = document.createElement('div'); el.className = 'cr-overlay'; el.setAttribute('role', 'dialog'); el.setAttribute('aria-modal', 'true'); el.setAttribute('aria-label', `字卡「${artifact.char}」`);
    el.innerHTML = `<div class="cr-box">
      <div class="cr-head"><h2>${artifact.char}</h2>${zhuyinHTML(info.zhuyin)}${info.radical ? `<span class="cr-rad">部首：${info.radical}</span>` : ''}<button type="button" data-act="close">關閉</button></div>
      <div class="cr-stage"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" role="img" aria-label="我寫的「${artifact.char}」"><line x1="${size / 2}" y1="0" x2="${size / 2}" y2="${size}" stroke="#e8e1d2" stroke-dasharray="4 4"/><line x1="0" y1="${size / 2}" x2="${size}" y2="${size / 2}" stroke="#e8e1d2" stroke-dasharray="4 4"/><g transform="${t.transform}">${paths}</g></svg></div>
      <div class="cr-words">${words.map(w => `<span>${wordHTML(w, this.o.wordZhuyin?.(w))}</span>`).join('')}</div>
      <p class="cr-note">這是你寫的筆跡（用固定速度重播）</p>
      <div class="cr-actions"><button type="button" data-act="replay">▶ 再看一次</button><button type="button" data-act="say">🔊 再唸一次</button></div>
      ${go.length ? `<div class="cr-actions go">${go.join('')}</div>` : ''}
    </div>`;
    for (const ev of ['pointerdown', 'pointermove', 'mousedown', 'mousemove', 'wheel', 'touchstart', 'touchmove']) el.addEventListener(ev, e => e.stopPropagation(), { passive: true });
    el.addEventListener('click', e => {
      const act = e.target.closest('button[data-act]')?.dataset.act;
      if (e.target === el || act === 'close') this.close(); else if (act === 'replay') this.play(); else if (act === 'say') this.say();
      else if (act === 'rewrite' || act === 'parts') { this.close(); this.log(`card ${act} ${artifact.char}`); (act === 'rewrite' ? this.o.onRewrite : this.o.onParts)?.(artifact); }
    });
    this._onKey = e => { if (e.key === 'Escape') this.close(); }; document.addEventListener('keydown', this._onKey);
    document.body.append(el); this.el = el; this.char = artifact.char; this.words = words;
    this.strokes = [...el.querySelectorAll('polyline')].map(p => ({ p, len: Math.max(1, p.getTotalLength()) }));
    for (const { p, len } of this.strokes) p.style.strokeDasharray = `${len} ${len}`;
    el.querySelector('[data-act="close"]').focus();
    this.log(`card open ${artifact.char} strokes=${n}`);
    this.say(); this.play(); this.o.onOpen?.();
    return true;
  }

  /** 唸「字，詞，詞」；在 click 內同步呼叫（iOS 規定） */
  say() { if (!this.el) return false; const text = cardSayText(this.char, this.words), ok = this.o.voice?.say(text) ?? false; this.log(`say(card) ${text} -> ${ok}`); return ok; }

  /** 依序把每一筆畫出來；回傳全部畫完的 Promise（測試用） */
  play() {
    if (!this.el) return Promise.resolve(false);
    this._stop();
    const still = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (still || typeof Element.prototype.animate !== 'function') { for (const { p } of this.strokes) p.style.strokeDashoffset = '0'; this.log('card replay still'); return Promise.resolve(true); }
    let at = REPLAY.startMs; const run = this.run = (this.run || 0) + 1;
    for (const { p, len } of this.strokes) {
      const duration = Math.max(REPLAY.minStrokeMs, len / REPLAY.unitsPerMs);
      p.style.strokeDashoffset = String(len); // 還沒輪到的筆先藏起來
      const a = p.animate([{ strokeDashoffset: len }, { strokeDashoffset: 0 }], { duration, delay: at, easing: 'linear', fill: 'none' });
      a.onfinish = () => { p.style.strokeDashoffset = '0'; };
      this.anims.push(a); at += duration + REPLAY.gapMs;
    }
    this.log(`card replay ${this.strokes.length} strokes ${Math.round(at)}ms`);
    return Promise.all(this.anims.map(a => a.finished)).then(() => { if (this.run === run) this.log('card replay done'); return true; }, () => false);
  }
  _stop() { for (const a of this.anims) { a.onfinish = null; try { a.cancel(); } catch { /* ignore */ } } this.anims = []; }

  close() {
    if (!this.el) return;
    this._stop(); this.o.voice?.stop(); this.el.remove(); this.el = null; document.removeEventListener('keydown', this._onKey);
    this.log('card close'); this.o.onClose?.();
  }
}

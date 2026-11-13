// v52 季節限定支線小考（設計：docs/plans/2026-11-12-phase3-seasons-and-side-quests.md §5.5）
// 重用聽寫小考的流程（聽 → 拼注音 → 寫國字），但這些字課本沒教，所以寫字時有淡淡的底圖（照著描）。
// 不寫聽寫小考的存檔、不寫 IndexedDB（不算進課本進度、不影響守門員門檻）；結果由 onClose 交給 game-v1.html 記到 extras。
import { Dictation } from './dictation.js?v=56';
import { bravo } from './fx.js?v=56';
import { zhuyinHTML } from './writing-panel.js?v=56';

/** 抽題：練過次數少的優先，其餘隨機；words＝seasons.json 的 quest.words；history＝extras.quests[id].chars */
export function pickQuestWords({ words, history = {}, n = 4, rand = Math.random }) {
  const r = new Map(words.map(w => [w.char, rand()]));
  return words.slice().sort((a, b) => ((history[a.char] || 0) - (history[b.char] || 0)) || (r.get(a.char) - r.get(b.char))).slice(0, n);
}

const CSS = `
.qs-run .dc-dialog{border:4px solid var(--qs-c,#FF8FA3);background:linear-gradient(#fffdf7,#fffdf7) padding-box}
.qs-run .dc-dialog h2{color:#E8665C}
.qs-run .dc-result .c{font-size:34px}
.qs-run .dc-grid{width:min(70vw,300px,40vh)} /* 詞語每個字都有注音，比聽寫小考高一點：格子小一點，iPad 才不用捲 */
.qs-run .dc-result .w{display:block;font-size:13px;color:#8a6f7c}
`;

export class QuestRun extends Dictation {
  constructor(opts) {
    const user = opts.onClose, wz = opts.wordZhuyin;
    super({ ...opts, storageKey: null, wordZhuyin: w => this._wordZy?.get(w) ?? wz?.(w) ?? null, onClose: r => user?.({ ...r, ...this._extra }) });
    this._extra = null; this._wordZy = new Map();
  }
  _pickQs() { const qs = this._opts?.questions ?? []; return qs.length ? qs : null; }
  _title() { const o = this._opts ?? {}; return `${o.icon || '🌸'} ${o.short ?? '季節'}小考`; }
  _record() { /* 季節小考不寫聽寫小考的存檔 */ }
  _showOutline() { return true; }

  open(pool, opts = {}) {
    this._wordZy = new Map((opts.questions ?? []).filter(q => Array.isArray(q.wordZy) && q.wordZy.length === [...q.word].length).map(q => [q.word, q.wordZy]));
    if (!super.open(pool, opts)) return false;
    if (!document.getElementById('qs-style')) { const s = document.createElement('style'); s.id = 'qs-style'; s.textContent = CSS; document.head.append(s); }
    this.el.classList.add('qs-run'); this.el.setAttribute('aria-label', this._title().replace(/^\S+\s/, ''));
    this.log(`quest open ${opts.seasonId ?? '-'} chars=${this.state.qs.map(q => q.char).join('')}`);
    return true;
  }
  async _write() {
    const p = super._write(); // super 在第一個 await 之前就把畫面換成寫字步驟
    if (this.state?.phase === 'loading') { this._q('.dc-ask').textContent = '照著淡淡的字，把 ○ 描出來！'; this._msg('照著底圖，一筆一筆描'); }
    return p;
  }
  close() {
    const s = this.state, o = this._opts ?? {};
    this._extra = s ? { seasonId: o.seasonId ?? null, complete: this._complete(), chars: s.qs.map(q => q.char) } : null;
    super.close();
  }
  /** 有字讀不到（跳過）就不算做完：不給星、不記次數 */
  _complete() { return !!this.state?.finished && this.state.qs.every(q => q.done && !q.skipped); }
  _finish() {
    const s = this.state, o = this._opts ?? {}; s.phase = 'result'; s.finished = true; this._dropWriter(); this._show('result');
    const complete = this._complete();
    this._q('.dc-dots').innerHTML = '';
    this._q('.dc-ask').textContent = complete ? `${o.icon || '🌸'} ${o.short ?? '季節'}小考做完了！` : `${o.icon || '🌸'} 這次有字讀不到`;
    this._q('.dc-result').innerHTML = s.qs.map(q => `<div><span class="c">${q.char}${zhuyinHTML(q.zhuyin)}</span><span class="w">${q.word}</span><small>注音 ${q.zyWrong ? '△' : '✓'}</small><small>寫字 ${q.skipped ? '—' : '✓'}</small></div>`).join('');
    this._msg(complete ? '學會新的字了，好棒！' : '有字的資料讀不到，這次不算。檢查網路後再試一次！', complete ? 'ok' : 'err');
    this._q('.dc-actions').innerHTML = `<button type="button" data-act="close" class="dc-primary">回小鎮</button>`;
    if (complete) { this.voice?.say('季節小考，做完了！'); bravo(this._q('.dc-dialog'), '完成！'); }
    this.log(`quest finished ${o.seasonId ?? '-'} complete=${complete}`);
  }
}

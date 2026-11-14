// v51 守門員總複習關（設計：docs/plans/2026-11-12-phase2-gatekeeper-boss-review.md）
// 重用聽寫小考的整個流程（拼注音 → 默寫國字），每個字之後多一步「認」：選出字裡的部件（或聽音找字）。
// 不寫聽寫小考的存檔、不寫 IndexedDB（不影響各字的星數與進度）；結果由 onClose 交給 game-v1.html 記到 extras。
import { Dictation } from './dictation.js?v=60';
import { bravo, flash } from './fx.js?v=60';
import { introText, zhuyinHTML } from './writing-panel.js?v=60';

const shuffle = (a, rand = Math.random) => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };

/**
 * 抽字：已學會的字裡，最高星數低的優先 → 聽寫小考「要再練」次數多的優先 → 上次守門員沒出過的優先 → 隨機。
 * pool＝[{char, zhuyin, word, taskId}]；best＝taskId→最高星數；weak＝{字:次數}；recent＝上次出過的字
 */
export function pickBossChars({ pool, best, weak = {}, recent = [], n = 4, rand = Math.random }) {
  const rec = new Set(recent), r = new Map(pool.map(t => [t.char, rand()]));
  return pool.slice().sort((a, b) => ((best.get(a.taskId) ?? 0) - (best.get(b.taskId) ?? 0)) || ((weak[b.char] || 0) - (weak[a.char] || 0)) || (rec.has(a.char) - rec.has(b.char)) || (r.get(a.char) - r.get(b.char))).slice(0, n);
}

/**
 * 「認」的題目：部件題只用核對過的靜態題目表 boss_parts.json（錯誤選項不會其實在字裡）；
 * 表裡沒有就用 parts_game.json 的形近字組出「聽音找字」；都沒有回傳 null（這個字跳過這一步）
 */
export function pickQuestionFor(char, word, { table = null, lookalike = [] } = {}, rand = Math.random) {
  const t = table?.chars?.[char];
  if (t && Array.isArray(t.wrong) && t.wrong.length === 2) {
    const opts = [{ label: t.part, name: t.say, ok: true }, ...t.wrong.map(w => ({ label: w.part, name: w.say, ok: false }))];
    return { kind: 'part', char, prompt: `「${char}」裡有哪一個部件？`, say: `${char}，裡面有哪一個部件？`, options: shuffle(opts, rand) };
  }
  const g = (lookalike ?? []).find(x => x.includes(char));
  if (g) { const opts = [char, ...shuffle(g.filter(c => c !== char), rand).slice(0, 2)]; return { kind: 'listen', char, prompt: '聽一聽，是哪一個字？', say: introText(char, word), options: shuffle(opts, rand).map(c => ({ label: c, ok: c === char })) }; }
  return null;
}

const CSS = `
.bs-run .dc-dialog{border:4px solid #F2C14E}
.bs-track{position:relative;height:58px;margin:0 0 6px;border-radius:14px;background:linear-gradient(#bfe6ff,#8fd0f5);overflow:hidden}
.bs-track .bank{position:absolute;top:0;bottom:0;width:9%;background:#8fcf6a}.bs-track .bank.l{left:0;border-radius:0 40% 40% 0}.bs-track .bank.r{right:0;border-radius:40% 0 0 40%}
.bs-track .planks{position:absolute;left:9%;right:9%;top:62%;height:16%;display:flex;gap:3%}
.bs-track .planks i{flex:1;border-radius:4px;border:2px dashed #b58a5a;background:transparent;transition:background .3s}
.bs-track .planks i.on{background:#c98f55;border-style:solid;border-color:#8a5a2b}
.bs-hero{position:absolute;bottom:22%;height:62%;width:auto;transform:translateX(-50%);transition:left .6s cubic-bezier(.3,1.4,.5,1)}
.bs-hero.hop{animation:bs-hop .6s ease-out}
@keyframes bs-hop{40%{transform:translate(-50%,-30%)}}
.bs-pick{display:flex;flex-direction:column;align-items:center;gap:10px;margin:6px 0}
.bs-pick .opts{display:flex;gap:12px;justify-content:center;flex-wrap:wrap}
.bs-pick button{font:inherit;min-width:92px;min-height:92px;padding:6px 10px;border-radius:18px;border:3px solid #F4B6A8;background:#fff;color:#2f3e46;cursor:pointer;touch-action:manipulation;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:2px}
.bs-pick button b{font:400 48px/1.05 "Kaiti TC","BiauKai","DFKai-SB","Noto Serif TC",serif}
.bs-pick button small{font-size:13px;color:#8a6f7c}
.bs-pick button.ans{border-color:#2b8a3e;background:#ebfbee}
.bs-pick button.bad{opacity:.45}
.bs-run .dc-result .c{font-size:34px}
@media (orientation:landscape) and (max-height:560px){
.bs-run .dc-dialog{grid-template-rows:repeat(8,auto) 1fr}
.bs-run .bs-track{grid-column:2;height:44px;margin:0 0 4px}
.bs-run .dc-zy,.bs-run .dc-grid,.bs-run .dc-result,.bs-run .bs-pick{grid-column:1;grid-row:1/10;align-self:center}
.bs-pick button{min-width:84px;min-height:84px}.bs-pick button b{font-size:42px}
}
`;

export class BossRun extends Dictation {
  constructor(opts) {
    const user = opts.onClose;
    super({ ...opts, storageKey: null, onClose: r => user?.({ ...r, ...this._extra }) });
    this._extra = null;
  }
  // ---- 覆寫聽寫小考的步驟 ----
  _pickQs() { const qs = this._opts?.questions ?? []; return qs.length ? qs : null; }
  _title() { const o = this._opts ?? {}; return `🛡️ ${o.title ?? '守門員'}${o.stage ? ` 第 ${o.stage} 關` : ''}${o.practice ? '（練習）' : ''}`; }
  _record() { /* 守門員不寫聽寫小考的存檔 */ }
  _show(phase) { super._show(phase); const p = this.el?.querySelector('.bs-pick'); if (p) p.hidden = phase !== 'pick'; }

  open(pool, opts = {}) {
    if (!super.open(pool, opts)) return false;
    if (!document.getElementById('bs-style')) { const s = document.createElement('style'); s.id = 'bs-style'; s.textContent = CSS; document.head.append(s); }
    const s = this.state, n = s.qs.length; this.el.classList.add('bs-run'); this.el.setAttribute('aria-label', this._title().replace(/^\S+\s/, ''));
    this._picks = new Map((opts.questions ?? []).map(q => [q.char, q.pick ?? null]));
    for (const q of s.qs) Object.assign(q, { pickWrong: 0, picked: false });
    const track = document.createElement('div'); track.className = 'bs-track'; track.setAttribute('aria-hidden', 'true');
    track.innerHTML = `<span class="bank l"></span><span class="bank r"></span><div class="planks">${'<i></i>'.repeat(n)}</div>${opts.heroSrc ? `<img class="bs-hero" alt="" src="${opts.heroSrc}">` : ''}`;
    this._q('.dc-dialog > h2').after(track); this._moveHero(0);
    const pick = document.createElement('div'); pick.className = 'bs-pick'; pick.hidden = true; this._q('.dc-zy').before(pick);
    pick.addEventListener('click', e => { const b = e.target.closest('button[data-pick]'); if (b && this.state) this._pick(+b.dataset.pick, b); });
    this.log(`boss open stage=${opts.stage ?? '-'} practice=${!!opts.practice} chars=${s.qs.map(q => q.char).join('')}`);
    return true;
  }
  close() {
    const s = this.state, o = this._opts ?? {};
    this._extra = s ? { stage: o.stage ?? null, practice: !!o.practice, complete: this._complete(), chars: s.qs.map(q => q.char), perfect: s.qs.filter(q => this._perfect(q)).length } : null;
    super.close();
  }
  /** 有字讀不到（跳過）就不算完整過關：不給進度和獎勵，請孩子再挑戰一次 */
  _complete() { return !!this.state?.finished && this.state.qs.every(q => q.done && !q.skipped); }
  _perfect(q) { return q.done && !q.skipped && q.zyWrong === 0 && !q.hint && q.mistakes === 0 && q.pickWrong === 0; }
  _moveHero(p) {
    const h = this.el?.querySelector('.bs-hero'), n = this.state?.qs.length || 1; if (!h) return;
    h.style.left = (4.5 + (p / n) * 91) + '%'; if (p) { h.classList.remove('hop'); void h.offsetWidth; h.classList.add('hop'); }
  }
  // ---- 第 3 步：認（部件或聽音找字） ----
  _afterWrite() {
    const s = this.state, q = this._cur(), pk = this._picks.get(q.char);
    if (!pk) return this._nextBtn();
    s.phase = 'pick'; this._show('pick');
    if (pk.kind === 'listen') this._q('.dc-word').hidden = true;
    this._q('.dc-ask').textContent = pk.prompt;
    const box = this._q('.bs-pick');
    box.innerHTML = `<div class="opts">${pk.options.map((o, k) => `<button type="button" data-pick="${k}" aria-label="${o.label}${o.name ? '，' + o.name : ''}"><b>${o.label}</b>${o.name ? `<small>${o.name}</small>` : ''}</button>`).join('')}</div>`;
    this._q('.dc-actions').innerHTML = `<button type="button" data-act="again" aria-label="再聽一次">🔈 再聽一次</button><button type="button" data-act="close">回小鎮</button>`;
    this._msg(pk.kind === 'part' ? '點一點，選出這個字裡的小積木' : '點出你聽到的字');
    this.voice?.say(pk.say); this.log(`boss pick ask ${q.char} kind=${pk.kind}`);
  }
  _prompt() { const s = this.state, q = this._cur(); if (s?.phase === 'pick') { const pk = this._picks.get(q.char); if (pk) this.voice?.say(pk.say); return; } super._prompt(); }
  _pick(k, btn) {
    const s = this.state, q = this._cur(), pk = this._picks.get(q?.char); if (s.phase !== 'pick' || !pk) return;
    const o = pk.options[k];
    if (o.ok) {
      s.phase = 'written'; q.picked = true; this.sound?.complete?.(); btn.classList.add('ans'); flash(btn);
      this._msg(q.pickWrong ? '找到了！' : '答對了！', 'ok'); this.voice?.say('答對了！'); this.log(`boss pick ok ${q.char} wrong=${q.pickWrong}`);
      this._q('.dc-word').hidden = false; this._q('.dc-word').innerHTML = `<span class="dc-w">${q.char}${zhuyinHTML(q.zhuyin)}</span>`;
      return this._nextBtn();
    }
    q.pickWrong += 1; this.sound?.mistake(); btn.classList.add('bad'); flash(btn, 'fx-shake');
    if (q.pickWrong >= 2) { const i = pk.options.findIndex(x => x.ok); this.el.querySelectorAll('.bs-pick button')[i]?.classList.add('ans'); this._msg('綠色的是答案，點它一下', 'err'); }
    else this._msg('不是這個喔，再想一想', 'err');
    this.log(`boss pick wrong ${q.char} got=${o.label}`);
  }
  _nextBtn() {
    super._nextBtn();
    const s = this.state, i = s.i; this.el.querySelectorAll('.bs-track .planks i')[i]?.classList.add('on'); this._moveHero(i + 1);
    const last = i === s.qs.length - 1, b = this._q('.dc-actions [data-act="next"]'); if (b) b.textContent = last ? '過橋看成績 ▶' : '下一個字 ▶';
  }
  _finish() {
    const s = this.state, o = this._opts ?? {}; s.phase = 'result'; s.finished = true; this._dropWriter(); this._show('result');
    const per = s.qs.filter(q => this._perfect(q)).length;
    this._q('.dc-dots').innerHTML = '';
    const complete = this._complete();
    this._q('.dc-ask').textContent = o.practice ? '🛡️ 練習完成！' : complete ? `🛡️ 第 ${o.stage} 關過關！` : '🛡️ 這次有字讀不到';
    const mark = q => (q.skipped ? '—' : q.picked || !this._picks.get(q.char) ? (q.pickWrong ? '△' : '✓') : '—');
    this._q('.dc-result').innerHTML = s.qs.map(q => `<div class="${this._perfect(q) ? '' : 'weak'}"><span class="c">${q.char}${zhuyinHTML(q.zhuyin)}</span><small>注音 ${q.zyWrong ? '✗' : '✓'}</small><small>國字 ${q.skipped ? '—' : q.hint ? '💡' : q.mistakes >= 3 ? '△' : '✓'}</small>${this._picks.get(q.char) ? `<small>認字 ${mark(q)}</small>` : ''}</div>`).join('');
    this._msg(o.practice ? '再練一次，越來越熟了！' : complete ? `過橋了！得到 ★${o.stars ?? 5} 和一個徽章！` : '有字的資料讀不到，這次不算過關。檢查網路後再挑戰一次！', complete || o.practice ? 'ok' : 'err');
    this._q('.dc-actions').innerHTML = `<button type="button" data-act="close" class="dc-primary">回小鎮</button>`;
    if (o.practice || complete) { this.voice?.say(o.practice ? '練習完成，好棒！' : '守門員，過關了！'); bravo(this._q('.dc-dialog'), o.practice ? '完成！' : '過關！'); }
    this.log(`boss finished stage=${o.stage ?? '-'} complete=${complete} perfect=${per}/${s.qs.length}`);
  }
}

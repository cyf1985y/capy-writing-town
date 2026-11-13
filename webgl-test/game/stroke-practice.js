// v57 基本筆畫練習（全螢幕，和聽寫小考同一種視窗）。設計：docs/plans/2026-11-13-basic-strokes-practice.md §4
// 一種筆畫四步：看示範 → 描第 1 次 → 描第 2 次 → 看字（把這一筆放回例字裡標橘色）。
// 兩次都沒寫錯、沒用提示＝描得好：由呼叫端（game-v1.html）照 v56 重複練習的規則給星、記練習紀錄。
// 筆畫資料 strokes/strokes.json 由 strokes/build_strokes.py 產生（AI 標的名稱，人工核對 pending）。
import HanziWriter from '../vendor-v2/hanzi-writer/lib/dist/index.esm.js';
import { bravo, flash } from './fx.js?v=59';
import { QUIZ_CONFIG } from './writing-panel.js?v=59';

const CSS = `
.sp-overlay{position:fixed;inset:0;z-index:1000;background:rgba(91,58,74,.72);display:flex;align-items:center;justify-content:center;font:16px system-ui,"Noto Sans TC",sans-serif;color:var(--ui-ink,#5B3A4A);touch-action:manipulation}
.sp-dialog{position:relative;background:#fffdf7;border-radius:20px;box-shadow:0 20px 60px rgba(0,0,0,.35);padding:16px 16px 18px;width:min(94vw,600px);max-height:97vh;max-height:97dvh;overflow:auto;box-sizing:border-box;text-align:center}
.sp-dialog h2{margin:0 0 4px;font-size:20px}
.sp-top{font-size:14px;margin:0 0 8px;opacity:.85}
.sp-group{font-size:15px;font-weight:700;margin:8px 0 4px;text-align:left}
.sp-picks{display:grid;grid-template-columns:repeat(auto-fill,minmax(78px,1fr));gap:8px}
.sp-picks button{position:relative;font:inherit;font-size:15px;font-weight:700;padding:4px 2px 6px;border-radius:14px;border:3px solid #F4B6A8;background:#fff;color:inherit;cursor:pointer;touch-action:manipulation}
.sp-picks button svg{display:block;width:100%;max-width:64px;aspect-ratio:1;margin:0 auto 2px}
.sp-picks button.good{border-color:#2b8a3e;background:#F3FBF4}
.sp-picks button i{position:absolute;right:4px;top:2px;font-style:normal;color:#2b8a3e;font-size:16px}
.sp-picks button small{display:block;font-size:11px;font-weight:400;opacity:.75}
.sp-picks button em{position:absolute;left:3px;top:2px;font-style:normal;font-size:11px;font-weight:700;color:#fff;background:#E55A4E;border-radius:999px;padding:0 5px}
.sp-weak{border:3px solid #F4B6A8;border-radius:16px;background:#FFF4F1;padding:6px 8px 8px;margin:4px 0 6px}
.sp-weak .sp-group{margin-top:0;color:#C2410C}.sp-weak p{margin:0 0 6px;font-size:13px;text-align:left;opacity:.85}
.sp-weak .sp-picks button{border-color:#E55A4E}
.sp-dialog .sp-actions.sp-sticky{position:sticky;bottom:-18px;background:#fffdf7;padding:8px 0 4px;margin:0 -4px;box-shadow:0 -6px 10px -6px rgba(91,58,74,.25)} /* v58 選筆畫畫面：按鈕列固定在底部 */
.sp-name{font-size:40px;font-weight:800;margin:2px 0;font-family:"Kaiti TC","BiauKai","DFKai-SB","Noto Serif TC",serif;color:#E55A4E}
.sp-step{display:flex;gap:6px;justify-content:center;margin:0 0 6px}
.sp-step span{font-size:13px;padding:2px 9px;border-radius:999px;background:#eee6d8}.sp-step span.on{background:var(--ui-primaryDark,#E8665C);color:#fff}
.sp-grid{position:relative;width:min(70vw,300px,46vh);aspect-ratio:1;margin:4px auto 8px;border:3px solid #F4B6A8;border-radius:14px;background:#fff;touch-action:none;overflow:hidden}
.sp-grid::before,.sp-grid::after{content:"";position:absolute;pointer-events:none;border:0 dashed #efd9cf}
.sp-grid::before{left:50%;top:0;bottom:0;border-left-width:2px}.sp-grid::after{top:50%;left:0;right:0;border-top-width:2px}
.sp-target{position:absolute;inset:0}
.sp-host{display:block;width:100%;height:100%}
.sp-msg{min-height:1.5em;font-size:17px;margin:0 0 8px}.sp-msg.ok{color:#2b8a3e}.sp-msg.err{color:#c92a2a}
.sp-actions{display:flex;gap:10px;justify-content:center;flex-wrap:wrap}
.sp-actions button{font:inherit;font-size:18px;padding:10px 16px;border-radius:12px;border:2px solid #F7C9C0;background:#fff;cursor:pointer;touch-action:manipulation}
.sp-actions button.sp-primary{background:var(--ui-primaryDark,#E8665C);border-color:var(--ui-primaryDark,#E8665C);color:#fff}
.sp-dialog [hidden]{display:none!important}
@media (min-width:700px){.sp-grid{width:min(70vw,380px,46vh)}.sp-actions button{font-size:20px;padding:12px 20px}.sp-picks{grid-template-columns:repeat(auto-fill,minmax(88px,1fr))}}
@media (orientation:landscape) and (max-height:560px){
.sp-dialog{width:min(96vw,860px);max-height:calc(100vh - 10px);max-height:calc(100dvh - 10px);padding:10px 14px}
.sp-run{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);column-gap:16px;align-items:center}
.sp-run .sp-grid{grid-column:1;grid-row:1/6;width:min(calc(100vh - 80px),42vw);width:min(calc(100dvh - 80px),42vw);margin:0 auto}
.sp-dialog h2{font-size:16px;margin:0 0 2px}
.sp-run>*:not(.sp-grid){grid-column:2}
.sp-name{font-size:32px}.sp-msg{font-size:15px}.sp-actions button{font-size:15px;padding:8px 12px}
.sp-picks{grid-template-columns:repeat(auto-fill,minmax(70px,1fr));gap:6px}.sp-picks button svg{max-width:44px}
}
`;
const esc = s => String(s).replace(/[&<>"']/g, c => '&#' + c.charCodeAt(0) + ';');
const FLIP = 'translate(0,900) scale(1,-1)'; // 字形資料是 1024 字身、y 向上（-124..900）；這樣翻正
const svgOf = (paths, cls = '') => `<svg class="${cls}" viewBox="0 0 1024 1024" aria-hidden="true"><g transform="${FLIP}">${paths}</g></svg>`;

/** 讀進來的 strokes.json 整理：不合的那一種丟掉。回傳 { strokes, dropped } */
export function validStrokes(doc) {
  const out = [], seen = new Set(); let dropped = 0;
  for (const s of Array.isArray(doc?.strokes) ? doc.strokes : []) {
    const g = s?.glyph, h = s?.host;
    const ok = s && typeof s.id === 'string' && /^[a-z]+$/.test(s.id) && !seen.has(s.id) && typeof s.name === 'string' && s.name
      && g && Array.isArray(g.strokes) && Array.isArray(g.medians) && g.strokes.length === 1 && g.medians.length === 1 && typeof g.strokes[0] === 'string'
      && h && typeof h.char === 'string' && [...h.char].length === 1 && Number.isInteger(h.index) && h.index >= 0;
    if (!ok) { dropped++; continue; }
    seen.add(s.id); out.push({ id: s.id, name: s.name, table: s.table === 1 ? 1 : 2, host: { char: h.char, index: h.index }, glyph: { strokes: g.strokes.slice(), medians: g.medians.map(m => m.map(p => p.slice())) } });
  }
  return { strokes: out, dropped };
}

export class StrokePractice {
  /**
   * strokes＝validStrokes 的結果；loadHost(char) → Promise<字形資料>（看字那一步用）；
   * finish({ id, good, roundId }) → Promise<{ add, reason, leftChar }>（呼叫端寫存檔、給星；add>0＝拿到星）；
   * today() → { goodIds:Set, fullIds:Set, strokeStars, dayStars, perDay, starsOn }
   */
  constructor({ strokes, voice, sound, log = () => {}, loadHost, finish, today, weak = null, onOpen, onClose }) {
    Object.assign(this, { strokes, voice, sound, log, loadHost, finish, today, weak, onOpen, onClose }); this.el = null; this.state = null; // v58 weak()→[{ id, name, misses, seen }] 最近常寫錯的筆畫
  }
  isOpen() { return !!this.el; }
  open() {
    if (this.el || !this.strokes.length) return false;
    if (!document.getElementById('sp-style')) { const s = document.createElement('style'); s.id = 'sp-style'; s.textContent = CSS; document.head.append(s); }
    const el = document.createElement('div'); el.className = 'sp-overlay'; el.setAttribute('role', 'dialog'); el.setAttribute('aria-modal', 'true'); el.setAttribute('aria-label', '筆畫練習');
    el.innerHTML = `<div class="sp-dialog"><h2>✏️ 筆畫練習</h2><div class="sp-body"></div></div>`;
    for (const t of ['pointerdown', 'pointermove', 'mousedown', 'mousemove', 'wheel', 'touchstart', 'touchmove']) el.addEventListener(t, e => e.stopPropagation(), { passive: true });
    el.addEventListener('click', e => { const b = e.target.closest('button'); if (!b || b.disabled) return; if (b.dataset.wpick != null) this._startWeak(+b.dataset.wpick); else if (b.dataset.pick != null) this._start(+b.dataset.pick); else if (b.dataset.act) this._act(b.dataset.act); });
    this._onKey = e => { e.stopPropagation(); if (e.key === 'Escape') this.close(); }; document.addEventListener('keydown', this._onKey, true);
    document.body.append(el); this.el = el; this.state = { phase: 'pick', i: -1, rounds: 0, good: 0, stars: 0 };
    // v58：打開時算一次最近常寫錯的筆畫（只留筆畫練習裡有的種類）
    let wk = []; try { wk = this.weak?.() ?? []; } catch (e) { this.log('strokes weak failed ' + e); }
    this.weakList = wk.map(w => ({ ...w, i: this.strokes.findIndex(s => s.id === w.id) })).filter(w => w.i >= 0);
    this.onOpen?.(); this._picker(); this.log('strokes open weak=' + this.weakList.map(w => w.id).join(','));
    if (this.weakList.length) this.voice?.say(`最近比較常寫錯的是${this.weakList[0].name}，先練練看吧！`);
    return true;
  }
  close() {
    if (!this.el) return;
    const st = this.state; this._dropWriter(); this.el.remove(); this.el = null; this.state = null;
    document.removeEventListener('keydown', this._onKey, true); try { this.voice?.cancel?.(); } catch { /* ignore */ }
    this.log(`strokes close rounds=${st?.rounds ?? 0} good=${st?.good ?? 0} stars=${st?.stars ?? 0}`);
    this.onClose?.({ rounds: st?.rounds ?? 0, good: st?.good ?? 0, stars: st?.stars ?? 0 });
  }
  _q(sel) { return this.el?.querySelector(sel); }
  _body(html) { this._dropWriter(); this._q('.sp-body').innerHTML = html; }
  _msg(t, cls = '') { const m = this._q('.sp-msg'); if (m) { m.textContent = t; m.className = 'sp-msg ' + cls; } }

  // ---------- 選筆畫 ----------
  _picker() {
    const t = this.today?.() ?? {}, good = t.goodIds ?? new Set(), full = t.fullIds ?? new Set();
    const W = this.weakList ?? [], weakIds = new Set(W.map(w => w.id));
    const btn = (s, i, w = null) => `<button type="button" ${w ? `data-wpick="${w.k}"` : `data-pick="${i}"`} class="${good.has(s.id) ? 'good' : ''}" aria-label="${esc(s.name)}${weakIds.has(s.id) ? '（常寫錯）' : ''}${good.has(s.id) ? '（今天描得好）' : ''}">${!w && weakIds.has(s.id) ? '<em>常錯</em>' : ''}${good.has(s.id) ? '<i>✓</i>' : ''}${svgOf(`<path d="${s.glyph.strokes[0]}" fill="#5B3A4A"/>`)}${esc(s.name)}${w ? `<small>錯 ${w.misses} 次</small>` : full.has(s.id) ? '<small>今天星星滿了</small>' : ''}</button>`;
    const weakHTML = W.length ? `<div class="sp-weak"><div class="sp-group">🎯 最近常寫錯的筆畫</div><p>最近兩週寫字時，這幾種筆畫比較常寫錯（同一筆錯好幾次會算好幾次）。</p><div class="sp-picks">${W.map((w, k) => btn(this.strokes[w.i], w.i, { ...w, k })).join('')}</div></div>` : '';
    const grp = (tb, label) => { const xs = this.strokes.map((s, i) => [s, i]).filter(([s]) => s.table === tb); return xs.length ? `<div class="sp-group">${label}</div><div class="sp-picks">${xs.map(([s, i]) => btn(s, i)).join('')}</div>` : ''; };
    const top = t.perDay ? `今天練筆畫拿了 ★${t.strokeStars ?? 0}・今天全部練習星星 ★${t.dayStars ?? 0}／${t.perDay}` : '點一個筆畫開始練';
    const acts = W.length ? '<button type="button" data-act="weakFirst" class="sp-primary">先練常錯的 ▶</button><button type="button" data-act="first">從頭練</button>' : '<button type="button" data-act="first" class="sp-primary">從頭練 ▶</button>';
    this._body(`<div class="sp-top">${top}</div>${weakHTML}${grp(1, '基本筆畫')}${grp(2, '其他筆畫')}<div class="sp-msg">兩次都描對，就能拿星星喔！</div><div class="sp-actions sp-sticky">${acts}<button type="button" data-act="close">回小鎮</button></div>`);
    this.state.seq = null; // 回到選筆畫畫面就結束常錯模式
    this.state.phase = 'pick'; this.state.i = -1;
  }

  // ---------- 一種筆畫 ----------
  /** v58 常錯模式：從第 k 種開始繞一圈（點 B → B、C、A），每一種都會輪到 */
  _startWeak(k) {
    const W = this.weakList ?? []; if (!W[k]) return;
    const order = W.map((_, j) => W[(k + j) % W.length].i);
    this._start(order[0], { order, pos: 0 }); this.log('strokes weak mode ' + order.map(i => this.strokes[i].id).join(','));
  }
  _start(i, seq) {
    if (seq !== undefined) this.state.seq = seq; // 沒傳＝維持原本的模式（再練一次）
    const st = this.state, s = this.strokes[i]; if (!s) return;
    Object.assign(st, { i, round: { id: globalThis.crypto?.randomUUID?.() ?? String(Date.now()) + Math.random(), mistakes: 0, hint: false, trace: 0 } });
    this._run('demo'); this.log('strokes start ' + s.id);
  }
  _run(step) {
    const st = this.state, s = this.strokes[st.i], steps = [['demo', '看示範'], ['t1', '描第 1 次'], ['t2', '描第 2 次'], ['host', '看字']];
    this._body(`<div class="sp-run"><div class="sp-step">${steps.map(([k, l]) => `<span class="${k === step ? 'on' : ''}">${l}</span>`).join('')}</div>
<div class="sp-name">${esc(s.name)}</div><div class="sp-grid"><div class="sp-target"></div></div><div class="sp-msg"></div><div class="sp-actions"></div></div>`);
    st.phase = step;
    if (step === 'demo') this._demo(); else if (step === 'host') this._host(); else this._trace(step === 't1' ? 1 : 2);
  }
  _writer(opts) {
    const s = this.strokes[this.state.i], target = this._q('.sp-target'), size = target.clientWidth || 280, data = s.glyph;
    this.state.writer = HanziWriter.create(target, s.name, {
      width: size, height: size, padding: QUIZ_CONFIG.padding, renderer: QUIZ_CONFIG.renderer, showCharacter: false, showOutline: true,
      strokeColor: '#2f3e46', outlineColor: '#dcd5c6', drawingColor: '#1c5d99', highlightColor: '#f08c00', highlightCompleteColor: '#2b8a3e',
      drawingWidth: QUIZ_CONFIG.drawingWidth, strokeWidth: QUIZ_CONFIG.strokeWidth, strokeAnimationSpeed: 0.8, delayBetweenStrokes: 300,
      charDataLoader: (char, onLoad, onError) => { if (char === s.name) onLoad(data); else onError(new Error('UNEXPECTED_CHAR:' + char)); }, ...opts,
    });
    this.state.totalStrokes = 1; return this.state.writer;
  }
  _demo() {
    const s = this.strokes[this.state.i];
    this._q('.sp-actions').innerHTML = `<button type="button" data-act="replayDemo">🔁 再看一次</button><button type="button" data-act="toT1" class="sp-primary">我來描 ▶</button>`;
    this._msg('看清楚從哪裡開始、往哪裡寫'); this.voice?.say(s.name);
    this._writer({}); this._animate();
  }
  _animate() { const w = this.state.writer; try { w?.hideCharacter?.(); w?.animateCharacter?.(); } catch (e) { this.log('strokes animate failed ' + e); } }
  _trace(n) {
    const st = this.state, r = st.round; r.trace = n;
    this._q('.sp-actions').innerHTML = `<button type="button" data-act="pick">選別的</button><button type="button" data-act="close">回小鎮</button>`;
    this._msg(n === 1 ? '照著淡淡的筆畫描一次' : '再描一次！'); const w = this._writer({});
    w.quiz({
      leniency: QUIZ_CONFIG.leniency, showHintAfterMisses: QUIZ_CONFIG.showHintAfterMisses, highlightOnComplete: QUIZ_CONFIG.highlightOnComplete,
      acceptBackwardsStrokes: QUIZ_CONFIG.acceptBackwardsStrokes, markStrokeCorrectAfterMisses: QUIZ_CONFIG.markStrokeCorrectAfterMisses,
      onCorrectStroke: d => { this.sound?.stroke(d.strokeNum); },
      onMistake: d => {
        r.mistakes += 1; if (d.mistakesOnStroke >= QUIZ_CONFIG.showHintAfterMisses) r.hint = true;
        this.sound?.mistake(); flash(this._q('.sp-grid'), 'fx-shake');
        this._msg(d.mistakesOnStroke >= QUIZ_CONFIG.showHintAfterMisses ? '看橘色的地方，從起點照著寫' : '不太對，從起點照著方向再寫一次', 'err');
      },
      onComplete: () => {
        if (this.state !== st || st.phase !== (n === 1 ? 't1' : 't2')) return;
        this.log(`strokes trace ${this.strokes[st.i].id} #${n} mistakes=${r.mistakes} hint=${r.hint}`);
        if (n === 1) { this._msg('描好了！再一次', 'ok'); this._q('.sp-actions').innerHTML = `<button type="button" data-act="toT2" class="sp-primary">再描一次 ▶</button>`; }
        else this._run('host');
      },
    });
  }
  async _host() {
    const st = this.state, s = this.strokes[st.i], r = st.round, good = r.mistakes === 0 && !r.hint;
    this._q('.sp-actions').innerHTML = ''; st.rounds += 1; if (good) st.good += 1;
    // 給星、記紀錄（呼叫端）
    let res = null; try { res = await this.finish?.({ id: s.id, good, roundId: r.id }); } catch (e) { this.log('strokes finish failed ' + e); }
    if (this.state !== st) return;
    if (res?.add) st.stars += res.add;
    const starMsg = !good ? '再練一次，兩次都描對就有星星喔。' : res?.add ? `描得真好！多拿 ★${res.add}！` : res?.reason === 'char' ? `今天練「${s.name}」的星星拿滿了，換別的筆畫吧。` : res?.reason === 'day' ? `今天的練習星星都拿滿了（★${res.perDay ?? 60}），明天再來！` : res?.reason === 'save' ? '描得真好！可是星星存不進去（可能是私密瀏覽模式）。' : '描得真好！';
    if (good && res?.add) { this.sound?.complete?.(); bravo(this._q('.sp-dialog'), '★+' + res.add); }
    // 看字：例字全部筆畫灰色，這一筆橘色（自己畫 SVG，一直亮著）
    let data = null; try { data = await this.loadHost?.(s.host.char); } catch (e) { this.log(`strokes host load failed ${s.host.char}: ${e?.message || e}`); }
    if (this.state !== st) return;
    const grid = this._q('.sp-grid'), n = s.host.index + 1;
    if (data?.strokes?.[s.host.index]) {
      grid.innerHTML = svgOf(data.strokes.map((p, k) => `<path d="${p}" fill="${k === s.host.index ? '#F08C00' : '#CFC6B8'}"/>`).join('') + `<path d="${data.strokes[s.host.index]}" fill="#F08C00"/>`, 'sp-host');
      this._q('.sp-name').innerHTML = `「${esc(s.host.char)}」的第 ${n} 筆就是<b>${esc(s.name)}</b>`; this._q('.sp-name').style.fontSize = '24px';
      this.voice?.say(`${s.host.char}的第${n}筆，就是${s.name}`);
    } else grid.hidden = true;
    this._msg(starMsg, good ? 'ok' : '');
    const sq = st.seq, last = sq ? sq.pos >= sq.order.length - 1 : st.i >= this.strokes.length - 1;
    if (sq && last) this._msg(starMsg + ' 常錯的筆畫都練完了！', good ? 'ok' : '');
    this._q('.sp-actions').innerHTML = `<button type="button" data-act="again">再練一次</button><button type="button" data-act="pick">選別的</button>${last ? '' : '<button type="button" data-act="next" class="sp-primary">下一種 ▶</button>'}<button type="button" data-act="close"${last ? ' class="sp-primary"' : ''}>回小鎮</button>`;
  }
  _dropWriter() { const s = this.state; if (s?.writer) { try { s.writer.cancelQuiz(); } catch { /* ignore */ } s.writer = null; } }
  _act(a) {
    const st = this.state; if (!st) return;
    if (a === 'close') this.close();
    else if (a === 'first') this._start(0, null);
    else if (a === 'weakFirst') this._startWeak(0);
    else if (a === 'pick') this._picker();
    else if (a === 'replayDemo') this._animate();
    else if (a === 'toT1' && st.phase === 'demo') this._run('t1');
    else if (a === 'toT2' && st.phase === 't1') this._run('t2');
    else if (a === 'again' && st.phase === 'host') this._start(st.i);
    else if (a === 'next' && st.phase === 'host') { const sq = st.seq; if (sq) { sq.pos += 1; if (sq.pos < sq.order.length) this._start(sq.order[sq.pos]); } else this._start(st.i + 1); }
  }
}

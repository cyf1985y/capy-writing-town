// v12 家長面板：練習統計、常錯的字（錯在第幾筆）、關卡進度、設定。
// 只讀存檔（IndexedDB 作品），不寫入；設定存在 localStorage `capy_settings`（只是這台裝置的偏好）。
import { starsOf } from './stars.js?v=40';
import { LEVELS } from './writing-panel.js?v=40';
import { loadRewards, saveRewards, rewardState, addReward, editReward, archiveReward, redeemReward, MAX_ACTIVE, TITLE_MAX } from './rewards.js?v=40';

export const SETTINGS_KEY = 'capy_settings';
export const DEFAULT_SETTINGS = Object.freeze({ speed: 'mid', intro: 'full', strokeVoice: true, reviewDictation: true, shop: true });
export function loadSettings() {
  try { return { ...DEFAULT_SETTINGS, ...JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}') }; } catch { return { ...DEFAULT_SETTINGS }; }
}
function saveSettings(s) { try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(s)); } catch { /* 私密模式：只在這次有效 */ } }

const day = d => new Date(d).toLocaleDateString('sv');
const esc = s => String(s).replace(/[&<>"']/g, c => '&#' + c.charCodeAt(0) + ';');
const mins = ms => (ms > 0 && ms < 3e4 ? '<1' : Math.round(ms / 6e4)); // 不滿半分鐘顯示 <1，避免長條有高度卻寫 0

/** 由作品算統計（純函式，測試可直接呼叫） */
export function parentStats({ artifacts, passedTaskIds, tasks, names = {}, totalChars, now = new Date() }) {
  const today = day(now), week = [...Array(7)].map((_, i) => day(new Date(now - (6 - i) * 864e5)));
  const msOf = a => a.meta?.panelOpenMs ?? a.meta?.durationMs ?? 0, perDay = Object.fromEntries(week.map(d => [d, { n: 0, ms: 0 }]));
  for (const a of artifacts) { const d = day(a.createdAt); if (perDay[d]) { perDay[d].n += 1; perDay[d].ms += msOf(a); } }
  const byChar = new Map();
  for (const a of artifacts) {
    const r = byChar.get(a.char) ?? { char: a.char, taskId: a.taskId, writes: 0, mistakes: 0, hints: 0, strokes: [], best: 0, levels: new Set() };
    r.writes += 1; r.mistakes += a.mistakes ?? 0; r.hints += a.hints ?? 0; r.best = Math.max(r.best, starsOf(a)); r.levels.add(a.meta?.level ?? 1);
    (a.meta?.mistakesByStroke ?? []).forEach((m, i) => { r.strokes[i] = (r.strokes[i] ?? 0) + m; });
    byChar.set(a.char, r);
  }
  const weak = [...byChar.values()].filter(r => r.mistakes + r.hints > 0).sort((a, b) => (b.mistakes + b.hints) - (a.mistakes + a.hints)).slice(0, 5).map(r => {
    const i = r.strokes.reduce((k, m, j) => (m > (r.strokes[k] ?? 0) ? j : k), -1);
    return { ...r, levels: [...r.levels], worstStroke: i >= 0 && r.strokes[i] > 0 ? { n: i + 1, misses: r.strokes[i], name: names[r.char]?.[i] ?? null } : null };
  });
  const passed = new Set(passedTaskIds), levelCount = LEVELS.map(l => [...byChar.values()].filter(r => passed.has(r.taskId) && r.levels.has(l.n)).length);
  return { learned: new Set([...passed].map(id => tasks.get(id)?.char)).size, totalChars, today: perDay[today], week: week.map(d => ({ d, ...perDay[d] })), weak, levelCount };
}

const CSS = `
.pp-overlay{position:fixed;inset:0;z-index:1000;background:rgba(91,58,74,.72);display:flex;align-items:center;justify-content:center;font:15px system-ui,"Noto Sans TC",sans-serif;color:var(--ui-ink,#5B3A4A)}
.pp-dialog{background:#fffdf7;border-radius:20px;box-shadow:0 20px 60px rgba(0,0,0,.35);padding:16px 18px 18px;width:min(94vw,560px);max-height:94vh;overflow:auto;box-sizing:border-box}
.pp-dialog h2{margin:0 0 10px;font-size:20px;display:flex;align-items:center}
.pp-dialog h2 button{margin-left:auto}
.pp-dialog h3{margin:14px 0 6px;font-size:16px;color:#E8665C}
.pp-kpis{display:grid;grid-template-columns:repeat(3,1fr);gap:8px}
.pp-kpis div{background:#fff;border:2px solid #F7C9C0;border-radius:12px;padding:8px;text-align:center}
.pp-kpis b{display:block;font-size:24px;color:#2f3e46}
.pp-week{display:flex;align-items:flex-end;gap:6px;height:90px;padding:4px 0}
.pp-week div{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:flex-end;height:100%;font-size:11px;color:#8a6f7c}
.pp-week i{display:block;width:70%;background:#FFA94D;border-radius:4px 4px 0 0;min-height:2px}
.pp-weak{list-style:none;margin:0;padding:0}
.pp-weak li{display:flex;gap:10px;align-items:center;background:#fff;border:2px solid #F7C9C0;border-radius:12px;padding:6px 10px;margin:0 0 6px}
.pp-weak .ch{font-size:30px;font-family:"Kaiti TC","BiauKai","DFKai-SB","Noto Serif TC",serif;color:#2f3e46}
.pp-weak small{display:block;color:#8a6f7c}
.pp-weak a{margin-left:auto;font-size:13px;white-space:nowrap;color:#1c5d99}
.pp-set{display:grid;grid-template-columns:auto 1fr;gap:8px 10px;align-items:center}
.pp-set .seg{display:flex;gap:6px;flex-wrap:wrap}
.pp-set button,.pp-dialog h2 button{font:inherit;font-size:14px;padding:6px 12px;border-radius:999px;border:2px solid #F5CBA7;background:#fff;color:#6E473B;cursor:pointer;touch-action:manipulation}
.pp-set button[aria-pressed=true]{background:#FFA94D;border-color:#FFA94D;color:#fff;font-weight:700}
.pp-note{font-size:12px;color:#8a6f7c;margin:10px 0 0}
.pp-save{background:#fff;border:2px solid #F7C9C0;border-radius:12px;padding:8px 10px}
.pp-save p{margin:0 0 6px;font-size:14px}
.pp-save .ok{color:#2b8a3e;font-weight:700}.pp-save .warn{color:#c2410c;font-weight:700}
.pp-save .row{display:flex;gap:8px;flex-wrap:wrap}
.pp-save button{font:inherit;font-size:14px;padding:6px 12px;border-radius:999px;border:2px solid #F5CBA7;background:#FFF8E7;color:#6E473B;cursor:pointer;touch-action:manipulation}
.pp-save output{display:block;font-size:13px;margin-top:6px;min-height:1.2em}
.pp-rw p{margin:0 0 6px;font-size:14px}.pp-rw .warn{color:#c2410c;font-weight:700}.pp-rw .ok{color:#2b8a3e;font-weight:700}
.pp-rw ul{list-style:none;margin:0 0 6px;padding:0}
.pp-rw li{background:#fff;border:2px solid #F7C9C0;border-radius:12px;padding:8px 10px;margin:0 0 6px}
.pp-rw .rw-top{display:flex;gap:8px;align-items:baseline}.pp-rw .rw-top b{font-size:16px;color:#2f3e46;overflow-wrap:anywhere}.pp-rw .rw-top span{margin-left:auto;white-space:nowrap;color:#E8A000;font-weight:800}
.pp-rw .rw-bar{height:10px;background:#F3E9DD;border-radius:999px;overflow:hidden;margin:6px 0 4px}.pp-rw .rw-bar i{display:block;height:100%;background:#FFA94D;border-radius:999px}
.pp-rw small{display:block;color:#8a6f7c;font-size:13px}
.pp-rw .row,.pp-rw .rw-form,.pp-rw .rw-ask{display:flex;gap:6px;flex-wrap:wrap;align-items:center;margin-top:6px}
.pp-rw button{font:inherit;font-size:14px;padding:6px 12px;border-radius:999px;border:2px solid #F5CBA7;background:#FFF8E7;color:#6E473B;cursor:pointer;touch-action:manipulation}
.pp-rw button[data-rw=redeem],.pp-rw button[data-rw=redeemOk]{background:#FFA94D;border-color:#FFA94D;color:#fff;font-weight:700}
.pp-rw button:disabled{opacity:.45;cursor:default}
.pp-rw input{font:inherit;font-size:16px;padding:5px 8px;border:2px solid #F5CBA7;border-radius:10px;box-sizing:border-box;min-width:0}
.pp-rw input[data-f=title]{flex:1 1 150px}.pp-rw input[data-f=cost],.pp-rw input[data-f=ans]{width:76px}
.pp-rw .rw-ask{background:#FFF1DC;border-radius:10px;padding:6px 8px}
.pp-rw output{display:block;font-size:13px;min-height:1.2em;margin-top:4px}
.pp-rw details{margin-top:4px;font-size:13px}.pp-rw details li{border:0;padding:2px 0;margin:0;background:none}
`;

export class ParentPanel {
  /** rewards（可省略）：{ key, totals: () => ({ total, maxTotal }), onChange }，見 rewards.js；shop（可省略）：{ summary: () => ({ count, all, spent, balance, names }) }，見 shop.js */
  /** books（可省略）：{ list: [{ id, label }], current, onPick(id) }，見 books.js */
  constructor({ getData, onSettings, backup = null, rewards = null, shop = null, books = null, log = () => {} }) { Object.assign(this, { getData, onSettings, backup, rewards, shop, books, log }); this.el = null; }
  isOpen() { return !!this.el; }
  open() {
    if (this.el) return;
    if (!document.getElementById('pp-style')) { const s = document.createElement('style'); s.id = 'pp-style'; s.textContent = CSS; document.head.append(s); }
    const st = parentStats(this.getData()), set = loadSettings(), maxMs = Math.max(1, ...st.week.map(w => w.ms));
    const seg = (key, opts) => `<div class="seg">${opts.map(([v, l]) => `<button type="button" data-k="${key}" data-v="${v}" aria-pressed="${String(set[key]) === String(v)}">${l}</button>`).join('')}</div>`;
    const el = document.createElement('div'); el.className = 'pp-overlay'; el.setAttribute('role', 'dialog'); el.setAttribute('aria-modal', 'true'); el.setAttribute('aria-label', '家長面板');
    el.innerHTML = `<div class="pp-dialog">
      <h2>👪 家長面板<button type="button" data-act="close">關閉</button></h2>
      ${this.books ? `<p class="pp-note" style="margin:0 0 8px">📚 目前課本：<b>${esc(this.books.list.find(b => b.id === this.books.current)?.label ?? '')}</b>（可在下方「設定」切換）</p>` : ''}
      <div class="pp-kpis"><div>學會的字<b>${st.learned}</b>／${st.totalChars}</div><div>今天寫了<b>${st.today.n}</b>次</div><div>今天練習<b>${mins(st.today.ms)}</b>分鐘</div></div>
      <h3>最近 7 天（分鐘）</h3>
      <div class="pp-week">${st.week.map(w => `<div title="${w.d}：${w.n} 次"><span>${mins(w.ms)}</span><i style="height:${Math.round(70 * w.ms / maxMs)}%"></i>${w.d.slice(5).replace('-', '/')}</div>`).join('')}</div>
      <h3>關卡進度（已過關的字）</h3>
      <div class="pp-kpis">${LEVELS.map((l, i) => `<div>${l.icon} ${l.label}<b>${st.levelCount[i]}</b>字</div>`).join('')}</div>
      <h3>常錯的字</h3>
      ${st.weak.length ? `<ul class="pp-weak">${st.weak.map(w => `<li><span class="ch">${w.char}</span><span>寫了 ${w.writes} 次，錯 ${w.mistakes} 次、提示 ${w.hints} 次<small>${w.worstStroke ? `最常錯在第 ${w.worstStroke.n} 筆${w.worstStroke.name ? `（${w.worstStroke.name}）` : ''}，錯 ${w.worstStroke.misses} 次` : '還沒有逐筆紀錄（v12 以後寫的才有）'}</small></span><a href="https://stroke-order.learningweb.moe.edu.tw/dictView.jsp?ID=${w.char.codePointAt(0)}" target="_blank" rel="noopener">教育部筆順 ↗</a></li>`).join('')}</ul>` : '<p class="pp-note">目前沒有寫錯或用提示的字。</p>'}
      ${this.rewards ? '<h3>🎁 獎勵（用星星換）</h3><div class="pp-rw"></div>' : ''}
      ${this.shop ? (() => { const s = this.shop.summary(); return s ? `<h3>🏪 配件商店</h3>
      <div class="pp-save pp-shop"><p>孩子自己用星星買配件，幫小鎮的朋友換裝。已買 <b>${s.count}</b>／${s.all} 件，花了 ★${s.spent}，還能用 ★${Math.max(0, s.balance)}。</p>
        <p class="pp-note" style="margin:0">配件的星星和上面的獎勵<b>分開算</b>：買配件不會讓獎勵變遠，兌換獎勵也不會讓配件星星變少。買了不能退。</p>
        ${s.names.length ? `<details><summary>已買的配件（${s.names.length} 件）</summary><p style="margin:4px 0 0">${s.names.map(esc).join('、')}</p></details>` : ''}</div>` : ''; })() : ''}
      ${this.backup ? (() => { const i = this.backup.info() ?? {}; return `<h3>📱 存檔保護</h3>
      <div class="pp-save">
        <p>${i.standalone ? '<span class="ok">✔ 已從主畫面開啟</span>，資料比較不會被系統清掉。' : '<span class="warn">建議加到主畫面</span>：在 Safari 按分享鈕 ⬆️ →「加入主畫面」，以後從主畫面的圖示打開。'}${i.persisted ? '（瀏覽器已同意長期保存）' : ''}</p>
        <p>iPhone 上「主畫面 App」和「Safari」是兩份分開的存檔。換手機或改用主畫面 App 前，先在原本的地方按「備份」，再到新的地方按「還原」。</p>
        <div class="row"><button type="button" data-act="export">💾 備份進度</button><button type="button" data-act="import">📂 從備份還原</button><input type="file" accept="application/json,.json" hidden></div>
        <output></output>
      </div>`; })() : ''}
      <h3>設定</h3>
      <div class="pp-set">
        <span>示範速度</span>${seg('speed', [['slow', '慢'], ['mid', '中'], ['fast', '快']])}
        <span>開始時</span>${seg('intro', [['full', '唸完整口訣'], ['short', '只唸短句']])}
        <span>筆畫名稱</span>${seg('strokeVoice', [[true, '唸出來'], [false, '不唸']])}
        <span>複習方式</span>${seg('reviewDictation', [[true, '聽寫'], [false, '照進度']])}
        ${this.shop ? `<span>配件商店</span>${seg('shop', [[true, '開'], [false, '關']])}` : ''}
        ${this.books ? `<span>課本版本</span><div class="seg">${this.books.list.map(b => `<button type="button" data-book="${esc(b.id)}" aria-pressed="${b.id === this.books.current}">${esc(b.label)}</button>`).join('')}</div>` : ''}
      </div>
      ${this.books ? '<p class="pp-note">換課本版本會重新載入。每個版本的進度、星星、獎勵和配件分開記，換回來都還在；備份也要在各版本分別做。</p>' : ''}
      <p class="pp-note">設定只存在這台裝置。筆畫名稱與口訣由 AI 撰寫，若和課本不同請以課本為準。</p>
      <p class="pp-note">🔍 <a href="./game/check.html" target="_blank" rel="noopener">家長核對頁</a>：逐項確認台灣筆順修正、筆畫名稱、注音與部件表，核對完可匯出結果。</p>
      <p class="pp-note">🖨️ <a href="./game/worksheet.html" target="_blank" rel="noopener">列印練習單</a>：把還沒三顆星、常錯的字印成 A4 練習單（可存成 PDF）。</p>
    </div>`;
    for (const t of ['pointerdown', 'pointermove', 'mousedown', 'mousemove', 'wheel', 'touchstart', 'touchmove']) el.addEventListener(t, e => e.stopPropagation(), { passive: true });
    el.addEventListener('click', e => {
      const b = e.target.closest('button'); if (!b) { if (e.target === el) this.close(); return; }
      if (b.dataset.act === 'close') return this.close();
      if (b.dataset.act === 'export' || b.dataset.act === 'import') return this._backupAct(b.dataset.act);
      if (b.dataset.rw) return this._rewardAct(b);
      if (b.dataset.book) { this.log('book ' + b.dataset.book); return this.books.onPick(b.dataset.book); }
      if (b.dataset.k) {
        const s = loadSettings(), v = b.dataset.v; s[b.dataset.k] = v === 'true' ? true : v === 'false' ? false : v; saveSettings(s);
        for (const x of el.querySelectorAll(`button[data-k="${b.dataset.k}"]`)) x.setAttribute('aria-pressed', String(x === b));
        this.onSettings?.(s); this.log('settings ' + JSON.stringify(s));
      }
    });
    this._onKey = e => { e.stopPropagation(); if (e.key === 'Escape') this.close(); else if (e.key === 'Enter' && e.target.matches?.('.pp-rw input')) e.target.closest('.rw-form, .rw-ask')?.querySelector('button:not(:disabled)')?.click(); }; document.addEventListener('keydown', this._onKey, true);
    el.querySelector('.pp-save input')?.addEventListener('change', async e => {
      const f = e.target.files?.[0], out = el.querySelector('.pp-save output'); e.target.value = ''; if (!f) return;
      try { const r = await this.backup.onImport(f); out.textContent = r.message; } catch (err) { out.textContent = '還原失敗：' + (err?.message || err); this.log('restore failed ' + err); }
    });
    document.body.append(el); this.el = el; this.stats = st;
    this._rw = { mode: null, id: null, msg: '', quiz: null }; this._renderRewards();
  }
  /** 🎁 獎勵區：每次操作後整區重畫（資料直接讀 localStorage） */
  _renderRewards() {
    const box = this.el?.querySelector('.pp-rw'); if (!box) return;
    const data = loadRewards(this.rewards.key), st = rewardState({ ...this.rewards.totals(), data }), ui = this._rw, n = st.items.length;
    const fields = r => `<input type="text" data-f="title" maxlength="${TITLE_MAX}" placeholder="獎勵名稱（例：去公園玩）" value="${esc(r?.title ?? '')}" aria-label="獎勵名稱"><label>★ <input type="number" data-f="cost" min="1" max="${st.maxTotal}" step="1" inputmode="numeric" placeholder="星數" value="${r?.cost ?? ''}" aria-label="需要幾顆星"></label>`;
    const item = r => {
      if (ui.mode === 'edit' && ui.id === r.id) return `<li data-id="${esc(r.id)}"><div class="rw-form">${fields(r)}<button type="button" data-rw="save">儲存</button><button type="button" data-rw="cancel">取消</button></div><small>改名稱或星數只影響之後的兌換，以前的紀錄不變。</small></li>`;
      const have = Math.max(0, Math.min(st.balance, r.cost));
      return `<li data-id="${esc(r.id)}"><div class="rw-top"><b>${esc(r.title)}</b><span>★ ${r.cost}</span></div>
        <div class="rw-bar" role="progressbar" aria-valuemin="0" aria-valuemax="${r.cost}" aria-valuenow="${have}"><i style="width:${Math.round(100 * have / r.cost)}%"></i></div>
        <small>${r.canRedeem ? '<span class="ok">星星夠了，可以兌換！</span>' : `有 ${have}／${r.cost} 顆，還差 ${r.need} 顆`}</small>
        ${r.unreachable ? '<small class="warn">這個獎勵的星數已經拿不到，請調整</small>' : ''}
        <div class="row"><button type="button" data-rw="redeem" ${r.canRedeem ? '' : 'disabled'}>已兌換</button><button type="button" data-rw="edit">修改</button><button type="button" data-rw="archive">封存</button></div>
        ${ui.mode === 'redeem' && ui.id === r.id ? `<div class="rw-ask"><span>請大人回答：${ui.quiz.a} ＋ ${ui.quiz.b} ＝</span><input type="number" data-f="ans" inputmode="numeric" aria-label="答案"><button type="button" data-rw="redeemOk">確定兌換</button><button type="button" data-rw="cancel">取消</button></div>` : ''}
        ${ui.mode === 'archive' && ui.id === r.id ? '<div class="rw-ask"><span>封存後孩子就看不到這個獎勵（兌換紀錄會留著）。</span><button type="button" data-rw="archiveOk">確定封存</button><button type="button" data-rw="cancel">取消</button></div>' : ''}</li>`;
    };
    box.innerHTML = `<p>現在有 <b>★${st.total}</b> 顆星，已兌換 ${st.spent} 顆，還能用 <b>${Math.max(0, st.balance)}</b> 顆。${st.advance ? `<span class="warn">已預支 ${st.advance} 顆</span>（補回來以前不能再兌換）` : ''}</p>
      ${n ? `<ul>${st.items.map(item).join('')}</ul>` : '<p class="pp-note" style="margin:0 0 6px">還沒有獎勵。可以設定 1～3 個實際的獎勵（例：去公園玩、選今天的晚餐），孩子存夠星星後由大人按「已兌換」。</p>'}
      <div class="rw-form" data-new>${fields(null)}<button type="button" data-rw="add" ${st.canAdd ? '' : 'disabled'}>新增</button></div>
      <small>${st.overLimit ? `<span class="warn">現在有 ${n} 個獎勵，封存到 ${MAX_ACTIVE} 個以內才能再新增</span>` : !st.canAdd ? `最多 ${MAX_ACTIVE} 個獎勵；要新增請先封存一個。` : `每個字最多 3 顆星，全部拿滿是 ★${st.maxTotal}。`}</small>
      <output>${esc(ui.msg)}</output>
      ${data.redemptions.length ? `<details><summary>兌換紀錄（${data.redemptions.length} 筆）</summary><ul>${[...data.redemptions].sort((a, b) => b.redeemedAt.localeCompare(a.redeemedAt)).map(x => `<li>${x.redeemedAt ? day(x.redeemedAt) : ''}　${esc(x.title)}　★${x.cost}</li>`).join('')}</ul></details>` : ''}`;
    this.rewardState = st;
    if (ui.mode === 'redeem') box.querySelector('[data-f="ans"]')?.focus();
  }
  _rewardAct(b) {
    const R = this.rewards, ui = this._rw, act = b.dataset.rw, id = b.closest('li[data-id]')?.dataset.id ?? null, row = b.closest('.rw-form, .rw-ask');
    const val = f => row?.querySelector(`[data-f="${f}"]`)?.value ?? '', { total, maxTotal } = R.totals(), data = loadRewards(R.key);
    const quiz = () => ({ a: 11 + Math.floor(Math.random() * 79), b: 11 + Math.floor(Math.random() * 79) });
    const commit = (res, okMsg) => {
      if (res.error) { ui.msg = res.error; return; }
      if (!saveRewards(R.key, res.data)) { ui.msg = '存不進去（可能是私密瀏覽模式）'; return; }
      Object.assign(ui, { mode: null, id: null, quiz: null, msg: okMsg }); this.log(`reward ${act} ${id ?? ''}`); R.onChange?.();
    };
    ui.msg = '';
    if (act === 'cancel') Object.assign(ui, { mode: null, id: null, quiz: null });
    else if (act === 'edit' || act === 'archive') Object.assign(ui, { mode: act, id, quiz: null });
    else if (act === 'redeem') Object.assign(ui, { mode: 'redeem', id, quiz: quiz() });
    else if (act === 'add') commit(addReward(data, { title: val('title'), cost: Number(val('cost')) }, { maxTotal }), '已新增獎勵。');
    else if (act === 'save') commit(editReward(data, id, { title: val('title'), cost: Number(val('cost')) }, { maxTotal }), '已修改。');
    else if (act === 'archiveOk') commit(archiveReward(data, id), '已封存。');
    else if (act === 'redeemOk') {
      if (val('ans').trim() === '' || Number(val('ans')) !== ui.quiz.a + ui.quiz.b) { ui.msg = '答案不對，請大人再算一次。'; ui.quiz = quiz(); }
      else commit(redeemReward(data, id, { total }), '已記錄兌換，記得把獎勵給孩子！');
    }
    this._renderRewards();
  }
  async _backupAct(act) {
    const out = this.el.querySelector('.pp-save output');
    if (act === 'import') { this.el.querySelector('.pp-save input').click(); return; }
    try { out.textContent = '準備備份檔…'; const r = await this.backup.onExport(); out.textContent = r.via === 'cancel' ? '已取消。' : `已產生備份檔「${r.name}」（${Math.max(1, Math.round(r.bytes / 1024))} KB）。請存到「檔案」或傳給自己。`; }
    catch (err) { out.textContent = '備份失敗：' + (err?.message || err); this.log('backup failed ' + err); }
  }
  close() { if (!this.el) return; document.removeEventListener('keydown', this._onKey, true); this.el.remove(); this.el = null; }
}

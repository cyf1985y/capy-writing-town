// v12 家長面板：練習統計、常錯的字（錯在第幾筆）、關卡進度、設定。
// 只讀存檔（IndexedDB 作品），不寫入；設定存在 localStorage `capy_settings`（只是這台裝置的偏好）。
import { isApp, bindExternalLinks } from './app-env.js?v=59'; // v54 App 版
import { starsOf } from './stars.js?v=59';
import { LEVELS } from './writing-panel.js?v=59';
import { loadRewards, saveRewards, rewardState, costMaxOf, addReward, editReward, archiveReward, redeemReward, MAX_ACTIVE, TITLE_MAX } from './rewards.js?v=59';

export const SETTINGS_KEY = 'capy_settings';
export const DEFAULT_SETTINGS = Object.freeze({ speed: 'mid', intro: 'full', strokeVoice: true, reviewDictation: true, shop: true });
export function loadSettings() {
  try { return { ...DEFAULT_SETTINGS, ...JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}') }; } catch { return { ...DEFAULT_SETTINGS }; }
}
/**
 * v56 家長限制課程範圍：settings.lessonMax＝{ <課程 id>: 最大可寫的課號 }。lessons＝這個課程的課號（含 0）。
 * 回傳 null＝不限制（沒設、壞值、或已經是最後一課）。第 0 課一直開放（由呼叫端處理）。
 */
export function lessonMaxOf(settings, book, lessons) {
  const v = settings?.lessonMax?.[book], last = Math.max(...lessons);
  return Number.isInteger(v) && v >= 1 && v < last ? v : null;
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
.pp-dialog h2>button{margin-left:auto}
.pp-tabs{display:none}
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
.pp-dhist ul{list-style:none;margin:6px 0 0;padding:0}.pp-dhist li{display:flex;flex-wrap:wrap;gap:6px;align-items:center;margin:0 0 6px}
.pp-dt{font-size:13px;color:#8a6f7c;flex-basis:100%}.pp-dq{display:inline-flex;flex-direction:column;align-items:center;min-width:40px;padding:2px 4px;border:2px solid #cfe8d4;border-radius:10px;background:#fff;font-size:22px;font-family:"Kaiti TC","BiauKai","DFKai-SB","Noto Serif TC",serif;color:#2f3e46}
.pp-dq.bad{border-color:#F7C9C0}.pp-dq small{font:12px system-ui,sans-serif;color:#8a6f7c}
.pp-dweak .dn,.pp-dnote{display:none}
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
/* v48 手機橫放：上面分頁（學習／聽寫／星星／設定），每頁左右兩欄，少捲動 */
@media (orientation:landscape) and (max-height:560px){
  .pp-dialog{width:96vw;max-width:none;height:calc(100dvh - 12px);max-height:none;padding:8px 14px 10px;display:flex;flex-direction:column}
  .pp-dialog h2{margin:0 0 6px;font-size:17px;gap:8px;flex:none}
  .pp-tabs{display:flex;gap:6px;margin-left:10px}
  .pp-tabs button{font:inherit;font-size:14px;font-weight:700;padding:5px 12px;border-radius:999px;border:2px solid #F5CBA7;background:#fff;color:#6E473B;cursor:pointer;touch-action:manipulation}
  .pp-tabs button[aria-selected=true]{background:#FFA94D;border-color:#FFA94D;color:#fff}
  .pp-sec{display:none;flex:1;min-height:0;overflow:auto;overscroll-behavior:contain}
  .pp-sec.on{display:grid;grid-template-columns:1fr 1fr;gap:0 16px;align-content:start}
  .pp-sec.one.on{grid-template-columns:1fr}
  .pp-sec>.pp-c{min-width:0}
  .pp-sec h3{margin:6px 0 4px;font-size:15px}
  .pp-sec>.pp-c>h3:first-child,.pp-sec>.pp-c>.pp-note:first-child{margin-top:0}
  .pp-kpis{gap:6px}.pp-kpis div{padding:4px 6px;font-size:13px}.pp-kpis b{font-size:20px}
  .pp-week{height:72px}
  .pp-weak li{padding:4px 8px;margin:0 0 4px}.pp-weak .ch{font-size:26px}
  .pp-note{margin:6px 0 0}
  .pp-sec[data-sec=set].on{grid-template-rows:auto 1fr}.pp-sec[data-sec=set] .pp-note{font-size:12px;margin-top:4px}.pp-sec[data-sec=set]>.pp-c:nth-child(1){grid-area:1/1}.pp-sec[data-sec=set]>.pp-c:nth-child(2){grid-area:1/2/3/3}.pp-sec[data-sec=set]>.pp-c:nth-child(3){grid-area:2/1}
  .pp-sec[data-sec=dict].on{grid-template-rows:100%}.pp-sec[data-sec=dict]>.pp-c{overflow:auto;overscroll-behavior:contain}
  .pp-dweak{display:grid;grid-template-columns:repeat(auto-fill,minmax(96px,1fr));gap:4px}
  .pp-dweak li{margin:0;padding:0 6px;gap:6px}.pp-dweak .ch{font-size:22px}.pp-dweak .dl{display:none}.pp-dweak .dn{display:block;font-size:12px;color:#8a6f7c;white-space:nowrap}
  .pp-dnote{display:block}
  .pp-dhist summary{font-size:14px}.pp-dhist li{gap:3px;margin:0 0 4px;flex-wrap:nowrap;flex-direction:row}.pp-dhist li .pp-dt{flex:none;width:44px;white-space:normal;line-height:1.2}.pp-dt{font-size:12px}
  .pp-dq{flex:1 1 0;min-width:0;padding:0 1px;font-size:17px;border-radius:8px}.pp-dq small{font-size:10px}
  .pp-set{gap:5px 8px}.pp-set .seg{gap:5px}.pp-set button{font-size:13px;padding:3px 10px}
  .pp-save{padding:6px 8px}.pp-save p{font-size:13px;margin:0 0 4px}.pp-save button{font-size:13px;padding:4px 10px}
  .pp-rw p{font-size:13px;margin:0 0 4px}.pp-rw li{padding:5px 8px;margin:0 0 4px}.pp-rw .rw-bar{margin:4px 0 2px}.pp-rw small{font-size:12px}
  .pp-rw button{font-size:13px;padding:3px 10px}.pp-rw .row,.pp-rw .rw-form,.pp-rw .rw-ask{margin-top:4px}.pp-rw input{font-size:15px;padding:3px 6px}
}
`;

export class ParentPanel {
  /** rewards（可省略）：{ key, totals: () => ({ total, maxTotal }), onChange }，見 rewards.js；shop（可省略）：{ summary: () => ({ count, all, spent, balance, names }) }，見 shop.js */
  /** books（可省略）：{ list: [{ id, label }], current, onPick(id), lessons: [課號] }，見 books.js；v56 lessons 給「可以寫到」設定用 */
  constructor({ getData, onSettings, backup = null, rewards = null, shop = null, books = null, skins = null, dictation = null, seasons = null, strokes = null, log = () => {} }) { Object.assign(this, { getData, onSettings, backup, rewards, shop, books, skins, dictation, seasons, strokes, log }); /* v57 strokes＝{ summary()：{ done, total, good, weak } }；v58 weak＝最近常寫錯的筆畫 */ /* v52 seasons＝{ info()：{ current, list:[{id,label,short,unlocked,unlockStars,price,runs}] }, onPick(id|null)：async → true／false } */ this.el = null; }
  isOpen() { return !!this.el; }
  open() {
    if (this.el) return;
    if (!document.getElementById('pp-style')) { const s = document.createElement('style'); s.id = 'pp-style'; s.textContent = CSS; document.head.append(s); }
    const st = parentStats(this.getData()), set = loadSettings(), maxMs = Math.max(1, ...st.week.map(w => w.ms));
    const seg = (key, opts) => `<div class="seg">${opts.map(([v, l]) => `<button type="button" data-k="${key}" data-v="${v}" aria-pressed="${String(set[key]) === String(v)}">${l}</button>`).join('')}</div>`;
    const el = document.createElement('div'); el.className = 'pp-overlay'; el.setAttribute('role', 'dialog'); el.setAttribute('aria-modal', 'true'); el.setAttribute('aria-label', '家長面板');
    el.innerHTML = `<div class="pp-dialog">
      <h2>👪 家長面板${this._tabsHTML()}<button type="button" data-act="close">關閉</button></h2>
      <section class="pp-sec" data-sec="learn"><div class="pp-c">
      ${this.books ? `<p class="pp-note" style="margin:0 0 8px">📚 目前課程：<b>${esc(this.books.list.find(b => b.id === this.books.current)?.label ?? '')}</b>（可在「設定」切換）</p>` : ''}
      <div class="pp-kpis"><div>學會的字<b>${st.learned}</b>／${st.totalChars}</div><div>今天寫了<b>${st.today.n}</b>次</div><div>今天練習<b>${mins(st.today.ms)}</b>分鐘</div></div>
      <h3>最近 7 天（分鐘）</h3>
      <div class="pp-week">${st.week.map(w => `<div title="${w.d}：${w.n} 次"><span>${mins(w.ms)}</span><i style="height:${Math.round(70 * w.ms / maxMs)}%"></i>${w.d.slice(5).replace('-', '/')}</div>`).join('')}</div>
      <h3>關卡進度（已過關的字）</h3>
      <div class="pp-kpis">${LEVELS.map((l, i) => `<div>${l.icon} ${l.label}<b>${st.levelCount[i]}</b>字</div>`).join('')}</div>
      ${(() => { const q = this.seasons?.info().list.filter(x => x.runs) ?? []; return q.length ? `<p class="pp-note" style="margin:6px 0 0">🌸 季節小考（課本外的字，不算進上面的進度）：${q.map(x => `${esc(x.short)} 做過 ${x.runs} 次`).join('、')}</p>` : ''; })()}
      ${(() => { const k = this.strokes?.summary?.(); return k ? `<p class="pp-note" style="margin:6px 0 0">✏️ 筆畫練習：練過 ${k.done}／${k.total} 種，描得好 ${k.good} 次</p>${k.weak?.length ? `<p class="pp-note pp-weakstroke" style="margin:4px 0 0">🎯 最近兩週最常寫錯的筆畫：${k.weak.map(w => `${esc(w.name)}（寫過 ${w.seen} 次，寫錯 ${w.misses} 次）`).join('、')}。建議先到大廳「✏️ 筆畫練習」練這幾種。<small style="display:block;opacity:.75">寫錯是寫錯的次數，同一筆錯好幾次會算好幾次。</small></p>` : ''}` : ''; })()}
      </div><div class="pp-c">
      <h3>常錯的字</h3>
      ${st.weak.length ? `<ul class="pp-weak">${st.weak.map(w => `<li><span class="ch">${w.char}</span><span>寫了 ${w.writes} 次，錯 ${w.mistakes} 次、提示 ${w.hints} 次<small>${w.worstStroke ? `最常錯在第 ${w.worstStroke.n} 筆${w.worstStroke.name ? `（${w.worstStroke.name}）` : ''}，錯 ${w.worstStroke.misses} 次` : '還沒有逐筆紀錄（v12 以後寫的才有）'}</small></span><a href="https://stroke-order.learningweb.moe.edu.tw/dictView.jsp?ID=${w.char.codePointAt(0)}" target="_blank" rel="noopener" data-ext>教育部筆順 ↗</a></li>`).join('')}</ul>` : '<p class="pp-note">目前沒有寫錯或用提示的字。</p>'}
      </div></section>
      ${this.dictation ? `<section class="pp-sec" data-sec="dict">${this._dictationHTML()}</section>` : ''}
      <section class="pp-sec" data-sec="star"><div class="pp-c">
      ${this.rewards ? '<h3>🎁 獎勵（用星星換）</h3><div class="pp-rw"></div>' : ''}
      </div><div class="pp-c">
      ${this.shop ? (() => { const s = this.shop.summary(); return s ? `<h3>🏪 配件商店</h3>
      <div class="pp-save pp-shop"><p>孩子自己用星星買配件，幫小鎮的朋友換裝。已買 <b>${s.count}</b>／${s.all} 件${s.gifted ? `（另有朋友送的 ${s.gifted} 件）` : ''}，花了 ★${s.spent}，還能用 ★${Math.max(0, s.balance)}。</p>
        <p class="pp-note" style="margin:0">配件的星星和上面的獎勵<b>分開算</b>：買配件不會讓獎勵變遠，兌換獎勵也不會讓配件星星變少。買了不能退。</p>
        ${s.names.length ? `<details><summary>已買的配件（${s.names.length} 件）</summary><p style="margin:4px 0 0">${s.names.map(esc).join('、')}</p></details>` : ''}
        ${s.seasons?.length ? `<p style="margin:6px 0 0">🌸 用星星提早換的季節：${s.seasons.map(x => `${esc(x.name)}（★${x.cost}）`).join('、')}</p>` : ''}
        ${s.space ? `<p class="pp-space" style="margin:6px 0 0">🛰️ 太空基地：升級 ${s.space.builds} 次、火箭零件 ${s.space.parts} 個、去過 ${s.space.planets} 顆星球（共用 ★${s.space.cost}）</p>` : ''}</div>` : ''; })() : ''}
      </div></section>
      <section class="pp-sec" data-sec="set"><div class="pp-c">
      ${this.backup ? (() => { const i = this.backup.info() ?? {}; return `<h3>📱 存檔保護</h3>
      <div class="pp-save">
        ${isApp() ? `<p><span class="ok">✔ 資料存在這個 App 裡</span>，沒有網路也能玩。<b>刪掉 App 會連進度一起刪掉</b>，換 iPad 或刪 App 前，先按「備份」。</p>
        <p>App 和 Safari 網站版的進度是分開的。要把網站版的進度搬過來：先在 Safari 按「備份」，再到 App 按「還原」（兩個課程要各做一次）。</p>` : `<p>${i.standalone ? '<span class="ok">✔ 已從主畫面開啟</span>，資料比較不會被系統清掉。' : '<span class="warn">建議加到主畫面</span>：在 Safari 按分享鈕 ⬆️ →「加入主畫面」，以後從主畫面的圖示打開。'}${i.persisted ? '（瀏覽器已同意長期保存）' : ''}</p>
        <p>iPhone 上「主畫面 App」和「Safari」是兩份分開的存檔。換手機或改用主畫面 App 前，先在原本的地方按「備份」，再到新的地方按「還原」。</p>`}
        <div class="row"><button type="button" data-act="export">💾 備份進度</button><button type="button" data-act="import">📂 從備份還原</button><input type="file" accept="application/json,.json" hidden></div>
        <output></output>
      </div>`; })() : ''}
      </div><div class="pp-c">
      <h3>設定</h3>
      <div class="pp-set">
        <span>示範速度</span>${seg('speed', [['slow', '慢'], ['mid', '中'], ['fast', '快']])}
        <span>開始時</span>${seg('intro', [['full', '唸完整口訣'], ['short', '只唸短句']])}
        <span>筆畫名稱</span>${seg('strokeVoice', [[true, '唸出來'], [false, '不唸']])}
        <span>複習方式</span>${seg('reviewDictation', [[true, '聽寫'], [false, '照進度']])}
        ${this.shop ? `<span>配件商店</span>${seg('shop', [[true, '開'], [false, '關']])}` : ''}
        ${this.skins?.list.length > 1 ? `<span>遊戲主題</span><div class="seg">${this.skins.list.map(b => `<button type="button" data-skin="${esc(b.id)}" aria-pressed="${b.id === this.skins.current}">${esc(b.label)}</button>`).join('')}</div>` : ''}
        ${this._seasonSetHTML()}
        ${this._lessonMaxHTML(set)}
        ${this.books ? `<span>課程</span><div class="seg">${this.books.list.map(b => `<button type="button" data-book="${esc(b.id)}" aria-pressed="${b.id === this.books.current}">${esc(b.label)}</button>`).join('')}</div>` : ''}
      </div>
      <p class="pp-note">🔍 <a href="./game/check.html"${isApp() ? '' : ' target="_blank" rel="noopener"'}>家長核對頁</a>：逐項確認台灣筆順修正、筆畫名稱、注音與部件表，核對完可匯出結果。</p>
      <p class="pp-note">🖨️ <a href="./game/worksheet.html"${isApp() ? '' : ' target="_blank" rel="noopener"'}>列印練習單</a>：把還沒三顆星、常錯的字印成 A4 練習單（可存成 PDF）。</p>
      </div><div class="pp-c">
      ${this.skins?.list.length > 1 ? '<p class="pp-note">換遊戲主題只是換圖案和朋友的樣子，會重新載入；學會的字、星星、獎勵和配件都不變。</p>' : ''}
      ${this.seasons?.info().list.length ? '<p class="pp-note">季節只是換顏色和飄落的雪花／花瓣，不影響學習進度，也不用重新載入。總星數到了會自動解鎖，孩子也可以在商店用星星提早換。換上季節後地圖上會出現「季節小考」（課本外的字，第一次做完送星星）。</p>' : ''}
      ${this.books?.lessons?.length > 2 ? '<p class="pp-note">「可以寫到」：孩子只能選到這一課（第 0 課一直開著），只改目前這個課程。已經學會的字照樣會出現在每日複習、聽寫小考和守門員。</p>' : ''}
      ${this.books ? '<p class="pp-note">換課程會重新載入。每個課程的進度、星星、獎勵和配件分開記，換回來都還在；備份也要在各課程分別做。</p>' : ''}
      <p class="pp-note">🔒 <a href="./game/privacy.html">隱私權政策</a>　❓ <a href="./game/support.html">使用說明與聯絡</a></p>
      <p class="pp-note">設定只存在這台裝置。筆畫名稱與口訣由 AI 撰寫，若和課本不同請以課本為準。</p>
      </div></section>
    </div>`;
    for (const t of ['pointerdown', 'pointermove', 'mousedown', 'mousemove', 'wheel', 'touchstart', 'touchmove']) el.addEventListener(t, e => e.stopPropagation(), { passive: true });
    el.addEventListener('click', e => {
      const b = e.target.closest('button'); if (!b) { if (e.target === el) this.close(); return; }
      if (b.dataset.act === 'close') return this.close();
      if (b.dataset.tab) return this._showTab(b.dataset.tab);
      if (b.dataset.act === 'export' || b.dataset.act === 'import') return this._backupAct(b.dataset.act);
      if (b.dataset.rw) return this._rewardAct(b);
      if (b.dataset.skin) { this.log('skin ' + b.dataset.skin); return this.skins.onPick(b.dataset.skin); }
      if (b.dataset.book) { this.log('book ' + b.dataset.book); return this.books.onPick(b.dataset.book); }
      if (b.dataset.season != null) return this._seasonPick(b);
      if (b.dataset.lmax != null) { // v56 可以寫到第幾課
        const s = loadSettings(), lm = { ...(s.lessonMax && typeof s.lessonMax === 'object' ? s.lessonMax : {}) }, v = b.dataset.lmax;
        if (v === '') delete lm[this.books.current]; else lm[this.books.current] = Number(v);
        s.lessonMax = lm; saveSettings(s);
        for (const x of el.querySelectorAll('button[data-lmax]')) x.setAttribute('aria-pressed', String(x === b));
        this.onSettings?.(s); this.log('lessonMax ' + this.books.current + '=' + (v || 'all')); return;
      }
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
    bindExternalLinks(el, m => this.log(m)); // v54：外部連結（App 裡先過家長確認）
    document.body.append(el); this.el = el; this.stats = st; this._showTab(this._tab);
    this._rw = { mode: null, id: null, msg: '', quiz: null }; this._renderRewards();
  }
  /** v56「可以寫到」：不限＋第 1 課…倒數第二課（最後一課＝不限） */
  _lessonMaxHTML(set) {
    const ls = this.books?.lessons; if (!ls || ls.length <= 2) return '';
    const cur = lessonMaxOf(set, this.books.current, ls), opts = ls.filter(l => l >= 1 && l < Math.max(...ls));
    const btn = (v, label) => `<button type="button" data-lmax="${v}" aria-pressed="${String(cur ?? '') === String(v)}">${label}</button>`;
    return `<span>可以寫到</span><div class="seg pp-lmax">${btn('', '不限')}${opts.map(l => btn(l, '第 ' + l + ' 課')).join('')}</div>`;
  }
  /** v52 設定裡的季節選擇：不用＋各季（沒解鎖的灰色、寫怎麼解鎖） */
  _seasonSetHTML() {
    const inf = this.seasons?.info(); if (!inf?.list.length) return '';
    const btn = (id, label, on, dis, note = '') => `<button type="button" data-season="${esc(id)}" aria-pressed="${on}"${dis ? ' disabled' : ''}>${esc(label)}${note ? `<small style="display:block;font-size:11px;font-weight:600">${esc(note)}</small>` : ''}</button>`;
    return `<span>季節</span><div class="seg pp-season">${btn('', '不用', inf.current == null, false)}${inf.list.map(x => btn(x.id, x.short, inf.current === x.id, !x.unlocked, x.unlocked ? '' : `★${x.unlockStars} 解鎖／商店 ★${x.price}`)).join('')}</div>`;
  }
  async _seasonPick(b) {
    const id = b.dataset.season || null; this.log('parent season ' + (id ?? 'none'));
    const ok = await this.seasons.onPick(id); if (!this.el) return;
    const cur = this.seasons.info().current;
    for (const x of this.el.querySelectorAll('button[data-season]')) x.setAttribute('aria-pressed', String((x.dataset.season || null) === cur));
    if (!ok) { const o = this.el.querySelector('.pp-season'); o?.insertAdjacentHTML('afterend', '<p class="pp-note" style="grid-column:1/-1;color:#c92a2a">換不了（可能是私密瀏覽模式）</p>'); }
  }
  /** v48 手機橫放用的分頁鈕（其他尺寸 CSS 藏起來，所有區塊照舊一路排下來） */
  _tabsHTML() {
    const t = [['learn', '📊 學習'], this.dictation && ['dict', '👂 聽寫'], (this.rewards || this.shop) && ['star', '⭐ 星星'], ['set', '⚙️ 設定']].filter(Boolean);
    return `<nav class="pp-tabs" role="tablist">${t.map(([k, l]) => `<button type="button" role="tab" data-tab="${k}">${l}</button>`).join('')}</nav>`;
  }
  _showTab(k) {
    if (!this.el?.querySelector(`.pp-sec[data-sec="${k}"]`)) k = 'learn'; this._tab = k;
    for (const s of this.el.querySelectorAll('.pp-sec')) s.classList.toggle('on', s.dataset.sec === k);
    for (const b of this.el.querySelectorAll('.pp-tabs button')) b.setAttribute('aria-selected', String(b.dataset.tab === k));
  }
  /** 👂 聽寫小考成績（v43）：考過幾次、要再練的字、最近幾次的結果。資料由 dictation.summary() 提供（同 dictation.js 的存檔） */
  _dictationHTML() {
    const d = this.dictation.summary?.() ?? null, n = d?.sessions || 0, hist = Array.isArray(d?.history) ? d.history : [], tested = d?.tested ?? {}, missed = d?.missed ?? {};
    const day = iso => { const t = new Date(iso); return isNaN(t) ? '' : `${t.getMonth() + 1}/${t.getDate()} ${String(t.getHours()).padStart(2, '0')}:${String(t.getMinutes()).padStart(2, '0')}`; };
    const W = { ok: '✓', hint: '💡', many: '△', skip: '—' }, weak = Object.entries(d?.weak ?? {}).sort((a, b) => b[1] - a[1]);
    if (!n && !weak.length) return `<div class="pp-c"><h3>👂 聽寫小考</h3><p class="pp-note" style="margin:0 0 6px">還沒考過。孩子學會 5 個字以後，大廳會出現「👂 聽寫小考」：聽語音、點注音、再自己寫出國字。</p></div>`;
    const row = h => `<li><span class="pp-dt">${esc(day(h.at))}</span>${h.qs.map(q => `<span class="pp-dq${q.zy && q.w === 'ok' ? '' : ' bad'}" title="注音${q.zy ? '對' : '錯'}，國字${{ ok: '自己寫對', hint: '看了提示', many: '錯 3 筆以上', skip: '沒寫' }[q.w] ?? ''}">${esc(q.c)}<small>${q.zy ? '✓' : '✗'}${W[q.w] ?? ''}</small></span>`).join('')}</li>`;
    const land = matchMedia('(orientation:landscape) and (max-height:560px)').matches; // 手機橫放：成績直接展開放右欄
    return `<div class="pp-c"><h3>👂 聽寫小考</h3>
      <div class="pp-kpis"><div>考過<b>${n}</b>次</div><div>要再練的字<b>${weak.length}</b>個</div><div>最近一次<b style="font-size:18px">${esc(hist.length ? day(hist[hist.length - 1].at) : '—')}</b></div></div>
      ${weak.length ? `<ul class="pp-weak pp-dweak">${weak.map(([c]) => `<li><span class="ch">${esc(c)}</span><span class="dn">錯 ${missed[c] ?? '?'}／考 ${tested[c] ?? '?'}</span><span class="dl">考過 ${tested[c] ?? '?'} 次，其中 ${missed[c] ?? '?'} 次沒有全對<small>下次聽寫會先考這個字；之後全對就會從這裡移除（錯越多次，要全對越多次）</small></span></li>`).join('')}</ul><p class="pp-note pp-dnote">下次聽寫會先考這些字；之後全對就會移除（錯越多次，要全對越多次）。</p>`
        : '<p class="pp-note" style="margin:0 0 6px">目前沒有要再練的字 👍</p>'}</div><div class="pp-c">
      ${hist.length ? `<details class="pp-dhist"${land ? ' open' : ''}><summary>最近 ${Math.min(10, hist.length)} 次的成績</summary><ul>${hist.slice(-10).reverse().map(row).join('')}</ul>
        <p class="pp-note" style="margin:4px 0 0">每個字下面：第一個是注音（✓ 對／✗ 拼錯過），第二個是國字（✓ 自己寫對／💡 看了提示／△ 錯 3 筆以上／— 沒寫）。</p></details>` : ''}</div>`;
  }
  /** 🎁 獎勵區：每次操作後整區重畫（資料直接讀 localStorage） */
  _renderRewards() {
    const box = this.el?.querySelector('.pp-rw'); if (!box) return;
    const tot = this.rewards.totals(), bonus = tot.bonus || 0, data = loadRewards(this.rewards.key), st = rewardState({ ...tot, data }), ui = this._rw, n = st.items.length; // v50：bonus＝朋友送的額外星星（已含在 total）
    const fields = r => `<input type="text" data-f="title" maxlength="${TITLE_MAX}" placeholder="獎勵名稱（例：去公園玩）" value="${esc(r?.title ?? '')}" aria-label="獎勵名稱"><label>★ <input type="number" data-f="cost" min="1" max="${st.costMax}" step="1" inputmode="numeric" placeholder="星數" value="${r?.cost ?? ''}" aria-label="需要幾顆星"></label>`;
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
    box.innerHTML = `<p>現在有 <b>★${st.total}</b> 顆星${bonus ? `（含額外獲得的 ${bonus} 顆：地圖上朋友送的、守門員、季節小考、學過的字再寫一次、筆畫練習）` : ''}，已兌換 ${st.spent} 顆，還能用 <b>${Math.max(0, st.balance)}</b> 顆。${st.advance ? `<span class="warn">已預支 ${st.advance} 顆</span>（補回來以前不能再兌換）` : ''}</p>
      ${tot.repeat ? `<p class="pp-note" style="margin:0 0 6px">🔁 今天重複練習（再寫一次＋筆畫）拿了 ★${tot.repeat.today}（每個字每天最多 ${tot.repeat.perChar} 顆，每天最多 ${tot.repeat.perDay} 顆）</p>` : ''}
      ${n ? `<ul>${st.items.map(item).join('')}</ul>` : '<p class="pp-note" style="margin:0 0 6px">還沒有獎勵。可以設定 1～3 個實際的獎勵（例：去公園玩、選今天的晚餐），孩子存夠星星後由大人按「已兌換」。</p>'}
      <div class="rw-form" data-new>${fields(null)}<button type="button" data-rw="add" ${st.canAdd ? '' : 'disabled'}>新增</button></div>
      <small>${st.overLimit ? `<span class="warn">現在有 ${n} 個獎勵，封存到 ${MAX_ACTIVE} 個以內才能再新增</span>` : !st.canAdd ? `最多 ${MAX_ACTIVE} 個獎勵；要新增請先封存一個。` : st.open ? `已經學會的字再寫一次還能多拿星星（每個字每天 ${tot.repeat?.perChar ?? 8} 顆，每天最多 ${tot.repeat?.perDay ?? 60} 顆），獎勵最多可以設 ★${st.costMax}。` : `每個字最多 3 顆星，全部拿滿是 ★${st.maxTotal}。`}</small>
      <output>${esc(ui.msg)}</output>
      ${data.redemptions.length ? `<details><summary>兌換紀錄（${data.redemptions.length} 筆）</summary><ul>${[...data.redemptions].sort((a, b) => b.redeemedAt.localeCompare(a.redeemedAt)).map(x => `<li>${x.redeemedAt ? day(x.redeemedAt) : ''}　${esc(x.title)}　★${x.cost}</li>`).join('')}</ul></details>` : ''}`;
    this.rewardState = st;
    if (ui.mode === 'redeem') box.querySelector('[data-f="ans"]')?.focus();
  }
  _rewardAct(b) {
    const R = this.rewards, ui = this._rw, act = b.dataset.rw, id = b.closest('li[data-id]')?.dataset.id ?? null, row = b.closest('.rw-form, .rw-ask');
    const val = f => row?.querySelector(`[data-f="${f}"]`)?.value ?? '', tt = R.totals(), { total } = tt, maxTotal = costMaxOf(tt), data = loadRewards(R.key); // v56：重複練習開著時獎勵上限另外算
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
    try { out.textContent = '準備備份檔…'; const r = await this.backup.onExport(); out.textContent = r.via === 'cancel' ? '已取消。' : r.via === 'unavailable' ? '⚠️ App 裡現在不能存備份檔，請截圖回報。' : `已產生備份檔「${r.name}」（${Math.max(1, Math.round(r.bytes / 1024))} KB）。請存到「檔案」或傳給自己。`; }
    catch (err) { out.textContent = '備份失敗：' + (err?.message || err); this.log('backup failed ' + err); }
  }
  close() { if (!this.el) return; document.removeEventListener('keydown', this._onKey, true); this.el.remove(); this.el = null; }
}

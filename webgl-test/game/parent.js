// v12 家長面板：練習統計、常錯的字（錯在第幾筆）、關卡進度、設定。
// 只讀存檔（IndexedDB 作品），不寫入；設定存在 localStorage `capy_settings`（只是這台裝置的偏好）。
import { starsOf } from './stars.js?v=29';
import { LEVELS } from './writing-panel.js?v=29';

export const SETTINGS_KEY = 'capy_settings';
export const DEFAULT_SETTINGS = Object.freeze({ speed: 'mid', intro: 'full', strokeVoice: true });
export function loadSettings() {
  try { return { ...DEFAULT_SETTINGS, ...JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}') }; } catch { return { ...DEFAULT_SETTINGS }; }
}
function saveSettings(s) { try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(s)); } catch { /* 私密模式：只在這次有效 */ } }

const day = d => new Date(d).toLocaleDateString('sv');
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
`;

export class ParentPanel {
  constructor({ getData, onSettings, log = () => {} }) { Object.assign(this, { getData, onSettings, log }); this.el = null; }
  isOpen() { return !!this.el; }
  open() {
    if (this.el) return;
    if (!document.getElementById('pp-style')) { const s = document.createElement('style'); s.id = 'pp-style'; s.textContent = CSS; document.head.append(s); }
    const st = parentStats(this.getData()), set = loadSettings(), maxMs = Math.max(1, ...st.week.map(w => w.ms));
    const seg = (key, opts) => `<div class="seg">${opts.map(([v, l]) => `<button type="button" data-k="${key}" data-v="${v}" aria-pressed="${String(set[key]) === String(v)}">${l}</button>`).join('')}</div>`;
    const el = document.createElement('div'); el.className = 'pp-overlay'; el.setAttribute('role', 'dialog'); el.setAttribute('aria-modal', 'true'); el.setAttribute('aria-label', '家長面板');
    el.innerHTML = `<div class="pp-dialog">
      <h2>👪 家長面板<button type="button" data-act="close">關閉</button></h2>
      <div class="pp-kpis"><div>學會的字<b>${st.learned}</b>／${st.totalChars}</div><div>今天寫了<b>${st.today.n}</b>次</div><div>今天練習<b>${mins(st.today.ms)}</b>分鐘</div></div>
      <h3>最近 7 天（分鐘）</h3>
      <div class="pp-week">${st.week.map(w => `<div title="${w.d}：${w.n} 次"><span>${mins(w.ms)}</span><i style="height:${Math.round(70 * w.ms / maxMs)}%"></i>${w.d.slice(5).replace('-', '/')}</div>`).join('')}</div>
      <h3>關卡進度（已過關的字）</h3>
      <div class="pp-kpis">${LEVELS.map((l, i) => `<div>${l.icon} ${l.label}<b>${st.levelCount[i]}</b>字</div>`).join('')}</div>
      <h3>常錯的字</h3>
      ${st.weak.length ? `<ul class="pp-weak">${st.weak.map(w => `<li><span class="ch">${w.char}</span><span>寫了 ${w.writes} 次，錯 ${w.mistakes} 次、提示 ${w.hints} 次<small>${w.worstStroke ? `最常錯在第 ${w.worstStroke.n} 筆${w.worstStroke.name ? `（${w.worstStroke.name}）` : ''}，錯 ${w.worstStroke.misses} 次` : '還沒有逐筆紀錄（v12 以後寫的才有）'}</small></span><a href="https://stroke-order.learningweb.moe.edu.tw/dictView.jsp?ID=${w.char.codePointAt(0)}" target="_blank" rel="noopener">教育部筆順 ↗</a></li>`).join('')}</ul>` : '<p class="pp-note">目前沒有寫錯或用提示的字。</p>'}
      <h3>設定</h3>
      <div class="pp-set">
        <span>示範速度</span>${seg('speed', [['slow', '慢'], ['mid', '中'], ['fast', '快']])}
        <span>開始時</span>${seg('intro', [['full', '唸完整口訣'], ['short', '只唸短句']])}
        <span>筆畫名稱</span>${seg('strokeVoice', [[true, '唸出來'], [false, '不唸']])}
      </div>
      <p class="pp-note">設定只存在這台裝置。筆畫名稱與口訣由 AI 撰寫，若和課本不同請以課本為準。</p>
    </div>`;
    for (const t of ['pointerdown', 'pointermove', 'mousedown', 'mousemove', 'wheel', 'touchstart', 'touchmove']) el.addEventListener(t, e => e.stopPropagation(), { passive: true });
    el.addEventListener('click', e => {
      const b = e.target.closest('button'); if (!b) { if (e.target === el) this.close(); return; }
      if (b.dataset.act === 'close') return this.close();
      if (b.dataset.k) {
        const s = loadSettings(), v = b.dataset.v; s[b.dataset.k] = v === 'true' ? true : v === 'false' ? false : v; saveSettings(s);
        for (const x of el.querySelectorAll(`button[data-k="${b.dataset.k}"]`)) x.setAttribute('aria-pressed', String(x === b));
        this.onSettings?.(s); this.log('settings ' + JSON.stringify(s));
      }
    });
    this._onKey = e => { e.stopPropagation(); if (e.key === 'Escape') this.close(); }; document.addEventListener('keydown', this._onKey, true);
    document.body.append(el); this.el = el; this.stats = st;
  }
  close() { if (!this.el) return; document.removeEventListener('keydown', this._onKey, true); this.el.remove(); this.el = null; }
}

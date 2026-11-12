// v54 家長確認（App Store 兒童類別要求：家長功能、外部連結、付費之前要先確認是大人）。設計：docs/plans/2026-11-12-app-store-readiness.md §4
// 題目用國字寫的乘法（6～9 × 6～9），用數字鍵作答；答錯換題，連錯 3 次要等 10 秒。通過後 5 分鐘內不再問（sessionStorage）。
const KEY = 'capy_gate_until', OK_MS = 5 * 60 * 1000, LOCK_MS = 10 * 1000;
const NUM = ['零', '一', '二', '三', '四', '五', '六', '七', '八', '九'];
const PRIVACY = new URL('./privacy.html', import.meta.url).href.replace(/\?.*$/, '');
const CSS = `
.pg-overlay{position:fixed;inset:0;z-index:2000;background:rgba(60,40,50,.78);display:flex;align-items:center;justify-content:center;font:16px system-ui,"Noto Sans TC",sans-serif;color:#5B3A4A;padding:max(8px,env(safe-area-inset-top)) max(8px,env(safe-area-inset-right)) max(8px,env(safe-area-inset-bottom)) max(8px,env(safe-area-inset-left));box-sizing:border-box}
.pg-box{background:#fffdf7;border-radius:20px;box-shadow:0 20px 60px rgba(0,0,0,.4);padding:14px 18px 10px;width:min(94vw,420px);max-height:100%;overflow:auto;box-sizing:border-box;text-align:center}
.pg-box h2{margin:0;font-size:19px;color:#E8665C}
.pg-q{font-size:24px;font-weight:800;margin:8px 0 4px}
.pg-ans{font-size:30px;font-weight:900;letter-spacing:4px;min-height:42px;border:3px dashed #F5CBA7;border-radius:12px;margin:0 auto 8px;width:120px;line-height:38px;background:#fff}
.pg-msg{min-height:1.3em;font-size:14px;color:#c92a2a;margin-bottom:6px}
.pg-keys{display:grid;grid-template-columns:repeat(5,1fr);gap:6px;margin-bottom:8px}
.pg-keys button,.pg-act button{font:inherit;font-size:22px;font-weight:800;height:46px;border-radius:12px;border:2px solid #F5CBA7;background:#fff;color:#5B3A4A;cursor:pointer;touch-action:manipulation}
.pg-act{display:flex;gap:8px}.pg-act button{flex:1;font-size:17px}
.pg-act .go{background:#E8665C;border-color:#E8665C;color:#fff}
.pg-keys button:disabled,.pg-act button:disabled{opacity:.45}
.pg-foot{margin-top:8px;font-size:12px}.pg-foot a{color:#1c5d99}
@media (orientation:landscape) and (max-height:560px){.pg-box{width:min(96vw,640px);display:grid;grid-template-columns:1fr 1.2fr;gap:4px 14px;align-items:center;padding:10px 14px 8px}.pg-box h2,.pg-foot{grid-column:1/-1}.pg-q{font-size:21px}.pg-keys button,.pg-act button{height:40px}}
`;
let openEl = null;
export const gateOpen = () => !!openEl;
export function gateValid() { try { return +(sessionStorage.getItem(KEY) || 0) > Date.now(); } catch { return false; } }
function remember() { try { sessionStorage.setItem(KEY, String(Date.now() + OK_MS)); } catch { /* 私密模式：只是下次會再問 */ } }
const newQ = () => { const a = 6 + Math.floor(Math.random() * 4), b = 6 + Math.floor(Math.random() * 4); return { a, b, ans: a * b }; };

/** 問家長；通過回傳 true，取消回傳 false。5 分鐘內通過過就直接回傳 true */
export function parentGate({ reason = '', log = () => {} } = {}) {
  if (gateValid()) return Promise.resolve(true);
  if (openEl) return Promise.resolve(false);
  if (!document.getElementById('pg-style')) { const s = document.createElement('style'); s.id = 'pg-style'; s.textContent = CSS; document.head.append(s); }
  return new Promise(resolve => {
    let q = newQ(), typed = '', wrong = 0, lockUntil = 0, lockT = null;
    const el = document.createElement('div'); el.className = 'pg-overlay'; el.setAttribute('role', 'dialog'); el.setAttribute('aria-modal', 'true'); el.setAttribute('aria-label', '家長確認');
    el.innerHTML = `<div class="pg-box"><h2>👪 請家長回答</h2><div><div class="pg-q"></div><div class="pg-ans" aria-live="polite"></div><div class="pg-msg" role="status"></div></div>
      <div><div class="pg-keys">${[1, 2, 3, 4, 5, 6, 7, 8, 9, 0].map(n => `<button type="button" data-n="${n}">${n}</button>`).join('')}</div>
      <div class="pg-act"><button type="button" data-a="del">⌫ 刪掉</button><button type="button" data-a="cancel">取消</button><button type="button" class="go" data-a="ok">確定</button></div></div>
      <div class="pg-foot">這一頁是給大人用的。<a href="${PRIVACY}">隱私權政策</a></div></div>`;
    const $ = s => el.querySelector(s);
    const paint = () => {
      $('.pg-q').textContent = `${NUM[q.a]} 乘以 ${NUM[q.b]} 是多少？`; $('.pg-ans').textContent = typed || ' ';
      const locked = Date.now() < lockUntil; el.querySelectorAll('.pg-keys button, [data-a="ok"], [data-a="del"]').forEach(b => { b.disabled = locked; });
    };
    const done = ok => { clearTimeout(lockT); document.removeEventListener('keydown', onKey, true); el.remove(); openEl = null; if (ok) remember(); log(`gate ${ok ? 'ok' : 'cancel'} reason=${reason}`); resolve(ok); };
    const submit = () => {
      if (!typed || Date.now() < lockUntil) return;
      if (+typed === q.ans) return done(true);
      wrong += 1; typed = ''; q = newQ(); log(`gate wrong reason=${reason} n=${wrong}`);
      if (wrong >= 3) { wrong = 0; lockUntil = Date.now() + LOCK_MS; $('.pg-msg').textContent = '答錯太多次，請等 10 秒再試'; lockT = setTimeout(() => { $('.pg-msg').textContent = ''; paint(); }, LOCK_MS); }
      else $('.pg-msg').textContent = '不對喔，換一題';
      paint();
    };
    el.addEventListener('click', e => {
      const b = e.target.closest('button'); if (!b || b.disabled) { if (e.target === el) done(false); return; }
      if (b.dataset.n != null) { if (typed.length < 3) typed += b.dataset.n; $('.pg-msg').textContent = ''; paint(); }
      else if (b.dataset.a === 'del') { typed = typed.slice(0, -1); paint(); }
      else if (b.dataset.a === 'cancel') done(false);
      else if (b.dataset.a === 'ok') submit();
    });
    for (const t of ['pointerdown', 'pointermove', 'mousedown', 'mousemove', 'wheel', 'touchstart', 'touchmove']) el.addEventListener(t, e => e.stopPropagation(), { passive: true });
    const onKey = e => { e.stopPropagation(); if (e.key === 'Escape') done(false); else if (/^\d$/.test(e.key) && Date.now() >= lockUntil) { if (typed.length < 3) typed += e.key; paint(); } else if (e.key === 'Backspace') { typed = typed.slice(0, -1); paint(); } else if (e.key === 'Enter') submit(); };
    document.addEventListener('keydown', onKey, true);
    document.body.append(el); openEl = el; paint(); log('gate open reason=' + reason);
  });
}

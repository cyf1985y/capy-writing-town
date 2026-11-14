// v59 太空主題「太空基地」面板：🏗️ 基地（8 棟建築升級）、🚀 火箭（組零件、發射、到達星球）。
// 規則都在 space-build.js；存檔是配件商店同一個 capy_shop_<profileId>（shop.js 的 loadShop／saveShop）。
// 設計：docs/plans/2026-11-13-space-base-rocket.md §6。發射從「買到第 4 個零件」到「到達畫面關掉」整段都算面板開著（isOpen() 一直是 true）。
import { loadShop, saveShop } from './shop.js?v=61';
import { buildState, buyBuild } from './space-build.js?v=61';

const CSS = `
.sb-overlay{position:fixed;inset:0;z-index:1000;background:rgba(20,30,52,.72);display:flex;align-items:center;justify-content:center;font:15px system-ui,"Noto Sans TC",sans-serif;color:#24324A;-webkit-user-select:none;user-select:none}
.sb-dialog{position:relative;display:flex;flex-direction:column;background:#F4F7FD;border-radius:22px;box-shadow:0 20px 60px rgba(0,0,0,.4);width:min(96vw,900px);height:min(94vh,94dvh,760px);box-sizing:border-box;padding:10px 12px 12px;overflow:hidden}
.sb-head{display:flex;align-items:center;gap:8px;flex:none}
.sb-head h2{margin:0;font-size:20px;color:#1F4FA8;white-space:nowrap}
.sb-wallet{display:flex;align-items:center;gap:4px;margin-left:auto;background:#FFF1C9;border:2px solid #F5CBA7;border-radius:999px;padding:2px 12px 2px 4px;font-weight:900;font-size:20px;color:#B86E00;white-space:nowrap}
.sb-wallet img{width:30px;height:30px}
.sb-close{font:inherit;font-size:16px;font-weight:700;padding:7px 14px;min-height:44px;border-radius:999px;border:2px solid #B9C8E6;background:#fff;color:#24324A;cursor:pointer;touch-action:manipulation;white-space:nowrap}
.sb-tabs{display:flex;gap:6px;flex:none;margin-top:8px}
.sb-tabs button{flex:1;font:inherit;font-size:17px;font-weight:900;padding:9px 4px;border-radius:14px 14px 0 0;border:2px solid #B9C8E6;border-bottom:0;background:#E3EBF8;color:#5C6E8F;cursor:pointer;touch-action:manipulation;min-height:44px}
.sb-tabs button[aria-selected=true]{background:#fff;color:#1F4FA8}
.sb-body{flex:1;min-height:0;overflow-y:auto;-webkit-overflow-scrolling:touch;overscroll-behavior:contain;background:#fff;border:2px solid #B9C8E6;border-radius:0 0 14px 14px;padding:8px}
.sb-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:8px}
.sb-card{display:flex;flex-direction:column;align-items:center;gap:3px;padding:6px 4px 8px;border-radius:14px;border:3px solid #E1E8F5;background:#FBFCFF;cursor:pointer;touch-action:manipulation}
.sb-card .pic{width:100%;height:92px;display:flex;align-items:flex-end;justify-content:center}
.sb-card .pic img{max-width:92%;max-height:100%;object-fit:contain}
.sb-card b{font-size:15px}
.sb-card .lv{font-size:14px;letter-spacing:1px;color:#F5A800}
.sb-card .lv i{font-style:normal;color:#C9D3E6}
.sb-card.sel{border-color:#FF8A1F;background:#FFF6EC}
.sb-price{display:flex;align-items:center;gap:3px;font-weight:900;font-size:16px;color:#B86E00}
.sb-price img{width:20px;height:20px}
.sb-price.poor{color:#8A97B0;font-size:14px}
.sb-price.max{color:#2b8a3e}
.sb-rocket{display:grid;grid-template-columns:minmax(0,40%) minmax(0,1fr);gap:10px;min-height:100%}
@media (max-width:640px),(max-aspect-ratio:4/5){.sb-rocket{grid-template-columns:1fr}}
.sb-pad{position:relative;display:flex;align-items:flex-end;justify-content:center;border-radius:16px;background:linear-gradient(#1B2A55,#3B5FA8 70%,#C9D3E6);min-height:220px;overflow:hidden}
.sb-pad img{max-height:88%;max-width:70%;object-fit:contain;margin-bottom:4%}
.sb-pad .ghost{position:absolute;bottom:6%;left:50%;transform:translateX(-50%);width:26%;height:72%;border:3px dashed rgba(255,255,255,.6);border-radius:50% 50% 12px 12px}
.sb-pad .rname{position:absolute;left:8px;top:8px;font-weight:900;color:#fff;background:rgba(0,0,0,.3);border-radius:999px;padding:1px 10px}
.sb-parts{display:flex;flex-direction:column;gap:8px}
.sb-part{display:flex;align-items:center;gap:10px;padding:8px 10px;border-radius:14px;border:3px solid #E1E8F5;background:#FBFCFF;font-size:17px;font-weight:800;min-height:44px}
.sb-part .n{width:30px;height:30px;border-radius:50%;background:#C9D3E6;color:#fff;display:flex;align-items:center;justify-content:center;font-weight:900}
.sb-part.got .n{background:#5CC05C}.sb-part.next{border-color:#FF8A1F;background:#FFF6EC;cursor:pointer}.sb-part.next .n{background:#FF8A1F}.sb-part.lock{opacity:.6}
.sb-part .sb-price{margin-left:auto}
.sb-note{padding:6px 10px;border-radius:12px;background:#FFF1C9;font-weight:800;color:#8A5A00}
.sb-planets{display:flex;gap:8px;flex-wrap:wrap}
.sb-planets button{display:flex;flex-direction:column;align-items:center;gap:2px;width:96px;font:inherit;font-weight:800;font-size:13px;padding:4px;border-radius:12px;border:2px solid #B9C8E6;background:#fff;cursor:pointer;touch-action:manipulation}
.sb-planets button img{width:86px;height:58px;object-fit:cover;border-radius:8px}
.sb-planets button[disabled]{cursor:default;color:#8A97B0}
.sb-planets button[disabled] span.q{width:86px;height:58px;border-radius:8px;background:#E3EBF8;display:flex;align-items:center;justify-content:center;font-size:26px}
.sb-bar{flex:none;display:flex;align-items:center;gap:8px;flex-wrap:wrap;justify-content:center;min-height:52px;margin-top:8px;padding:6px 10px;border-radius:16px;background:#E3EBF8;font-size:16px;font-weight:700;text-align:center}
.sb-bar button{font:inherit;font-size:18px;font-weight:900;padding:9px 20px;border-radius:999px;border:3px solid #fff;background:#fff;color:#24324A;box-shadow:0 3px 8px rgba(0,0,0,.2);cursor:pointer;touch-action:manipulation;min-height:44px}
.sb-bar button.go{background:#FF8A1F;color:#fff}
.sb-bar button.go img{width:22px;height:22px;vertical-align:-4px}
.sb-dialog.yay{animation:sb-yay .6s cubic-bezier(.3,1.6,.5,1)}
@keyframes sb-yay{40%{transform:scale(1.02)}}
.sb-launch{position:fixed;inset:0;z-index:1000;background:transparent;touch-action:none}
.sb-count{position:absolute;left:50%;top:38%;transform:translate(-50%,-50%);font:900 min(28vw,180px)/1 system-ui;color:#fff;text-shadow:0 0 18px #FF8A1F,0 4px 0 #1F4FA8;animation:sb-count .9s ease-out}
@keyframes sb-count{0%{transform:translate(-50%,-50%) scale(1.8);opacity:0}30%{opacity:1}100%{transform:translate(-50%,-50%) scale(1)}}
.sb-arrive{position:absolute;inset:0;background:#000 center/cover no-repeat;display:flex;flex-direction:column;align-items:center;justify-content:flex-start;animation:sb-fade .5s ease-out;cursor:pointer}
@keyframes sb-fade{from{opacity:0}}
.sb-arrive h2{margin:6vh 0 0;font:900 clamp(26px,6vw,56px)/1.2 system-ui,"Noto Sans TC",sans-serif;color:#fff;text-shadow:0 3px 0 #1F4FA8,0 0 16px rgba(0,0,0,.5);text-align:center;padding:0 12px}
.sb-arrive p{margin:6px 0 0;font:800 clamp(14px,2.4vw,20px)/1.3 system-ui;color:#fff;text-shadow:0 2px 6px rgba(0,0,0,.6)}
.sb-crew{position:absolute;left:50%;bottom:6%;transform:translateX(-50%);display:flex;align-items:flex-end;gap:2vw;height:38%}
.sb-crew img{height:100%;width:auto;animation:sb-hop 1.1s ease-in-out infinite}
.sb-crew img:nth-child(2){height:88%;animation-delay:.2s}.sb-crew img:nth-child(3){height:88%;animation-delay:.4s}
@keyframes sb-hop{50%{transform:translateY(-8%)}}
.sb-shake{animation:sb-shake .12s linear infinite}
@keyframes sb-shake{25%{transform:translate(2px,1px)}75%{transform:translate(-2px,-1px)}}
.t2-builds img.sb-flame{z-index:1;animation:sb-flicker .14s steps(1) infinite}
.t2-builds img.sb-smoke{z-index:3;opacity:.9;transition:transform 1.6s ease-out,opacity 1.6s ease-out}
@keyframes sb-flicker{50%{opacity:.75}}
@media (prefers-reduced-motion:reduce){.sb-crew img,.sb-count{animation:none}}
@media (orientation:landscape) and (max-height:560px){.sb-dialog{height:calc(100vh - 10px);height:calc(100dvh - 10px);padding:6px 10px 8px}.sb-head h2{font-size:17px}.sb-wallet{font-size:16px}.sb-wallet img{width:24px;height:24px}.sb-tabs{margin-top:4px}.sb-tabs button{padding:5px 4px;font-size:15px}.sb-card .pic{height:50px}.sb-card{padding:4px 4px 6px;gap:1px}.sb-grid{grid-template-columns:repeat(auto-fill,minmax(120px,1fr));gap:6px}.sb-bar{min-height:44px;margin-top:6px;padding:4px 8px}.sb-pad{min-height:150px}.sb-part{padding:4px 8px}} /* 手機橫放：卡片矮一點，價錢露出來 */
`;

const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

export class SpaceBuildPanel {
  /**
   * key＝商店存檔鍵；build＝theme.json 的 build；town／townFx＝大廳；url(name)＝主題圖片網址；coin＝錢包小圖網址；totals()＝{ total }
   * onOpen／onClose（暫停／恢復大廳，onClose 整段只呼叫一次）；onLaunchStart()＝發射時讓大廳播放（resume）；onBuilt()＝存檔改了，地圖重畫
   * crew()＝到達畫面上的隊員圖網址（導遊＋2 位）；onPractice()＝「去練習寫字」
   */
  constructor(o) {
    Object.assign(this, o); this.el = null; this.ui = { tab: 'base', sel: null, confirm: null, msg: '', busy: false };
    this.timers = []; this.launch = null; this.pendingRedraw = false;
    if (!document.getElementById('sb-style')) { const s = document.createElement('style'); s.id = 'sb-style'; s.textContent = CSS; document.head.append(s); }
    this._vis = () => { if (document.hidden && this.launch) { this.log('launch: page hidden → finish'); this._finishLaunch(); } };
    document.addEventListener('visibilitychange', this._vis);
  }
  isOpen() { return !!this.el; }
  launching() { return !!this.launch; }
  state() { const data = loadShop(this.key); return { data, st: buildState({ total: this.totals().total, build: this.build, data }) }; }
  open(tab = 'base') {
    if (this.el) return false;
    this.ui = { tab, sel: null, confirm: null, msg: '', busy: false };
    const el = document.createElement('div'); el.className = 'sb-overlay'; el.setAttribute('role', 'dialog'); el.setAttribute('aria-label', '太空基地');
    el.innerHTML = `<div class="sb-dialog"><div class="sb-head"><h2>🛰️ 太空基地</h2><div class="sb-wallet"></div><button type="button" class="sb-close" data-act="close">關閉</button></div>
      <div class="sb-tabs" role="tablist"><button type="button" role="tab" data-tab="base">🏗️ 基地</button><button type="button" role="tab" data-tab="rocket">🚀 火箭</button></div>
      <div class="sb-body"></div><div class="sb-bar"></div></div>`;
    el.addEventListener('click', e => this._click(e));
    this._key = e => { if (e.key === 'Escape' && !this.launch) this.close(); };
    document.addEventListener('keydown', this._key);
    document.body.append(el); this.el = el; this.onOpen?.(); this.render(); this.voice?.say('太空基地');
    this.log('space build open ' + tab); return true;
  }
  close() {
    if (!this.el || this.launch) return;
    document.removeEventListener('keydown', this._key); this.el.remove(); this.el = null; this.onClose?.(); this.log('space build close');
  }
  refresh() { if (this.launch) { this.pendingRedraw = true; return; } if (this.el && !this.ui.busy) this.render(); }
  render() {
    const { st } = this.state(), ui = this.ui, $ = s => this.el.querySelector(s); this.lastState = st;
    $('.sb-wallet').innerHTML = `<img alt="" src="${this.coin}">可以用 ★${Math.max(0, st.balance)}`;
    for (const b of this.el.querySelectorAll('.sb-tabs button')) b.setAttribute('aria-selected', b.dataset.tab === ui.tab);
    $('.sb-body').innerHTML = ui.tab === 'base' ? this._baseHTML(st) : this._rocketHTML(st);
    $('.sb-bar').innerHTML = this._barHTML(st);
  }
  /** v61：面板用裁掉透明邊的縮圖；圖片清單裡沒有就用地圖那張 */
  _thumb(n) { return this.has?.('thumb_' + n) ? this.url('thumb_' + n) : this.url(n); }
  _price(o, max = false) {
    if (max) return '<span class="sb-price max">滿級！</span>';
    if (!o) return '';
    return o.canBuy ? `<span class="sb-price"><img alt="" src="${this.coin}">${o.price}</span>` : `<span class="sb-price poor">★${o.price}・再 ${o.need} 顆</span>`;
  }
  _baseHTML(st) {
    return `<div class="sb-grid">${this.build.buildings.map((b, i) => {
      const lv = st.levels[i], nx = st.next.buildings[i];
      return `<div class="sb-card${this.ui.sel === i ? ' sel' : ''}" role="button" tabindex="0" data-b="${i}" aria-label="${esc(b.name)}，${lv} 級"><div class="pic"><img alt="" src="${this._thumb(`build_${i}_${lv}`)}"></div><b>${esc(b.name)}</b><span class="lv">${'★'.repeat(lv)}<i>${'★'.repeat(3 - lv)}</i></span>${this._price(nx, lv >= 3)}</div>`;
    }).join('')}</div>`;
  }
  _rocketHTML(st) {
    const cur = st.current, show = cur ?? 2, R = this.build.rockets[show], rs = st.rockets[show], parts = cur == null ? 4 : rs.parts;
    const pad = parts ? `<img alt="" src="${this.url(`rocket_${show + 1}_${parts}`)}">` : '<span class="ghost"></span>';
    const rows = R.parts.map((p, k) => {
      const got = k < parts, next = cur != null && k === parts, o = next ? st.next.rocket : null;
      const cls = got ? 'got' : next && !o.locked ? 'next' : 'lock';
      return `<div class="sb-part ${cls}"${next && !o.locked ? ` role="button" tabindex="0" data-part="${k}"` : ''}><span class="n">${got ? '✓' : k + 1}</span>${esc(p)}${got ? '' : next && !o.locked ? this._price(o) : '<span class="sb-price poor">🔒</span>'}</div>`;
    }).join('');
    let note = '';
    if (cur == null) note = '🎉 三枚火箭都做好了！點下面的星球可以再飛一次。';
    else if (st.next.rocket?.locked === 'pad') note = `🔒 要先把「發射台」升到 ${cur + 1} 級，才能做${esc(R.name)}。`;
    const planets = this.build.rockets.map((r, i) => st.planets.includes(i)
      ? `<button type="button" data-planet="${i}"><img alt="" src="${this.url('planet_' + (i + 1))}">${esc(r.planet.name)}<small>再飛一次</small></button>`
      : `<button type="button" disabled><span class="q">？</span>還沒去過</button>`).join('');
    return `<div class="sb-rocket"><div class="sb-pad"><span class="rname">${esc(R.name)}</span>${pad}</div><div class="sb-parts">${rows}${note ? `<div class="sb-note">${note}</div>` : ''}<b>去過的星球</b><div class="sb-planets">${planets}</div></div></div>`;
  }
  _barHTML(st) {
    const ui = this.ui, coin = `<img alt="" src="${this.coin}">`, dis = ui.busy ? ' disabled' : '';
    if (ui.msg) return `<span>${esc(ui.msg)}</span>` + (ui.look != null ? `<button type="button" class="go" data-act="look">去看看</button>` : '');
    if (ui.confirm) {
      const o = this._offer(st, ui.confirm); if (!o) { ui.confirm = null; return this._barHTML(st); }
      return `<span>用 ★${o.price} ${esc(o.label)}嗎？</span><button type="button" class="go" data-act="yes"${dis}>${coin} 要！</button><button type="button" data-act="no"${dis}>先不要</button>`;
    }
    if (ui.tab === 'base' && ui.sel != null) {
      const o = st.next.buildings[ui.sel], b = this.build.buildings[ui.sel];
      if (!o) return `<span>${esc(b.name)}已經是最高級了！</span>`;
      if (o.canBuy) return `<span>${esc(b.name)}升到 ${st.levels[ui.sel] + 1} 級</span><button type="button" class="go" data-act="ask" data-item="${o.itemId}">${coin} ${o.price} 升級</button>`;
      return `<span>還差 ${o.need} 顆星星</span><button type="button" class="go" data-act="practice">✏️ 去練習寫字</button>`;
    }
    if (ui.tab === 'rocket' && st.next.rocket && !st.next.rocket.locked && !st.next.rocket.canBuy) return `<span>下一個零件還差 ${st.next.rocket.need} 顆星星</span><button type="button" class="go" data-act="practice">✏️ 去練習寫字</button>`;
    return ui.tab === 'base' ? '<span>點一棟建築，用星星把它升級！</span>' : '<span>一個一個裝上零件，裝好就能發射！</span>';
  }
  _offer(st, itemId) {
    const b = st.next.buildings.findIndex(o => o?.itemId === itemId);
    if (b >= 0) return { ...st.next.buildings[b], label: `把${this.build.buildings[b].name}升到 ${st.levels[b] + 1} 級` };
    const r = st.next.rocket; if (r?.itemId === itemId) return { ...r, label: `裝上${this.build.rockets[r.rocket].name}的「${this.build.rockets[r.rocket].parts[r.part]}」` };
    return null;
  }
  _click(e) {
    if (!this.el || this.launch) return;
    const t = e.target.closest('[data-act],[data-tab],[data-b],[data-part],[data-planet]'); if (!t) return;
    const ui = this.ui; this.sound?.unlock?.();
    if (t.dataset.tab) { ui.tab = t.dataset.tab; ui.sel = null; ui.confirm = null; ui.msg = ''; ui.look = null; this.render(); this.voice?.say(ui.tab === 'base' ? '基地' : '火箭'); return; }
    if (t.dataset.b != null) { ui.sel = +t.dataset.b; ui.confirm = null; ui.msg = ''; ui.look = null; this.render(); this.voice?.say(this.build.buildings[ui.sel].name); return; }
    if (t.dataset.part != null) { const st = this.lastState, o = st.next.rocket; if (!o || o.locked) return; this.voice?.say(this.build.rockets[o.rocket].parts[o.part]); if (o.canBuy) { ui.confirm = o.itemId; ui.msg = ''; } else ui.msg = `還差 ${o.need} 顆星星`; ui.look = null; this.render(); return; }
    if (t.dataset.planet != null) { this._replay(+t.dataset.planet); return; }
    const act = t.dataset.act;
    if (act === 'close') return this.close();
    if (act === 'ask') { ui.confirm = t.dataset.item; ui.msg = ''; this.render(); return; }
    if (act === 'no') { ui.confirm = null; this.render(); return; }
    if (act === 'practice') { this.close(); this.onPractice?.(); return; }
    if (act === 'look') { const i = ui.look; this.close(); this.onLook?.(i); return; }
    if (act === 'yes') this._buy(ui.confirm);
  }
  _buy(itemId) {
    const ui = this.ui; if (ui.busy || !itemId) return; ui.busy = true;
    try {
      const data = loadShop(this.key), r = buyBuild(data, itemId, { build: this.build, total: this.totals().total });
      if (r.error) { ui.confirm = null; ui.msg = r.error === '已經有了' ? '這個已經做好了！' : r.error; this.log('space buy refused ' + itemId + ' ' + r.error); return; }
      if (!saveShop(this.key, r.data)) { ui.confirm = null; ui.msg = '存不進去（可能是私密瀏覽模式）'; this.log('space buy save failed ' + itemId); return; }
      ui.confirm = null; this.log(`space buy ${itemId} ${r.item.price}`); this.onBuilt?.(); this.sound?.complete?.();
      const d = this.el.querySelector('.sb-dialog'); d.classList.remove('yay'); void d.offsetWidth; d.classList.add('yay');
      if (r.item.kind === 'b') { const b = this.build.buildings[r.item.index]; ui.msg = `${b.name}升到 ${r.item.lv} 級了！`; ui.look = r.item.index; this.voice?.say(b.name + '升級了！'); }
      else if (r.item.k < 4) { const R = this.build.rockets[r.item.index]; ui.msg = `裝好「${R.parts[r.item.k - 1]}」了！`; ui.look = null; this.voice?.say('裝好了！'); }
      else { ui.msg = '準備發射！'; ui.look = null; this.voice?.say('準備發射！'); const idx = r.item.index; this._later(() => this._startLaunch(idx, false), 1000); this.launch = { index: idx, phase: 'ready' }; }
    } finally { ui.busy = false; if (this.el) this.render(); }
  }
  _replay(i) { if (this.launch) return; this.voice?.say('再飛一次！'); this.launch = { index: i, phase: 'ready', replay: true }; this._startLaunch(i, true); }
  _later(fn, ms) { const id = setTimeout(() => { this.timers = this.timers.filter(x => x !== id); fn(); }, ms); this.timers.push(id); return id; }
  /** 發射（§6.3）：對話框換成透明擋板、大廳播放、平移到發射台、倒數、火焰、飛走、到達畫面 */
  _startLaunch(i, replay) {
    if (!this.el || !this.launch || this.launch.done) return;
    const L = this.launch; L.phase = 'count'; L.replay = replay;
    this.el.className = 'sb-launch'; this.el.innerHTML = ''; this.onLaunchStart?.();
    const b = this.build, t = this.town, rk = t.rocketEl, reduced = this.reduced;
    t.setRocket({ sprite: `rocket_${i + 1}_4`, at: b.rocketAt, w: b.rocketW, cx: b.rocketCx?.[String(i + 1)] ?? 0.5, by: b.rocketBy?.[String(i + 1)] ?? 1 });
    t.panTo(b.rocketAt[0], true);
    const say = n => { const c = document.createElement('div'); c.className = 'sb-count'; c.textContent = n; this.el.querySelector('.sb-count')?.remove(); this.el.append(c); this.voice?.say(String(n)); };
    const fx = []; const addFx = (cls, sprite, dx, dy, w) => { const im = document.createElement('img'); im.alt = ''; im.className = cls; im.src = this.url(sprite); im.style.position = 'absolute';
      im.style.left = ((b.rocketAt[0] + dx - w / 2) / t.W * 100) + '%'; im.style.top = ((b.rocketAt[1] + dy) / t.H * 100) + '%'; im.style.width = (w / t.W * 100) + '%'; t.builds.append(im); fx.push(im); return im; };
    L.fx = fx;
    const step = reduced ? 350 : 900;
    say(3); this._later(() => say(2), step); this._later(() => say(1), step * 2);
    this._later(() => {
      this.el.querySelector('.sb-count')?.remove(); this.sound?.whoosh?.();
      const fw = b.rocketW * 0.28, flame = addFx('sb-flame', 'fx_flame_1', 0, -6, fw);
      let k = 0; L.flick = setInterval(() => { k = 1 - k; flame.src = this.url(k ? 'fx_flame_2' : 'fx_flame_1'); }, 140);
      const s1 = addFx('sb-smoke', 'fx_smoke_1', -b.rocketW * 0.5, -10, b.rocketW * 0.7), s2 = addFx('sb-smoke', 'fx_smoke_2', b.rocketW * 0.5, -6, b.rocketW * 0.7);
      if (!reduced) t.view.classList.add('sb-shake');
      requestAnimationFrame(() => { s1.style.transform = 'translate(-40%,-20%) scale(1.6)'; s1.style.opacity = '0'; s2.style.transform = 'translate(40%,-20%) scale(1.6)'; s2.style.opacity = '0'; });
      const fly = reduced ? 600 : 1500, up = `translateY(-${(t.H * 1.2 / t.H * 100).toFixed(0)}vh)`;
      for (const el of [rk ?? t.rocketEl, flame]) { el.style.transition = `transform ${fly}ms cubic-bezier(.55,0,.9,.4)`; }
      requestAnimationFrame(() => { (rk ?? t.rocketEl).style.transform = up; flame.style.transform = up; });
      this._later(() => { t.view.classList.remove('sb-shake'); this._arrive(i); }, fly + 150);
    }, step * 3);
    this.log('launch ' + b.rockets[i].id + (replay ? ' (replay)' : ''));
  }
  _arrive(i) {
    if (!this.launch || this.launch.done) return;
    const L = this.launch; L.phase = 'arrive'; const r = this.build.rockets[i];
    const a = document.createElement('div'); a.className = 'sb-arrive'; a.style.backgroundImage = `url('${this.url('planet_' + (i + 1))}')`;
    a.innerHTML = `<h2>${esc(r.planet.line?.t ?? `飛到${r.planet.name}了！`)}</h2><p>${esc(r.name)}帶大家來到了${esc(r.planet.name)}</p><div class="sb-crew">${(this.crew?.() ?? []).map(u => `<img alt="" src="${u}">`).join('')}</div>`;
    a.addEventListener('click', () => this._finishLaunch());
    this.el.append(a); this.voice?.say(r.planet.line?.t ?? `飛到${r.planet.name}了！`); this.sound?.complete?.();
    this._later(() => this._finishLaunch(), 5000);
  }
  /** 結束發射（只做一次）：清掉計時器和特效、火箭回到目前狀態、關掉面板 */
  _finishLaunch() {
    const L = this.launch; if (!L || L.done) return; L.done = true;
    for (const id of this.timers) clearTimeout(id); this.timers = []; clearInterval(L.flick);
    for (const im of L.fx ?? []) im.remove();
    const rk = this.town.rocketEl; if (rk) { rk.style.transition = 'none'; rk.style.transform = ''; void rk.offsetWidth; rk.style.transition = ''; }
    this.town.view.classList.remove('sb-shake');
    this.pendingRedraw = false; this.onBuilt?.(); // 發射台換成目前狀態（通常是空的）
    this.launch = null; this.lastLaunch = { index: L.index, replay: !!L.replay };
    document.removeEventListener('keydown', this._key); this.el?.remove(); this.el = null;
    this.log('launch finished ' + this.build.rockets[L.index].id); this.onClose?.();
  }
}

// v18 配件商店畫面：選朋友 → 選位置分頁 → 點配件試戴 → 用星星換（問一次）→ 戴上。買過的點一下＝戴上／拿下來。
// 規則與存檔都在 shop.js；這裡只管畫面、語音與音效。所有字都很短，點配件會唸名稱（孩子不一定認得字）。
import { loadShop, saveShop, shopState, outfitOf, buyItem, wearItem, placeAccessory } from './shop.js?v=52';
const SEASON_TAB = '__season', seasonItemId = id => 'season:' + id; // v52 季節分頁（和 extras.js 的 seasonItemId 同一個格式）

const CSS = `
.sh-overlay{position:fixed;inset:0;z-index:1000;background:rgba(91,58,74,.72);display:flex;align-items:center;justify-content:center;font:15px system-ui,"Noto Sans TC",sans-serif;color:var(--ui-ink,#5B3A4A);-webkit-user-select:none;user-select:none}
.sh-dialog{position:relative;display:flex;flex-direction:column;background:#FFFAF2;border-radius:22px;box-shadow:0 20px 60px rgba(0,0,0,.35);width:min(96vw,900px);height:min(94vh,94dvh,760px);box-sizing:border-box;padding:10px 12px 12px;overflow:hidden}
.sh-head{display:flex;align-items:center;gap:8px;flex:none}
.sh-head h2{margin:0;font-size:20px;color:#E8665C;white-space:nowrap}
.sh-wallet{display:flex;align-items:center;gap:4px;margin-left:auto;background:#FFF1C9;border:2px solid #F5CBA7;border-radius:999px;padding:2px 12px 2px 4px;font-weight:900;font-size:20px;color:#B86E00;white-space:nowrap}
.sh-wallet img{width:30px;height:30px}
.sh-close{font:inherit;font-size:16px;font-weight:700;padding:7px 14px;border-radius:999px;border:2px solid #F5CBA7;background:#fff;color:#6E473B;cursor:pointer;touch-action:manipulation;white-space:nowrap}
.sh-friends{display:flex;gap:6px;overflow-x:auto;flex:none;padding:8px 2px 6px;-webkit-overflow-scrolling:touch}
.sh-friends button{flex:none;display:flex;flex-direction:column;align-items:center;gap:1px;width:64px;font:inherit;font-size:13px;font-weight:700;padding:4px 2px;border-radius:14px;border:3px solid transparent;background:#fff;color:#6E473B;cursor:pointer;touch-action:manipulation}
.sh-friends button img{height:44px;width:56px;object-fit:contain}
.sh-friends button[aria-pressed=true]{border-color:#FF8FA3;background:#FFE3EA}
.sh-main{flex:1;min-height:0;display:grid;grid-template-columns:minmax(0,42%) minmax(0,1fr);gap:10px}
@media (max-width:640px),(max-aspect-ratio:4/5){.sh-main{grid-template-columns:1fr;grid-template-rows:auto minmax(0,1fr)}}
.sh-stage{container-type:size;position:relative;display:flex;align-items:flex-end;justify-content:center;min-height:0;height:100%;border-radius:18px;background:radial-gradient(ellipse 60% 14% at 45% 92%,rgba(91,58,74,.14),transparent 70%),linear-gradient(#E9F7EF,#FFF4E4);overflow:hidden}
@media (max-width:640px),(max-aspect-ratio:4/5){.sh-stage{height:clamp(150px,27dvh,250px)}}
.sh-fig{position:relative;height:min(64cqh,70cqw);margin:0 20cqw 5cqh 0;transform-origin:50% 100%} /* 留位置給頭頂的帽子和右邊的身邊小物 */
.sh-fig>img{position:absolute;pointer-events:none}
.sh-fig>img.ch{left:0;top:0;width:100%;height:100%}
.sh-fig.yay{animation:sh-yay .7s cubic-bezier(.3,1.6,.5,1)}
@keyframes sh-yay{0%{transform:scale(1.15,.85)}40%{transform:translateY(-12%) scale(.92,1.08)}100%{transform:none}}
.sh-name{position:absolute;left:10px;top:8px;font-weight:900;font-size:18px;color:#6E473B;background:rgba(255,255,255,.8);border-radius:999px;padding:1px 10px}
.sh-try{position:absolute;right:10px;top:8px;font-size:13px;font-weight:800;color:#fff;background:#FF8FA3;border-radius:999px;padding:2px 9px}
.sh-try:empty{display:none}
.sh-shop{display:flex;flex-direction:column;min-height:0}
.sh-tabs{display:flex;gap:6px;flex:none}
.sh-tabs button{flex:1;font:inherit;font-size:16px;font-weight:800;padding:8px 4px;border-radius:14px 14px 0 0;border:2px solid #F5CBA7;border-bottom:0;background:#FFF1DC;color:#8a6f7c;cursor:pointer;touch-action:manipulation}
.sh-tabs button[aria-selected=true]{background:#fff;color:#E8665C}
.sh-grid{flex:1;min-height:0;overflow-y:auto;-webkit-overflow-scrolling:touch;overscroll-behavior:contain;display:grid;grid-template-columns:repeat(auto-fill,minmax(96px,1fr));gap:8px;align-content:start;padding:8px;background:#fff;border:2px solid #F5CBA7;border-radius:0 0 14px 14px}
.sh-item{position:relative;display:flex;flex-direction:column;align-items:center;gap:2px;font:inherit;padding:6px 4px 5px;border-radius:14px;border:3px solid #F7E3D3;background:#FFFDF9;color:#6E473B;cursor:pointer;touch-action:manipulation}
.sh-item .pic{width:100%;height:64px;display:flex;align-items:center;justify-content:center}
.sh-item .pic img{max-width:78%;max-height:100%;object-fit:contain}
.sh-item b{font-size:13px;line-height:1.2;text-align:center}
.sh-item .tag{display:flex;align-items:center;gap:2px;font-size:15px;font-weight:900;color:#B86E00}
.sh-item .tag img{width:20px;height:20px}
.sh-item.poor{background:#F6F2EE}
.sh-item.poor .pic img{opacity:.55;filter:grayscale(.5)}
.sh-item.poor .tag{color:#9c8a92;font-size:13px}
.sh-item.owned .tag{color:#2b8a3e}
.sh-item.worn{border-color:#5CC05C;background:#EFFBEF}
.sh-item.trying{border-color:#FF8FA3;background:#FFF0F4;box-shadow:0 0 0 3px rgba(255,143,163,.35)}
.sh-bar{flex:none;display:flex;align-items:center;gap:8px;flex-wrap:wrap;justify-content:center;min-height:52px;margin-top:8px;padding:6px 10px;border-radius:16px;background:#FFF1DC;font-size:16px;font-weight:700;text-align:center}
.sh-bar button{font:inherit;font-size:18px;font-weight:900;padding:9px 20px;border-radius:999px;border:3px solid #fff;background:#fff;color:#6E473B;box-shadow:0 3px 8px rgba(91,58,74,.2);cursor:pointer;touch-action:manipulation}
.sh-bar button.go{background:#FF8FA3;color:#fff}
.sh-bar button.go img{width:22px;height:22px;vertical-align:-4px}
.sh-burst{position:absolute;z-index:3;width:34px;pointer-events:none;animation:sh-burst .9s ease-out forwards}
@keyframes sh-burst{0%{transform:translate(-50%,-50%) scale(.3);opacity:1}100%{transform:translate(calc(-50% + var(--x)),calc(-50% + var(--y))) scale(1) rotate(var(--r));opacity:0}}
/* v47 手機橫放：朋友列改小、商品圖矮一點、下方按鈕列變窄，讓價錢露出來 */
@media (orientation:landscape) and (max-height:560px){
.sh-dialog{height:calc(100vh - 10px);height:calc(100dvh - 10px);padding:6px 10px 8px}
.sh-head h2{font-size:17px}.sh-wallet{font-size:16px}.sh-wallet img{width:24px;height:24px}.sh-close{font-size:14px;padding:4px 10px}
.sh-friends{padding:4px 2px}
.sh-friends button{flex-direction:row;width:auto;gap:4px;padding:2px 8px 2px 2px;font-size:12px}
.sh-friends button img{height:30px;width:34px}
.sh-tabs button{font-size:14px;padding:5px 4px}
.sh-grid{grid-template-columns:repeat(auto-fill,minmax(84px,1fr));gap:6px;padding:6px}
.sh-item .pic{height:44px}
.sh-bar{min-height:38px;margin-top:6px;padding:3px 8px;font-size:14px}
.sh-bar button{font-size:15px;padding:5px 14px}
}
/* v52 季節分頁：左邊舞台換成季節預覽（色調＋幾片 CSS 粒子），右邊是季節卡 */
.sh-sprev{display:none;position:absolute;inset:0;flex-direction:column;align-items:center;justify-content:center;gap:4px;text-align:center;overflow:hidden}
.sh-stage.season .sh-fig,.sh-stage.season .sh-name,.sh-stage.season .sh-try{display:none}
.sh-stage.season .sh-sprev{display:flex}
.sh-sprev .big{font-size:min(28cqh,30cqw);line-height:1}
.sh-sprev b{font-size:clamp(16px,7cqw,24px);color:#6E473B;background:rgba(255,255,255,.8);border-radius:999px;padding:2px 12px}
.sh-sprev small{font-size:13px;font-weight:700;color:#8a6f7c}
.sh-sprev i{position:absolute;top:-8%;left:var(--x);width:9px;aspect-ratio:1;border-radius:50%;background:#fff;box-shadow:0 0 3px rgba(150,180,220,.9);animation:sh-fall var(--d) linear var(--dl) infinite}
.sh-sprev[data-kind=petal] i{width:11px;aspect-ratio:1.3;border-radius:80% 0 80% 0;background:linear-gradient(135deg,#ffd1e0,#ff9fbe)}
@keyframes sh-fall{to{transform:translateY(120cqh) rotate(200deg)}}
@media (prefers-reduced-motion:reduce){.sh-sprev i{display:none}}
.sh-item .pic .em{font-size:44px;line-height:1}
.sh-item.cur{border-color:#5CC05C;background:#EFFBEF}
.sh-item .tag small{font-size:11px;color:#9c8a92;font-weight:700;display:block}
.sh-item.season .tag{flex-direction:column;gap:0;line-height:1.15}
`;
const esc = s => String(s).replace(/[&<>"']/g, c => '&#' + c.charCodeAt(0) + ';');

export class ShopPanel {
  /**
   * catalog＝accessories.json；base＝配件圖網址前綴；town＝Town2D（角色圖網址、姿勢尺寸）；
   * friends()＝[{ object, name, sprite }] 目前已解鎖的朋友；totals()＝{ total }；
   * onOutfit(object, outfit)＝造型改了（大廳跟著換）；onPractice()＝按「去練習寫字」
   * v52 seasons＝{ list()：可用的季節, sync()：{ current, unlocked(id) }（畫面用）, state(id)：async，用最新存檔算 { unlocked, freeNow, total },
   *               checkUnlocks()：async 記下免費解鎖, pick(id|null)：async 換季節（回傳 true／false） }；沒給就沒有季節分頁
   */
  constructor({ key, catalog, base, town, friends, totals, onOutfit, onPractice, onOpen, onClose, voice, sound, seasons = null, log = () => {} }) {
    Object.assign(this, { key, catalog, base, town, friends, totals, onOutfit, onPractice, onOpen, onClose, voice, sound, seasons, log });
    this.byId = new Map(catalog.items.map(i => [i.id, i])); this.el = null; this.ui = { who: null, slot: catalog.slots[1] ?? catalog.slots[0], tryId: null, confirm: false, msg: '' };
  }
  isOpen() { return !!this.el; }
  url(file) { return this.base + file; }
  open() {
    if (this.el) return;
    if (!document.getElementById('sh-style')) { const s = document.createElement('style'); s.id = 'sh-style'; s.textContent = CSS; document.head.append(s); }
    const fr = this.friends(); if (!fr.length) return;
    if (!fr.some(f => f.object === this.ui.who)) this.ui.who = fr[0].object;
    if (this.ui.slot === SEASON_TAB && !this._seasons().length) this.ui.slot = this.catalog.slots[1] ?? this.catalog.slots[0];
    Object.assign(this.ui, { tryId: null, confirm: false, msg: '', sid: undefined, busy: false });
    const el = document.createElement('div'); el.className = 'sh-overlay'; el.setAttribute('role', 'dialog'); el.setAttribute('aria-modal', 'true'); el.setAttribute('aria-label', '配件商店');
    el.innerHTML = `<div class="sh-dialog">
      <div class="sh-head"><h2>🏪 配件商店</h2><span class="sh-wallet" aria-live="polite"></span><button type="button" class="sh-close" data-act="close">✕ 回小鎮</button></div>
      <div class="sh-friends" role="group" aria-label="選朋友"></div>
      <div class="sh-main"><div class="sh-stage"><span class="sh-name"></span><span class="sh-try"></span><div class="sh-fig"><img class="ch" alt=""></div><div class="sh-sprev" aria-hidden="true"></div></div>
        <div class="sh-shop"><div class="sh-tabs" role="tablist">${this.catalog.slots.map(s => `<button type="button" role="tab" data-slot="${s}">${esc(this.catalog.slotNames?.[s] ?? s)}</button>`).join('')}${this._seasons().length ? `<button type="button" role="tab" data-slot="${SEASON_TAB}">🌸 季節</button>` : ''}</div><div class="sh-grid"></div></div></div>
      <div class="sh-bar" aria-live="polite"></div>
    </div>`;
    for (const t of ['pointerdown', 'pointermove', 'mousedown', 'mousemove', 'wheel', 'touchstart', 'touchmove']) el.addEventListener(t, e => e.stopPropagation(), { passive: true });
    el.addEventListener('click', e => this._click(e));
    this._onKey = e => { e.stopPropagation(); if (e.key === 'Escape') this.close(); }; document.addEventListener('keydown', this._onKey, true);
    document.body.append(el); this.el = el; this.onOpen?.(); this.log('shop open');
    this.render();
  }
  close() {
    if (!this.el) return;
    document.removeEventListener('keydown', this._onKey, true); this.el.remove(); this.el = null; this.ui.tryId = null; this.ui.confirm = false;
    this.voice?.stop?.(); this.onClose?.(); this.log('shop close');
  }
  state() { const data = loadShop(this.key); return { data, st: shopState({ total: this.totals().total, catalog: this.catalog, data }) }; }
  render() {
    if (!this.el) return;
    const { data, st } = this.state(), ui = this.ui, fr = this.friends(), who = fr.find(f => f.object === ui.who) ?? fr[0], outfit = outfitOf(data, who.object);
    const preview = { ...outfit }; if (ui.tryId) preview[this.byId.get(ui.tryId).slot] = ui.tryId;
    const $ = s => this.el.querySelector(s);
    $('.sh-wallet').innerHTML = `<img alt="" src="${this.url(this.catalog.ui.coin)}">可以用 ★${Math.max(0, st.balance)}`;
    $('.sh-wallet').setAttribute('aria-label', `可以用 ${Math.max(0, st.balance)} 顆星`);
    $('.sh-friends').innerHTML = fr.map(f => `<button type="button" data-who="${esc(f.object)}" aria-pressed="${f.object === who.object}"><img alt="" src="${this.town.url(f.sprite + '_idle')}">${esc(f.name)}</button>`).join('');
    $('.sh-name').textContent = who.name; $('.sh-try').textContent = ui.tryId ? '試戴中' : '';
    this._drawFig($('.sh-fig'), who.sprite, ui.pose ?? 'idle', preview);
    for (const b of this.el.querySelectorAll('.sh-tabs button')) b.setAttribute('aria-selected', String(b.dataset.slot === ui.slot));
    $('.sh-stage').classList.toggle('season', ui.slot === SEASON_TAB);
    if (ui.slot === SEASON_TAB) return this._renderSeasons(st);
    $('.sh-grid').innerHTML = st.items.filter(i => i.slot === ui.slot).map(i => {
      const worn = outfit[i.slot] === i.id, cls = ['sh-item', i.owned ? 'owned' : i.canBuy ? 'buy' : 'poor', worn ? 'worn' : '', ui.tryId === i.id ? 'trying' : ''].join(' ');
      const tag = i.owned ? `<img alt="" src="${this.url(this.catalog.ui.owned)}">${worn ? '戴著' : '有了'}` : i.canBuy ? `<img alt="" src="${this.url(this.catalog.ui.coin)}">${i.price}` : `★${i.price}・再 ${i.need} 顆`;
      return `<button type="button" class="${cls}" data-id="${esc(i.id)}" aria-label="${esc(i.name)}，${i.owned ? (worn ? '戴著' : '已經有了') : i.price + ' 顆星'}"><span class="pic"><img alt="" src="${this.url(i.file)}"></span><b>${esc(i.name)}</b><span class="tag">${tag}</span></button>`;
    }).join('');
    $('.sh-bar').innerHTML = this._bar(st);
    this.lastState = { balance: st.balance, spent: st.spent, owned: [...st.owned], who: who.object, outfit, preview, slot: ui.slot, tryId: ui.tryId, confirm: ui.confirm };
  }
  // ======== v52 季節分頁 ========
  _seasons() { return this.seasons?.list() ?? []; }
  /** 每一季在畫面上的狀態（用這個分頁記憶體裡的總星數；真正購買時會再用最新存檔檢查一次） */
  _seasonRows(st) {
    const sy = this.seasons.sync();
    return this._seasons().map(s => {
      const unlocked = sy.unlocked(s.id), bought = st.owned.has(seasonItemId(s.id)), buyNeed = Math.max(0, s.price - st.balance), freeNeed = Math.max(0, s.unlockStars - st.total);
      return { s, unlocked, bought, current: sy.current === s.id, canBuy: !unlocked && buyNeed === 0, need: Math.min(buyNeed, freeNeed) };
    });
  }
  _renderSeasons(st) {
    const $ = q => this.el.querySelector(q), ui = this.ui, rows = this._seasonRows(st), cur = this.seasons.sync().current;
    if (ui.sid === undefined) ui.sid = cur ?? null;
    const sel = rows.find(r => r.s.id === ui.sid) ?? null;
    if (ui.confirm && (!sel || sel.unlocked)) Object.assign(ui, { confirm: false, msg: sel ? '這個季節已經解鎖了' : '' }); // 別的分頁剛好解鎖或買了：取消確認
    const pv = $('.sh-sprev'); pv.dataset.kind = sel?.s.particles.kind ?? ''; pv.style.background = sel?.s.tint ? `${sel.s.tint}, linear-gradient(#E9F7EF,#FFF4E4)` : 'linear-gradient(#E9F7EF,#FFF4E4)';
    pv.innerHTML = `${sel ? Array.from({ length: 8 }, (_, i) => `<i style="--x:${(i * 12 + 4).toFixed(0)}%;--d:${(4 + (i % 3)).toFixed(1)}s;--dl:${(-i * 0.7).toFixed(1)}s"></i>`).join('') : ''}<span class="big">${sel ? esc(sel.s.icon || '🌸') : '🏡'}</span><b>${sel ? esc(sel.s.label) : '不用季節'}</b><small>${sel ? (sel.current ? '現在的季節' : sel.unlocked ? '已經解鎖' : `★${sel.s.unlockStars} 自動解鎖・商店 ★${sel.s.price}`) : '原本的樣子'}</small>`;
    const coin = `<img alt="" src="${this.url(this.catalog.ui.coin)}">`;
    const none = `<button type="button" class="sh-item season owned${cur == null ? ' cur' : ''}${ui.sid === null ? ' trying' : ''}" data-season="" aria-label="不用季節${cur == null ? '，現在用的' : ''}"><span class="pic"><span class="em">🏡</span></span><b>不用季節</b><span class="tag">${cur == null ? '用著' : '換回來'}</span></button>`;
    $('.sh-grid').innerHTML = none + rows.map(r => {
      const cls = ['sh-item', 'season', r.unlocked ? 'owned' : r.canBuy ? 'buy' : 'poor', r.current ? 'cur' : '', ui.sid === r.s.id ? 'trying' : ''].join(' ');
      const tag = r.current ? '用著' : r.unlocked ? '換上' : r.canBuy ? `<span>${coin}${r.s.price}</span><small>★${r.s.unlockStars} 自動送</small>` : `<span>還差 ${r.need} 顆</span><small>★${r.s.unlockStars} 自動送</small>`;
      return `<button type="button" class="${cls}" data-season="${esc(r.s.id)}" aria-label="${esc(r.s.label)}，${r.current ? '現在用的' : r.unlocked ? '已經解鎖' : r.canBuy ? r.s.price + ' 顆星' : '還差 ' + r.need + ' 顆星'}"><span class="pic"><span class="em">${esc(r.s.icon || '🌸')}</span></span><b>${esc(r.s.label)}</b><span class="tag">${tag}</span></button>`;
    }).join('');
    $('.sh-bar').innerHTML = this._seasonBar(sel, cur);
    this.lastState = { balance: st.balance, spent: st.spent, owned: [...st.owned], slot: ui.slot, sid: ui.sid, confirm: ui.confirm, busy: !!ui.busy, msg: ui.msg, seasons: rows.map(r => ({ id: r.s.id, unlocked: r.unlocked, bought: r.bought, current: r.current, canBuy: r.canBuy, need: r.need })) };
  }
  _seasonBar(sel, cur) {
    const ui = this.ui, coin = `<img alt="" src="${this.url(this.catalog.ui.coin)}">`, dis = ui.busy ? ' disabled' : '';
    if (ui.msg) return `<span>${esc(ui.msg)}</span>`;
    if (!sel) return cur == null ? '<span>點一個季節看看！到了星星數會自動解鎖，也可以用星星提早換。</span>' : `<span>換回原本的樣子嗎？</span><button type="button" class="go" data-act="seasonWear"${dis}>換回來</button>`;
    const s = sel.s;
    if (sel.current) return `<span>現在就是「${esc(s.label)}」</span>`;
    if (sel.unlocked) return `<span>換上「${esc(s.label)}」嗎？</span><button type="button" class="go" data-act="seasonWear"${dis}>換上</button>`;
    if (ui.confirm) return `<span>到 ${s.unlockStars} 顆星會自動解鎖，現在要先用 ${s.price} 顆換嗎？</span><button type="button" class="go" data-act="seasonOk"${dis}>要！</button><button type="button" data-act="cancel"${dis}>先不要</button>`;
    if (sel.canBuy) return `<span>到 ${s.unlockStars} 顆星會自動解鎖</span><button type="button" class="go" data-act="seasonBuy">${coin} 用 ${s.price} 顆提早換</button>`;
    return `<span>還差 ${sel.need} 顆星（到 ${s.unlockStars} 顆自動解鎖）</span><button type="button" class="go" data-act="practice">✏️ 去練習寫字</button>`;
  }
  /** 點季節卡＝預覽（不用季節卡＝預覽原本的樣子） */
  _tapSeason(id) {
    const ui = this.ui; if (ui.busy) return;
    Object.assign(ui, { sid: id || null, confirm: false, msg: '' });
    const s = this._seasons().find(x => x.id === id); this.sound?.squeak(1.1); this.voice?.say(s ? s.label : '不用季節'); this.render();
  }
  async _seasonAct(act) {
    const ui = this.ui, s = this._seasons().find(x => x.id === ui.sid) ?? null;
    if (ui.busy) return;
    if (act === 'seasonBuy' && s) { ui.confirm = true; this.voice?.say(`要用${s.price}顆星，換${s.label}嗎？`); return this.render(); }
    ui.busy = true; this.render();
    try {
      if (act === 'seasonWear') {
        const ok = await this.seasons.pick(s ? s.id : null);
        ui.msg = !ok ? '換不了（可能是私密瀏覽模式）' : s ? `換上「${s.label}」了！` : '換回原本的樣子了';
        if (ok) { this.sound?.boing(); this.voice?.say(s ? s.label : '換回來了'); }
      } else if (act === 'seasonOk' && s) {
        const r = await this.seasons.state(s.id); // 用最新的存檔（含別的分頁剛寫的字）再檢查一次
        if (!this.el) return;
        if (r.unlocked || r.freeNow) { // 已經解鎖：不扣星星，直接換上
          if (!r.unlocked) await this.seasons.checkUnlocks();
          const ok = await this.seasons.pick(s.id); this.log(`shop season already unlocked ${s.id}`);
          ui.msg = ok ? '這個季節已經解鎖了，直接換上！' : '換不了（可能是私密瀏覽模式）';
        } else {
          const fresh = loadShop(this.key), b = buyItem(fresh, { id: seasonItemId(s.id), price: s.price }, { total: r.total }); // await 之後重新讀商店，中間不再 await
          if (b.error) ui.msg = b.error;
          else if (!saveShop(this.key, b.data)) ui.msg = '存不進去（可能是私密瀏覽模式）';
          else {
            this.log(`shop buy season:${s.id} ${s.price}`); const ok = await this.seasons.pick(s.id);
            ui.msg = ok ? `換到「${s.label}」了！` : `買到「${s.label}」了！`; this.sound?.complete(); this.voice?.say(`${s.label}，換到了！`);
          }
        }
        ui.confirm = false;
      }
    } finally { ui.busy = false; if (this.el) this.render(); }
  }
  /** 別的分頁改了商店或 extras（game-v1.html 的 storage 事件）：重新讀存檔再畫；過期的確認會在 render 裡取消 */
  refresh() { if (this.el && !this.ui.busy) this.render(); }
  _bar(st) {
    const ui = this.ui, it = ui.tryId && st.items.find(i => i.id === ui.tryId), coin = `<img alt="" src="${this.url(this.catalog.ui.coin)}">`;
    if (it && ui.confirm) return `<span>要用 ${it.price} 顆星換「${esc(it.name)}」嗎？</span><button type="button" class="go" data-act="buyOk">要！</button><button type="button" data-act="cancel">先不要</button>`;
    if (it && it.canBuy) return `<span>「${esc(it.name)}」好看嗎？</span><button type="button" class="go" data-act="buy">${coin} 用 ${it.price} 顆換</button><button type="button" data-act="cancel">不要了</button>`;
    if (it) return `<span>「${esc(it.name)}」還差 ${it.need} 顆星</span><button type="button" class="go" data-act="practice">✏️ 去練習寫字</button><button type="button" data-act="cancel">不要了</button>`;
    if (ui.msg) return `<span>${esc(ui.msg)}</span>`;
    return st.allOwned ? '<span>🎉 全部收集完了！點一下就能幫朋友換裝。</span>' : '<span>點配件試戴看看！買過的點一下就能戴上或拿下來。</span>';
  }
  /** 把角色和配件畫到 fig（外框比例＝這個姿勢角色圖的寬高比） */
  _drawFig(fig, sprite, pose, outfit) {
    const m = this.town.sprites[sprite + '_' + pose], an = this.catalog.anchors[sprite + '_' + pose] ?? {};
    fig.style.aspectRatio = (m.w / m.h).toFixed(4); fig.querySelector('img.ch').src = this.town.url(sprite + '_' + pose);
    fig.querySelectorAll('img.acc').forEach(im => im.remove());
    for (const s of this.catalog.slots) {
      const item = outfit[s] && this.byId.get(outfit[s]); if (!item || !an[s]) continue;
      const im = document.createElement('img'); im.className = 'acc'; im.alt = ''; im.src = this.url(item.file); im.dataset.slot = s; placeAccessory(im, item, an[s], m.w / m.h); fig.append(im);
    }
  }
  _click(e) {
    const b = e.target.closest('button'), ui = this.ui; if (!b) { if (e.target === this.el) this.close(); return; }
    this.sound?.unlock();
    if (b.dataset.act === 'close') return this.close();
    if (b.dataset.who) { Object.assign(ui, { who: b.dataset.who, tryId: null, confirm: false, msg: '' }); this.sound?.squeak(1); this.voice?.say(b.textContent.trim()); return this.render(); }
    if (b.dataset.slot) { if (ui.busy) return; Object.assign(ui, { slot: b.dataset.slot, tryId: null, confirm: false, msg: '', sid: undefined }); this.voice?.say(b.textContent.trim()); this.el.querySelector('.sh-grid').scrollTop = 0; return this.render(); }
    if (b.dataset.id) return this._tapItem(b.dataset.id);
    if (b.dataset.season != null) return this._tapSeason(b.dataset.season);
    if (ui.slot === SEASON_TAB && /^season|^cancel$/.test(b.dataset.act ?? '')) { if (b.dataset.act === 'cancel') { if (ui.busy) return; Object.assign(ui, { confirm: false, msg: '' }); return this.render(); } return this._seasonAct(b.dataset.act); }
    const act = b.dataset.act, { data, st } = this.state(), it = ui.tryId && this.byId.get(ui.tryId);
    if (act === 'cancel') Object.assign(ui, { tryId: null, confirm: false, msg: '' });
    else if (act === 'buy' && it) { ui.confirm = true; this.voice?.say(`要用${it.price}顆星，換${it.name}嗎？`); }
    else if (act === 'practice') { this.close(); this.onPractice?.(); return; }
    else if (act === 'buyOk' && it) {
      const bought = buyItem(data, it, { total: st.total });
      if (bought.error) { Object.assign(ui, { confirm: false, msg: bought.error }); return this.render(); }
      const worn = wearItem(bought.data, ui.who, it.slot, it.id);
      if (!saveShop(this.key, worn.data)) { Object.assign(ui, { confirm: false, msg: '存不進去（可能是私密瀏覽模式）' }); return this.render(); }
      Object.assign(ui, { tryId: null, confirm: false, msg: `買到「${it.name}」了！` });
      this.onOutfit?.(ui.who, outfitOf(worn.data, ui.who)); this.log(`shop buy ${it.id} ${it.price} for ${ui.who}`);
      this.sound?.complete(); this.voice?.say(`${it.name}，買到了！`); this.render(); this._yay(); return;
    }
    this.render();
  }
  _tapItem(id) {
    const ui = this.ui, { data, st } = this.state(), it = st.items.find(i => i.id === id); if (!it) return;
    if (it.owned) {
      const on = outfitOf(data, ui.who)[it.slot] === id, r = wearItem(data, ui.who, it.slot, on ? null : id);
      if (!saveShop(this.key, r.data)) { ui.msg = '存不進去（可能是私密瀏覽模式）'; return this.render(); }
      Object.assign(ui, { tryId: null, confirm: false, msg: on ? `拿下「${it.name}」了` : `戴上「${it.name}」了！` });
      this.onOutfit?.(ui.who, outfitOf(r.data, ui.who)); this.log(`shop ${on ? 'off' : 'wear'} ${id} on ${ui.who}`);
      if (on) this.sound?.squeak(0.8); else { this.sound?.boing(); this._yay(false); }
      this.voice?.say(on ? `拿下${it.name}` : it.name); return this.render();
    }
    Object.assign(ui, { tryId: ui.tryId === id ? null : id, confirm: false, msg: '' });
    if (ui.tryId) { this.sound?.squeak(1.2); this.voice?.say(it.canBuy ? `${it.name}，${it.price}顆星` : `${it.name}，還差${it.need}顆星`); }
    this.render();
  }
  /** 開心跳一下（買到時換 happy 姿勢、撒星星） */
  _yay(big = true) {
    const fig = this.el?.querySelector('.sh-fig'); if (!fig) return;
    if (big) { this.ui.pose = 'happy'; this.render(); clearTimeout(this._pt); this._pt = setTimeout(() => { this.ui.pose = null; this.render(); }, 1500); }
    const f = this.el.querySelector('.sh-fig'); f.classList.remove('yay'); void f.offsetWidth; f.classList.add('yay');
    if (!big) return;
    const stage = this.el.querySelector('.sh-stage');
    for (let i = 0; i < 10; i++) {
      const im = document.createElement('img'); im.className = 'sh-burst'; im.alt = ''; im.src = this.town.url(['fx_star', 'fx_heart', 'fx_sparkle'][i % 3]);
      const a = Math.random() * Math.PI * 2, r = 70 + Math.random() * 60;
      im.style.left = '45%'; im.style.top = '45%'; im.style.setProperty('--x', (Math.cos(a) * r).toFixed(0) + 'px'); im.style.setProperty('--y', (Math.sin(a) * r).toFixed(0) + 'px'); im.style.setProperty('--r', ((Math.random() - 0.5) * 120).toFixed(0) + 'deg');
      stage.append(im); setTimeout(() => im.remove(), 950);
    }
  }
}

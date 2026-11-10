// v8 2D 甜點樂園大廳（契約 v8 art2d）：用 Codex 生成的插畫取代 3D 小鎮，對外介面與 3D 版相同，頁面可以互換。
// - Town2D：背景插畫＋角色（DOM 圖片），resize(w) 依比例縮放；世界座標＝插畫像素座標（1536×1024）。
// - Lobby2D：只有一個 RAF 迴圈跑補間動畫；面板開啟時暫停 RAF 並暫停所有 CSS 動畫（省電）。
// - TownFx2D：區域彩度（未寫的區域蓋一層去彩度的同一張插畫，用低解析度遮罩混合）、地圖標記、點角色、寫完字的慶祝、鏡頭推近。
// - Reward2D：第一次得獎時泡泡從廣場走到溫泉池邊、池子冒蒸氣；之後只跳一下。由帳本筆數推導，不另存。
// - Album2D：沿用 Album 的解鎖規則，縮圖改用角色插畫、卡框用甜點卡框。
import { Album } from './album.js?v=39';
import { placeAccessory } from './shop.js?v=39';

const CSS = `
.t2-view{position:relative;overflow:hidden;margin:0 auto;border-radius:16px;background:#FFF0F5;touch-action:manipulation;user-select:none;-webkit-user-select:none}
.t2-world{position:absolute;left:0;top:0;width:100%;height:100%;transform-origin:0 0;transition:transform .8s cubic-bezier(.45,0,.25,1);will-change:transform}
.t2-world>img.t2-bg,.t2-world>canvas{position:absolute;left:0;top:0;width:100%;height:100%;display:block;pointer-events:none}
.t2-world>canvas{transition:opacity 1.1s ease}
.t2-glow{position:absolute;border-radius:50%;pointer-events:none;background:radial-gradient(closest-side,rgba(255,255,240,.85),rgba(255,240,250,0));opacity:0}
.t2-glow.on{animation:t2-glow 1.3s ease-out}
@keyframes t2-glow{20%{opacity:1}100%{opacity:0}}
.t2-char{position:absolute;transform:translate(-50%,-100%);cursor:pointer;-webkit-tap-highlight-color:transparent;transition:left 1.6s ease-in-out,top 1.6s ease-in-out}
.t2-char::before{content:'';position:absolute;inset:-12px}
.t2-fig{position:relative;display:block;height:100%;width:auto;transform-origin:50% 100%;animation:t2-bob 2.6s ease-in-out infinite;filter:drop-shadow(0 3px 2px rgba(91,58,74,.22))} /* v18：角色圖＋配件包在同一層，跳動、壓扁、陰影一起 */
.t2-fig>img{display:block;height:100%;width:100%}
.t2-fig>img.t2-acc{position:absolute;height:auto;max-width:none;pointer-events:none}
.t2-char.shadow .t2-acc{display:none}
.t2-char.hidden{display:none}
.t2-char.shadow .t2-fig{filter:brightness(0) opacity(.55) drop-shadow(0 0 4px rgba(255,255,255,.9)) drop-shadow(0 0 2px #fff);animation:none}
.t2-char.shadow.near .t2-fig{animation:t2-wiggle 1.3s ease-in-out infinite}
.t2-hint{display:none}
.t2-char.shadow .t2-hint{display:block;position:absolute;z-index:2;left:50%;bottom:100%;transform:translate(-50%,-2px);font:800 clamp(10px,1vw,13px)/1.3 system-ui,"Noto Sans TC",sans-serif;color:#fff;background:rgba(45,35,30,.85);border:1.5px solid rgba(255,255,255,.8);border-radius:999px;padding:1px 8px;white-space:nowrap;box-shadow:0 2px 5px rgba(0,0,0,.25);pointer-events:none}
.t2-hint em{font-style:normal;color:#FFD54A}
@media (max-width:600px){.t2-char.shadow .t2-hint{transform:translate(-22%,-2px)}} /* 手機：避開第 4 課的進度膠囊 */
.t2-char.shadow:has(.t2-hint)::after{display:none}
.t2-char.shadow::after{content:'?';position:absolute;left:50%;top:-4%;transform:translate(-50%,-100%);font:900 clamp(12px,1.6vw,22px)/1 system-ui;color:#fff;background:rgba(91,58,74,.55);border-radius:50%;width:1.4em;height:1.4em;display:flex;align-items:center;justify-content:center}
@keyframes t2-wiggle{0%,100%{transform:rotate(0)}25%{transform:rotate(-6deg)}75%{transform:rotate(6deg)}}
.t2-char.pop .t2-fig{animation:t2-pop .7s cubic-bezier(.3,1.6,.5,1)}
.t2-char.hop .t2-fig{animation:t2-hop .55s ease-out}
.t2-char.squash .t2-fig{animation:t2-squash .5s ease-out}
@keyframes t2-bob{0%,100%{transform:translateY(0) scale(1,1)}50%{transform:translateY(-3%) scale(1.02,.98)}}
@keyframes t2-pop{0%{transform:scale(0)}100%{transform:scale(1)}}
@keyframes t2-hop{0%{transform:translateY(0) scale(1.08,.9)}35%{transform:translateY(-38%) scale(.95,1.06)}70%{transform:translateY(0) scale(1.1,.88)}100%{transform:translateY(0) scale(1,1)}}
@keyframes t2-squash{0%{transform:scale(1.18,.78)}40%{transform:scale(.9,1.12) translateY(-10%)}100%{transform:scale(1,1)}}
.t2-steam{position:absolute;pointer-events:none;transform:translate(-50%,-50%);width:9%;aspect-ratio:1;opacity:0;transition:opacity 1s}
.t2-steam.on{opacity:1}
.t2-steam i{position:absolute;left:50%;bottom:0;width:38%;aspect-ratio:1;border-radius:50%;background:rgba(255,255,255,.85);filter:blur(3px);animation:t2-steam 2.8s ease-out infinite}
.t2-steam i:nth-child(2){left:25%;animation-delay:.9s}
.t2-steam i:nth-child(3){left:62%;animation-delay:1.8s}
@keyframes t2-steam{0%{transform:translate(-50%,0) scale(.5);opacity:0}25%{opacity:.9}100%{transform:translate(-50%,-260%) scale(1.5);opacity:0}}
.t2-fx{position:absolute;z-index:200;pointer-events:none;width:4.2%;transform:translate(-50%,-50%);animation:t2-fx var(--d,1s) cubic-bezier(.2,.7,.3,1) forwards}
@keyframes t2-fx{0%{transform:translate(-50%,-50%) scale(.2) rotate(0);opacity:1}70%{opacity:1}100%{transform:translate(calc(-50% + var(--x)),calc(-50% + var(--y))) scale(1) rotate(var(--r));opacity:0}}
.t2-pin{position:absolute;z-index:150;transform:translate(-50%,-50%);width:clamp(48px,8.5%,108px);aspect-ratio:1;border:0;padding:0;background:none;cursor:pointer;touch-action:manipulation;transition:transform .15s,opacity .25s;-webkit-tap-highlight-color:transparent}
.t2-pin img{width:100%;height:100%;display:block;filter:drop-shadow(0 0 2px #fff) drop-shadow(0 3px 4px rgba(91,58,74,.35))}
.t2-pin b{position:absolute;left:-8%;top:-8%;min-width:46%;aspect-ratio:1;border-radius:50%;background:var(--pc,#FF8FA3);border:3px solid #FFFFFF;box-shadow:0 4px 10px rgba(0,0,0,.25);font:900 clamp(13px,1.35vw,19px)/1 system-ui,"Noto Sans TC",sans-serif;color:#fff;text-shadow:0 1px 2px rgba(91,58,74,.6);display:flex;align-items:center;justify-content:center;box-sizing:border-box}
.t2-pin small{position:absolute;z-index:1;top:94%;left:50%;transform:translateX(-50%);font:800 clamp(11px,1.05vw,14px)/1.25 system-ui;color:#fff;background:rgba(45,35,30,.85);border:1.5px solid rgba(255,255,255,.8);border-radius:999px;padding:1px 7px;white-space:nowrap;box-shadow:0 2px 4px rgba(91,58,74,.35)}
.t2-pin small:empty{display:none}
.t2-pin small i{font-style:normal;color:#FFD54A}
.t2-pin.done b{border-color:#FFE08A}
.t2-pin u{display:none;position:absolute;left:50%;bottom:100%;transform:translateX(-50%);text-decoration:none;font:900 clamp(16px,1.8vw,26px)/1 system-ui;color:#E55A4E;text-shadow:0 0 3px #fff,0 0 3px #fff,0 2px 3px rgba(91,58,74,.4);pointer-events:none}
.t2-pin.active{z-index:160;transform:translate(-50%,-50%) scale(1.15)}
.t2-pin.active b{background:#E55A4E;animation:nodePulse 1.6s ease-in-out infinite}
.t2-pin.active img{filter:drop-shadow(0 0 4px #fff) drop-shadow(0 0 10px rgba(229,90,78,.8)) drop-shadow(0 3px 4px rgba(91,58,74,.35))}
.t2-pin.active u{display:block;animation:t2-arrow .9s ease-in-out infinite}
@keyframes nodePulse{0%,100%{transform:scale(1);box-shadow:0 0 0 0 rgba(229,90,78,.6),0 4px 10px rgba(0,0,0,.3)}50%{transform:scale(1.12);box-shadow:0 0 0 8px rgba(229,90,78,0),0 6px 14px rgba(0,0,0,.35)}}
@keyframes t2-arrow{0%,100%{transform:translate(-50%,-10%)}50%{transform:translate(-50%,-45%)}}
.t2-pins-hidden .t2-pin{opacity:0;pointer-events:none}
/* v13：選中課次的標記加呼吸光圈；標記旁的課名膠囊靠邊時往內收 */
.t2-pin.active::before{content:'';position:absolute;inset:-16%;border-radius:50%;border:4px solid #fff;box-shadow:0 0 0 4px rgba(229,90,78,.75),0 0 24px 10px rgba(255,214,90,.85);animation:t2-ring 1.6s ease-out infinite;pointer-events:none}
.t2-pin.active img{animation:t2-breathe 1.6s ease-in-out infinite}
@keyframes t2-ring{0%{transform:scale(.8);opacity:1}100%{transform:scale(1.45);opacity:0}}
@keyframes t2-breathe{50%{transform:scale(1.08)}}
.t2-pin.active small{background:#E55A4E;font-size:clamp(12px,1.2vw,16px);padding:2px 9px}
.t2-pin.edge-r small{left:auto;right:-10%;transform:none}
.t2-pin.edge-l small{left:-10%;transform:none}
/* v13：每課一團雲，寫一個字吹散一朵 */
.t2-cloud{position:absolute;z-index:1;transform:translate(-50%,-50%);aspect-ratio:1.6;pointer-events:none;opacity:.92;transition:transform 1.4s cubic-bezier(.3,.7,.3,1),opacity 1.4s ease;
  background:radial-gradient(circle at 28% 62%,#fff 0 25%,transparent 26%),radial-gradient(circle at 50% 42%,#fff 0 31%,transparent 32%),radial-gradient(circle at 73% 60%,#fff 0 24%,transparent 25%),radial-gradient(ellipse 46% 26% at 50% 70%,#fff 0 99%,transparent 100%);
  filter:drop-shadow(0 4px 4px rgba(150,120,150,.35));animation:t2-drift var(--dd,7s) ease-in-out infinite alternate}
.t2-cloud.gone{opacity:0;transform:translate(calc(-50% + var(--gx,0px)),-90%) scale(1.6);animation:none}
@keyframes t2-drift{to{margin-left:1.2%}}
/* v13：下一個字的對話氣泡（點它＝開始寫字） */
.t2-say{position:absolute;z-index:3;left:50%;bottom:104%;transform:translateX(-50%);display:flex;flex-direction:column;align-items:center;font:900 clamp(13px,1.5vw,20px)/1.2 system-ui,"Noto Sans TC",sans-serif;color:#5B3A4A;background:#fff;border:3px solid #FFA94D;border-radius:16px;padding:4px 12px 5px;white-space:nowrap;box-shadow:0 4px 10px rgba(91,58,74,.3);cursor:pointer;animation:t2-sayBob 1.8s ease-in-out infinite;touch-action:manipulation}
.t2-say::after{content:'';position:absolute;left:50%;top:100%;transform:translateX(-50%);border:9px solid transparent;border-top-color:#FFA94D}
.t2-say em{font-style:normal;font-size:1.7em;line-height:1;color:#E55A4E;font-family:"Kaiti TC","BiauKai","DFKai-SB","Noto Serif TC",serif}
.t2-say small{font:700 .7em/1.2 system-ui,"Noto Sans TC",sans-serif;color:#E8665C}
@keyframes t2-sayBob{50%{transform:translateX(-50%) translateY(-6%)}}
.t2-pins-hidden .t2-say{opacity:0;pointer-events:none}
.t2-say.below{bottom:auto;top:96%;left:12%;transform:none;animation:none} /* 角色在畫面頂端（例如走到溫泉後）：氣泡改到腳下偏右，不被切掉、不擋第 5 課標記 */
.t2-say.below::after{top:auto;bottom:100%;left:18%;border-top-color:transparent;border-bottom-color:#FFA94D}
.t2-paused *,.t2-paused *::before{animation-play-state:paused!important}
/* v15：寫字／小遊戲全螢幕蓋住地圖時，只留底圖，雲、角色、標記先藏起來（瀏覽器不必每格整理這些圖層，寫字較順）；關掉就恢復 */
.t2-paused .t2-world>:not(.t2-bg){visibility:hidden}
`;

const loadImg = src => new Promise((ok, bad) => { const i = new Image(); i.decoding = 'async'; i.onload = () => ok(i); i.onerror = () => bad(new Error('IMG_LOAD_FAILED:' + src)); i.src = src; });
const POSES = ['idle', 'happy', 'surprised', 'wave'];
export const PIN_COLORS = ['#FF7FA8', '#FF9F43', '#3CC8A0', '#4FA8F0', '#A07CF0', '#F06CB8', '#F5B800', '#5CC05C'];
const sleep = ms => new Promise(r => setTimeout(r, ms));

export class Town2D {
  constructor({ contract, stage, onStatus = () => {} }) {
    Object.assign(this, { contract, stage, onStatus });
    this.cfg = contract.art2d; [this.W, this.H] = this.cfg.size; this.aspect = this.H / this.W;
    this.zoom = { s: 1, tx: 0, ty: 0 };
  }
  url(name) { return this.cfg.base + this.sprites[name].file; }
  async load() {
    if (!document.getElementById('t2-style')) { const s = document.createElement('style'); s.id = 't2-style'; s.textContent = CSS; document.head.append(s); }
    const t0 = performance.now();
    this.onStatus('載入小鎮插畫…');
    const res = await fetch(this.cfg.base + this.cfg.manifest, { cache: 'no-store' });
    if (!res.ok) throw new Error('SPRITES_MANIFEST_HTTP_' + res.status);
    this.sprites = await res.json();
    const view = document.createElement('div'); view.className = 't2-view';
    const world = document.createElement('div'); world.className = 't2-world'; view.append(world);
    this.bg = await loadImg(this.url(this.cfg.background)); this.bg.className = 't2-bg'; this.bg.alt = ''; world.append(this.bg);
    // 去彩度用的兩張疊圖（交替淡入，彩度變化才會平滑）
    this.fog = [0, 1].map(() => { const c = document.createElement('canvas'); c.width = this.W; c.height = this.H; c.style.opacity = 0; world.append(c); return c; });
    this.glow = document.createElement('div'); this.glow.className = 't2-glow'; world.append(this.glow);
    // 所有角色姿勢先載入，換姿勢時不閃
    const sheets = [...new Set(Object.values(this.cfg.residents).map(r => r.sprite))];
    await Promise.all(sheets.flatMap(s => POSES.map(p => loadImg(this.url(s + '_' + p)))));
    this.chars = new Map();
    for (const [name, r] of Object.entries(this.cfg.residents)) {
      const el = document.createElement('div'); el.className = 't2-char hidden'; el.dataset.name = name;
      const meta = this.sprites[r.sprite + '_idle'];
      el.style.height = (this.cfg.characterHeight * 100) + '%'; el.style.aspectRatio = (meta.w / meta.h).toFixed(3);
      const fig = document.createElement('span'); fig.className = 't2-fig'; fig.style.animationDelay = (-Math.random() * 2.6).toFixed(2) + 's';
      const img = document.createElement('img'); img.alt = ''; img.draggable = false; img.src = this.url(r.sprite + '_idle');
      fig.style.aspectRatio = (meta.w / meta.h).toFixed(4); /* 外框＝這個姿勢角色圖的大小（各姿勢寬度不同，換姿勢時跟著改） */
      fig.append(img); el.append(fig); world.append(el);
      this.chars.set(name, { name, el, fig, img, sprite: r.sprite, home: r.at, zone: r.zone, pose: 'idle', outfit: null });
      this.place(name, r.at);
    }
    const st = this.cfg.reward.steamAt; this.steam = document.createElement('div'); this.steam.className = 't2-steam'; this.steam.innerHTML = '<i></i><i></i><i></i>';
    this.steam.style.left = (st[0] / this.W * 100) + '%'; this.steam.style.top = (st[1] / this.H * 100) + '%'; world.append(this.steam);
    this.stage.append(view); Object.assign(this, { view, world });
    this.inventory = { kind: '2d', background: this.cfg.background, size: this.cfg.size, sprites: Object.keys(this.sprites).length, characters: this.chars.size, loadMs: Math.round(performance.now() - t0) };
    return this;
  }
  place(name, [x, y]) { const c = this.chars.get(name); c.at = [x, y]; c.el.style.left = (x / this.W * 100) + '%'; c.el.style.top = (y / this.H * 100) + '%'; c.el.style.zIndex = 2 + Math.round(y / 10); }
  pose(name, p) { const c = this.chars.get(name); if (c.pose === p) return; c.img.src = this.url(c.sprite + '_' + p); c.pose = p; const m = this.sprites[c.sprite + '_' + p]; c.fig.style.aspectRatio = (m.w / m.h).toFixed(4); this._placeAcc(c); }
  /** v18 配件：catalog＝art2d/accessories.json，base＝配件圖所在的網址前綴 */
  setAccessories(catalog, base) { this.acc = { catalog, base, byId: new Map(catalog.items.map(i => [i.id, i])) }; }
  /** outfit＝{ clip, hat, side }（itemId 或 null）；null＝全部拿掉 */
  setOutfit(name, outfit) {
    const c = this.chars.get(name); if (!c || !this.acc) return;
    for (const s of this.acc.catalog.slots) {
      const id = outfit?.[s] ?? null, item = id && this.acc.byId.get(id); let im = c.fig.querySelector(`.t2-acc[data-slot="${s}"]`);
      if (!item) { im?.remove(); continue; }
      if (!im) { im = document.createElement('img'); im.className = 't2-acc'; im.alt = ''; im.draggable = false; im.dataset.slot = s; c.fig.append(im); }
      if (im.dataset.id !== id) { im.src = this.acc.base + item.file; im.dataset.id = id; }
    }
    c.outfit = outfit; this._placeAcc(c);
  }
  _placeAcc(c) {
    if (!this.acc) return;
    const an = this.acc.catalog.anchors[c.sprite + '_' + c.pose], m = this.sprites[c.sprite + '_' + c.pose];
    for (const im of c.fig.querySelectorAll('.t2-acc')) { const item = this.acc.byId.get(im.dataset.id), a = an?.[im.dataset.slot]; if (item && a) placeAccessory(im, item, a, m.w / m.h); }
  }
  /** 頁面版面寬度（px） */
  resize(w) { this.width = w; this.view.style.width = w + 'px'; this.view.style.height = Math.round(w * this.aspect) + 'px'; }
}

export class Lobby2D {
  constructor(town) {
    Object.assign(this, { town, mode: 'active', rafId: 0, last: 0, effectTime: 0, renderCount: 0, rafCount: 0, lastDrawCalls: 0, lastTriangles: 0, events: [], benchmark: null });
    this.animators = new Set(); this._frame = now => this._tick(now);
  }
  start() { if (this.rafId) return; this.last = performance.now(); this.rafId = requestAnimationFrame(this._frame); }
  pause(reason = 'panel') {
    if (this.mode === 'paused') return; this.mode = 'paused';
    if (this.rafId) { cancelAnimationFrame(this.rafId); this.rafId = 0; }
    this.town.view.classList.add('t2-paused'); this.events.push({ name: 'pause', reason, time: performance.now() });
  }
  resume(reason = 'panel') {
    if (this.mode === 'active') return; this.mode = 'active';
    this.town.view.classList.remove('t2-paused'); this.events.push({ name: 'resume', reason, time: performance.now() }); this.start();
  }
  requestFrame() { /* DOM 版不需要補畫單幀 */ }
  _tick(now) {
    this.rafId = 0; this.rafCount++;
    if (this.mode === 'paused') return;
    const dt = Math.min(0.1, (now - this.last) / 1000); this.last = now; this.effectTime += dt;
    for (const a of this.animators) { if (a(dt) === false) this.animators.delete(a); }
    this.renderCount++;
    this.rafId = requestAnimationFrame(this._frame);
  }
  async measure(ms = 2000) {
    const r0 = this.renderCount, f0 = this.rafCount, t0 = performance.now();
    await sleep(ms);
    const dt = (performance.now() - t0) / 1000;
    return { mode: this.mode, seconds: +dt.toFixed(3), rafPerSec: +((this.rafCount - f0) / dt).toFixed(1), renderPerSec: +((this.renderCount - r0) / dt).toFixed(1), drawCalls: 0, triangles: 0, renderer: 'dom-2d' };
  }
}

export class TownFx2D {
  constructor({ town, lobby, contract, reward, sound, stage, log = () => {} }) {
    Object.assign(this, { town, lobby, contract, reward, sound, stage, log });
    this.zoneIds = contract.zones.ids; this.lessonToZone = contract.zones.lessonToZone; this.colorCfg = contract.zones.color;
    this.art = contract.art2d; this.tintedMaterials = 0; this.props = []; this.camToken = 0; this.fogFront = 0; this.busy = false;
    this.residents = [...town.chars.values()].map(c => ({ name: c.name, kind: c.sprite.startsWith('capy') ? 'capy' : 'bunny', zone: this.zoneIds.indexOf(c.zone), el: c.el }));
    this._makeGray(); this._mountClouds();
    town.view.addEventListener('pointerdown', e => this._tap(e));
    this._waveTimer = setInterval(() => this._idleWave(), 3800);
  }
  /** 把背景插畫轉一份低彩度版本（只做一次） */
  _makeGray() {
    const { W, H } = this.town, c = document.createElement('canvas'); c.width = W; c.height = H;
    const g = c.getContext('2d', { willReadFrequently: true }); g.drawImage(this.town.bg, 0, 0);
    const img = g.getImageData(0, 0, W, H), d = img.data;
    for (let i = 0; i < d.length; i += 4) {
      const l = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
      d[i] = l + (d[i] - l) * 0.22 + 18; d[i + 1] = l + (d[i + 1] - l) * 0.22 + 14; d[i + 2] = l + (d[i + 2] - l) * 0.22 + 16; /* 奶油灰，不是死灰 */
    }
    g.putImageData(img, 0, 0); this.gray = c;
  }
  /** v13：每課一團雲（雲朵數＝字數，黃金角螺旋排列，中心先散） */
  _mountClouds() {
    this.clouds = {};
    for (const [l, c] of Object.entries(this.art.clouds?.lessons ?? {})) {
      const n = this.contract.modes['lesson_' + l]?.writingTaskIds.length ?? 0; if (!n) continue;
      this.clouds[l] = Array.from({ length: n }, (_, i) => {
        const a = i * 2.39996, d = c.r * 0.82 * Math.sqrt((i + 0.5) / n), x = c.center[0] + Math.cos(a) * d, y = c.center[1] + Math.sin(a) * d * 0.75;
        const el = document.createElement('div'); el.className = 't2-cloud';
        el.style.left = (x / this.town.W * 100) + '%'; el.style.top = (y / this.town.H * 100) + '%'; el.style.width = (c.r * (0.72 - 0.25 * i / n) / this.town.W * 100) + '%';
        el.style.setProperty('--dd', (5 + (i % 4)) + 's'); el.style.animationDelay = (-i * 1.3) + 's'; el.style.setProperty('--gx', (Math.cos(a) * 60).toFixed(0) + 'px');
        this.town.world.append(el); return el;
      });
    }
  }
  _updateClouds(passed, instant) {
    const left = {};
    for (const [l, els] of Object.entries(this.clouds ?? {})) {
      const done = (this.contract.modes['lesson_' + l]?.writingTaskIds || []).filter(id => passed.has(id)).length;
      els.forEach((el, i) => { if (instant) el.style.transition = 'none'; el.classList.toggle('gone', i < done); if (instant) requestAnimationFrame(() => requestAnimationFrame(() => { el.style.transition = ''; })); });
      left[l] = Math.max(0, els.length - done);
    }
    return left;
  }
  /** v13：下一個字的對話氣泡，掛在引導角色（泡泡）頭上；text=null 隱藏 */
  setNextHint(char, { onTap } = {}) {
    const c = this.town.chars.get(this.art.nextHint?.resident); if (!c) return;
    let b = c.el.querySelector('.t2-say');
    if (!char) { b?.remove(); return; }
    if (!b) {
      b = document.createElement('span'); b.className = 't2-say'; b.setAttribute('role', 'button');
      b.addEventListener('pointerdown', e => e.stopPropagation());
      b.addEventListener('click', e => { e.stopPropagation(); this.sound?.unlock(); this._sayTap?.(); });
      c.el.append(b);
    }
    b.classList.toggle('below', c.at[1] - this.town.H * this.art.characterHeight < 260);
    this._sayTap = onTap; b.innerHTML = `<small>下一個字</small><em>${char}</em><small>點我寫字！</small>`; b.setAttribute('aria-label', `下一個字「${char}」，點我開始寫字`);
  }
  zoneOfLesson(l) { return this.zoneIds.indexOf(this.lessonToZone[String(l)]); }
  /** 已解鎖（出現在小鎮上）的朋友：規則同圖鑑 */
  unlockedNames(passed) {
    const set = new Set(passed);
    return this.contract.album.residents.filter(r => {
      if (r.unlockLesson == null) return true;
      const ids = this.contract.modes['lesson_' + r.unlockLesson]?.writingTaskIds || [];
      return ids.length > 0 && ids.every(id => set.has(id));
    }).map(r => r.object);
  }
  setProgress(passedTaskIds, { instant = false } = {}) {
    const passed = new Set(passedTaskIds), ratio = {};
    for (const [l, z] of Object.entries(this.lessonToZone)) {
      const ids = this.contract.modes['lesson_' + l]?.writingTaskIds || [], done = ids.filter(id => passed.has(id)).length;
      ratio[z] = Math.max(ratio[z] ?? 0, ids.length ? done / ids.length : 0);
    }
    const glob = ratio[this.lessonToZone[String(this.colorCfg.globalLesson)]] ?? 0;
    const sat = this.zoneIds.map(z => Math.max(ratio[z] ?? 0, glob));
    const outside = Math.max(glob, sat.reduce((a, b) => a + b, 0) / sat.length);
    this._drawFog(sat, outside, instant);
    // 朋友出現：剛解鎖的跳出來；v9 還沒解鎖但該課寫過一半的，先出現影子（剩 ≤ 3 字會晃）
    const on = new Set(this.unlockedNames(passedTaskIds)), pv = this.contract.feedback?.friendPreview ?? { showAtRatio: 0.5, nearRemaining: 3 };
    this.preview = {};
    for (const r of this.contract.album.residents) {
      if (on.has(r.object) || r.unlockLesson == null) continue;
      const ids = this.contract.modes['lesson_' + r.unlockLesson]?.writingTaskIds || [], done = ids.filter(id => passed.has(id)).length;
      if (ids.length && done / ids.length >= pv.showAtRatio) this.preview[r.object] = { remaining: ids.length - done, near: ids.length - done <= pv.nearRemaining };
    }
    for (const c of this.town.chars.values()) {
      const was = this._visible(c), now = on.has(c.name), pre = this.preview[c.name], wasShadow = c.el.classList.contains('shadow');
      c.el.classList.toggle('hidden', !now && !pre); c.el.classList.toggle('shadow', !now && !!pre); c.el.classList.toggle('near', !now && !!pre?.near);
      if (!now && pre) { /* v10：影子旁直接顯示還差幾個字 */
        const h = c.el.querySelector('.t2-hint') ?? c.el.appendChild(Object.assign(document.createElement('span'), { className: 't2-hint' }));
        h.innerHTML = `🔒 再寫 <em>${pre.remaining}</em> 字`; /* v11（規格 5.3）：常駐小膠囊 */
      }
      if (!instant && ((now && !was) || (pre && !wasShadow))) this._anim(c, 'pop', 700);
    }
    const clouds = this._updateClouds(passed, instant);
    this.colorState = { saturation: sat.map(v => +v.toFixed(2)), outside: +outside.toFixed(2), visibleFriends: [...on], shadows: this.preview, cloudsLeft: clouds };
    return this.colorState;
  }
  _drawFog(sat, outside, instant) {
    const { W, H } = this.town, max = this.art.zoneColor?.fogMax ?? 0.62;
    // 遮罩用 1/8 解析度計算（各區高斯權重混合），再平滑放大到整張插畫
    const mw = W / 8, mh = H / 8, m = document.createElement('canvas'); m.width = mw; m.height = mh;
    const mg = m.getContext('2d'), md = mg.createImageData(mw, mh);
    const zs = this.zoneIds.map((z, i) => ({ c: this.art.zones[z].center, r: this.art.zones[z].r, s: sat[i] }));
    for (let y = 0; y < mh; y++) for (let x = 0; x < mw; x++) {
      let wsum = 0.15, v = 0.15 * outside;
      for (const z of zs) { const dx = x * 8 - z.c[0], dy = y * 8 - z.c[1], w = Math.exp(-(dx * dx + dy * dy) / (2 * (z.r * 0.6) ** 2)); wsum += w; v += w * z.s; }
      md.data[(y * mw + x) * 4 + 3] = Math.round((1 - v / wsum) * max * 255);
    }
    mg.putImageData(md, 0, 0);
    const cv = this.town.fog[1 - this.fogFront], old = this.town.fog[this.fogFront], g = cv.getContext('2d');
    g.globalCompositeOperation = 'source-over'; g.clearRect(0, 0, W, H); g.drawImage(this.gray, 0, 0);
    g.globalCompositeOperation = 'destination-in'; g.imageSmoothingEnabled = true; g.drawImage(m, 0, 0, W, H);
    if (instant) { cv.style.transition = old.style.transition = 'none'; }
    cv.style.opacity = 1; old.style.opacity = 0; this.fogFront = 1 - this.fogFront;
    if (instant) requestAnimationFrame(() => requestAnimationFrame(() => { cv.style.transition = old.style.transition = ''; }));
  }
  _visible(c) { return !c.el.classList.contains('hidden') && !c.el.classList.contains('shadow'); }
  _anim(c, cls, ms) { const el = c.el; el.classList.remove('pop', 'hop', 'squash'); void el.offsetWidth; el.classList.add(cls); clearTimeout(el._t); el._t = setTimeout(() => el.classList.remove(cls), ms); }
  _idleWave() {
    if (this.lobby.mode !== 'active' || this.busy || document.hidden) return;
    const vis = [...this.town.chars.values()].filter(c => this._visible(c) && c.pose === 'idle');
    if (!vis.length) return;
    const c = vis[Math.floor(Math.random() * vis.length)];
    this.town.pose(c.name, Math.random() < 0.5 ? 'wave' : 'happy');
    setTimeout(() => { if (c.pose === 'wave' || c.pose === 'happy') this.town.pose(c.name, 'idle'); }, 1400);
  }
  _tap(e) {
    const el = e.target.closest?.('.t2-char'); if (!el) return null;
    const c = this.town.chars.get(el.dataset.name); this.sound?.unlock();
    if (c.el.classList.contains('shadow')) { // v9：點影子＝預告
      const n = this.preview?.[c.name]?.remaining ?? 0; this._anim(c, 'squash', 500); this.sound?.squeak(0.8);
      this.voice?.say(`再寫${n}個字，我就來了！`); this.log('tap shadow ' + c.name + ' remaining=' + n); return c.name;
    }
    this.town.pose(c.name, 'surprised'); this._anim(c, 'squash', 500);
    clearTimeout(c._pt); c._pt = setTimeout(() => { this.town.pose(c.name, 'happy'); c._pt = setTimeout(() => this.town.pose(c.name, 'idle'), 850); }, 450);
    const kind = c.sprite.startsWith('capy') ? 'capy' : 'bunny';
    if (kind === 'capy') this.sound?.puru(); else this.sound?.boing();
    this.spriteBurst([c.at[0], c.at[1] - this.town.H * this.art.characterHeight], { n: 6, spread: 70, sprites: kind === 'capy' ? ['fx_heart', 'fx_candy'] : ['fx_star', 'fx_sparkle'], d: 0.8 });
    this.log('tap ' + c.name + ' (' + kind + ')'); return c.name;
  }
  /** 甜點特效：從世界座標往外噴 */
  spriteBurst([x, y], { n = 12, spread = 140, sprites = ['fx_star', 'fx_heart', 'fx_sparkle', 'fx_candy', 'fx_petal', 'fx_macaron'], d = 1.1 } = {}) {
    const { W, H } = this.town, k = this.town.width / W;
    for (let i = 0; i < n; i++) {
      const im = document.createElement('img'); im.className = 't2-fx'; im.alt = ''; im.src = this.town.url(sprites[i % sprites.length]);
      const a = Math.random() * Math.PI * 2, r = spread * (0.5 + Math.random() * 0.6);
      im.style.left = (x / W * 100) + '%'; im.style.top = (y / H * 100) + '%';
      im.style.setProperty('--x', (Math.cos(a) * r * k).toFixed(1) + 'px'); im.style.setProperty('--y', (Math.sin(a) * r * k - 30 * k).toFixed(1) + 'px');
      im.style.setProperty('--r', ((Math.random() - 0.5) * 120).toFixed(0) + 'deg'); im.style.setProperty('--d', (d * (0.8 + Math.random() * 0.4)).toFixed(2) + 's');
      this.town.world.append(im); setTimeout(() => im.remove(), d * 1300);
    }
  }
  // ======== 鏡頭（推近／拉遠） ========
  _zoomTo([x, y], s) {
    const w = this.town.width, h = Math.round(w * this.town.aspect), k = w / this.town.W;
    let tx = w / 2 - x * k * s, ty = h / 2 - y * k * s;
    tx = Math.min(0, Math.max(w - w * s, tx)); ty = Math.min(0, Math.max(h - h * s, ty)); /* 不露出插畫外面 */
    this.town.zoom = { s, tx, ty };
    this.town.world.style.transform = s === 1 ? '' : `translate(${tx.toFixed(1)}px,${ty.toFixed(1)}px) scale(${s})`;
    const token = ++this.camToken;
    return sleep(820).then(() => token === this.camToken);
  }
  flyHome() { return this._zoomTo([0, 0], 1).then(ok => { if (ok) this._showPins(true); return ok; }); }
  _zoneCenter(i) { return i >= 0 ? this.art.zones[this.zoneIds[i]].center : [this.town.W / 2, this.town.H / 2]; }
  async flyToLesson(lesson, { hold = 1.2, zoom = 1.9 } = {}) {
    const i = this.zoneOfLesson(lesson); if (i < 0) return true;
    this._showPins(false); this.sound?.whoosh();
    if (!(await this._zoomTo(this._zoneCenter(i), zoom))) return false;
    const token = this.camToken; await sleep(hold * 1000);
    return token === this.camToken ? this.flyHome() : false;
  }
  async flyToResident(name) {
    const c = this.town.chars.get(name); if (!c || !this._visible(c)) return false;
    this._showPins(false); this.sound?.whoosh();
    if (!(await this._zoomTo([c.at[0], c.at[1] - 60], 2.4))) return false;
    const token = this.camToken; this.busy = true;
    this.town.pose(name, 'happy'); this._anim(c, 'hop', 550); setTimeout(() => this._anim(c, 'hop', 550), 600);
    await sleep(1600); this.town.pose(name, 'idle'); this.busy = false;
    return token === this.camToken ? this.flyHome() : false;
  }
  async celebrate(lesson) {
    const i = this.zoneOfLesson(lesson), center = this._zoneCenter(i);
    this._showPins(false); this.sound?.whoosh(); this.busy = true;
    if (!(await this._zoomTo(center, i >= 0 ? 1.9 : 1))) { this.busy = false; return false; }
    const token = this.camToken;
    const r = i >= 0 ? this.art.zones[this.zoneIds[i]].r : this.town.W / 2, g = this.town.glow;
    g.style.left = ((center[0] - r) / this.town.W * 100) + '%'; g.style.top = ((center[1] - r) / this.town.H * 100) + '%';
    g.style.width = (2 * r / this.town.W * 100) + '%'; g.style.height = (2 * r / this.town.H * 100) + '%';
    g.classList.remove('on'); void g.offsetWidth; g.classList.add('on');
    const vis = [...this.town.chars.values()].filter(c => this._visible(c));
    let rs = i >= 0 ? vis.filter(c => c.zone === this.zoneIds[i]) : vis;
    if (rs.length < 2) rs = [...vis].sort((a, b) => Math.hypot(a.at[0] - center[0], a.at[1] - center[1]) - Math.hypot(b.at[0] - center[0], b.at[1] - center[1])).slice(0, 2);
    rs.forEach((c, k) => setTimeout(() => { this.town.pose(c.name, 'happy'); this._anim(c, 'hop', 550); }, 100 + k * 180));
    this.spriteBurst(center, { n: 16, spread: 170 });
    this.lastCelebration = { lesson, zone: this.zoneIds[i] ?? 'global', residents: rs.map(c => c.name), props: 0 };
    await sleep(1900);
    rs.forEach(c => this.town.pose(c.name, 'idle')); this.busy = false;
    return token === this.camToken ? this.flyHome() : false;
  }
  // ======== 地圖上的課次標記 ========
  mountPins({ onPick, onStart }) {
    this.onPick = onPick; this.onStart = onStart;
    this.pins = Object.keys(this.lessonToZone).map(l => {
      const p = this.art.pins[l], b = document.createElement('button'); b.type = 'button'; b.className = 't2-pin'; b.dataset.lesson = l;
      b.innerHTML = `<u aria-hidden="true">▼</u><img alt="" draggable="false" src="${this.town.url(p.icon)}"><b>${l === '0' ? '數' : l}</b><small></small>`;
      b.style.setProperty('--pc', PIN_COLORS[+l % PIN_COLORS.length]); /* v10：題號改馬卡龍色塊＋白粗邊 */
      b.style.left = (p.at[0] / this.town.W * 100) + '%'; b.style.top = (p.at[1] / this.town.H * 100) + '%';
      if (p.at[0] > this.town.W * 0.8) b.classList.add('edge-r'); else if (p.at[0] < this.town.W * 0.2) b.classList.add('edge-l'); /* v13：課名膠囊不被畫面邊緣切掉 */
      b.addEventListener('pointerdown', e => e.stopPropagation());
      b.addEventListener('click', e => { e.stopPropagation(); this.sound?.unlock(); if (b.classList.contains('active') && this.onStart) this.onStart(+l); else this.onPick?.(+l); }); /* v13：點目前這課的標記＝開始寫字 */
      this.town.world.append(b); return b;
    });
  }
  placePins() { /* 標記用百分比定位，隨版面縮放，不必重算 */ }
  updatePins(activeLesson, counts) {
    for (const b of this.pins ?? []) {
      const l = +b.dataset.lesson, c = counts[l];
      b.classList.toggle('active', l === activeLesson); b.classList.toggle('done', !!c && c[0] === c[1]);
      b.querySelector('small').innerHTML = c ? (l === activeLesson ? c[2] + ' ' : '') + `${c[0]}/${c[1]}` + (c[3] ? ` <i>★${c[3]}</i>` : '') : ''; /* v9：c[3]＝星星合計；v13：選中的課加課名（頂部章節列已收起） */
      b.title = c ? `${c[2]}（${c[0]}/${c[1]} 字${c[3] != null ? `，★${c[3]}/${c[4]}` : ''}）` : ''; b.setAttribute('aria-label', b.title);
    }
  }
  _showPins(on) { this.town.view.classList.toggle('t2-pins-hidden', !on); }
}

export class Reward2D {
  constructor({ town, lobby, contract, log = () => {} }) {
    Object.assign(this, { town, lobby, contract, log });
    this.cfg = contract.art2d.reward; this.npc = this.cfg.npc;
    if (!town.chars.has(this.npc)) throw new Error('NPC_NOT_FOUND:' + this.npc);
    this.rest = town.chars.get(this.npc).home; this.end = this.cfg.to;
    this.state = { atPool: false, steamOn: false }; this.busy = false;
    this.distance = Math.hypot(this.end[0] - this.rest[0], this.end[1] - this.rest[1]);
  }
  /** 重開／載入：由帳本筆數推導固定位置（不累加） */
  applyState({ rewardCount }) {
    const on = rewardCount > 0, el = this.town.chars.get(this.npc).el;
    el.style.transition = 'none'; this.town.place(this.npc, on ? this.end : this.rest); void el.offsetWidth; el.style.transition = '';
    this.town.steam.classList.toggle('on', on); this.state = { atPool: on, steamOn: on };
    this.log(`applyState rewardCount=${rewardCount} → npc ${on ? 'pool' : 'rest'}, steam ${on ? 'on' : 'off'}`);
  }
  play({ rewardNew }) {
    if (!rewardNew) { this.log('reward replay: no new reward, no displacement'); return Promise.resolve(false); }
    const c = this.town.chars.get(this.npc);
    this.busy = true;
    if (this.state.atPool) {
      c.el.classList.remove('hop'); void c.el.offsetWidth; c.el.classList.add('hop');
      return sleep(560).then(() => { c.el.classList.remove('hop'); this.busy = false; return true; });
    }
    this.town.pose(this.npc, 'happy'); this.town.place(this.npc, this.end);
    return sleep(1650).then(() => {
      this.town.pose(this.npc, 'wave'); this.town.steam.classList.add('on'); this.state = { atPool: true, steamOn: true };
      this.log(`reward: npc walked ${this.distance.toFixed(0)} px to pool, steam on`); this.busy = false;
      setTimeout(() => this.town.pose(this.npc, 'idle'), 1200); return true;
    });
  }
  npcPosition() { return this.town.chars.get(this.npc).at; }
}

const ALBUM_CSS = (frame, locked) => `
.al2 .al-grid{gap:12px;row-gap:30px;padding-bottom:16px}
.al2 .al-card{position:relative;border:0;background:url(${frame}) center/100% 100% no-repeat;aspect-ratio:397/600;padding:21% 14% 0;justify-content:flex-start;border-radius:0;gap:0}
.al2 .al-card.locked{background-image:url(${locked})}
.al2 .al-card img{width:100%;aspect-ratio:1;object-fit:contain;background:none;border-radius:0}
.al2 .al-card.locked img{visibility:hidden}
.al2 .al-card b{position:absolute;left:0;right:0;bottom:9.5%;text-align:center;font-size:clamp(13px,2.4vw,17px)}
.al2 .al-card small{position:absolute;left:4%;right:4%;top:100%;margin-top:2px;text-align:center;font-size:11px;line-height:1.2}
.al2 .al-card.new{border:0;animation:al-glow2 1.2s ease-in-out 3}
@keyframes al-glow2{50%{filter:drop-shadow(0 0 10px rgba(240,140,0,.8))}}
`;

export class Album2D extends Album {
  constructor(opts) {
    super(opts);
    if (!document.getElementById('al2-style')) { const s = document.createElement('style'); s.id = 'al2-style'; s.textContent = ALBUM_CSS(this.town.url('card_open'), this.town.url('card_locked')); document.head.append(s); }
  }
  _snap(object) { const c = this.town.chars.get(object); return c ? this.town.url(c.sprite + '_idle') : ''; }
  open(passed, opts) { const r = super.open(passed, opts); this.el?.classList.add('al2'); return r; }
  async visit(r) { this.close(); this.voice?.say(r.name); await this.townFx.flyToResident(r.object); this.lastVisit = r.object; }
}

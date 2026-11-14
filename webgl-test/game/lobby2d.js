// v8 2D 甜點樂園大廳（契約 v8 art2d）：用 Codex 生成的插畫取代 3D 小鎮，對外介面與 3D 版相同，頁面可以互換。
// - Town2D：背景插畫＋角色（DOM 圖片），resize(w) 依比例縮放；世界座標＝插畫像素座標（1536×1024）。
// - Lobby2D：只有一個 RAF 迴圈跑補間動畫；面板開啟時暫停 RAF 並暫停所有 CSS 動畫（省電）。
// - TownFx2D：區域彩度（未寫的區域蓋一層去彩度的同一張插畫，用低解析度遮罩混合）、地圖標記、點角色、寫完字的慶祝、鏡頭推近。
// - Reward2D：第一次得獎時泡泡從廣場走到溫泉池邊、池子冒蒸氣；之後只跳一下。由帳本筆數推導，不另存。
// - Album2D：沿用 Album 的解鎖規則，縮圖改用角色插畫、卡框用甜點卡框。
import { Album } from './album.js?v=60';
import { placeAccessory } from './shop.js?v=60';

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
.t2-pin.locked img{filter:grayscale(1) opacity(.55) drop-shadow(0 0 2px #fff)}
.t2-pin.locked b{background:#9a8f94;font-size:0}
.t2-pin.locked b::after{content:'🔒';font-size:clamp(12px,1.2vw,17px)}
.t2-pin.locked small{opacity:.75}
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
/* v50 區域全三星：標記金色光暈＋標記附近常駐的小粒子（只動 transform／opacity；每課 3 個） */
.t2-pin.mastered img{filter:drop-shadow(0 0 3px #FFD54A) drop-shadow(0 0 7px #FFB300) drop-shadow(0 3px 4px rgba(91,58,74,.35))}
.t2-pin.mastered b{border-color:#FFD54A;box-shadow:0 0 0 2px #FFB300,0 4px 10px rgba(0,0,0,.25)}
.t2-amb{position:absolute;z-index:140;pointer-events:none;width:9%;aspect-ratio:1;transform:translate(-50%,-80%);transition:opacity .25s}
.t2-amb i{position:absolute;top:0;left:8%;width:26%;aspect-ratio:1;background:center/contain no-repeat;opacity:0;animation:t2-amb 3.6s linear infinite}
.t2-amb i:nth-child(2){left:40%;animation-delay:1.2s}
.t2-amb i:nth-child(3){left:68%;animation-delay:2.4s}
@keyframes t2-amb{0%{transform:translateY(-20%) rotate(0);opacity:0}15%{opacity:.95}80%{opacity:.8}100%{transform:translateY(270%) rotate(150deg);opacity:0}}
.t2-pins-hidden .t2-amb{opacity:0}
@media (prefers-reduced-motion:reduce){.t2-amb{display:none}}
/* v51 守門員節點：圓形底＋🛡️（不用新圖）；有 t2-pin class，鏡頭推近、全螢幕視窗時跟著課次標記一起藏起來 */
.t2-boss{border-radius:50%;background:radial-gradient(circle at 35% 30%,#fff7d6,#f2c14e 70%,#c98f2a);box-shadow:0 0 0 3px #fff,0 4px 10px rgba(0,0,0,.3)}
.t2-boss .ico{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font-size:clamp(22px,4vw,52px);line-height:1;filter:drop-shadow(0 2px 2px rgba(0,0,0,.25))}
.t2-boss b{background:#7B5CC4}
.t2-boss.ready b{background:#E55A4E;animation:nodePulse 1.6s ease-in-out infinite}
.t2-boss.ready{animation:t2-bossGlow 1.6s ease-in-out infinite}
@keyframes t2-bossGlow{50%{box-shadow:0 0 0 3px #fff,0 0 16px 6px rgba(242,193,78,.9)}}
.t2-boss.done{box-shadow:0 0 0 3px #FFD54A,0 0 12px 4px rgba(255,179,0,.7)}
@media (prefers-reduced-motion:reduce){.t2-boss.ready,.t2-boss.ready b{animation:none}}
/* v52 季節層：色調（半透明漸層，不用 filter）在背景上、雲和朋友下；粒子在朋友上、標記下。粒子只動 transform／opacity */
.t2-season-tint{position:absolute;inset:0;z-index:1;pointer-events:none}
.t2-season-fx{position:absolute;inset:0;z-index:120;pointer-events:none;overflow:hidden}
.t2-season-fx i{position:absolute;top:0;left:var(--x);width:var(--s);height:100%;animation:t2-fall var(--d) linear var(--dl) infinite;will-change:transform}
.t2-season-fx i::before{content:'';position:absolute;left:0;top:0;width:100%;aspect-ratio:1;animation:t2-sway calc(var(--d) / 3) ease-in-out var(--dl) infinite alternate}
.t2-season-fx[data-kind=snow] i::before{border-radius:50%;background:#fff;box-shadow:0 0 3px rgba(150,180,220,.8);opacity:.92}
.t2-season-fx[data-kind=petal] i::before{aspect-ratio:1.3;border-radius:80% 0 80% 0;background:linear-gradient(135deg,#ffd1e0,#ff9fbe);box-shadow:0 1px 2px rgba(200,90,130,.3)}
@keyframes t2-fall{from{transform:translateY(-6%)}to{transform:translateY(102%)}}
@keyframes t2-sway{from{transform:translateX(calc(var(--sw) * -1)) rotate(-25deg)}to{transform:translateX(var(--sw)) rotate(35deg)}}
.t2-paused .t2-season-fx i,.t2-paused .t2-season-fx i::before{animation-play-state:paused}
/* v52 季節小考節點（同守門員：圓形底＋圖示，不用新圖） */
.t2-quest{border-radius:50%;background:radial-gradient(circle at 35% 30%,#fff,#ffd6e3 60%,#f39ab8);box-shadow:0 0 0 3px #fff,0 4px 10px rgba(0,0,0,.3);animation:t2-questGlow 2s ease-in-out infinite}
.t2-quest .ico{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font-size:clamp(22px,4vw,52px);line-height:1;filter:drop-shadow(0 2px 2px rgba(0,0,0,.25))}
.t2-quest b{background:#E8665C}
.t2-quest.done{animation:none;box-shadow:0 0 0 3px #8fd18f,0 4px 10px rgba(0,0,0,.3)}
@keyframes t2-questGlow{50%{box-shadow:0 0 0 3px #fff,0 0 16px 6px rgba(255,143,163,.85)}}
@media (prefers-reduced-motion:reduce){.t2-quest{animation:none}}
/* v50 朋友的對話氣泡（每個字附注音；注音樣式同寫字面板的 .zy，這裡另存一份，因為面板的樣式要開過面板才有） */
.t2-char.talking .t2-say{opacity:0;pointer-events:none}
.t2-talk{position:absolute;z-index:180;transform:translate(-50%,-100%);margin-top:-1.4%;display:flex;align-items:center;gap:.15em;font:800 clamp(18px,2.6vw,28px)/1.2 system-ui,"Noto Sans TC",sans-serif;color:#5B3A4A;background:#fff;border:3px solid #F48FB1;border-radius:16px;padding:6px 12px;white-space:nowrap;box-shadow:0 4px 10px rgba(91,58,74,.3);pointer-events:none;animation:t2-talkIn .18s ease-out}
.t2-talk::after{content:'';position:absolute;left:calc(50% + var(--ax,0px));top:100%;transform:translateX(-50%);border:9px solid transparent;border-top-color:#F48FB1}
.t2-talk.below{transform:translate(-50%,0);margin-top:1.4%}
.t2-talk.below::after{top:auto;bottom:100%;border-top-color:transparent;border-bottom-color:#F48FB1}
@keyframes t2-talkIn{from{opacity:0}}
.t2-talk .wz{display:inline-flex;align-items:center}
.t2-talk .wz-c{font-family:"Kaiti TC","BiauKai","DFKai-SB","Noto Serif TC",serif;font-size:1.15em}
.t2-talk .zy{display:inline-flex;align-items:flex-end;line-height:1;font:700 .56em/1 system-ui,"Noto Sans TC",sans-serif;font-style:normal;color:#8a5a6a;margin-left:1px}
.t2-talk .zy-s{display:inline-flex;flex-direction:column;align-items:center}
.t2-talk .zy-s b{font-weight:inherit}
.t2-talk .zy-dot{font-style:normal;line-height:.6}
.t2-talk .zy-t{font-size:.85em;width:.7em;margin-bottom:.15em}
.t2-talk .gift{display:inline-flex;align-items:center;gap:2px;margin-left:.3em;color:#E8A000;font-weight:900}
.t2-talk .gift img{height:1.7em;width:1.7em;object-fit:contain}
.t2-pins-hidden .t2-talk{opacity:0}
.t2-paused *,.t2-paused *::before{animation-play-state:paused!important}
/* v15：寫字／小遊戲全螢幕蓋住地圖時，只留底圖，雲、角色、標記先藏起來（瀏覽器不必每格整理這些圖層，寫字較順）；關掉就恢復 */
.t2-paused .t2-world>:not(.t2-bg){visibility:hidden}
/* v59 寬版地圖（太空）：可以左右拖曳、角色走路、建築和火箭圖層 */
.t2-view.t2-pan{touch-action:pan-y}
.t2-pan .t2-pin{width:clamp(40px,6%,84px)} /* 太空版：標記小一點，才看得到後面的建築 */
.t2-char.t2-walkmode{transition:none!important}
.t2-char.walking .t2-fig{animation:t2-walk .42s ease-in-out infinite}
.t2-fig.flip>img:not(.t2-acc){transform:scaleX(-1)}
@keyframes t2-walk{0%,100%{transform:translateY(0)}50%{transform:translateY(-5%)}}
.t2-builds{position:absolute;inset:0;z-index:1;pointer-events:none}
.t2-builds img{position:absolute;display:block;height:auto;pointer-events:none;-webkit-user-drag:none}
.t2-builds img.rocket{z-index:2}
.t2-edge{position:absolute;z-index:300;top:50%;transform:translateY(-50%);width:34px;height:64px;border:0;border-radius:12px;background:rgba(36,50,74,.45);color:#fff;font:900 30px/1 system-ui;cursor:pointer;touch-action:manipulation;-webkit-tap-highlight-color:transparent;display:flex;align-items:center;justify-content:center;padding:0 0 4px}
.t2-edge.l{left:6px}.t2-edge.r{right:6px}
.t2-edge[hidden],.t2-paused .t2-edge,.t2-pins-hidden .t2-edge{display:none}
@media (prefers-reduced-motion:reduce){.t2-char.walking .t2-fig{animation:none}}
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
  /** 頁面版面寬度（px）；v59 寬版地圖：resize(畫面寬, 畫面高)，地圖高＝畫面高、可以左右平移（pan） */
  resize(w, h = null) {
    if (h == null) { this.width = w; this.view.style.width = w + 'px'; this.view.style.height = Math.round(w * this.aspect) + 'px'; return; }
    const ratio = this.maxPan > 0 ? this.pan / this.maxPan : null, mw = Math.round(h * this.W / this.H);
    this.panMode = true; this.view.classList.add('t2-pan');
    Object.assign(this, { width: mw, vw: w, vh: h, maxPan: Math.max(0, mw - w) });
    this.view.style.width = w + 'px'; this.view.style.height = h + 'px'; this.world.style.width = mw + 'px'; this.world.style.height = h + 'px';
    this.pan = ratio != null ? ratio * this.maxPan : this.panFocus ? this._panFor(this.panFocus()) : 0;
    this.pan = Math.min(this.maxPan, Math.max(0, this.pan)); this.applyPan(false);
  }
  /** 讓插畫 x 座標在畫面中間的 pan 值 */
  _panFor(x) { return Math.min(this.maxPan, Math.max(0, x * this.width / this.W - this.vw / 2)); }
  /** 套用平移（鏡頭推近中不動，等 flyHome 套用）；animate＝0.4 秒動畫 */
  applyPan(animate = false) {
    if (!this.panMode || this.zoom.s !== 1) { this.onPan?.(); return; }
    this.world.style.transition = animate ? 'transform .4s ease' : 'none';
    this.world.style.transform = this.pan ? `translate(${(-this.pan).toFixed(1)}px,0)` : '';
    this.zoom = { s: 1, tx: -this.pan, ty: 0 };
    if (!animate) { void this.world.offsetWidth; this.world.style.transition = ''; } else { clearTimeout(this._panT); this._panT = setTimeout(() => { this.world.style.transition = ''; }, 420); }
    this.onPan?.();
  }
  panTo(x, animate = true) { if (!this.panMode) return; this.pan = this._panFor(x); this.applyPan(animate); }
  panBy(dx, animate = true) { if (!this.panMode) return; this.pan = Math.min(this.maxPan, Math.max(0, this.pan + dx)); this.applyPan(animate); }
  /** v59 建築圖層：list＝[{ sprite, at, w, cx, by }]（at＝圖上 (cx,by) 那一點在插畫的位置，w＝顯示寬度，插畫 px） */
  setBuildings(list) {
    if (!this.builds) { this.builds = document.createElement('div'); this.builds.className = 't2-builds'; this.world.insertBefore(this.builds, this.glow); this.buildEls = []; }
    list.forEach((b, i) => {
      let im = this.buildEls[i]; if (!im) { im = document.createElement('img'); im.alt = ''; im.draggable = false; im.dataset.idx = i; this.builds.append(im); this.buildEls[i] = im; }
      this._placeSprite(im, b);
    });
    if (this.rocketEl) this.builds.append(this.rocketEl);
  }
  /** v59 火箭（null＝發射台上沒有火箭）；排在建築後面＝蓋在發射台上 */
  setRocket(r) {
    if (!this.builds) return;
    if (!this.rocketEl) { this.rocketEl = document.createElement('img'); this.rocketEl.alt = ''; this.rocketEl.draggable = false; this.rocketEl.className = 'rocket'; this.builds.append(this.rocketEl); }
    this.rocketEl.hidden = !r; if (r) this._placeSprite(this.rocketEl, r); else this.rocketEl.dataset.src = '';
  }
  _placeSprite(im, { sprite, at, w, cx = 0.5, by = 1 }) {
    const m = this.sprites[sprite]; if (!m) return; const h = w * m.h / m.w;
    if (im.dataset.src !== sprite) { im.src = this.url(sprite); im.dataset.src = sprite; }
    im.style.left = ((at[0] - cx * w) / this.W * 100) + '%'; im.style.top = ((at[1] - by * h) / this.H * 100) + '%'; im.style.width = (w / this.W * 100) + '%';
  }
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
  constructor({ town, lobby, contract, reward, sound, stage, map = null, log = () => {} }) {
    Object.assign(this, { town, lobby, contract, reward, sound, stage, map, log }); this.camBusy = false;
    this.zoneIds = contract.zones.ids; this.lessonToZone = contract.zones.lessonToZone; this.colorCfg = contract.zones.color;
    this.art = contract.art2d; this.tintedMaterials = 0; this.props = []; this.camToken = 0; this.fogFront = 0; this.busy = false;
    this.residents = [...town.chars.values()].map(c => ({ name: c.name, kind: c.sprite.startsWith('capy') ? 'capy' : 'bunny', zone: this.zoneIds.indexOf(c.zone), el: c.el }));
    this._makeGray(); this._mountClouds();
    town.view.addEventListener('pointerdown', e => this._tap(e));
    this._waveTimer = setInterval(() => this._idleWave(), 3800);
    if (map?.pan) this._setupPan();
  }
  // ======== v59 寬版地圖：拖曳與邊緣箭頭 ========
  _setupPan() {
    const t = this.town, v = t.view; let drag = null;
    const arrow = (cls, sign, label) => {
      const b = document.createElement('button'); b.type = 'button'; b.className = 't2-edge ' + cls; b.textContent = sign < 0 ? '‹' : '›'; b.setAttribute('aria-label', label);
      b.addEventListener('pointerdown', e => e.stopPropagation());
      b.addEventListener('click', e => { e.stopPropagation(); if (this.camBusy) return; this.sound?.unlock(); t.panBy(sign * t.vw / 2, true); this.log('pan arrow ' + cls + ' -> ' + Math.round(t.pan)); });
      v.append(b); return b;
    };
    this.edges = [arrow('l', -1, '往左看'), arrow('r', 1, '往右看')];
    t.onPan = () => { const [l, r] = this.edges; l.hidden = !(t.maxPan > 0 && t.pan > 1); r.hidden = !(t.maxPan > 0 && t.pan < t.maxPan - 1); };
    t.onPan();
    v.addEventListener('pointerdown', e => {
      t.dragged = false;
      if (!t.panMode || t.maxPan <= 0 || this.camBusy || this.lobby.mode !== 'active' || t.zoom.s !== 1) return;
      if (e.target.closest?.('.t2-char,.t2-pin,.t2-say,.t2-boss,.t2-quest,.t2-edge')) return;
      drag = { id: e.pointerId, x: e.clientX, y: e.clientY, pan: t.pan, on: false };
    });
    v.addEventListener('pointermove', e => {
      if (!drag || e.pointerId !== drag.id) return;
      const dx = e.clientX - drag.x;
      if (!drag.on) {
        if (Math.abs(dx) < 8) return;
        if (Math.abs(e.clientY - drag.y) > Math.abs(dx)) { drag = null; return; }
        drag.on = true; t.dragged = true; try { v.setPointerCapture(e.pointerId); } catch { /* ignore */ }
      }
      t.pan = Math.min(t.maxPan, Math.max(0, drag.pan - dx)); t.applyPan(false);
    });
    const end = e => { if (drag && e.pointerId === drag.id) { if (drag.on) this.log('pan drag -> ' + Math.round(t.pan)); drag = null; } };
    v.addEventListener('pointerup', end); v.addEventListener('pointercancel', end);
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
    this.refreshHintSide();
    this._sayTap = onTap; b.innerHTML = `<small>下一個字</small><em>${char}</em><small>點我寫字！</small>`; b.setAttribute('aria-label', `下一個字「${char}」，點我開始寫字`);
  }
  /** v59：「下一個字」氣泡放上面或下面（導遊走路時每格呼叫；只在結果改變時改 class） */
  refreshHintSide() {
    const c = this.town.chars.get(this.art.nextHint?.resident), b = c?.el.querySelector('.t2-say'); if (!b) return null;
    const below = c.at[1] - this.town.H * this.art.characterHeight < (this.map ? 0.3 * this.town.H : 260);
    if (b.classList.contains('below') !== below) b.classList.toggle('below', below);
    return below;
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
    const el = e.target.closest?.('.t2-char'); if (!el || this.town.dragged) return null;
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
    this.log('tap ' + c.name + ' (' + kind + ')'); this.onFriendTap?.(c); /* v50：對話氣泡、首次禮物（game-v1.html 接） */ return c.name;
  }
  // ======== v50 區域全三星（外觀、常駐粒子、慶祝）與朋友對話氣泡 ========
  /** lessons＝全三星的課（數字陣列）；sprites＝各課輪流用的特效圖。重複呼叫只補差異 */
  setMastery(lessons, sprites = ['fx_star']) {
    const want = new Set(lessons.map(String)); this.amb ??= new Map();
    for (const b of this.pins ?? []) b.classList.toggle('mastered', want.has(b.dataset.lesson));
    for (const [l, el] of this.amb) if (!want.has(l)) { el.remove(); this.amb.delete(l); }
    for (const l of want) {
      const p = this.art.pins?.[l]; if (this.amb.has(l) || !p) continue;
      const el = document.createElement('div'), src = this.town.url(sprites[+l % sprites.length]); el.className = 't2-amb'; el.dataset.lesson = l;
      el.style.left = (p.at[0] / this.town.W * 100) + '%'; el.style.top = (p.at[1] / this.town.H * 100) + '%';
      el.innerHTML = `<i style="background-image:url('${src}')"></i>`.repeat(3);
      this.town.world.append(el); this.amb.set(l, el);
    }
    this.masteryState = [...want].map(Number).sort((a, b) => a - b);
  }
  /** 某一課剛達成全三星：在那一課的標記噴特效，看得到的朋友跳一下 */
  masteryCheer(lesson, sprite = 'fx_star') {
    const p = this.art.pins?.[lesson]; if (!p) return false;
    this.spriteBurst(p.at, { n: 12, spread: 150, sprites: [sprite, 'fx_sparkle'], d: 1.2 });
    const vis = [...this.town.chars.values()].filter(c => this._visible(c));
    vis.forEach((c, k) => setTimeout(() => this._anim(c, 'hop', 550), k * 100));
    this.lastMastery = { lesson, sprite, residents: vis.length }; return true;
  }
  // ======== v51 守門員節點 ========
  mountBoss({ at, onTap }) {
    if (this.boss || !at) return null;
    const b = document.createElement('button'); b.type = 'button'; b.className = 't2-pin t2-boss'; b.dataset.boss = '1';
    b.innerHTML = '<span class="ico" aria-hidden="true">🛡️</span><b>守</b><small></small>';
    b.style.left = (at[0] / this.town.W * 100) + '%'; b.style.top = (at[1] / this.town.H * 100) + '%';
    if (at[0] < this.town.W * 0.2) b.classList.add('edge-l'); else if (at[0] > this.town.W * 0.8) b.classList.add('edge-r');
    b.addEventListener('pointerdown', e => e.stopPropagation());
    b.addEventListener('click', e => { e.stopPropagation(); this.sound?.unlock(); onTap?.(); });
    this.town.world.append(b); this.boss = b; this.bossAt = at; return b;
  }
  /** st＝extras.js 的 bossStatus() 結果 */
  setBoss(st, title = '守門員') {
    const b = this.boss; if (!b || !st) return;
    b.classList.toggle('ready', st.ready); b.classList.toggle('done', st.done);
    b.querySelector('small').textContent = st.done ? `👑 ${st.cleared}/${st.stages}` : st.ready ? `${st.cleared}/${st.stages} 挑戰！` : `再學 ${st.need} 字`;
    b.title = st.done ? `${title}：全部 ${st.stages} 關都過了（可以再練習）` : st.ready ? `${title}：可以挑戰第 ${st.next} 關（已過 ${st.cleared}/${st.stages}）` : `${title}：再學 ${st.need} 個字就能挑戰第 ${st.next} 關（已過 ${st.cleared}/${st.stages}）`;
    b.setAttribute('aria-label', b.title); this.bossState = st;
  }
  // ======== v52 季節層與季節小考節點 ========
  /** cfg＝seasons.json 的一季（null＝不用季節）；small＝手機尺寸（粒子少一點）；reduced＝不要動畫（不建粒子，只留色調）。三個值都一樣就不重建 */
  setSeason(cfg, { small = false, reduced = false } = {}) {
    const key = cfg ? `${cfg.id}|${small ? 1 : 0}|${reduced ? 1 : 0}` : 'none';
    if (key === this._seasonKey) return this.seasonState;
    this._seasonKey = key; this.seasonTint?.remove(); this.seasonFx?.remove(); this.seasonTint = this.seasonFx = null;
    const bg = this.town.bg; if (bg) bg.style.filter = '';
    if (!cfg) { this.seasonState = { id: null, kind: null, particles: 0 }; return this.seasonState; }
    const w = this.town.world, anchor = this.town.glow?.nextSibling ?? null;
    if (cfg.tint) { const t = document.createElement('div'); t.className = 't2-season-tint'; t.style.background = cfg.tint; w.insertBefore(t, anchor); this.seasonTint = t; }
    if (cfg.bgFilter && bg) bg.style.filter = cfg.bgFilter;
    const n = reduced ? 0 : small ? cfg.particles.nSmall : cfg.particles.n;
    if (n) {
      const fx = document.createElement('div'); fx.className = 't2-season-fx'; fx.dataset.kind = cfg.particles.kind;
      const big = cfg.particles.kind === 'petal' ? 1.5 : 1.1;
      fx.innerHTML = Array.from({ length: n }, (_, i) => {
        const x = ((i + Math.random() * 0.8) / n * 100).toFixed(1), sz = (big * (0.6 + Math.random() * 0.7)).toFixed(2), d = (7 + Math.random() * 6).toFixed(1), dl = (-Math.random() * 12).toFixed(1), sw = (8 + Math.random() * 16).toFixed(0);
        return `<i style="--x:${x}%;--s:${sz}%;--d:${d}s;--dl:${dl}s;--sw:${sw}px"></i>`;
      }).join('');
      w.append(fx); this.seasonFx = fx;
    }
    this.seasonState = { id: cfg.id, kind: cfg.particles.kind, particles: n }; return this.seasonState;
  }
  /** 季節小考節點：q＝{ at, icon, label, done, title }；null＝移除 */
  setQuest(q, onTap) {
    if (!q) { this.quest?.remove(); this.quest = null; this.questState = null; return; }
    let b = this.quest;
    if (!b || this._questAt?.join() !== q.at.join()) {
      b?.remove(); b = document.createElement('button'); b.type = 'button'; b.className = 't2-pin t2-quest'; b.dataset.quest = '1';
      b.innerHTML = '<span class="ico" aria-hidden="true"></span><b>考</b><small></small>';
      b.style.left = (q.at[0] / this.town.W * 100) + '%'; b.style.top = (q.at[1] / this.town.H * 100) + '%';
      if (q.at[0] < this.town.W * 0.2) b.classList.add('edge-l'); else if (q.at[0] > this.town.W * 0.8) b.classList.add('edge-r');
      b.addEventListener('pointerdown', e => e.stopPropagation());
      b.addEventListener('click', e => { e.stopPropagation(); this.sound?.unlock(); this._questTap?.(); });
      this.town.world.append(b); this.quest = b; this._questAt = q.at;
    }
    this._questTap = onTap;
    b.querySelector('.ico').textContent = q.icon || '🌸'; b.classList.toggle('done', !!q.done);
    b.querySelector('small').textContent = q.label + (q.done ? ' ✓' : '');
    b.title = `${q.title ?? q.label}${q.done ? '（做過了，可以再練習）' : '（第一次做完送星星）'}`; b.setAttribute('aria-label', b.title);
    this.questState = { icon: q.icon, label: q.label, done: !!q.done };
  }
  /** 在朋友頭上顯示一個氣泡（一次只有一個），ms 毫秒後收起；回傳氣泡元素 */
  talk(name, html, ms = 3200) {
    const c = this.town.chars.get(name); if (!c) return null;
    this._talkEnd?.();
    const b = document.createElement('span'); b.className = 't2-talk'; b.innerHTML = html;
    // 氣泡掛在地圖上（不掛在朋友身上：朋友被點時會壓扁、跳，氣泡不要跟著變形），位置＝朋友頭頂
    const feet = parseFloat(c.el.style.top), place = y => { b.style.left = c.el.style.left; b.style.top = y + '%'; }; // 用朋友現在的位置（導遊會走到別的地方）
    place(feet - this.art.characterHeight * 100); c.el.classList.add('talking'); this.town.world.append(b);
    // 量實際位置：超出地圖上緣就改放腳下；左右超出就平移回來（箭頭留在朋友頭上）
    const v = this.town.view.getBoundingClientRect(); let r = b.getBoundingClientRect();
    if (r.top < v.top + 2) { b.classList.add('below'); place(feet); r = b.getBoundingClientRect(); }
    const dx = r.left < v.left + 4 ? v.left + 4 - r.left : r.right > v.right - 4 ? v.right - 4 - r.right : 0;
    if (dx) { b.style.translate = dx.toFixed(1) + 'px 0'; b.style.setProperty('--ax', (-dx).toFixed(1) + 'px'); }
    const t = setTimeout(() => this._talkEnd?.(), ms);
    this._talkEnd = () => { clearTimeout(t); b.remove(); c.el.classList.remove('talking'); this._talkEnd = null; };
    return b;
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
    const t = this.town, mw = t.width, mh = Math.round(mw * t.aspect), vw = t.panMode ? t.vw : mw, vh = t.panMode ? t.vh : mh, k = mw / t.W;
    let tx, ty;
    if (s === 1) { tx = -(t.panMode ? t.pan : 0); ty = 0; } /* v59：拉回時保留平移的位置 */
    else { tx = vw / 2 - x * k * s; ty = vh / 2 - y * k * s; tx = Math.min(0, Math.max(vw - mw * s, tx)); ty = Math.min(0, Math.max(vh - mh * s, ty)); } /* 不露出插畫外面 */
    t.zoom = { s, tx, ty }; t.world.style.transition = '';
    t.world.style.transform = s === 1 && !tx ? '' : `translate(${tx.toFixed(1)}px,${ty.toFixed(1)}px)` + (s === 1 ? '' : ` scale(${s})`);
    const token = ++this.camToken; if (s !== 1) this.camBusy = true;
    return sleep(820).then(() => { const ok = token === this.camToken; if (ok && s === 1 && this.camBusy) { this.camBusy = false; this.onCamIdle?.(); } return ok; });
  }
  /** v59：每一課鏡頭推近的目標（有寬版地圖＝那一課的標記；沒有＝區域中心；全鎮課回傳 null＝不推近） */
  lessonFocus(lesson) {
    if (this.map) return this.art.pins[String(lesson)]?.at ?? null;
    const i = this.zoneOfLesson(lesson); return i >= 0 ? this._zoneCenter(i) : null;
  }
  flyHome() { return this._zoomTo([0, 0], 1).then(ok => { if (ok) this._showPins(true); return ok; }); }
  _zoneCenter(i) { return i >= 0 ? this.art.zones[this.zoneIds[i]].center : [this.town.W / 2, this.town.H / 2]; }
  async flyToLesson(lesson, { hold = 1.2, zoom = 1.9 } = {}) {
    const f = this.lessonFocus(lesson); if (!f) return true;
    if (this.town.panMode) this.town.pan = this.town._panFor(f[0]); /* v59：拉回後停在那一課 */
    this._showPins(false); this.sound?.whoosh();
    if (!(await this._zoomTo(f, zoom))) return false;
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
    const i = this.zoneOfLesson(lesson), center = this.map ? (this.lessonFocus(lesson) ?? this._zoneCenter(i)) : this._zoneCenter(i);
    if (this.map && this.town.panMode) this.town.pan = this.town._panFor(center[0]);
    this._showPins(false); this.sound?.whoosh(); this.busy = true;
    if (!(await this._zoomTo(center, i >= 0 || this.map ? 1.9 : 1))) { this.busy = false; return false; }
    const token = this.camToken;
    const r = this.map ? (i >= 0 ? this.art.zones[this.zoneIds[i]].r : 260) : i >= 0 ? this.art.zones[this.zoneIds[i]].r : this.town.W / 2, g = this.town.glow;
    g.style.left = ((center[0] - r) / this.town.W * 100) + '%'; g.style.top = ((center[1] - r) / this.town.H * 100) + '%';
    g.style.width = (2 * r / this.town.W * 100) + '%'; g.style.height = (2 * r / this.town.H * 100) + '%';
    g.classList.remove('on'); void g.offsetWidth; g.classList.add('on');
    const vis = [...this.town.chars.values()].filter(c => this._visible(c));
    let rs = this.map ? [] : i >= 0 ? vis.filter(c => c.zone === this.zoneIds[i]) : vis; /* v59 寬版地圖：挑標記附近的朋友 */
    if (rs.length < 2) rs = [...vis].sort((a, b) => Math.hypot(a.at[0] - center[0], a.at[1] - center[1]) - Math.hypot(b.at[0] - center[0], b.at[1] - center[1])).slice(0, 2);
    rs.forEach((c, k) => setTimeout(() => { this.town.pose(c.name, 'happy'); this._anim(c, 'hop', 550); }, 100 + k * 180));
    this.spriteBurst(center, { n: 16, spread: 170 });
    this.lastCelebration = { lesson, zone: this.zoneIds[i] ?? 'global', residents: rs.map(c => c.name), props: 0 };
    await sleep(1900);
    rs.forEach(c => this.town.pose(c.name, 'idle')); this.busy = false;
    return token === this.camToken ? this.flyHome() : false;
  }
  /** v46 聽寫小考考完：不飛鏡頭，地圖上所有朋友一起跳、四處噴彩帶（全對多噴一些） */
  async cheer(perfect = false) {
    if (this.busy) return false;
    this.busy = true; this.sound?.complete();
    const vis = [...this.town.chars.values()].filter(c => this._visible(c)), { W, H } = this.town;
    vis.forEach((c, k) => setTimeout(() => { this.town.pose(c.name, 'happy'); this._anim(c, 'hop', 550); setTimeout(() => this._anim(c, 'hop', 550), 620); }, k * 120));
    const spots = [[W * .25, H * .35], [W * .5, H * .3], [W * .75, H * .35], [W * .35, H * .65], [W * .65, H * .65]];
    spots.forEach((p, k) => setTimeout(() => this.spriteBurst(p, { n: perfect ? 14 : 9, spread: 200, d: 1.3 }), k * 220));
    this.lastCheer = { perfect, residents: vis.map(c => c.name), bursts: spots.length };
    await sleep(2000);
    vis.forEach(c => this.town.pose(c.name, 'idle')); this.busy = false;
    return true;
  }
  // ======== 地圖上的課次標記 ========
  mountPins({ onPick, onStart }) {
    this.onPick = onPick; this.onStart = onStart;
    this.pins = Object.keys(this.lessonToZone).map(l => {
      const p = this.art.pins[l], b = document.createElement('button'); b.type = 'button'; b.className = 't2-pin'; b.dataset.lesson = l;
      b.innerHTML = `<u aria-hidden="true">▼</u><img alt="" draggable="false" src="${this.town.url(p.icon)}"><b>${p.label ?? (l === '0' ? '數' : l)}</b><small></small>`;
      b.style.setProperty('--pc', PIN_COLORS[+l % PIN_COLORS.length]); /* v10：題號改馬卡龍色塊＋白粗邊 */
      b.style.left = (p.at[0] / this.town.W * 100) + '%'; b.style.top = (p.at[1] / this.town.H * 100) + '%';
      if (p.at[0] > this.town.W * 0.8) b.classList.add('edge-r'); else if (p.at[0] < this.town.W * 0.2) b.classList.add('edge-l'); /* v13：課名膠囊不被畫面邊緣切掉 */
      b.addEventListener('pointerdown', e => e.stopPropagation());
      b.addEventListener('click', e => { e.stopPropagation(); this.sound?.unlock(); if (b.classList.contains('active') && this.onStart) this.onStart(+l); else this.onPick?.(+l); }); /* v13：點目前這課的標記＝開始寫字 */
      this.town.world.append(b); return b;
    });
  }
  placePins() { /* 標記用百分比定位，隨版面縮放，不必重算 */ }
  updatePins(activeLesson, counts, locked = new Set()) {
    for (const b of this.pins ?? []) {
      const l = +b.dataset.lesson, c = counts[l];
      b.classList.toggle('active', l === activeLesson); b.classList.toggle('done', !!c && c[0] === c[1]);
      b.classList.toggle('locked', locked.has(l)); /* v56 家長限制的課：灰色＋鎖，點了由 switchChapter 說明 */
      b.querySelector('small').innerHTML = c ? (l === activeLesson ? c[2] + ' ' : '') + `${c[0]}/${c[1]}` + (c[3] ? ` <i>★${c[3]}</i>` : '') : ''; /* v9：c[3]＝星星合計；v13：選中的課加課名（頂部章節列已收起） */
      b.title = c ? `${locked.has(l) ? '（還沒開放）' : ''}${c[2]}（${c[0]}/${c[1]} 字${c[3] != null ? `，★${c[3]}/${c[4]}` : ''}）` : ''; b.setAttribute('aria-label', b.title);
    }
  }
  _showPins(on) { this.town.view.classList.toggle('t2-pins-hidden', !on); }
}

export class Reward2D {
  constructor({ town, lobby, contract, walkMode = false, log = () => {} }) {
    Object.assign(this, { town, lobby, contract, walkMode, log }); /* v59 walkMode：導遊的位置由 Walker 決定，這裡只開關蒸氣、跳一下 */
    this.cfg = contract.art2d.reward; this.npc = this.cfg.npc;
    if (!town.chars.has(this.npc)) throw new Error('NPC_NOT_FOUND:' + this.npc);
    this.rest = town.chars.get(this.npc).home; this.end = this.cfg.to;
    this.state = { atPool: false, steamOn: false }; this.busy = false;
    this.distance = Math.hypot(this.end[0] - this.rest[0], this.end[1] - this.rest[1]);
  }
  /** 重開／載入：由帳本筆數推導固定位置（不累加） */
  applyState({ rewardCount }) {
    if (this.walkMode) { const on = rewardCount > 0; this.town.steam.classList.toggle('on', on); this.state = { atPool: false, steamOn: on }; this.log(`applyState rewardCount=${rewardCount} → steam ${on ? 'on' : 'off'} (walk mode)`); return; }
    const on = rewardCount > 0, el = this.town.chars.get(this.npc).el;
    el.style.transition = 'none'; this.town.place(this.npc, on ? this.end : this.rest); void el.offsetWidth; el.style.transition = '';
    this.town.steam.classList.toggle('on', on); this.state = { atPool: on, steamOn: on };
    this.log(`applyState rewardCount=${rewardCount} → npc ${on ? 'pool' : 'rest'}, steam ${on ? 'on' : 'off'}`);
  }
  play({ rewardNew }) {
    if (!rewardNew) { this.log('reward replay: no new reward, no displacement'); return Promise.resolve(false); }
    const c = this.town.chars.get(this.npc);
    this.busy = true;
    if (this.walkMode) {
      const first = !this.state.steamOn; this.town.steam.classList.add('on'); this.state = { atPool: false, steamOn: true };
      if (first) this.town.pose(this.npc, 'happy');
      c.el.classList.remove('hop'); void c.el.offsetWidth; c.el.classList.add('hop');
      return sleep(first ? 1200 : 560).then(() => { c.el.classList.remove('hop'); if (first) this.town.pose(this.npc, 'idle'); this.busy = false; this.log('reward (walk mode): ' + (first ? 'steam on, hop' : 'hop')); return true; });
    }
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
.al2 .al-card img{position:absolute;left:21%;width:58%;top:31%;height:44%;aspect-ratio:auto;object-fit:contain;object-position:50% 100%;background:none;border-radius:0}
.al2 .al-card.locked img{visibility:hidden}
.al2 .al-card b{position:absolute;left:18%;right:18%;top:82.8%;bottom:auto;transform:translateY(-50%);line-height:1;white-space:nowrap;text-align:center;font-size:clamp(12px,1.9vw,16px)}
.al2 .al-card small{position:absolute;left:4%;right:4%;top:100%;margin-top:2px;text-align:center;font-size:11px;line-height:1.2}
.al2 .al-card.new{border:0;animation:al-glow2 1.2s ease-in-out 3}
@keyframes al-glow2{50%{filter:drop-shadow(0 0 10px rgba(240,140,0,.8))}}
/* v47 手機橫放：圖鑑卡之間的上下距離縮小 */
@media (orientation:landscape) and (max-height:560px){.al2 .al-grid{row-gap:14px;gap:8px}}
/* v51 守門員徽章 */
.al-badges{display:flex;align-items:center;gap:6px;flex-wrap:wrap;justify-content:center;margin:10px 0 0;padding-top:8px;border-top:2px dashed rgba(91,58,74,.15);position:sticky;bottom:-18px;z-index:2;background:#fffdf7;padding-bottom:8px} /* v53：圖鑑要捲時（手機直放），徽章列黏在下面，不用捲到底才看得到 */
.al-badges h3{margin:0 6px 0 0;font-size:15px}
.al-badges i{width:34px;height:34px;border-radius:50%;display:flex;align-items:center;justify-content:center;font:900 14px/1 system-ui;font-style:normal;color:#b9aeb3;border:2px dashed #d8cfd3;background:#fff}
.al-badges i.got{color:#7a4b00;border:2px solid #fff;background:radial-gradient(circle at 35% 30%,#fff3c4,#f2c14e 70%,#c98f2a);box-shadow:0 2px 6px rgba(0,0,0,.25)}
@media (orientation:landscape) and (max-height:560px){.al-badges{margin:4px 0 0;padding-top:4px;bottom:-12px;padding-bottom:4px}.al-badges i{width:26px;height:26px;font-size:12px}.al-badges h3{font-size:13px}}
`;

/** v60 主題的圖鑑卡片名字樣式（太空的名牌是深藍色）：不合格的欄位就不用 */
export function cardCSS(card) {
  if (!card || typeof card !== 'object') return '';
  const col = c => typeof c === 'string' && /^#[0-9a-fA-F]{6}$/.test(c) ? c : null, top = Number.isFinite(card.nameTop) && card.nameTop >= 50 && card.nameTop <= 98 ? card.nameTop : null;
  let css = '';
  if (top != null || col(card.nameColor)) css += `.al2 .al-card b{${top != null ? `top:${top}%;` : ''}${col(card.nameColor) ? `color:${col(card.nameColor)};` : ''}}`;
  if (col(card.lockedColor)) css += `.al2 .al-card.locked b{color:${col(card.lockedColor)}}`;
  return css;
}
export class Album2D extends Album {
  constructor(opts) {
    super(opts);
    if (!document.getElementById('al2-style')) { const s = document.createElement('style'); s.id = 'al2-style'; s.textContent = ALBUM_CSS(this.town.url('card_open'), this.town.url('card_locked')) + cardCSS(opts.card); document.head.append(s); }
    this._refit = () => { clearTimeout(this._fitT); this._fitT = setTimeout(() => this.fitNames(), 350); };
  }
  /** v60 名字放得下：先回到 CSS 的字體大小，放不下就每次縮 1 px，最小 10 px */
  fitNames() {
    if (!this.el) return [];
    return [...this.el.querySelectorAll('.al-card b')].map(b => {
      b.style.fontSize = ''; let fs = parseFloat(getComputedStyle(b).fontSize) || 16;
      while (b.scrollWidth > b.clientWidth + 0.5 && fs > 10) { fs -= 1; b.style.fontSize = fs + 'px'; }
      return fs;
    });
  }
  _snap(object) { const c = this.town.chars.get(object); return c ? this.town.url(c.sprite + '_idle') : ''; }
  open(passed, opts) {
    const r = super.open(passed, opts); this.el?.classList.add('al2'); this.fitNames();
    addEventListener('resize', this._refit); addEventListener('orientationchange', this._refit); return r;
  }
  close() { removeEventListener('resize', this._refit); removeEventListener('orientationchange', this._refit); clearTimeout(this._fitT); super.close(); }
  async visit(r) { this.close(); this.voice?.say(r.name); await this.townFx.flyToResident(r.object); this.lastVisit = r.object; }
}

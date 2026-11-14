// v44 主題（外表）：同一套遊戲換一組圖，例如「甜點樂園」「恐龍島」。
// 進度、星星、獎勵、配件都共用（存檔鍵不含主題）；選哪個主題只記在這台裝置。
// 主題的圖放在自己的資料夾，檔名和甜點版完全相同（capy_cocoa_idle…），所以座標、配件位置都不用重對。
export const SKINS = {
  sweet: { label: '甜點樂園' }, // 預設：契約裡原本的圖
  dino: { label: '恐龍島', config: 'art2d/dino/theme.json' },
  space: { label: '太空探險', config: 'art2d/space/theme.json' }, // v59 寬版地圖、會走路、蓋基地＋組火箭（設計 docs/plans/2026-11-13-space-*.md）
  _test: { label: '測試主題', config: 'art2d/_skin_test/theme.json', hidden: true }, // 只給自動測試用（?skin=_test），不出現在家長頁
};
export const SKIN_KEY = 'capy_skin', DEFAULT_SKIN = 'sweet';
export function currentSkin(qs = new URLSearchParams(location.search)) {
  let want = qs.get('skin');
  if (!want) try { want = localStorage.getItem(SKIN_KEY); } catch { /* 私密模式 */ }
  return SKINS[want] ? want : DEFAULT_SKIN;
}
export function saveSkin(id) { if (!SKINS[id]) return false; try { localStorage.setItem(SKIN_KEY, id); return true; } catch { return false; } }
/** 讀主題設定；圖片清單（manifest）也讀得到才算準備好，否則回傳 null（呼叫端就用預設主題） */
export async function loadSkin(id, gameBase = './game/') {
  const s = SKINS[id]; if (!s?.config) return null;
  try {
    const r = await fetch(gameBase + s.config, { cache: 'no-cache' }); if (!r.ok) return null;
    const cfg = await r.json(); if (cfg.ready === false) return null; // 圖還沒放進來：不去找圖片清單（避免 404）
    const base = gameBase + s.config.replace(/[^/]+$/, '') + (cfg.sprites ?? 'sprites/');
    const manifest = cfg.manifest ?? 'sprites.json', m = await fetch(base + manifest, { cache: 'no-cache' }); if (!m.ok) return null;
    let spriteKeys = null; try { spriteKeys = Object.keys(await m.json()); } catch { return null; } // v59：給 validBuild 檢查建築／火箭圖都在
    return { ...cfg, id, label: s.label, base, manifest, spriteKeys };
  } catch { return null; }
}
/** 把主題套到契約（只改這次載入的物件，不動檔案）：圖片資料夾、標題、配色、朋友名字、圖鑑標題 */
export function applySkin(contract, skin, MAP = null) {
  contract.art2d = { ...contract.art2d, base: skin.base, manifest: skin.manifest };
  if (MAP) { // v59 寬版地圖：整組換掉契約的地圖座標（座標驗證見 validMap）
    const a = contract.art2d;
    contract.art2d = { ...a, size: MAP.size, background: MAP.background, characterHeight: MAP.characterHeight ?? a.characterHeight,
      pins: Object.fromEntries(Object.entries(MAP.pins).map(([l, p]) => [l, { ...a.pins?.[l], ...p }])), zones: MAP.zones,
      residents: Object.fromEntries(Object.entries(a.residents).map(([k, r]) => [k, { ...r, at: MAP.residentAt[k] }])),
      reward: { ...a.reward, to: MAP.reward.to, steamAt: MAP.reward.steamAt } };
  }
  // 主題可以讓每位朋友用不同的角色圖（residentSprites 的順序同 album.residents）；甜點版 8 位朋友共用 4 種外觀
  if (skin.residentSprites) contract.art2d.residents = Object.fromEntries(Object.entries(contract.art2d.residents).map(([k, r]) => { const i = contract.album.residents.findIndex(a => a.object === k), sp = skin.residentSprites[i]; return [k, sp ? { ...r, sprite: sp } : r]; }));
  // 主題的地圖不一樣，朋友站的位置也可以換（residentAt：{朋友代號: [x, y]}）
  if (skin.residentAt && !MAP) contract.art2d.residents = Object.fromEntries(Object.entries(contract.art2d.residents).map(([k, r]) => [k, skin.residentAt[k] ? { ...r, at: skin.residentAt[k] } : r]));
  if (skin.rewardTo && contract.art2d.reward && !MAP) contract.art2d.reward = { ...contract.art2d.reward, to: skin.rewardTo };
  contract.theme = { ...contract.theme, title: skin.title ?? contract.theme.title, ui: { ...contract.theme.ui, ...skin.ui } };
  contract.album = { ...contract.album, title: skin.albumTitle ?? contract.album.title, residents: contract.album.residents.map((r, i) => ({ ...r, name: skin.names?.[i] ?? r.name, ...(typeof skin.notes?.[String(i)] === 'string' ? { note: skin.notes[String(i)] } : {}) })) }; // v60 notes＝圖鑑卡片下面的小字
  return contract;
}
/** 家長頁可以選的主題：預設主題＋圖片已經準備好的主題 */
export async function readySkins(gameBase = './game/', includeHidden = false) {
  const out = [];
  for (const [id, s] of Object.entries(SKINS)) { if (s.hidden && !includeHidden) continue; if (!s.config || await loadSkin(id, gameBase)) out.push({ id, label: s.label }); }
  return out;
}

// ======== v59 寬版地圖設定（主題的 map）：驗證與整理。驗證不過 → 整個主題不用（呼叫端退回甜點樂園） ========
const pt = (p, W, H) => Array.isArray(p) && p.length === 2 && p.every(Number.isFinite) && p[0] >= 0 && p[0] <= W && p[1] >= 0 && p[1] <= H;
export const MAP_LESSONS = ['0', '1', '2', '3', '4', '5', '6', '7']; // 兩個課程用到的所有課號
/** contract＝目前的課程契約（只讀）；allResidents＝兩個課程的朋友代號聯集（主題要涵蓋全部，預設＝目前契約的朋友） */
export function validMap(map, contract, allResidents = Object.keys(contract.art2d.residents)) {
  const errors = [], E = m => errors.push(m);
  if (!map || typeof map !== 'object') return { ok: false, errors: ['map 不是物件'] };
  const [W, H] = Array.isArray(map.size) ? map.size : [];
  if (!(Number.isInteger(W) && W > 0 && Number.isInteger(H) && H > 0)) return { ok: false, errors: ['size 要兩個正整數'] };
  if (typeof map.background !== 'string' || !map.background) E('background');
  if (map.characterHeight != null && !(Number.isFinite(map.characterHeight) && map.characterHeight > 0 && map.characterHeight < 1)) E('characterHeight');
  const lessons = new Set([...MAP_LESSONS, ...Object.keys(contract.art2d.pins ?? {})]);
  for (const l of lessons) { const p = map.pins?.[l]; if (!p || !pt(p.at, W, H) || typeof p.icon !== 'string') E('pins.' + l); }
  for (const z of contract.zones.ids) { const zz = map.zones?.[z]; if (!zz || !pt(zz.center, W, H) || !(zz.r > 0)) E('zones.' + z); }
  const people = new Set([...allResidents, ...Object.keys(contract.art2d.residents)]);
  for (const k of people) if (!pt(map.residentAt?.[k], W, H)) E('residentAt.' + k);
  if (!pt(map.reward?.to, W, H) || !pt(map.reward?.steamAt, W, H)) E('reward');
  if (!pt(map.bossAt, W, H)) E('bossAt'); if (!pt(map.questAt, W, H)) E('questAt');
  const wk = map.walk;
  if (!wk || typeof wk.nodes !== 'object') E('walk.nodes');
  else {
    const ids = Object.keys(wk.nodes);
    for (const id of ids) if (!pt(wk.nodes[id], W, H)) E('walk.nodes.' + id);
    if (!Array.isArray(wk.edges) || !wk.edges.length) E('walk.edges');
    else for (const e of wk.edges) if (!Array.isArray(e) || e.length !== 2 || !(e[0] in wk.nodes) || !(e[1] in wk.nodes) || e[0] === e[1]) E('walk.edges ' + JSON.stringify(e));
    if (ids.length && Array.isArray(wk.edges) && !errors.some(x => x.startsWith('walk.edges'))) { // 連通
      const adj = graphOf(wk), seen = new Set([ids[0]]), q = [ids[0]];
      while (q.length) for (const n of adj.get(q.shift())) if (!seen.has(n)) { seen.add(n); q.push(n); }
      if (seen.size !== ids.length) E('walk 不連通');
    }
    for (const l of lessons) { if (!(wk.pinNode?.[l] in (wk.nodes ?? {}))) E('walk.pinNode.' + l); if (!pt(wk.guideStand?.[l], W, H)) E('walk.guideStand.' + l); }
    for (const k of people) if (!(wk.residentNode?.[k] in (wk.nodes ?? {}))) E('walk.residentNode.' + k);
  }
  return { ok: !errors.length, errors };
}
export function graphOf(walk) {
  const adj = new Map(Object.keys(walk.nodes).map(k => [k, []]));
  for (const [a, b] of walk.edges) { adj.get(a).push(b); adj.get(b).push(a); }
  return adj;
}
/** 回傳 { MAP, error }：主題沒有 map → MAP＝null（照舊）；有但驗證不過 → error（呼叫端整個主題不用） */
export function resolveMap(skin, contract, allResidents) {
  if (!skin?.map) return { MAP: null, error: null };
  const v = validMap(skin.map, contract, allResidents);
  if (!v.ok) return { MAP: null, error: v.errors.slice(0, 8).join('; ') };
  return { MAP: { ...skin.map, pan: skin.map.pan === true }, error: null };
}
/** 兩個課程的朋友代號聯集（課程 2 多第 9 位「奶酪」）；validMap 要求主題涵蓋全部，切換課程時才不會有人沒有座標 */
export const KNOWN_RESIDENTS = ['Resident_static_N101_160', 'Resident_static_N102_157', 'Resident_static_N101_154', 'Resident_static_N101_155', 'Resident_static_N101_156', 'Resident_static_N101_158', 'Resident_static_N102_159', 'Resident_static_N102_153', 'Resident_extra_nani_7'];
/** v59 寬版地圖的畫面大小（§5.1）：aw／ah＝可用寬高，A＝地圖寬／高。回傳畫面 vw×vh、地圖寬 mw、可平移 maxPan */
export function panFit({ aw, ah, A }) {
  const vh = Math.max(200, Math.floor(Math.min(ah, aw / 1.5))), vw = Math.floor(Math.min(aw, vh * A)), mw = Math.round(vh * A);
  return { vw, vh, mw, maxPan: Math.max(0, mw - vw) };
}

// v59 太空主題：用星星「蓋基地＋組火箭」（設計：docs/plans/2026-11-13-space-base-rocket.md §4、§5）。純函式，不碰畫面。
// - 購買記在配件商店同一個存檔 capy_shop_<profileId> 的 purchases：建築 space:b:<id>:<lv>（lv＝2、3）、火箭 space:r:<rocketId>:<k>（k＝1～4）。
// - 可用星數＝總星數 − 所有購買（和 shop.js 的 shopState 同一個算法），所以甜點商店和太空面板看到的數字一樣。
// - 「第 n 枚火箭 4 個零件都買了」＝「第 n 顆星球去過了」，不另外存。
const ID = /^[a-z0-9]+$/, posInt = n => Number.isInteger(n) && n >= 1, posNum = n => Number.isFinite(n) && n > 0, str = s => typeof s === 'string' && s.length > 0;
const inMap = (p, W, H) => Array.isArray(p) && p.length === 2 && p.every(Number.isFinite) && p[0] >= 0 && p[0] <= W && p[1] >= 0 && p[1] <= H;
export const buildItemId = (id, lv) => `space:b:${id}:${lv}`;
export const rocketItemId = (id, k) => `space:r:${id}:${k}`;
export const isSpaceItem = id => typeof id === 'string' && id.startsWith('space:');

/** 設定檢查（§4）；spriteKeys＝主題 sprites.json 的鍵（可省略＝不檢查圖） */
export function validBuild(build, map, spriteKeys = null) {
  const errors = [], E = m => errors.push(m);
  if (!build || typeof build !== 'object') return { ok: false, errors: ['build 不是物件'] };
  const [W, H] = map?.size ?? [];
  const bs = build.buildings;
  if (!Array.isArray(bs) || bs.length !== 8) E('buildings 要 8 棟');
  else {
    const ids = new Set();
    bs.forEach((b, i) => {
      if (!b || !ID.test(b.id ?? '')) E(`buildings[${i}].id`); else if (ids.has(b.id)) E(`buildings[${i}].id 重複`); else ids.add(b.id);
      if (!str(b?.name)) E(`buildings[${i}].name`);
      if (!Array.isArray(b?.prices) || b.prices.length !== 2 || !b.prices.every(posInt)) E(`buildings[${i}].prices`);
      if (!inMap(b?.at, W, H)) E(`buildings[${i}].at`);
      if (!posNum(b?.w)) E(`buildings[${i}].w`);
      for (const k of ['cx', 'by']) if (b?.[k] != null && !(Number.isFinite(b[k]) && b[k] >= 0 && b[k] <= 1)) E(`buildings[${i}].${k}`);
    });
  }
  if (!(Number.isInteger(build.padIndex) && build.padIndex >= 0 && build.padIndex <= 7)) E('padIndex');
  if (!inMap(build.rocketAt, W, H)) E('rocketAt');
  if (!posNum(build.rocketW)) E('rocketW');
  const rs = build.rockets;
  if (!Array.isArray(rs) || rs.length !== 3) E('rockets 要 3 枚');
  else {
    const ids = new Set();
    rs.forEach((r, i) => {
      if (!r || !ID.test(r.id ?? '')) E(`rockets[${i}].id`); else if (ids.has(r.id)) E(`rockets[${i}].id 重複`); else ids.add(r.id);
      if (!str(r?.name)) E(`rockets[${i}].name`);
      if (!Array.isArray(r?.parts) || r.parts.length !== 4 || !r.parts.every(str)) E(`rockets[${i}].parts`);
      if (!Array.isArray(r?.prices) || r.prices.length !== 4 || !r.prices.every(posInt)) E(`rockets[${i}].prices`);
      if (!str(r?.planet?.name)) E(`rockets[${i}].planet.name`);
    });
  }
  if (spriteKeys && !errors.length) {
    const have = new Set(spriteKeys);
    for (let n = 0; n < 8; n++) for (let lv = 1; lv <= 3; lv++) if (!have.has(`build_${n}_${lv}`)) E(`圖 build_${n}_${lv}`);
    for (let r = 1; r <= 3; r++) { for (let s = 1; s <= 4; s++) if (!have.has(`rocket_${r}_${s}`)) E(`圖 rocket_${r}_${s}`); if (!have.has(`planet_${r}`)) E(`圖 planet_${r}`); }
  }
  return { ok: !errors.length, errors };
}

/** 由總星數、設定、商店存檔算出狀態（§5） */
export function buildState({ total, build, data }) {
  const owned = new Set(data.purchases.map(p => p.itemId)), spent = data.purchases.reduce((s, p) => s + p.cost, 0), balance = total - spent;
  const levels = build.buildings.map(b => owned.has(buildItemId(b.id, 2)) ? (owned.has(buildItemId(b.id, 3)) ? 3 : 2) : 1);
  const padLv = levels[build.padIndex];
  const rockets = []; let prevDone = true;
  build.rockets.forEach((r, i) => {
    let parts = 0; while (parts < 4 && owned.has(rocketItemId(r.id, parts + 1))) parts++;
    const unlocked = prevDone && padLv >= i + 1;
    rockets.push({ id: r.id, index: i, parts, unlocked, done: parts === 4, lockedBy: unlocked ? null : !prevDone ? 'prev' : 'pad' });
    prevDone = prevDone && parts === 4;
  });
  const offer = (itemId, price) => ({ itemId, price, canBuy: balance >= price, need: Math.max(0, price - balance) });
  const next = {
    buildings: build.buildings.map((b, i) => levels[i] >= 3 ? null : offer(buildItemId(b.id, levels[i] + 1), b.prices[levels[i] - 1])),
    rocket: null,
  };
  const cur = rockets.find(r => !r.done);
  if (cur) { const r = build.rockets[cur.index]; next.rocket = { ...offer(rocketItemId(r.id, cur.parts + 1), r.prices[cur.parts]), rocket: cur.index, part: cur.parts, locked: cur.lockedBy }; if (cur.lockedBy) next.rocket.canBuy = false; }
  return { total, spent, balance, levels, rockets, current: cur ? cur.index : null, planets: rockets.filter(r => r.done).map(r => r.index), next };
}

/** 解析購買代號 → { kind:'b', index, lv, price } 或 { kind:'r', index, k, price }；不合格回傳 null */
export function parseItem(build, itemId) {
  const m = /^space:(b|r):([a-z0-9]+):(\d)$/.exec(itemId ?? ''); if (!m) return null;
  const n = +m[3];
  if (m[1] === 'b') { const i = build.buildings.findIndex(b => b.id === m[2]); if (i < 0 || n < 2 || n > 3) return null; return { kind: 'b', index: i, lv: n, price: build.buildings[i].prices[n - 2] }; }
  const i = build.rockets.findIndex(r => r.id === m[2]); if (i < 0 || n < 1 || n > 4) return null; return { kind: 'r', index: i, k: n, price: build.rockets[i].prices[n - 1] };
}

/** 買呼叫端確認的那一件（完整代號）；用剛讀出來的存檔檢查。回傳 { data, error, item }，有 error 時 data 不變 */
export function buyBuild(data, itemId, { build, total, now = new Date() }) {
  const item = parseItem(build, itemId); if (!item) return { data, error: '找不到這個東西' };
  if (data.purchases.some(p => p.itemId === itemId)) return { data, error: '已經有了', item };
  const st = buildState({ total, build, data });
  if (item.kind === 'b') {
    if (st.levels[item.index] !== item.lv - 1) return { data, error: '要先升級到 ' + (item.lv - 1) + ' 級', item };
  } else {
    const r = st.rockets[item.index];
    if (!r.unlocked) return { data, error: r.lockedBy === 'pad' ? `要先把發射台升到 ${item.index + 1} 級` : '要先把前一枚火箭做好', item };
    if (r.parts !== item.k - 1) return { data, error: '要照順序裝零件', item };
  }
  if (st.balance < item.price) return { data, error: '星星還不夠', item };
  return { data: { ...data, purchases: [...data.purchases, { itemId, cost: item.price, boughtAt: now.toISOString() }] }, error: null, item };
}

/** 家長面板用：只看前綴，不需要設定（甜點樂園也看得到） */
export function spaceSummary(data) {
  const sp = data.purchases.filter(p => isSpaceItem(p.itemId)); if (!sp.length) return null;
  const builds = sp.filter(p => p.itemId.startsWith('space:b:')).length, parts = sp.filter(p => p.itemId.startsWith('space:r:'));
  const planets = new Set(parts.filter(p => p.itemId.endsWith(':4')).map(p => p.itemId.split(':')[2])).size;
  return { builds, parts: parts.length, planets, cost: sp.reduce((s, p) => s + p.cost, 0) };
}

// v18 配件商店（資料與規則，不碰畫面）：孩子用星星買配件，給已解鎖的朋友戴。
// - 兩本帳：配件可用星數＝總星數 − 已買配件的價錢（同一件只算一次）；和 v17 家長獎勵（rewards.js）互不影響。
// - 買一次永久擁有、不能退；買過的配件所有朋友都能戴；每位朋友每個位置（髮夾／帽子／身邊小物）最多一件。
// - 存在 localStorage `capy_shop_<profileId>`：{ version:1, purchases:[{itemId,cost,boughtAt}], outfits:{<居民 object>:{clip,hat,side,updatedAt}} }
//   cost 是購買當下的價錢快照，之後調價不影響已買的。
// - 配件目錄與對位表在 art2d/accessories.json（build_accessories.py 產生、anchor-tool.html 調整）。
export const shopKey = profileId => 'capy_shop_' + profileId;
export const SLOTS = ['clip', 'hat', 'side'];
const isInt = n => Number.isInteger(n) && n >= 1;
export const emptyShop = () => ({ version: 1, purchases: [], outfits: {} });

/** 把讀進來的東西整理成合法結構；壞掉的項目丟掉（不丟錯）；同一件買兩次只留較早那筆 */
export function normalizeShop(obj) {
  const out = emptyShop();
  if (!obj || typeof obj !== 'object') return out;
  const seen = new Map();
  for (const p of Array.isArray(obj.purchases) ? obj.purchases : []) {
    if (!p || typeof p.itemId !== 'string') continue;
    const gift = p.gift === true && p.cost === 0; // v50：朋友送的配件（不花星星）
    if (!gift && !isInt(p.cost)) continue;
    const r = gift ? { itemId: p.itemId, cost: 0, gift: true, boughtAt: String(p.boughtAt || '') } : { itemId: p.itemId, cost: p.cost, boughtAt: String(p.boughtAt || '') }, old = seen.get(r.itemId);
    // 同一件有多筆：花星星買的一律優先於禮物（付過星星的證據不能被禮物紀錄取代）；同類才留較早的
    if (!old || (old.gift && !r.gift) || (!!old.gift === !!r.gift && r.boughtAt && r.boughtAt < old.boughtAt)) seen.set(r.itemId, r);
  }
  out.purchases = [...seen.values()];
  const owned = new Set(seen.keys());
  if (obj.outfits && typeof obj.outfits === 'object') for (const [who, o] of Object.entries(obj.outfits)) {
    if (!o || typeof o !== 'object') continue;
    const r = { updatedAt: String(o.updatedAt || '') }; for (const s of SLOTS) r[s] = typeof o[s] === 'string' && owned.has(o[s]) ? o[s] : null;
    out.outfits[who] = r;
  }
  return out;
}
export function loadShop(key) { try { return normalizeShop(JSON.parse(localStorage.getItem(key) || 'null')); } catch { return emptyShop(); } }
export function saveShop(key, data) { try { localStorage.setItem(key, JSON.stringify(data)); return true; } catch { return false; } }

/**
 * 由總星數、目錄與商店資料算出狀態（純函式）。
 * balance 可以是負的（寫字紀錄被清掉、或合併備份後）：已買的照樣能戴，補回來以前不能再買。
 */
export function shopState({ total, catalog, data }) {
  const owned = new Set(data.purchases.map(p => p.itemId)), spent = data.purchases.reduce((s, p) => s + p.cost, 0), balance = total - spent;
  const items = catalog.items.map(i => ({ ...i, owned: owned.has(i.id), canBuy: !owned.has(i.id) && balance >= i.price, need: owned.has(i.id) ? 0 : Math.max(0, i.price - balance) }));
  return { total, spent, balance, owned, items, ownedCount: owned.size, allOwned: catalog.items.every(i => owned.has(i.id)) };
}
export const outfitOf = (data, who) => ({ clip: null, hat: null, side: null, ...(data.outfits[who] ?? {}) });

/** 以下操作都回傳 { data, error }；有 error 時 data 不變。now 可注入（測試用）。 */
export function buyItem(data, item, { total, now = new Date() }) {
  if (!item || !isInt(item.price)) return { data, error: '找不到這個配件' };
  if (data.purchases.some(p => p.itemId === item.id)) return { data, error: '已經買過了' };
  const spent = data.purchases.reduce((s, p) => s + p.cost, 0);
  if (total - spent < item.price) return { data, error: '星星還不夠' };
  return { data: { ...data, purchases: [...data.purchases, { itemId: item.id, cost: item.price, boughtAt: now.toISOString() }] } };
}
/** v50 朋友送的配件：已經有（不論買的或送的）就不變；否則加一筆 cost 0 的禮物紀錄 */
export function giftItem(data, itemId, { now = new Date() } = {}) {
  if (typeof itemId !== 'string' || !itemId || data.purchases.some(p => p.itemId === itemId)) return data;
  return { ...data, purchases: [...data.purchases, { itemId, cost: 0, gift: true, boughtAt: now.toISOString() }] };
}
/**
 * v50 禮物配件和 extras 存檔的雙向對帳（純函式；沒有變動就回傳原物件）：
 * - 補：extras.gifts 有 itemId、商店完全沒有這件 → 補一筆禮物紀錄（第二步寫入失敗、舊版程式丟掉禮物紀錄）。
 * - 刪：商店裡 gift 的紀錄沒有被任何 extras.gifts[*].itemId 指到 → 移除，戴著的位置清掉（備份合併後本機留的是星星禮物）。
 * 花星星買的紀錄完全不動。
 */
export function reconcileGiftItems(data, extras, { now = new Date() } = {}) {
  const want = new Set(Object.values(extras?.gifts ?? {}).map(g => g?.itemId).filter(Boolean));
  const keep = data.purchases.filter(p => !p.gift || want.has(p.itemId)), have = new Set(keep.map(p => p.itemId));
  const add = [...want].filter(id => !have.has(id)).map(itemId => ({ itemId, cost: 0, gift: true, boughtAt: now.toISOString() }));
  if (keep.length === data.purchases.length && !add.length) return data;
  return normalizeShop({ ...data, purchases: [...keep, ...add] });
}
/** 給朋友 who 的 slot 戴上 itemId（null＝拿下來）；只能戴買過的 */
export function wearItem(data, who, slot, itemId, { now = new Date() } = {}) {
  if (!SLOTS.includes(slot)) return { data, error: '沒有這個位置' };
  if (itemId != null && !data.purchases.some(p => p.itemId === itemId)) return { data, error: '還沒買這個配件' };
  return { data: { ...data, outfits: { ...data.outfits, [who]: { ...outfitOf(data, who), [slot]: itemId, updatedAt: now.toISOString() } } } };
}

/** 備份還原用的合併：購買依 itemId 聯集（同一件取較早買的那筆，只算一次錢）；造型依朋友取 updatedAt 較新的（一樣新就留本機的）。 */
export function mergeShop(cur, inc) {
  const a = normalizeShop(cur), b = normalizeShop(inc);
  const outfits = { ...a.outfits }; for (const [who, o] of Object.entries(b.outfits)) if (!outfits[who] || o.updatedAt > outfits[who].updatedAt) outfits[who] = o;
  return normalizeShop({ version: 1, purchases: [...a.purchases, ...b.purchases], outfits });
}
/** 給 backup.js 用：兩邊都是 localStorage 的字串；備份那份壞掉就維持本機的 */
export function mergeShopJSON(curStr, incStr) {
  let inc; try { inc = JSON.parse(incStr); } catch { return curStr; }
  let cur = null; try { cur = JSON.parse(curStr ?? 'null'); } catch { /* 本機壞掉就當空的 */ }
  return JSON.stringify(mergeShop(cur, inc));
}

/** 讀配件目錄；讀不到回傳 null（商店不出現，遊戲照常） */
export async function loadCatalog(url) {
  try { const r = await fetch(url, { cache: 'no-cache' }); if (!r.ok) return null; const c = await r.json(); return Array.isArray(c.items) && c.anchors ? c : null; } catch { return null; }
}

/**
 * 把配件圖 img 擺到角色圖外框上（外框＝和角色圖同大小、position:relative 的容器）。座標定義見 art2d/build_accessories.py：
 * 配件寬＝角色圖高 × size × s；配件的 (px,py) 對到掛點 (x,y)；繞這一點轉 (anchor.rot + item.rot) 度。
 * aspect＝這個姿勢角色圖的寬／高（寬度要換算成外框寬的百分比）。和 anchor-tool.html 的 wear() 同一套算法。
 */
// v56：髮夾整組放大（不改 accessories.json／主題設定裡調好的每件 size；對位點在配件中心，以掛點為中心變大）。anchor-tool.html 的 wear() 用同一組倍數
export const SLOT_SCALE = Object.freeze({ clip: 1.2 });
export const slotScale = item => SLOT_SCALE[item?.slot] ?? 1;
export function placeAccessory(img, item, an, aspect) {
  img.style.left = an.x * 100 + '%'; img.style.top = an.y * 100 + '%';
  img.style.width = (item.size * slotScale(item) * an.s / aspect * 100).toFixed(2) + '%';
  img.style.transformOrigin = `${item.px * 100}% ${item.py * 100}%`;
  img.style.transform = `translate(${-item.px * 100}%,${-item.py * 100}%) rotate(${an.rot + (item.rot || 0)}deg)`;
}

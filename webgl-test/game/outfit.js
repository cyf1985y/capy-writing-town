// v64 換衣服（整隻重畫）：衣服＝「同一隻角色、同樣姿勢、穿著衣服」的另一組角色圖。這裡只有純函式（Node 可測）。
// 設計：docs/plans/2026-11-14-outfit-full-redraw.md §4。圖和清單由 art2d/outfit_tool.py 產生。
// - 衣服目錄 art2d/outfits.json：{ version, pad, items:[{ id, variant, name, price }] }
// - 每個主題的衣服圖清單 <主題圖片資料夾>/outfits_sprites.json：{ "<sprite>__<variant>_<pose>": { file, w, h } }
// - 衣服圖的外框＝原圖外框四邊各加 pad（原圖高的比例）；顯示時角色的框（fig）不變，衣服圖往四邊凸出去（frameStyle）。
export const OUTFIT_POSES = ['idle', 'happy', 'surprised', 'wave'];
export const variantKey = (sprite, variant, pose) => `${sprite}__${variant}_${pose}`;
const okEntry = m => !!m && typeof m.file === 'string' && m.file !== '' && m.w > 0 && m.h > 0;
/** 這個外觀的 4 個姿勢都有圖才算有 */
export function hasVariant(manifest, sprite, variant) {
  return !!manifest && typeof manifest === 'object' && OUTFIT_POSES.every(p => okEntry(manifest[variantKey(sprite, variant, p)]));
}
const okItem = i => !!i && typeof i.id === 'string' && i.id !== '' && typeof i.variant === 'string' && /^[a-z0-9]+$/.test(i.variant)
  && typeof i.name === 'string' && i.name !== '' && Number.isInteger(i.price) && i.price >= 1;
export const validPad = pad => Number.isFinite(pad) && pad >= 0 && pad <= 0.3;
/**
 * 這個主題可以上架的衣服（商店目錄項目）。sprites＝這個主題所有朋友用到的角色圖前綴。
 * 任何一種外觀缺圖，那套衣服整套不上架（不讓孩子買了卻有朋友不能穿）。設定檔壞掉／沒有 → 空陣列。
 */
export function availableOutfits(doc, manifest, sprites) {
  if (!doc || typeof doc !== 'object' || !Array.isArray(doc.items) || !validPad(doc.pad)) return [];
  if (!manifest || typeof manifest !== 'object') return [];
  const list = [...new Set(sprites ?? [])].filter(s => typeof s === 'string' && s); if (!list.length) return [];
  const seen = new Set(), out = [];
  for (const i of doc.items) {
    if (!okItem(i) || seen.has(i.id) || !list.every(s => hasVariant(manifest, s, i.variant))) continue;
    seen.add(i.id); out.push({ id: i.id, slot: 'body', kind: 'outfit', variant: i.variant, name: i.name, price: i.price });
  }
  return out;
}
/** 衣服圖相對於角色框（＝原圖的框）的位置：baseMeta＝原圖的 { w, h }；回傳百分比字串 */
export function frameStyle(baseMeta, pad) {
  const px = pad * baseMeta.h / baseMeta.w, f = v => (v * 100).toFixed(2) + '%';
  return { left: f(-px), top: f(-pad), width: f(1 + 2 * px), height: f(1 + 2 * pad) };
}
/** outfit.body 是「衣服」項目 → 它的 variant；沒穿／不是衣服／目錄裡沒有 → null。byId＝Map（商品 id → 目錄項目） */
export function variantOf(byId, outfit) {
  const id = outfit?.body; if (typeof id !== 'string' || !id) return null;
  const it = byId?.get?.(id); return it?.kind === 'outfit' && typeof it.variant === 'string' ? it.variant : null;
}
/**
 * v70 戴帽子自動換成「沒毛巾」的圖（docs/plans/2026-11-16-hat-hides-towel.md）：水豚頭上的溫泉毛巾是原圖的一部分，小帽子蓋不住。
 * 沒毛巾的圖和衣服圖放在同一份清單、同樣的外框（原圖＋pad）：沒穿衣服＝<sprite>__nt_<pose>，穿著衣服＝<sprite>__<variant>_nt_<pose>。
 * 只有「這個外觀這個組合 4 個姿勢都有沒毛巾的圖」才換；兔子、恐龍沒有這種圖，照舊。
 */
export const HATLESS = 'nt';
export const hatlessVariant = variant => (variant ? variant + '_' + HATLESS : HATLESS);
/** 現在要畫哪一組圖（清單裡的 variant 名稱；null＝原圖）。wear＝穿著的衣服 variant 或 null；hat＝帽子格有沒有戴東西 */
export function drawVariant(manifest, sprite, wear, hat) {
  const w = typeof wear === 'string' && wear ? wear : null;
  return hat && hasVariant(manifest, sprite, hatlessVariant(w)) ? hatlessVariant(w) : w;
}

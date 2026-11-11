// v44 主題（外表）：同一套遊戲換一組圖，例如「甜點樂園」「恐龍島」。
// 進度、星星、獎勵、配件都共用（存檔鍵不含主題）；選哪個主題只記在這台裝置。
// 主題的圖放在自己的資料夾，檔名和甜點版完全相同（capy_cocoa_idle…），所以座標、配件位置都不用重對。
export const SKINS = {
  sweet: { label: '甜點樂園' }, // 預設：契約裡原本的圖
  dino: { label: '恐龍島', config: 'art2d/dino/theme.json' },
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
    return { ...cfg, id, label: s.label, base, manifest };
  } catch { return null; }
}
/** 把主題套到契約（只改這次載入的物件，不動檔案）：圖片資料夾、標題、配色、朋友名字、圖鑑標題 */
export function applySkin(contract, skin) {
  contract.art2d = { ...contract.art2d, base: skin.base, manifest: skin.manifest };
  // 主題可以讓每位朋友用不同的角色圖（residentSprites 的順序同 album.residents）；甜點版 8 位朋友共用 4 種外觀
  if (skin.residentSprites) contract.art2d.residents = Object.fromEntries(Object.entries(contract.art2d.residents).map(([k, r]) => { const i = contract.album.residents.findIndex(a => a.object === k), sp = skin.residentSprites[i]; return [k, sp ? { ...r, sprite: sp } : r]; }));
  // 主題的地圖不一樣，朋友站的位置也可以換（residentAt：{朋友代號: [x, y]}）
  if (skin.residentAt) contract.art2d.residents = Object.fromEntries(Object.entries(contract.art2d.residents).map(([k, r]) => [k, skin.residentAt[k] ? { ...r, at: skin.residentAt[k] } : r]));
  if (skin.rewardTo && contract.art2d.reward) contract.art2d.reward = { ...contract.art2d.reward, to: skin.rewardTo };
  contract.theme = { ...contract.theme, title: skin.title ?? contract.theme.title, ui: { ...contract.theme.ui, ...skin.ui } };
  contract.album = { ...contract.album, title: skin.albumTitle ?? contract.album.title, residents: contract.album.residents.map((r, i) => ({ ...r, name: skin.names?.[i] ?? r.name })) };
  return contract;
}
/** 家長頁可以選的主題：預設主題＋圖片已經準備好的主題 */
export async function readySkins(gameBase = './game/', includeHidden = false) {
  const out = [];
  for (const [id, s] of Object.entries(SKINS)) { if (s.hidden && !includeHidden) continue; if (!s.config || await loadSkin(id, gameBase)) out.push({ id, label: s.label }); }
  return out;
}

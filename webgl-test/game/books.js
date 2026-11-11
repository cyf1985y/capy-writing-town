// v19 課本版本：每個版本一份契約（題庫、課次、地圖標記、朋友）。
// 進度、星星、家長獎勵、配件、複習紀錄都按版本分開存：profileId 加上版本後綴（康軒沒有後綴，舊存檔不受影響）。
// 選擇存在這台裝置的 localStorage `capy_book`（家長面板切換）；網址 ?book=<id> 只影響這一次，不會記住。
export const BOOKS = {
  kangxuan_1a: { label: '康軒 一上', contract: 'game/contract_v12.json', suffix: '' },
  nani_1a: { label: '南一 一上', contract: 'webgl-test/game/textbooks/contract_nani_1a.json', suffix: '@nani_1a', enrichment: 'textbooks/nani_1a_enrichment.json' },
};
export const DEFAULT_BOOK = 'kangxuan_1a', BOOK_KEY = 'capy_book';
export function currentBook(qs = new URLSearchParams(location.search)) {
  let want = qs.get('book');
  if (!want) try { want = localStorage.getItem(BOOK_KEY); } catch { /* 私密模式 */ }
  return BOOKS[want] ? want : DEFAULT_BOOK;
}
export function saveBook(id) { if (!BOOKS[id]) return false; try { localStorage.setItem(BOOK_KEY, id); return true; } catch { return false; } }
export const profileFor = (base, id) => base + (BOOKS[id]?.suffix ?? '');
/** 上次選的課存在哪個 localStorage 鍵（康軒沿用舊鍵） */
export const lessonKeyFor = id => 'capy_lesson' + (BOOKS[id]?.suffix ?? '');

// v19 課程：每個課程一份契約（題庫、課次、地圖標記、朋友）。v55 改成「課程 1／課程 2」，題庫和契約在 courses/（build_courses.py 產生）。
// 進度、星星、家長獎勵、配件、複習紀錄都按課程分開存：profileId 加上後綴（課程 1 沒有後綴）。id 和後綴不能改，否則舊存檔讀不到。
// 選擇存在這台裝置的 localStorage `capy_book`（家長面板切換）；網址 ?book=<id> 只影響這一次，不會記住。
export const BOOKS = {
  kangxuan_1a: { label: '課程 1', contract: 'webgl-test/game/courses/course1.json', suffix: '' },
  nani_1a: { label: '課程 2', contract: 'webgl-test/game/courses/course2.json', suffix: '@nani_1a', enrichment: 'courses/course2_enrichment.json' },
};
export const DEFAULT_BOOK = 'kangxuan_1a', BOOK_KEY = 'capy_book';
export function currentBook(qs = new URLSearchParams(location.search)) {
  let want = qs.get('book');
  if (!want) try { want = localStorage.getItem(BOOK_KEY); } catch { /* 私密模式 */ }
  return BOOKS[want] ? want : DEFAULT_BOOK;
}
export function saveBook(id) { if (!BOOKS[id]) return false; try { localStorage.setItem(BOOK_KEY, id); return true; } catch { return false; } }
export const profileFor = (base, id) => base + (BOOKS[id]?.suffix ?? '');
/** 上次選的課存在哪個 localStorage 鍵（課程 1 沿用舊鍵） */
export const lessonKeyFor = id => 'capy_lesson' + (BOOKS[id]?.suffix ?? '');

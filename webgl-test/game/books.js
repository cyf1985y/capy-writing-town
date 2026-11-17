// v19 課程：每個課程一份契約（題庫、課次、地圖標記、朋友）。v55 改成「課程 1／課程 2」，題庫和契約在 courses/（build_courses.py 產生）。
// 進度、星星、家長獎勵、配件、複習紀錄都按課程分開存：profileId 加上後綴（課程 1 沒有後綴）。後綴不能改，否則舊存檔讀不到。
// 選擇存在這台裝置的 localStorage `capy_book`（家長面板切換）；網址 ?book=<id> 只影響這一次，不會記住。
// v72 兩種樣子（設計 docs/plans/2026-11-17-appstore-app-web-flavors.md §2、§6）：
//   App＝課程 1／課程 2、依筆畫數自編的分組（courses/course*.json）；網頁＝課程名稱和分組照課本（courses/web/，App 打包時排除）。
//   課程 id 改成 course1／course2（網址、備份檔用）；舊 id（legacyId）照樣認得。存檔後綴 '@nani_1a' 不改（裝置裡的資料不搬）。
import { isApp } from './app-env.js?v=72';
const C = 'webgl-test/game/courses/';
export const BOOKS = {
  course1: { label: '課程 1', contract: C + 'course1.json', webContract: C + 'web/course1.json', suffix: '', legacyId: 'kangxuan_1a' },
  course2: { label: '課程 2', contract: C + 'course2.json', webContract: C + 'web/course2.json', suffix: '@nani_1a', legacyId: 'nani_1a', enrichment: 'courses/course2_enrichment.json' },
};
export const DEFAULT_BOOK = 'course1', BOOK_KEY = 'capy_book';
/** 網頁專用的課程名稱檔（相對專案根目錄；App 裡沒有這個檔） */
export const WEB_LABELS = C + 'web/books.json';
/** 新舊 id 都轉成新 id；不認得回傳 null */
export const bookId = id => (BOOKS[id] ? id : Object.keys(BOOKS).find(k => BOOKS[k].legacyId === id) ?? null);
export const FLAVORS = ['app', 'web'];
/** App 裡是 app；瀏覽器是 web。?test=1&flavor=app|web 可以指定（測試用） */
export function currentFlavor(qs = new URLSearchParams(location.search), app = isApp()) {
  const f = qs.get('test') === '1' ? qs.get('flavor') : null;
  return FLAVORS.includes(f) ? f : app ? 'app' : 'web';
}
/** 這個課程、這種樣子要讀哪一份契約（相對專案根目錄） */
export const contractFor = (id, flavor) => (flavor === 'web' ? BOOKS[id].webContract : BOOKS[id].contract);
export function currentBook(qs = new URLSearchParams(location.search)) {
  let want = qs.get('book');
  if (!want) try { want = localStorage.getItem(BOOK_KEY); } catch { /* 私密模式 */ }
  return bookId(want) ?? DEFAULT_BOOK;
}
export function saveBook(id) { const b = bookId(id); if (!b) return false; try { localStorage.setItem(BOOK_KEY, b); return true; } catch { return false; } }
export const profileFor = (base, id) => base + (BOOKS[bookId(id)]?.suffix ?? '');
/** 上次選的課存在哪個 localStorage 鍵（課程 1 沿用舊鍵） */
export const lessonKeyFor = id => 'capy_lesson' + (BOOKS[bookId(id)]?.suffix ?? '');
/** 網頁：讀網頁專用的課程名稱（courses/web/books.json），套進 BOOKS[*].label。讀不到就用預設名稱。base＝專案根目錄相對頁面的前綴。回傳實際用的名稱 */
export async function applyWebLabels(base, flavor) {
  if (flavor !== 'web') return null;
  try {
    const r = await fetch(base + WEB_LABELS + '?v=72'); if (!r.ok) return null;
    const j = await r.json();
    for (const [id, l] of Object.entries(j?.labels ?? {})) if (BOOKS[id] && typeof l === 'string' && l && l.length <= 12) BOOKS[id].label = l;
    return Object.fromEntries(Object.entries(BOOKS).map(([k, v]) => [k, v.label]));
  } catch { return null; }
}
/** 讀契約：網頁那一份讀不到（例如網頁的檔沒有跟著進 App）就改讀 App 那一份。回傳 { loaded, file, fellBack } */
export async function loadBookContract(loadContract, base, id, flavor) {
  const file = contractFor(id, flavor);
  try { return { loaded: await loadContract(base, file), file, fellBack: false }; }
  catch (e) {
    if (flavor !== 'web' || !/HTTP 404/.test(String(e?.message))) throw e;
    const f2 = contractFor(id, 'app'); return { loaded: await loadContract(base, f2), file: f2, fellBack: true };
  }
}

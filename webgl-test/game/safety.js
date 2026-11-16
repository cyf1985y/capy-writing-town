// v69 存檔安全：網址上的測試參數什麼時候才算數（純函式，Node 可測）。
// 設計：docs/plans/2026-11-16-save-safety-backup-tw-appversion.md §A
export const DEFAULT_PROFILE = 'local-child-1';

/** 本機開發伺服器：http://127.0.0.1 或 http://localhost。App 是 capacitor://localhost（iOS）、https://localhost（Android），不算。 */
export const isDevHost = loc => loc?.protocol === 'http:' && (loc.hostname === '127.0.0.1' || loc.hostname === 'localhost');

/**
 * reset=1（清空這個 profile 的存檔）什麼時候才算數：
 * 一定要同時有 test=1；而且（在本機開發伺服器上，或「實際要清的那個 profile」不是任何一個課程的正式存檔）。
 * profileId＝解析之後的 id（已經加上課程後綴）；realProfiles＝每個課程的正式存檔 id。
 * 比的是解析之後的 id，不是網址上的字：?profile=local-child-1@nani_1a（課程 1）解析出來就是課程 2 的正式存檔。
 * → 正式網站和 App 上，孩子真正的存檔沒有任何網址可以清掉。
 */
export function resetAllowed({ test, reset, profileId, realProfiles, loc }) {
  if (reset !== '1' || test !== '1') return false;
  if (isDevHost(loc)) return true;
  return typeof profileId === 'string' && profileId !== '' && Array.isArray(realProfiles) && realProfiles.length > 0 && !realProfiles.includes(profileId);
}

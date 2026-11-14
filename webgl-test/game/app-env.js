// v54 App 版（Capacitor iOS 包裝）的共用處理。設計：docs/plans/2026-11-12-app-store-readiness.md §3、§5、§6
// 網站版（沒有 window.Capacitor）一律走原本的行為；App 裡才換成原生外掛（App 內 Safari、存檔、分享、列印）。
export const isApp = () => window.Capacitor?.isNativePlatform?.() === true;
/** App 裡的原生外掛（Capacitor 注入的 Capacitor.Plugins.<名稱>）；網站版或沒裝好回傳 null */
export const plugin = name => (isApp() ? window.Capacitor?.Plugins?.[name] ?? null : null);
export const appInfo = () => ({ native: isApp(), plugins: ['Browser', 'Filesystem', 'Share', 'CapyPrint'].filter(n => plugin(n)) });

/** 外部網站（教育部筆順、辭典）：網站版另開分頁；App 裡先過家長確認，再用 App 內 Safari 打開 */
export async function openExternal(url, { log = () => {} } = {}) {
  if (!isApp()) { window.open(url, '_blank', 'noopener'); return true; }
  const { parentGate } = await import('./parent-gate.js?v=63');
  if (!(await parentGate({ reason: 'link', log }))) return false;
  const B = plugin('Browser');
  if (!B) { log('external unavailable'); window.alert('App 裡現在打不開外部網站，請用 Safari 開。'); return false; }
  try { await B.open({ url }); log('external open'); return true; } catch (e) { log('external failed ' + (e?.message || e)); return false; }
}

/**
 * 把文字存成檔案交給使用者（備份、核對結果）。回傳 { via, name, bytes }：
 * via＝share（分享面板）、download（網站版下載）、cancel（使用者取消）、unavailable（App 裡外掛拿不到：不能假裝成功）
 */
export async function shareTextFile(name, text, { mime = 'application/json', log = () => {} } = {}) {
  const blob = new Blob([text], { type: mime }), bytes = blob.size;
  if (isApp()) {
    const F = plugin('Filesystem'), S = plugin('Share');
    if (!F || !S) { log('export unavailable'); return { via: 'unavailable', name, bytes }; }
    const w = await F.writeFile({ path: name, data: text, directory: 'CACHE', encoding: 'utf8' });
    try { await S.share({ title: name, files: [w.uri] }); log('export share ' + name); return { via: 'share', name, bytes }; }
    catch (e) { const m = String(e?.message ?? e?.errorMessage ?? e); if (/cancel/i.test(m)) return { via: 'cancel', name, bytes }; throw e; }
  }
  const file = typeof File === 'function' ? new File([blob], name, { type: mime }) : null;
  if (file && navigator.canShare?.({ files: [file] })) { try { await navigator.share({ files: [file], title: name }); return { via: 'share', name, bytes }; } catch (e) { if (e?.name === 'AbortError') return { via: 'cancel', name, bytes }; } }
  const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: name }); document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  return { via: 'download', name, bytes };
}

/** 外部連結：<a href=… data-ext>，點了改走 openExternal（網站版效果和 target=_blank 相同） */
export function bindExternalLinks(root, log) {
  root.addEventListener('click', e => { const a = e.target.closest?.('a[data-ext]'); if (!a) return; e.preventDefault(); e.stopPropagation(); openExternal(a.href, { log }); });
}

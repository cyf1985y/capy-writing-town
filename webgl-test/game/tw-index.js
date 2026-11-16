// v69 台灣筆順索引（vendor-v2/hanzi-writer/data-tw/index.json）是必要教材：讀不到就不能開始，
// 不能無聲地退回原始筆順資料。設計：docs/plans/2026-11-16-save-safety-backup-tw-appversion.md §C
const plain = o => !!o && typeof o === 'object' && !Array.isArray(o);

/**
 * 讀索引。最多試 tries 次，第 i 次失敗後等 waits[i-1] 毫秒（不夠用最後一個）；每一次最多等 timeoutMs（請求一直不回來也算失敗）。
 * 一次算成功：在時限內 response.ok、JSON 解得開、chars 是一般物件而且至少有一個字。
 * 回傳 { chars, attempts }；都失敗丟 Error('TW_INDEX_UNAVAILABLE')（detail 記每次失敗的原因）。
 */
export async function loadTwIndex(url, { tries = 3, waits = [600, 1500], timeoutMs = 8000, fetchFn = (u, o) => fetch(u, o), sleep = ms => new Promise(r => setTimeout(r, ms)) } = {}) {
  const why = [];
  for (let i = 1; i <= tries; i += 1) {
    const ac = new AbortController(); let timer = null;
    try {
      const timeout = new Promise((_, rej) => { timer = setTimeout(() => { ac.abort(); rej(new Error('TIMEOUT')); }, timeoutMs); });
      const chars = await Promise.race([timeout, (async () => { // 讀內容也算在時限內
        const r = await fetchFn(url, { cache: 'no-cache', signal: ac.signal });
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return (await r.json())?.chars;
      })()]);
      if (!plain(chars) || !Object.keys(chars).length) throw new Error('EMPTY_INDEX');
      return { chars, attempts: i };
    } catch (e) { why.push(String(e?.message || e)); }
    finally { clearTimeout(timer); }
    if (i < tries) await sleep(waits[Math.min(i - 1, waits.length - 1)] ?? 0);
  }
  const err = new Error('TW_INDEX_UNAVAILABLE'); err.detail = why; throw err;
}

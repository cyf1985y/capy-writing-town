// v58 最近常寫錯的筆畫（設計：docs/plans/2026-11-13-weak-strokes-to-practice.md §3）
// 寫字作品的 meta.mistakesByStroke（第 i 筆寫錯幾次）＋ stroke_names.json（第 i 筆的名稱）→ 哪幾種筆畫最近比較常寫錯。
// 只讀資料、不寫入。筆序對不上的作品（字形來源不同、筆數不同、沒有逐筆紀錄）不算。
const SRC_TW = 'data-tw', SRC_ORIG = 'hanzi-writer-data';

/**
 * artifacts：全部作品；names：{ 字: [每一筆的名稱|null] }；strokes：筆畫練習的種類 [{ id, name }]；
 * twChars：用台灣筆順字形的字（Set）；twReady：data-tw 索引有沒有成功載入。
 * 回傳 { list: [{ id, name, misses, seen, rate }], counted, skipped, reason }
 * misses＝寫錯的嘗試次數（同一筆錯好幾次算好幾次），seen＝這種筆畫寫完幾次，rate＝misses/seen（可能大於 1，只用來排序）。
 */
export function weakStrokes({ artifacts, names, strokes, twChars, twReady, now = new Date(), days = 14, minMisses = 2, top = 3 }) {
  if (twReady !== true) return { list: [], counted: 0, skipped: 0, reason: 'no-tw-index' };
  if (!names || !Object.keys(names).length) return { list: [], counted: 0, skipped: 0, reason: 'no-names' };
  const order = new Map((strokes ?? []).map((s, i) => [s.name, i])), stat = new Map(), since = now.getTime() - days * 864e5;
  let counted = 0, skipped = 0;
  for (const a of artifacts ?? []) {
    const t = Date.parse(a?.createdAt); if (!Number.isFinite(t) || t < since) continue;
    const mb = a.meta?.mistakesByStroke, ns = names[a.char];
    const want = twChars?.has(a.char) ? SRC_TW : SRC_ORIG, got = a.meta?.glyphSource ?? SRC_ORIG;
    if (!Array.isArray(mb) || !Array.isArray(ns) || ns.length !== mb.length || want !== got) { skipped++; continue; }
    counted++;
    mb.forEach((m, i) => {
      const n = ns[i]; if (n == null || !order.has(n)) return;
      const r = stat.get(n) ?? { misses: 0, seen: 0 }; r.seen += 1; r.misses += Number.isInteger(m) && m > 0 ? m : 0; stat.set(n, r);
    });
  }
  const byName = new Map((strokes ?? []).map(s => [s.name, s]));
  const list = [...stat.entries()].filter(([, r]) => r.misses >= minMisses)
    .map(([n, r]) => ({ id: byName.get(n).id, name: n, misses: r.misses, seen: r.seen, rate: r.misses / r.seen }))
    .sort((x, y) => (y.rate - x.rate) || (y.misses - x.misses) || (order.get(x.name) - order.get(y.name)))
    .slice(0, top);
  return { list, counted, skipped, reason: list.length ? null : 'none' };
}

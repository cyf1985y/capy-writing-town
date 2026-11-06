// 測試驅動（只供自動化驗證，遊戲頁面以 ?test=1 才載入）：沿 median 以 mousedown/mousemove/mouseup 序列
// 送進 Hanzi Writer 的真實監聽器。這是合成滑鼠事件，不是真人手寫；真人／觸控書寫延遲留待第 5 步。
export function installTestDriver(panel) {
  window.__wpDraw = function (strokeIndex, { jitter = 6, reverse = false, steps = 24, wobble = 0 } = {}) {
    const w = panel.state?.writer; if (!w) throw new Error('no writer');
    const pos = w._positioner, rect = w.target.node.getBoundingClientRect();
    let pts = w._character.strokes[strokeIndex].points.slice(); if (reverse) pts.reverse();
    const toScreen = p => ({ x: rect.left + p.x * pos.scale + pos.xOffset, y: rect.top + (pos.height - pos.yOffset - p.y * pos.scale) });
    const seg = []; for (let i = 1; i < pts.length; i++) seg.push([pts[i - 1], pts[i]]);
    const len = ([p, q]) => Math.hypot(q.x - p.x, q.y - p.y);
    const total = seg.reduce((a, s) => a + len(s), 0);
    const samples = []; let acc = 0, si = 0;
    for (let k = 0; k <= steps; k++) {
      const d = total * k / steps; while (si < seg.length - 1 && acc + len(seg[si]) < d) { acc += len(seg[si]); si++; }
      const [p, q] = seg[si], L = len(seg[si]) || 1, t = Math.min(1, (d - acc) / L);
      const s = toScreen({ x: p.x + (q.x - p.x) * t, y: p.y + (q.y - p.y) * t });
      samples.push({ x: s.x + (Math.random() - .5) * jitter + Math.sin(k / 2) * wobble, y: s.y + (Math.random() - .5) * jitter });
    }
    const el = w.target.node; const fire = (type, p) => el.dispatchEvent(new MouseEvent(type, { clientX: p.x, clientY: p.y, bubbles: true, cancelable: true, buttons: 1 }));
    fire('mousedown', samples[0]); for (const p of samples.slice(1)) fire('mousemove', p); fire('mouseup', samples[samples.length - 1]);
    return samples.length;
  };
  window.__wpDrawAll = async function (opts) { const n = panel.state.totalStrokes; for (let i = 0; i < n; i++) { window.__wpDraw(i, opts); await new Promise(r => setTimeout(r, 120)); } };
}

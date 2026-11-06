// 大廳渲染迴圈（第 3 步）：只有一個 RAF 排程；面板開啟時 **暫停**（不排 RAF、不 render），恢復時重設時間基準；
// 效果時間可暫停（水流／蒸氣不跳時）；遊戲模式沒有 benchmark（town-v5 的 32 秒採樣不會在這裡跑）。
// 另記 RAF cadence 與實際 render 次數，不混稱 FPS。
export class Lobby {
  constructor(town) {
    this.town = town;
    this.mode = 'active';           // 'active' | 'paused'
    this.rafId = 0;
    this.last = 0;
    this.effectTime = 0;            // 秒，只在 active 時累加
    this.renderCount = 0;
    this.rafCount = 0;
    this.lastDrawCalls = 0;
    this.lastTriangles = 0;
    this.pendingSingleFrame = false;
    this._frame = now => this._tick(now);
    this.events = [];
    this.benchmark = null;          // 遊戲模式永遠 null；保留欄位給報告
    this.animators = new Set();     // 第 4 步：位移／淡入動畫 (dt)=>bool（回傳 false 表示結束）
  }
  start() { if (this.rafId) return; this.last = performance.now(); this.rafId = requestAnimationFrame(this._frame); }
  /** 面板開啟：暫停 RAF；benchmark 若存在則明確無效化 */
  pause(reason = 'panel') {
    if (this.mode === 'paused') return;
    this.mode = 'paused';
    if (this.rafId) { cancelAnimationFrame(this.rafId); this.rafId = 0; }
    if (this.benchmark) { this.benchmark.valid = false; this.benchmark.invalidReason = 'policy_change:' + reason; this.benchmark = null; }
    this.town.controls.enabled = false; // 鎖相機不因任何狀態變化解鎖
    this.events.push({ name: 'pause', reason, time: performance.now() });
  }
  /** 面板關閉：重設時間基準再恢復 */
  resume(reason = 'panel') {
    if (this.mode === 'active') return;
    this.mode = 'active';
    this.last = performance.now();   // 不把暫停期間的 dt 納入
    this.town.controls.enabled = false;
    this.events.push({ name: 'resume', reason, time: performance.now() });
    this.start();
  }
  /** 暫停中也可要求單幀（resize、context restore、第 4 步從存檔推導姿態後更新畫面） */
  requestFrame() { if (this.mode === 'active') return; this.pendingSingleFrame = true; if (!this.rafId) this.rafId = requestAnimationFrame(this._frame); }
  _render() {
    const t = this.town;
    for (const u of t.waterUniforms) u.value = this.effectTime;
    t.renderer.info.reset(); t.renderer.render(t.scene, t.camera);
    this.renderCount++; this.lastDrawCalls = t.renderer.info.render.calls; this.lastTriangles = t.renderer.info.render.triangles;
  }
  _tick(now) {
    this.rafId = 0; this.rafCount++;
    if (this.mode === 'paused') {
      if (this.pendingSingleFrame) { this.pendingSingleFrame = false; this._render(); }
      return; // 不再排程
    }
    const dt = Math.min(0.1, (now - this.last) / 1000); this.last = now; this.effectTime += dt;
    for (const a of this.animators) { if (a(dt) === false) this.animators.delete(a); }
    this._render();
    this.rafId = requestAnimationFrame(this._frame);
  }
  /** 量 N 毫秒內的 RAF 次數與 render 次數（不叫 FPS） */
  async measure(ms = 2000) {
    const r0 = this.renderCount, f0 = this.rafCount, t0 = performance.now();
    await new Promise(res => setTimeout(res, ms));
    const dt = (performance.now() - t0) / 1000;
    return { mode: this.mode, seconds: +dt.toFixed(3), rafPerSec: +((this.rafCount - f0) / dt).toFixed(1), renderPerSec: +((this.renderCount - r0) / dt).toFixed(1), drawCalls: this.lastDrawCalls, triangles: this.lastTriangles };
  }
}

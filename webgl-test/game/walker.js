// v59 角色在地圖上走路（設計：docs/plans/2026-11-13-space-theme-wide-map-walking.md §6）
// - 路線圖＝MAP.walk（節點＋連線）。朋友站在 residentAt，導遊站在 guideStand[課]；站的位置和節點之間是「接駁線」。
// - 走路只走「接駁線＋路線圖的邊」；導遊改路時先走完目前這一段，再從那一端重新找路。
// - Walker 掛在 lobby.animators（RAF 每格呼叫），所以大廳暫停時自動停。
import { graphOf } from './skin.js?v=60';

const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
/** 最短節點序列（BFS）；from === to 回傳 [from]；不連通回傳 null */
export function bfs(adj, from, to) {
  if (from === to) return [from];
  const prev = new Map([[from, null]]), q = [from];
  while (q.length) {
    const n = q.shift();
    for (const m of adj.get(n) ?? []) if (!prev.has(m)) { prev.set(m, n); if (m === to) { const path = [m]; let p = n; while (p != null) { path.unshift(p); p = prev.get(p); } return path; } q.push(m); }
  }
  return null;
}

export class Walker {
  /** opts：town、lobby、townFx、map（MAP）、guide（導遊代號）、reduced（不要動畫）、stroll（散步間隔秒數 [最短, 最長]）、log */
  constructor({ town, lobby, townFx, map, guide, reduced = false, stroll = [8, 16], log = () => {} }) {
    Object.assign(this, { town, lobby, townFx, map, guide, reduced, strollRange: stroll, log });
    this.walk = map.walk; this.nodes = map.walk.nodes; this.adj = graphOf(map.walk);
    this.speed = 0.09 * town.W; // 插畫 px／秒
    this.st = new Map(); // name → { anchor, route, idx, from, onArrive, rest }
    for (const c of town.chars.values()) {
      c.el.classList.add('t2-walkmode');
      this.st.set(c.name, { anchor: { kind: 'stand', node: map.walk.residentNode[c.name], p: c.at }, route: null, idx: 0, rest: 0 });
    }
    this.strollT = this._nextStroll(); this.paths = [];
    this._tick = dt => { this.step(dt); };
    lobby.animators.add(this._tick);
  }
  _nextStroll() { const [a, b] = this.strollRange; return a + Math.random() * (b - a); }
  isWalking(name) { return !!this.st.get(name)?.route; }
  /** 路徑點：{ p, node, stand }；stand＝站的位置（不在路線圖上），node＝它接到的節點 */
  _plan(anchor, target) {
    const wps = []; let from;
    if (anchor.kind === 'node') from = anchor.id;
    else if (anchor.kind === 'stand') {
      if (target.stand && anchor.p && dist(anchor.p, target.stand) < 1) return [];
      wps.push({ p: this.nodes[anchor.node], node: anchor.node }); from = anchor.node;
    } else return null;
    const path = bfs(this.adj, from, target.node); if (!path) return null;
    for (const n of path.slice(1)) wps.push({ p: this.nodes[n], node: n });
    if (target.stand) wps.push({ p: target.stand, node: target.node, stand: true });
    return wps;
  }
  /** 叫某個角色走到 target＝{ node, stand?[x,y] }；走到一半改路：先走完目前這一段 */
  go(name, target, { onArrive } = {}) {
    const s = this.st.get(name), c = this.town.chars.get(name); if (!s || !c) return false;
    let route;
    if (s.route) { const cur = s.route[s.idx]; const rest = this._plan(cur.stand ? { kind: 'stand', node: cur.node, p: cur.p } : { kind: 'node', id: cur.node }, target); if (!rest) return false; route = [cur, ...rest]; }
    else if (s.anchor.kind === 'seg') { // 被點停在半路：先走到比較近的那一端
      const e = dist(c.at, s.anchor.a.p) <= dist(c.at, s.anchor.b.p) ? s.anchor.a : s.anchor.b;
      const rest = this._plan(e.stand ? { kind: 'stand', node: e.node, p: e.p } : { kind: 'node', id: e.node }, target); if (!rest) return false; route = [e, ...rest];
    } else { route = this._plan(s.anchor, target); if (!route) return false; }
    s.onArrive = onArrive ?? null;
    if (!route.length) { s.route = null; onArrive?.(); return true; }
    if (this.reduced) { const last = route[route.length - 1]; this._arrive(name, last); return true; }
    s.route = route; s.idx = 0; s.from = [...c.at]; c.el.classList.add('walking'); this.town.pose(name, 'idle'); return true;
  }
  /** 立刻放到某個位置（載入時、reduced motion） */
  put(name, target) {
    const s = this.st.get(name); if (!s) return;
    s.route = null; this.town.chars.get(name).el.classList.remove('walking');
    this._arrive(name, target.stand ? { p: target.stand, node: target.node, stand: true } : { p: this.nodes[target.node], node: target.node }, true);
  }
  /** 停在原地（被點的朋友） */
  stop(name) {
    const s = this.st.get(name), c = this.town.chars.get(name); if (!s?.route) return false;
    const b = s.route[s.idx], a = s.prevWp ?? { p: s.from, node: b.node };
    s.anchor = { kind: 'seg', a, b }; s.route = null; s.rest = 4 + Math.random() * 6;
    c.el.classList.remove('walking'); c.fig.classList.remove('flip'); return true;
  }
  _arrive(name, wp, silent = false) {
    const s = this.st.get(name), c = this.town.chars.get(name);
    this.town.place(name, wp.p); s.anchor = wp.stand ? { kind: 'stand', node: wp.node, p: wp.p } : { kind: 'node', id: wp.node };
    s.route = null; s.prevWp = null; c.el.classList.remove('walking'); c.fig.classList.remove('flip');
    if (name === this.guide) this.townFx.refreshHintSide?.();
    const cb = s.onArrive; s.onArrive = null; if (!silent) cb?.();
  }
  /** 導遊走到第 lesson 課旁邊；instant＝直接出現 */
  guideTo(lesson, { instant = false } = {}) {
    const l = String(lesson), stand = this.walk.guideStand[l], node = this.walk.pinNode[l]; if (!stand || !node) return false;
    const target = { node, stand };
    if (instant || this.reduced) { this.put(this.guide, target); return true; }
    this.lastGuide = l; return this.go(this.guide, target);
  }
  /** 每格：走路中的角色前進；散步排程 */
  step(dt) {
    for (const [name, s] of this.st) {
      if (!s.route) { if (s.rest > 0) s.rest -= dt; continue; }
      const c = this.town.chars.get(name); let left = this.speed * dt;
      while (left > 0 && s.route) {
        const wp = s.route[s.idx], d = dist(c.at, wp.p);
        if (d <= left) {
          left -= d; s.prevWp = wp; s.from = [...wp.p];
          if (s.idx === s.route.length - 1) { this._arrive(name, wp); break; }
          this.town.place(name, wp.p); s.idx++;
        } else {
          const k = left / d, nx = c.at[0] + (wp.p[0] - c.at[0]) * k, ny = c.at[1] + (wp.p[1] - c.at[1]) * k;
          c.fig.classList.toggle('flip', wp.p[0] < c.at[0] - 0.5); this.town.place(name, [nx, ny]); left = 0;
        }
      }
      if (name === this.guide) this.townFx.refreshHintSide?.();
      this.paths.length > 400 && this.paths.shift(); this.paths.push([name, Math.round(c.at[0]), Math.round(c.at[1])]);
    }
    if (this.reduced) return;
    this.strollT -= dt; if (this.strollT > 0) return; this.strollT = this._nextStroll();
    this.strollOnce();
  }
  /** 挑一位朋友散步（可以直接呼叫，測試用） */
  strollOnce() {
    if (this.lobby.mode !== 'active' || this.townFx.busy || this.townFx.camBusy || document.hidden) return null;
    const ok = [...this.town.chars.values()].filter(c => c.name !== this.guide && this.townFx._visible(c) && c.pose === 'idle' && !this.st.get(c.name).route && this.st.get(c.name).rest <= 0 && !c.el.classList.contains('talking'));
    if (!ok.length) return null;
    const c = ok[Math.floor(Math.random() * ok.length)], s = this.st.get(c.name), home = this.walk.residentNode[c.name];
    let target;
    if (s.anchor.kind !== 'stand' && Math.random() < 0.5) target = { node: home, stand: this.map.residentAt[c.name] };
    else { // 家的節點 1～3 步之內
      const near = new Map([[home, 0]]), q = [home];
      while (q.length) { const n = q.shift(); if (near.get(n) >= 3) continue; for (const m of this.adj.get(n)) if (!near.has(m)) { near.set(m, near.get(n) + 1); q.push(m); } }
      const cand = [...near.keys()].filter(n => near.get(n) >= 1 && !(s.anchor.kind === 'node' && s.anchor.id === n));
      target = { node: cand[Math.floor(Math.random() * cand.length)] };
    }
    if (!this.go(c.name, target, { onArrive: () => { s.rest = 4 + Math.random() * 6; } })) return null;
    this.log('stroll ' + c.name + ' -> ' + (target.stand ? 'home' : target.node)); return c.name;
  }
  /** 給測試：路線圖上所有線段（含接駁線） */
  segments() {
    const segs = this.walk.edges.map(([a, b]) => [this.nodes[a], this.nodes[b], 'edge']);
    for (const [k, n] of Object.entries(this.walk.residentNode)) if (this.map.residentAt[k]) segs.push([this.map.residentAt[k], this.nodes[n], 'link']);
    for (const [l, n] of Object.entries(this.walk.pinNode)) segs.push([this.walk.guideStand[l], this.nodes[n], 'link']);
    return segs;
  }
}

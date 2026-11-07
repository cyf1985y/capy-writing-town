// 小鎮反應（契約 v3：feedback.charComplete.town、feedback.idle、zones.color、chapters.map）。
// - 區域彩度：所有非水材質加一段 shader，依世界座標到 5 個區域中心的高斯權重混合灰階↔彩色，外加亮度脈衝。
// - 鏡頭：使用者仍不能操作；只有程式在寫完字／切課時飛到區域再飛回。
// - 卡比巴拉：8 隻都獨立 Mesh；平常呼吸起伏，寫完字依序跳，點擊（螢幕距離 32px 內）也會跳。
// - 擺設（P/S/I 開頭的 instanced 物件）寫完字時在該區彈一下；動畫結束後還原原始矩陣。
// 存檔不新增欄位：彩度由 passedTaskIds 推導；反應動畫不寫存檔。
import * as THREE from 'three';
import { burst } from './fx.js';

const ease = t => (t < .5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);
const WATER = new Set(['Blockout_water', 'Waterfall', 'River_foam', 'Steam']);
const floorOf = cfg => cfg?.floor ?? 0.22;

export function residentNames(manifest) {
  return manifest.architecture_instances.filter(a => a.building === 'Resident_static').map(a => a.object);
}

export class TownFx {
  constructor({ town, lobby, contract, reward, sound, stage, log = () => {} }) {
    Object.assign(this, { town, lobby, contract, reward, sound, stage, log });
    const zc = contract.zones;
    this.zoneIds = zc.ids;                                   // 5 區
    this.lessonToZone = zc.lessonToZone;                     // "0".."6" → zone id 或 global_sakura
    this.colorCfg = zc.color;
    const b2t = ([x, y, z]) => new THREE.Vector3(x, z, -y);
    // 區域中心：該區代表建築 anchor 的平均（manifest 沒有正式 zone_index）
    this.centers = this.zoneIds.map(id => {
      const set = new Set(zc.centersFromBuildings[id]);
      const pts = town.manifest.architecture_instances.filter(a => set.has(a.building)).map(a => b2t(a.anchor_blender_m));
      const c = new THREE.Vector3(); pts.forEach(p => c.add(p)); return pts.length ? c.divideScalar(pts.length) : c;
    });
    this.nearestZone = p => { let bi = 0, bd = Infinity; this.centers.forEach((c, i) => { const d = (c.x - p.x) ** 2 + (c.z - p.z) ** 2; if (d < bd) { bd = d; bi = i; } }); return bi; };

    // ---- 卡比巴拉 ----
    this.residents = residentNames(town.manifest).map((name, k) => {
      const mesh = town.separate.get(name); if (!mesh) return null;
      const pos = new THREE.Vector3().setFromMatrixPosition(mesh.userData.restMatrix);
      return { name, mesh, zone: this.nearestZone(pos), phase: k * 1.7, hop: null, isRewardNpc: name === contract.reward.effect.npcInstance };
    }).filter(Boolean);

    // ---- 擺設（instanced）----
    this.props = [];
    const m = new THREE.Matrix4(), p = new THREE.Vector3();
    for (const [name, { mesh, instanceId }] of town.objectIndex) {
      if (!/^[PSI]\d{3}_/.test(name)) continue;
      mesh.getMatrixAt(instanceId, m); p.setFromMatrixPosition(m);
      const zone = this.nearestZone(p);
      if (Math.hypot(this.centers[zone].x - p.x, this.centers[zone].z - p.z) > 16) continue;
      this.props.push({ mesh, instanceId, base: m.clone(), zone, pos: p.clone(), anim: null });
    }

    // ---- 區域彩度 shader ----
    const f0 = floorOf(zc.color);
    this.u = {
      uZoneC: { value: this.centers.map(c => new THREE.Vector2(c.x, c.z)) },
      uZoneS: { value: this.zoneIds.map(() => f0) },
      uZoneG: { value: this.zoneIds.map(() => 0) },
      uZoneFloor: { value: f0 },
    };
    this.target = { s: this.zoneIds.map(() => f0), floor: f0 };
    this._installTint();

    // ---- 鏡頭 ----
    const cam = town.camera;
    this.home = { pos: cam.position.clone(), target: town.controls.target.clone(), zoom: cam.zoom };
    this.offset = this.home.pos.clone().sub(this.home.target);
    this.camToken = 0;

    // ---- 每幀動畫（常駐）----
    this.t = 0;
    this._m = new THREE.Matrix4(); this._s = new THREE.Matrix4();
    lobby.animators.add(dt => { this._frame(dt); return true; });

    // ---- 點擊卡比巴拉 ----
    town.renderer.domElement.addEventListener('pointerdown', e => this._tap(e));
    town.renderer.domElement.style.touchAction = 'manipulation';
  }

  // ======== 彩度 ========
  _installTint() {
    const u = this.u, mats = new Set();
    this.town.scene.traverse(o => { if (o.isMesh) (Array.isArray(o.material) ? o.material : [o.material]).forEach(mt => { if (!WATER.has(mt.name)) mats.add(mt); }); });
    const frag = [
      ' float zw=0.0, zs=0.0, zg=0.0;',
      ' for(int i=0;i<5;i++){ vec2 dd=vZoneWorld.xz-uZoneC[i]; float w=exp(-dot(dd,dd)/98.0)+1e-4; zw+=w; zs+=w*uZoneS[i]; zg+=w*uZoneG[i]; }',
      ' zs/=zw; zg/=zw; float sat=max(uZoneFloor, zs);',
      ' float lum=dot(gl_FragColor.rgb, vec3(0.299,0.587,0.114));',
      ' gl_FragColor.rgb = mix(vec3(lum)*(0.9+0.1*sat), gl_FragColor.rgb, sat) + vec3(1.0,0.86,0.55)*zg*0.28;',
      ' #include <dithering_fragment>',
    ].join('\n');
    for (const mt of mats) {
      mt.onBeforeCompile = shader => {
        Object.assign(shader.uniforms, u);
        shader.vertexShader = 'varying vec3 vZoneWorld;\n' + shader.vertexShader.replace('#include <worldpos_vertex>',
          '#include <worldpos_vertex>\n vec4 zoneP=vec4(transformed,1.0);\n #ifdef USE_INSTANCING\n zoneP=instanceMatrix*zoneP;\n #endif\n vZoneWorld=(modelMatrix*zoneP).xyz;');
        shader.fragmentShader = 'varying vec3 vZoneWorld; uniform vec2 uZoneC[5]; uniform float uZoneS[5]; uniform float uZoneG[5]; uniform float uZoneFloor;\n' +
          shader.fragmentShader.replace('#include <dithering_fragment>', frag);
      };
      mt.customProgramCacheKey = () => 'zone-tint-v1';
      mt.needsUpdate = true;
    }
    this.tintedMaterials = mats.size;
  }

  /** 由進度設定各區目標彩度（畫面上平滑過渡；instant 用於載入時） */
  setProgress(passedTaskIds, { instant = false } = {}) {
    const passed = new Set(passedTaskIds), modes = this.contract.modes, f0 = floorOf(this.colorCfg);
    const count = lessons => lessons.reduce((a, l) => { const ids = modes['lesson_' + l]?.writingTaskIds || []; a[0] += ids.filter(id => passed.has(id)).length; a[1] += ids.length; return a; }, [0, 0]);
    this.zoneIds.forEach((z, i) => {
      const [got, tot] = count(Object.entries(this.lessonToZone).filter(([, v]) => v === z).map(([k]) => +k));
      this.target.s[i] = f0 + (1 - f0) * (tot ? got / tot : 0);
    });
    const [g6, t6] = count([this.colorCfg.globalLesson]);
    this.target.floor = f0 + (1 - f0) * (t6 ? g6 / t6 : 0);
    if (instant) { this.u.uZoneS.value = [...this.target.s]; this.u.uZoneFloor.value = this.target.floor; }
    return { zones: Object.fromEntries(this.zoneIds.map((z, i) => [z, +this.target.s[i].toFixed(3)])), floor: +this.target.floor.toFixed(3) };
  }

  // ======== 每幀 ========
  _frame(dt) {
    this.t += dt;
    const k = Math.min(1, dt * 1.6), S = this.u.uZoneS.value, G = this.u.uZoneG.value;
    for (let i = 0; i < S.length; i++) { S[i] += (this.target.s[i] - S[i]) * k; G[i] = Math.max(0, G[i] - dt / 1.2); }
    this.u.uZoneFloor.value += (this.target.floor - this.u.uZoneFloor.value) * k;
    const mm = this._m, sc = this._s;
    for (const r of this.residents) {
      if (r.isRewardNpc && this.reward?.busy) continue;      // 獎勵位移中由 reward.js 控制
      const base = r.isRewardNpc && this.reward ? (this.reward.state.atPool ? this.reward.end : this.reward.rest) : r.mesh.userData.restMatrix;
      let dy = 0.04 * Math.sin(this.t * 2.2 + r.phase), sy = 1 + 0.025 * Math.sin(this.t * 2.2 + r.phase + 1);
      if (r.hop) {
        const h = (this.t - r.hop.t0) / r.hop.dur;
        if (h >= 1) r.hop = null;
        else if (h > 0) { dy += Math.sin(h * Math.PI) * r.hop.h; sy = h < .15 ? 1 - h * 1.5 : h > .85 ? 1 - (1 - h) * 1.5 : 1.08; }
      }
      mm.copy(base); mm.multiply(sc.makeScale(1, sy, 1)); mm.elements[13] += dy;
      r.mesh.matrix.copy(mm); r.mesh.matrixWorld.copy(mm);
    }
    const touched = new Set();
    for (const p of this.props) {
      if (!p.anim) continue;
      const h = (this.t - p.anim.t0) / 0.6;
      if (h < 0) continue;
      if (h >= 1) { p.mesh.setMatrixAt(p.instanceId, p.base); p.anim = null; touched.add(p.mesh); continue; }
      const s = 1 + Math.sin(h * Math.PI) * 0.28;
      mm.copy(p.base); mm.multiply(sc.makeScale(1 + (s - 1) * 0.3, s, 1 + (s - 1) * 0.3)); p.mesh.setMatrixAt(p.instanceId, mm); touched.add(p.mesh);
    }
    for (const mesh of touched) mesh.instanceMatrix.needsUpdate = true;
  }

  hop(r, delay = 0, h = 1.1) { r.hop = { t0: this.t + delay, dur: 0.5, h }; setTimeout(() => this.sound?.squeak(0.9 + Math.random() * 0.3), delay * 1000); }

  // ======== 鏡頭 ========
  _camTo(target, zoom, dur) {
    const cam = this.town.camera, t0 = this.town.controls.target.clone(), z0 = cam.zoom, token = ++this.camToken;
    return new Promise(res => {
      let t = 0;
      this.lobby.animators.add(dt => {
        if (token !== this.camToken) { res(false); return false; }
        t = Math.min(1, t + dt / dur); const e = ease(t);
        const tg = t0.clone().lerp(target, e); this.town.controls.target.copy(tg);
        cam.position.copy(tg).add(this.offset); cam.lookAt(tg); cam.zoom = z0 + (zoom - z0) * e; cam.updateProjectionMatrix();
        if (t >= 1) { res(true); return false; }
        return true;
      });
    });
  }
  flyHome(dur = 0.8) { return this._camTo(this.home.target, this.home.zoom, dur).then(ok => { if (ok) this._showPins(true); return ok; }); }
  zoneOfLesson(lesson) { return this.zoneIds.indexOf(this.lessonToZone[String(lesson)]); }
  async flyToLesson(lesson, { hold = 1.2, zoom = 2.3 } = {}) {
    const i = this.zoneOfLesson(lesson);
    this._showPins(false); this.sound?.whoosh();
    if (!(await this._camTo(i >= 0 ? this.centers[i] : this.home.target, i >= 0 ? zoom : 1.25, 0.8))) return false;
    const token = this.camToken;
    if (i >= 0) this.u.uZoneG.value[i] = 0.6;
    await new Promise(r => setTimeout(r, hold * 1000));
    return token === this.camToken ? this.flyHome() : false;
  }

  // ======== 寫完字的整套反應 ========
  async celebrate(lesson) {
    const i = this.zoneOfLesson(lesson);
    const target = i >= 0 ? this.centers[i] : this.home.target;
    this._showPins(false); this.sound?.whoosh();
    if (!(await this._camTo(target, i >= 0 ? 2.3 : 1.25, 0.8))) return false;
    const token = this.camToken;
    if (i >= 0) this.u.uZoneG.value[i] = 1; else this.u.uZoneG.value.fill(0.7);
    let rs = i >= 0 ? this.residents.filter(r => r.zone === i) : this.residents;
    if (rs.length < 2) rs = [...this.residents].sort((a, b) => dist(a, target) - dist(b, target)).slice(0, 2);
    rs.forEach((r, k) => this.hop(r, 0.1 + k * 0.18));
    for (const p of this.props) if (i < 0 || p.zone === i) p.anim = { t0: this.t + 0.05 + Math.hypot(p.pos.x - target.x, p.pos.z - target.z) * 0.03 };
    const sp = this.toScreen(target.clone().add(new THREE.Vector3(0, 1.5, 0)));
    if (sp) burst(this.stage, sp.x, sp.y, { n: 16, spread: 110, glyphs: ['⭐', '✨', '🌸', '💛', '🎉'] });
    this.lastCelebration = { lesson, zone: this.zoneIds[i] ?? 'global', residents: rs.map(r => r.name), props: this.props.filter(p => p.anim).length };
    await new Promise(r => setTimeout(r, 1900));
    return token === this.camToken ? this.flyHome() : false;
  }

  // ======== 螢幕座標 ========
  _project(v, cam) {
    const c = this.town.renderer.domElement, p = v.clone().project(cam);
    const cr = c.getBoundingClientRect(), sr = this.stage.getBoundingClientRect();
    return { x: (p.x + 1) / 2 * cr.width + (cr.left - sr.left), y: (1 - p.y) / 2 * cr.height + (cr.top - sr.top) };
  }
  toScreen(v) { return this._project(v, this.town.camera); }
  toScreenHome(v) {
    const cam = this.town.camera.clone(); cam.position.copy(this.home.pos); cam.zoom = this.home.zoom; cam.lookAt(this.home.target); cam.updateProjectionMatrix(); cam.updateMatrixWorld();
    return this._project(v, cam);
  }
  _tap(e) {
    const sr = this.stage.getBoundingClientRect(), x = e.clientX - sr.left, y = e.clientY - sr.top;
    let best = null, bd = 32 * 32;
    for (const r of this.residents) {
      const p = this.toScreen(new THREE.Vector3().setFromMatrixPosition(r.mesh.matrixWorld).add(new THREE.Vector3(0, 0.4, 0)));
      const d = (p.x - x) ** 2 + (p.y - y) ** 2; if (d < bd) { bd = d; best = { r, p }; }
    }
    if (!best) return null;
    this.sound?.unlock(); this.hop(best.r, 0, 1.3);
    burst(this.stage, best.p.x, best.p.y - 10, { n: 6, spread: 50, glyphs: ['💛', '✨'], duration: 700 });
    this.log('tap ' + best.r.name);
    return best.r.name;
  }

  // ======== 地圖上的課次標記 ========
  mountPins({ onPick }) {
    this.onPick = onPick;
    const css = document.createElement('style'); css.textContent = `
.tf-pin{position:absolute;z-index:3;transform:translate(-50%,-50%);width:38px;height:38px;border-radius:50%;border:3px solid #fff;background:#fffdf7;font:800 16px system-ui,"Noto Sans TC",sans-serif;color:#344b45;cursor:pointer;padding:0;box-shadow:0 3px 10px rgba(0,0,0,.3);touch-action:manipulation;transition:transform .15s,opacity .25s}
.tf-pin.done{border-color:#f08c00}
.tf-pin.active{transform:translate(-50%,-50%) scale(1.22);background:#386c56;color:#fff;border-color:#f08c00}
.tf-pin small{position:absolute;top:100%;left:50%;transform:translateX(-50%);margin-top:2px;font:700 11px system-ui;color:#fff;background:rgba(52,75,69,.82);border-radius:6px;padding:0 4px;white-space:nowrap}
.tf-pins-hidden .tf-pin{opacity:0;pointer-events:none}
@media (max-width:600px){.tf-pin{width:30px;height:30px;font-size:13px;border-width:2px}.tf-pin small{font-size:9px;padding:0 3px}}`;
    document.head.append(css);
    this.pins = Object.keys(this.lessonToZone).map(l => {
      const b = document.createElement('button'); b.type = 'button'; b.className = 'tf-pin'; b.dataset.lesson = l;
      b.innerHTML = `${l === '0' ? '數' : l}<small></small>`;
      b.addEventListener('pointerdown', e => e.stopPropagation());
      b.addEventListener('click', e => { e.stopPropagation(); this.onPick?.(+l); });
      this.stage.append(b); return b;
    });
    this.placePins();
  }
  placePins() {
    if (!this.pins) return;
    const sr = this.stage.getBoundingClientRect(), seen = {};
    for (const b of this.pins) {
      const i = this.zoneOfLesson(b.dataset.lesson);
      let x, y;
      if (i < 0) { x = sr.width / 2; y = 26; }
      else {
        const p = this.toScreenHome(this.centers[i].clone().add(new THREE.Vector3(0, 3, 0)));
        const shared = Object.values(this.lessonToZone).filter(v => v === this.zoneIds[i]).length > 1;
        const n = (seen[i] = (seen[i] ?? -1) + 1);
        const dx = sr.width < 600 ? 17 : 22; x = p.x + (shared ? (n ? dx : -dx) : 0); y = p.y;
      }
      b.style.left = Math.round(x) + 'px'; b.style.top = Math.round(y) + 'px';
    }
  }
  updatePins(activeLesson, counts) {
    for (const b of this.pins ?? []) {
      const l = +b.dataset.lesson, c = counts[l];
      b.classList.toggle('active', l === activeLesson); b.classList.toggle('done', !!c && c[0] === c[1]);
      b.querySelector('small').textContent = c ? `${c[0]}/${c[1]}` : '';
      b.title = c ? `${c[2]}（${c[0]}/${c[1]} 字）` : ''; b.setAttribute('aria-label', b.title);
    }
  }
  _showPins(on) { this.stage.classList.toggle('tf-pins-hidden', !on); }
}

function dist(r, v) { const p = new THREE.Vector3().setFromMatrixPosition(r.mesh.userData.restMatrix); return Math.hypot(p.x - v.x, p.z - v.z); }

// 小鎮反應（契約 v3：feedback.charComplete.town、feedback.idle、zones.color、chapters.map）。
// - 區域彩度：所有非水材質加一段 shader，依世界座標到 5 個區域中心的高斯權重混合灰階↔彩色，外加亮度脈衝。
// - 鏡頭：使用者仍不能操作；只有程式在寫完字／切課時飛到區域再飛回。
// - 卡比巴拉：8 隻都獨立 Mesh；平常呼吸起伏，寫完字依序跳，點擊（螢幕距離 32px 內）也會跳。
// - 擺設（P/S/I 開頭的 instanced 物件）寫完字時在該區彈一下；動畫結束後還原原始矩陣。
// 存檔不新增欄位：彩度由 passedTaskIds 推導；反應動畫不寫存檔。
import * as THREE from 'three';
import { burst } from './fx.js?v=20';
import { makeBunny, makeCarrot } from './characters.js?v=20';

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
    // v5：N101＝呆萌水豚（放大＋頭頂胡蘿蔔），N102＝長耳小兔兔（程序化模型取代原 Mesh，座標與朝向沿用）
    const cc = contract.characters || {}; this.K = cc.scale ?? 1; const K = this.K;
    this.residents = residentNames(town.manifest).map((name, k) => {
      const mesh = town.separate.get(name); if (!mesh) return null;
      const pos = new THREE.Vector3().setFromMatrixPosition(mesh.userData.restMatrix);
      const kind = /_N102_/.test(name) && cc.N102 ? 'bunny' : 'capy';
      const r = { name, mesh, kind, zone: this.nearestZone(pos), phase: k * 1.7, hop: null, tap: null, isRewardNpc: name === contract.reward.effect.npcInstance };
      if (kind === 'bunny') {
        const b = makeBunny(k % 2 ? { fur: '#FFE3EC', inner: '#FF9AA2' } : {}); r.bunny = b;
        b.group.matrixAutoUpdate = false; b.group.name = 'bunny:' + name; town.scene.add(b.group);
        mesh.visible = false; mesh.castShadow = false;
        r.bunnyBase = null; // 第一次 _frame 時依鏡頭方向算（兔子臉朝玩家）
      } else if (cc.N101) { r.carrot = makeCarrot(); r.carrot.name = 'carrot:' + name; town.scene.add(r.carrot); }
      return r;
    }).filter(Boolean);
    this._S = new THREE.Matrix4(); this._T = new THREE.Matrix4(); this._R = new THREE.Matrix4();
    // 獎勵 NPC（水豚）位移時由 reward.js 設矩陣：套同樣的放大
    if (reward && K !== 1) reward.decorate = m => m.clone().multiply(new THREE.Matrix4().makeScale(K, K, K));

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
      uPastel: { value: contract.theme?.pastelRemap?.strength ?? 0 },               // v5：0 = 原色
      uShadowTint: { value: new THREE.Vector3(...(contract.theme?.pastelRemap?.shadowTint ?? [0, 0, 0])) },
    };
    this.target = { s: this.zoneIds.map(() => f0), floor: f0 };
    this._installTint();

    // ---- 鏡頭 ----
    const cam = town.camera;
    this.home = { pos: cam.position.clone(), target: town.controls.target.clone(), zoom: cam.zoom };
    this.offset = this.home.pos.clone().sub(this.home.target);
    // v5：兔子的基準矩陣＝原位置＋面向鏡頭（±0.35 rad 變化），不沿用原水豚的朝向
    const yaw0 = Math.atan2(this.offset.x, this.offset.z);
    // 放大後兔子和附近水豚會重疊：離水豚 2.6 m 內就往外推（最多 1.3 m，只動兔子）
    const capyPos = this.residents.filter(r => r.kind === 'capy').map(r => new THREE.Vector3().setFromMatrixPosition(r.mesh.userData.restMatrix));
    this.residents.forEach((r, k) => {
      if (r.kind !== 'bunny') return;
      const p = new THREE.Vector3().setFromMatrixPosition(r.mesh.userData.restMatrix), push = new THREE.Vector3();
      for (const c of capyPos) { const d = Math.hypot(p.x - c.x, p.z - c.z); if (d < 2.6 && Math.abs(p.y - c.y) < 1) push.add(new THREE.Vector3(p.x - c.x, 0, p.z - c.z).normalize().multiplyScalar(2.6 - d)); }
      if (push.length() > 1.3) push.setLength(1.3);
      r.bunnyNudge = +push.length().toFixed(2);
      r.bunnyBase = new THREE.Matrix4().makeRotationY(yaw0 + (k % 3 - 1) * 0.35).setPosition(p.add(push));
    });
    this.camToken = 0;

    // ---- 每幀動畫（常駐）----
    this.t = 0;
    this._m = new THREE.Matrix4(); this._s = new THREE.Matrix4();
    lobby.animators.add(dt => { this._frame(dt); return true; });
    // v4 效能：陰影圖只在有東西移動（跳、彈、獎勵位移）時重畫；平常呼吸起伏太小，沿用上一張陰影。
    // 省下每幀一次的整鎮陰影繪製（三角面約減半）。
    this.shadowMap = town.renderer.shadowMap; this.shadowMap.autoUpdate = false; this.shadowMap.needsUpdate = true; this._wasMoving = true; this.shadowUpdates = 0;

    // ---- 點擊卡比巴拉 ----
    town.renderer.domElement.addEventListener('pointerdown', e => this._tap(e));
    town.renderer.domElement.style.touchAction = 'manipulation';
  }

  // ======== 彩度 ========
  _installTint() {
    const u = this.u, mats = new Set();
    this.town.scene.traverse(o => { if (o.isMesh) (Array.isArray(o.material) ? o.material : [o.material]).forEach(mt => { if (!WATER.has(mt.name)) mats.add(mt); }); });
    const frag = [
      // v5 馬卡龍色相偏移：依原色色相找最近的甜點色（草莓粉／奶油黃／薄荷綠／蘇打藍），越暗的顏色混越多，保留明暗
      ' { vec3 c0=gl_FragColor.rgb; float mx=max(c0.r,max(c0.g,c0.b)), mn=min(c0.r,min(c0.g,c0.b)), dl=mx-mn+1e-5, h;',
      '   if(mx==c0.r) h=mod((c0.g-c0.b)/dl,6.0); else if(mx==c0.g) h=(c0.b-c0.r)/dl+2.0; else h=(c0.r-c0.g)/dl+4.0; h*=60.0;',
      '   vec3 P_PINK=vec3(1.0,0.718,0.698), P_CREAM=vec3(1.0,0.961,0.729), P_MINT=vec3(0.71,0.918,0.843), P_SODA=vec3(0.78,0.808,0.918);',
      '   float l0=dot(c0,vec3(0.299,0.587,0.114)), satc=dl/(mx+1e-5);',
      '   vec3 pal = h<15.0||h>=330.0 ? P_PINK : h<45.0 ? mix(P_PINK,P_CREAM,smoothstep(0.25,0.7,l0)) : h<75.0 ? P_CREAM : h<170.0 ? P_MINT : h<290.0 ? P_SODA : P_PINK;',
      '   pal = mix(P_CREAM, pal, smoothstep(0.04,0.18,satc));',
      '   float lp=dot(pal,vec3(0.299,0.587,0.114)); pal=max(vec3(0.0), vec3(lp)+(pal-vec3(lp))*mix(2.1,1.15,smoothstep(0.1,0.7,l0)));', // 暗色來源給較濃的糖果色
      '   vec3 tgt = pal*mix(0.62,1.0,smoothstep(0.0,0.7,l0));',
      '   float k = uPastel*(0.5+0.5*(1.0-smoothstep(0.3,0.85,l0)));',
      '   gl_FragColor.rgb = mix(c0, tgt, k) + uShadowTint*(1.0-smoothstep(0.0,0.45,l0)); }',
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
        shader.fragmentShader = 'varying vec3 vZoneWorld; uniform vec2 uZoneC[5]; uniform float uZoneS[5]; uniform float uZoneG[5]; uniform float uZoneFloor; uniform float uPastel; uniform vec3 uShadowTint;\n' +
          shader.fragmentShader.replace('#include <dithering_fragment>', frag);
      };
      mt.customProgramCacheKey = () => 'zone-tint-v5';
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
    const K = this.K, T = this._T, Rm = this._R;
    for (const r of this.residents) {
      const t = this.t;
      if (r.isRewardNpc && this.reward?.busy) { if (r.carrot) this._placeCarrot(r, r.mesh.matrixWorld, 1, 1, 0, true); continue; } // 獎勵位移中由 reward.js 控制
      const base = r.isRewardNpc && this.reward ? (this.reward.state.atPool ? this.reward.end : this.reward.rest) : r.mesh.userData.restMatrix;
      const hopH = r.hop ? (() => { const h = (t - r.hop.t0) / r.hop.dur; if (h >= 1) { r.hop = null; return 0; } return h > 0 ? Math.sin(h * Math.PI) * r.hop.h : 0; })() : 0;
      if (r.kind === 'capy') {
        // 慢速果凍呼吸
        let sy = 1 + 0.04 * Math.sin(t * 2 + r.phase), sx = 1 - 0.02 * Math.sin(t * 2 + r.phase);
        if (r.tap) { // 點擊：0.4 秒布丁壓扁回彈
          const h = (t - r.tap.t0) / 0.4;
          if (h >= 1) r.tap = null; else if (h > 0) { const w = Math.sin(h * Math.PI * 2) * (1 - h); sy *= 1 - 0.34 * w; sx *= 1 + 0.2 * w; }
        }
        if (hopH > 0) { sy *= 1.06; sx *= 0.97; }
        mm.copy(base).multiply(sc.makeScale(K * sx, K * sy, K * sx)); mm.elements[13] += hopH;
        r.mesh.matrix.copy(mm); r.mesh.matrixWorld.copy(mm);
        if (r.carrot) this._placeCarrot(r, base, sx, sy, hopH);
      } else {
        // 小兔兔：原地輕跳＋耳朵擺動；點擊高跳翻一圈
        const beat = Math.abs(Math.sin(t * 4.5 + r.phase));
        let y = beat * 0.12, flip = 0;
        if (r.tap) {
          const h = (t - r.tap.t0) / 0.75;
          if (h >= 1) r.tap = null; else if (h > 0) { y += Math.sin(h * Math.PI) * 0.9; flip = Math.PI * 2 * ease(h); }
        }
        mm.copy(r.bunnyBase || base).multiply(sc.makeScale(K, K, K)).multiply(T.makeTranslation(0, y + hopH / K, 0));
        if (flip) mm.multiply(T.makeTranslation(0, 0.7, 0)).multiply(Rm.makeRotationX(-flip)).multiply(T.makeTranslation(0, -0.7, 0));
        const g = r.bunny.group; g.matrix.copy(mm); g.matrixWorldNeedsUpdate = true;
        r.mesh.matrix.copy(base); r.mesh.matrixWorld.copy(base);
        r.bunny.ears.forEach(e => { e.rotation.z = -e.userData.side * (0.12 + 0.22 * beat); e.rotation.x = -0.1 * beat; });
      }
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
    const moving = touched.size > 0 || !!this.reward?.busy || this.residents.some(r => r.hop || r.tap); // 呼吸、兔子輕跳不算（陰影沿用）
    if (moving || this._wasMoving) { this.shadowMap.needsUpdate = true; this.shadowUpdates++; } // 動完再補一張，停在最終姿勢
    this._wasMoving = moving;
  }

  /** 胡蘿蔔插在水豚頭頂（跟著呼吸與跳） */
  _placeCarrot(r, base, sx = 1, sy = 1, dy = 0, preScaled = false) {
    const K = preScaled ? 1 : this.K, m = r.carrot.matrix;
    m.copy(base).multiply(this._S.makeScale(K, K, K)).multiply(this._T.makeTranslation(0, 1.42 * sy, 0.05)).multiply(this._R.makeRotationZ(0.35));
    m.elements[13] += dy; r.carrot.matrixWorld.copy(m);
  }
  /** 圖鑑近拍用：這隻角色要拍哪些物件 */
  figureFor(object) { const r = this.residents.find(x => x.name === object); if (!r) return []; return r.kind === 'bunny' ? [r.bunny.group] : [r.mesh, r.carrot].filter(Boolean); }
  /** 角色螢幕上的中心點（世界座標） */
  _center(r) {
    const p = r.kind === 'bunny' ? new THREE.Vector3().setFromMatrixPosition(r.bunny.group.matrix) : new THREE.Vector3().setFromMatrixPosition(r.mesh.matrixWorld);
    return p.add(new THREE.Vector3(0, 0.7 * this.K, 0));
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
    let best = null, bd = 46 * 46; // v5：角色放大，判定半徑 46 px
    for (const r of this.residents) {
      const p = this.toScreen(this._center(r));
      const d = (p.x - x) ** 2 + (p.y - y) ** 2; if (d < bd) { bd = d; best = { r, p }; }
    }
    if (!best) return null;
    const r = best.r; this.sound?.unlock(); r.tap = { t0: this.t };
    if (r.kind === 'capy') { this.sound?.puru(); burst(this.stage, best.p.x, best.p.y - 30, { n: 8, spread: 70, glyphs: ['💗', '🥕', '💕'], duration: 800 }); }
    else { this.sound?.boing(); burst(this.stage, best.p.x, best.p.y - 30, { n: 10, spread: 80, glyphs: ['⭐', '✨', '🌟'], duration: 800 }); }
    this.log('tap ' + r.name + ' (' + r.kind + ')');
    return r.name;
  }

  // ======== 地圖上的課次標記 ========
  mountPins({ onPick }) {
    this.onPick = onPick;
    const css = document.createElement('style'); css.textContent = `
.tf-pin{position:absolute;z-index:3;transform:translate(-50%,-50%);width:48px;height:48px;border-radius:50%;border:0;background:transparent;display:flex;align-items:center;justify-content:center;font:800 16px system-ui,"Noto Sans TC",sans-serif;color:var(--ui-ink,#5B3A4A);cursor:pointer;padding:0;touch-action:manipulation;transition:transform .15s,opacity .25s}
.tf-pin::before{content:'';position:absolute;inset:5px;z-index:-1;border-radius:50%;border:3px solid #fff;background:#fffdf7;box-shadow:0 3px 10px rgba(0,0,0,.25)} /* v5：看到的圓 38px，可點範圍 48px */
.tf-pin.done::before{border-color:var(--ui-accent,#FFA94D)}
.tf-pin.active{transform:translate(-50%,-50%) scale(1.15);color:#fff}
.tf-pin.active::before{background:var(--ui-primaryDark,#E8665C);border-color:var(--ui-accent,#FFA94D)}
.tf-pin small{position:absolute;top:100%;left:50%;transform:translateX(-50%);margin-top:-5px;font:700 11px system-ui;color:#fff;background:rgba(91,58,74,.85);border-radius:6px;padding:0 4px;white-space:nowrap}
.tf-pins-hidden .tf-pin{opacity:0;pointer-events:none}
@media (max-width:600px){.tf-pin{font-size:13px}.tf-pin::before{inset:9px;border-width:2px}.tf-pin small{font-size:9px;padding:0 3px}}`;
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
        const dx = sr.width < 600 ? 26 : 30; /* v5：兩顆共用一區的標記中心距 ≥ 52 px，48 px 熱區不重疊 */ x = p.x + (shared ? (n ? dx : -dx) : 0); y = p.y;
      }
      b._x = x; b._y = y;
    }
    // v5：48 px 熱區不重疊——中心距小於 52 px 的兩顆互相推開（螢幕座標，只影響標記位置）
    for (let it = 0; it < 8; it++) for (let i = 0; i < this.pins.length; i++) for (let j = i + 1; j < this.pins.length; j++) {
      const a = this.pins[i], c = this.pins[j], dx = c._x - a._x, dy = c._y - a._y, d = Math.hypot(dx, dy) || 0.01;
      if (d < 52) { const k = (52 - d) / 2 / d; a._x -= dx * k; a._y -= dy * k; c._x += dx * k; c._y += dy * k; }
    }
    for (const b of this.pins) { b.style.left = Math.round(b._x) + 'px'; b.style.top = Math.round(Math.max(24, b._y)) + 'px'; }
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

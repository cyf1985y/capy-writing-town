// 大廳載入器（第 3 步）：由 webgl-test/town-v5.js 複製載入、燈光、陰影、水流／蒸氣 shader、GPU 實例化分批邏輯，
// 原檔未動。差異：
//  - 建 batch 時保存 instanceId → sourceObjectName 對照（lookup）。
//  - separateObjects（例如 Resident_static_N101_160）排除於靜態 batch，單獨以一個 Mesh 渲染（獨立材質 clone），供第 4 步位移／淡入。
//  - 12 片蒸氣按名稱分組回傳（steamGroups），供第 4 步只開 L205_147 那組。
//  - 沒有 benchmark、沒有 OrbitControls 旋轉（controls.enabled=false，鎖相機），沒有 town-v5 頁面的 DOM 查詢。
//  - 不自行跑 RAF；渲染迴圈由 lobby.js 管理。
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

export const STAGE = 'stage5';

async function readJSON(url) { const r = await fetch(url); if (!r.ok) throw new Error(url + ' HTTP ' + r.status); return r.json(); }

export async function loadTown({ container, base = '../models/Town_v5/stage5/', separateObjects = [], onStatus = () => {}, errors = [] }) {
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.debug.onShaderError = (gl, program, vs, fs) => { errors.push('Shader link failed: ' + gl.getProgramInfoLog(program) + ' | vertex: ' + gl.getShaderInfoLog(vs) + ' | fragment: ' + gl.getShaderInfoLog(fs)); onStatus('Shader 編譯失敗；此頁不得計為通過。'); };
  renderer.domElement.addEventListener('webglcontextlost', () => { errors.push('WebGL context lost'); onStatus('WebGL context 已遺失；請重新載入後重測。'); });
  renderer.setPixelRatio(1); renderer.info.autoReset = false;
  container.append(renderer.domElement);
  const scene = new THREE.Scene(); scene.background = new THREE.Color('#dce4dd');
  scene.add(new THREE.HemisphereLight(0xfff8e8, 0x829383, 2));
  const sun = new THREE.DirectionalLight(0xfff1dc, 2.5); sun.position.set(-10, 30, 15); scene.add(sun);
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap; sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -40, right: 40, top: 40, bottom: -40, near: .1, far: 120 }); sun.shadow.normalBias = .035; sun.shadow.bias = -.00015;
  const camera = new THREE.OrthographicCamera(-26, 26, 15, -15, .1, 250);
  const controls = new OrbitControls(camera, renderer.domElement); controls.enableDamping = false; controls.enabled = false; // 鎖相機（契約 entry.cameraLocked）

  onStatus('載入場景…');
  const manifest = await readJSON(base + 'scene_manifest.json');
  const model = (await new GLTFLoader().loadAsync(base + 'Town_blockout.glb')).scene;
  model.traverse(o => { if (o.isMesh) { o.castShadow = !o.name.startsWith('Continuous_river') && o.material.name !== 'Steam'; o.receiveShadow = true; } });

  // 水流／蒸氣 shader：與 town-v5.js 相同，時間由 uFlowTime 統一控制（lobby 用可暫停的效果時間）
  const waterUniforms = [], waterMaterials = new Set();
  model.traverse(o => { if (o.isMesh && ['Blockout_water', 'Waterfall', 'River_foam', 'Steam'].includes(o.material.name)) waterMaterials.add(o.material); });
  for (const material of waterMaterials) {
    const falling = material.name === 'Waterfall', steaming = material.name === 'Steam';
    if (steaming) { material.depthWrite = false; material.side = THREE.DoubleSide; }
    material.onBeforeCompile = shader => {
      const time = { value: 0 }; shader.uniforms.uFlowTime = time; waterUniforms.push(time);
      shader.vertexShader = 'varying vec3 vFlowWorld;\n' + shader.vertexShader;
      shader.vertexShader = shader.vertexShader.replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\n vec4 flowPosition=vec4(transformed,1.0);\n #ifdef USE_INSTANCING\n flowPosition=instanceMatrix*flowPosition;\n #endif\n vFlowWorld=(modelMatrix*flowPosition).xyz;');
      shader.fragmentShader = 'uniform float uFlowTime; varying vec3 vFlowWorld;\n' + shader.fragmentShader;
      shader.fragmentShader = shader.fragmentShader.replace('#include <color_fragment>', '#include <color_fragment>\n diffuseColor.rgb *= ' + (falling ? '(0.90+0.10*sin(vFlowWorld.y*19.0+uFlowTime*6.0))' : '(0.94+0.06*sin(vFlowWorld.x*4.0+vFlowWorld.z*2.0-uFlowTime*1.8))') + ';' + (steaming ? '\n diffuseColor.a *= 0.70+0.30*sin(uFlowTime*0.8+vFlowWorld.x*2.0+vFlowWorld.z*3.0);' : ''));
    };
    material.customProgramCacheKey = () => steaming ? 'town-steam-v1' : falling ? 'town-falling-water-v1' : 'town-river-water-v1';
    material.needsUpdate = true;
  }

  // 分批：與 town-v5.js 相同的 geometry|material|castShadow 鍵；另存每個 instance 的來源物件名
  model.updateMatrixWorld(true);
  const separate = new Map();              // name → Mesh（獨立渲染）
  const steamMeshes = [];                   // 12 片蒸氣（單獨 Mesh，方便分組開關）
  const groups = new Map();
  const separateSet = new Set(separateObjects);
  model.traverse(o => {
    if (!o.isMesh) return;
    if (separateSet.has(o.name) || o.material.name === 'Steam') return; // 不進 batch
    const key = o.geometry.uuid + '|' + o.material.uuid + '|' + o.castShadow;
    if (!groups.has(key)) groups.set(key, { source: o, matrices: [], names: [] });
    groups.get(key).matrices.push(o.matrixWorld.clone()); groups.get(key).names.push(o.name);
  });
  const instanced = new THREE.Group(); instanced.name = 'instanced'; scene.add(instanced);
  const lookup = new Map();                 // InstancedMesh → names[]（instanceId → sourceObjectName）
  const objectIndex = new Map();            // sourceObjectName → {mesh, instanceId}
  for (const { source, matrices, names } of groups.values()) {
    const o = new THREE.InstancedMesh(source.geometry, source.material, matrices.length);
    matrices.forEach((m, i) => o.setMatrixAt(i, m)); o.instanceMatrix.needsUpdate = true; o.computeBoundingSphere();
    o.castShadow = source.castShadow; o.receiveShadow = true; o.name = 'batch:' + source.name; o.userData.sourceNames = names;
    instanced.add(o); lookup.set(o, names); names.forEach((n, i) => objectIndex.set(n, { mesh: o, instanceId: i }));
  }
  // 獨立物件：複製 Mesh、材質 clone（淡入不影響其他同材質實例），保留世界矩陣
  const separatedGroup = new THREE.Group(); separatedGroup.name = 'separated'; scene.add(separatedGroup);
  model.traverse(o => {
    if (!o.isMesh) return;
    if (separateSet.has(o.name) || o.material.name === 'Steam') {
      const m = new THREE.Mesh(o.geometry, o.material.name === 'Steam' ? o.material : o.material.clone());
      m.name = o.name; m.castShadow = o.castShadow; m.receiveShadow = o.receiveShadow;
      m.matrixAutoUpdate = false; m.matrix.copy(o.matrixWorld); m.matrixWorld.copy(o.matrixWorld);
      m.userData.restMatrix = o.matrixWorld.clone();
      separatedGroup.add(m);
      if (o.material.name === 'Steam') steamMeshes.push(m); else separate.set(o.name, m);
    }
  });
  model.visible = false; // 原 model 不渲染，只保留作資料來源（不像 town-v5 可切換一般繪製）

  // 蒸氣分組：build_stage5.py 以三池各四片生成，GLB 命名 DISPLAY_Steam, .001 … .011（依序）；
  // 分組依「離三個 Hot_pool anchor 最近」決定，不假設命名順序。
  const pools = manifest.architecture_instances.filter(a => a.building === 'Hot_pool');
  const steamGroups = new Map(pools.map(p => [p.object, []]));
  const tmp = new THREE.Vector3();
  for (const s of steamMeshes) {
    tmp.setFromMatrixPosition(s.matrixWorld);
    let best = null, bd = Infinity;
    for (const p of pools) { const [bx, by, bz] = p.anchor_blender_m; const d = tmp.distanceTo(new THREE.Vector3(bx, bz, -by)); if (d < bd) { bd = d; best = p.object; } }
    steamGroups.get(best).push(s); s.userData.pool = best;
  }

  const xyz = p => [p[0], p[2], -p[1]];
  function reset() { camera.position.fromArray(xyz(manifest.camera.position)); controls.target.fromArray(xyz(manifest.camera.target)); camera.zoom = 1; camera.updateProjectionMatrix(); controls.update(); }
  function resize(width) {
    const w = width ?? Math.min(1600, innerWidth - 40), h = Math.round(w * 941 / 1672);
    renderer.setSize(w, h); camera.left = -26; camera.right = 26; camera.top = 26 * h / w; camera.bottom = -26 * h / w; camera.updateProjectionMatrix();
  }
  resize(); reset();
  const inventory = { meshNodes: 0, batches: instanced.children.length, separated: separate.size, steam: steamMeshes.length };
  model.traverse(o => { if (o.isMesh) inventory.meshNodes++; });
  onStatus(`已載入 stage5：${inventory.meshNodes} 個 mesh node、${inventory.batches} 個 batch、獨立渲染 ${inventory.separated} 件、蒸氣 ${inventory.steam} 片`);
  return { THREE, renderer, scene, camera, controls, sun, manifest, model, instanced, lookup, objectIndex, separate, steamMeshes, steamGroups, waterUniforms, reset, resize, inventory, errors,
    uvzToThree: ([u, v, z]) => new THREE.Vector3((u - v) / Math.SQRT2, z, -((u + v) / Math.SQRT2)) };
}

// v5 甜點樂園主題（契約 v5 theme.lighting / theme.water）：只改執行期的燈光、色調映射、背景與水色，
// 不動 GLB 檔。材質的馬卡龍色相偏移在 town-fx.js 的區域著色器裡做（同一段 shader，不多一次編譯）。
import * as THREE from 'three';

export function applyTheme(town, theme) {
  const L = theme.lighting, { scene, renderer, sun } = town, out = {};
  scene.background = new THREE.Color(L.background);
  let hemi = null; scene.traverse(o => { if (o.isHemisphereLight) hemi = o; });
  if (!hemi) { hemi = new THREE.HemisphereLight(); scene.add(hemi); }
  hemi.color.set(L.hemisphere[0]); hemi.groundColor.set(L.hemisphere[1]); hemi.intensity = L.hemisphere[2];
  const amb = new THREE.AmbientLight(L.ambient[0], L.ambient[1]); amb.name = 'theme-ambient'; scene.add(amb); // 暖紫粉環境光：陰影不再死黑
  sun.color.set(L.sun[0]); sun.intensity = L.sun[1];
  renderer.toneMapping = THREE[L.toneMapping] ?? THREE.NeutralToneMapping; renderer.toneMappingExposure = L.exposure;
  // 水：亮粉藍彈珠汽水
  const water = theme.water || {}; let tinted = 0;
  scene.traverse(o => { if (!o.isMesh) return; const m = o.material; if (m && water[m.name] && !m.userData.themeWater) { m.color.set(water[m.name]); m.emissive?.set(water[m.name]).multiplyScalar(0.18); m.userData.themeWater = true; tinted++; } });
  Object.assign(out, { hemisphere: L.hemisphere, ambient: L.ambient, toneMapping: renderer.toneMapping, exposure: renderer.toneMappingExposure, waterMaterials: tinted });
  return out;
}

/** UI 配色寫進 CSS 變數，頁面與面板共用 */
export function applyUiColors(ui) {
  const r = document.documentElement.style;
  for (const [k, v] of Object.entries(ui)) r.setProperty('--ui-' + k, v);
}

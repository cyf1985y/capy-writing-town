// v6 程序化角色與甜點道具（契約 v6 characters / props）。
// 效能：幾何與材質全域只建一次；同一種物件全場共用一個 InstancedMesh（3 隻兔子的身體、左耳、右耳各 1 個 draw call，
// 5 根胡蘿蔔 1 個、布丁 1 個、馬卡龍 1 個）。段數上限 radial ≤ 10、height ≤ 8。
// 尺寸以水豚原始尺寸（高 1.5）為單位，外面再整體放大；前方 = 本地 +z，腳底 y = 0。
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

function part(geo, color, { pos = [0, 0, 0], scale = [1, 1, 1], rot = [0, 0, 0] } = {}) {
  geo.scale(...scale); geo.rotateX(rot[0]); geo.rotateY(rot[1]); geo.rotateZ(rot[2]); geo.translate(...pos);
  if (geo.index) geo = geo.toNonIndexed();
  geo.deleteAttribute('uv');
  const c = new THREE.Color(color), n = geo.attributes.position.count, a = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { a[i * 3] = c.r; a[i * 3 + 1] = c.g; a[i * 3 + 2] = c.b; }
  geo.setAttribute('color', new THREE.BufferAttribute(a, 3));
  return geo;
}
const S = (r, w = 10, h = 8) => new THREE.SphereGeometry(r, w, h);

let shared = null;
/** 全域共用的幾何與材質（只建一次） */
export function sharedAssets() {
  if (shared) return shared;
  const fur = '#FFFFFF', inner = '#FFB7B2';
  const bunnyBody = mergeGeometries([
    part(S(0.46), fur, { pos: [0, 0.46, 0], scale: [1, 0.95, 0.92] }),
    part(S(0.38), fur, { pos: [0, 1.04, 0.06] }),                                 // 頭
    part(S(0.15, 8, 6), fur, { pos: [0, 0.34, -0.44] }),                          // 圓尾巴
    part(S(0.13, 8, 6), fur, { pos: [-0.2, 0.08, 0.26], scale: [1, 0.6, 1.4] }),  // 腳
    part(S(0.13, 8, 6), fur, { pos: [0.2, 0.08, 0.26], scale: [1, 0.6, 1.4] }),
    part(S(0.05, 6, 4), '#3B2A33', { pos: [-0.14, 1.1, 0.38] }),                  // 眼睛
    part(S(0.05, 6, 4), '#3B2A33', { pos: [0.14, 1.1, 0.38] }),
    part(S(0.07, 6, 4), '#FF9AA2', { pos: [-0.23, 0.98, 0.3], scale: [1, 0.6, 0.5] }), // 腮紅
    part(S(0.07, 6, 4), '#FF9AA2', { pos: [0.23, 0.98, 0.3], scale: [1, 0.6, 0.5] }),
    part(S(0.04, 6, 4), '#FF7B8A', { pos: [0, 1.0, 0.43] }),                       // 鼻子
  ]);
  const bunnyEar = mergeGeometries([
    part(new THREE.CapsuleGeometry(0.1, 0.5, 3, 8), fur, { pos: [0, 0.33, 0] }),
    part(new THREE.CapsuleGeometry(0.055, 0.4, 2, 6), inner, { pos: [0, 0.33, 0.06] }),
  ]);
  const carrot = mergeGeometries([
    part(new THREE.ConeGeometry(0.14, 0.5, 8), '#FF9F43', { pos: [0, 0.25, 0], rot: [Math.PI, 0, 0] }),
    part(new THREE.ConeGeometry(0.05, 0.24, 5), '#6BCB77', { pos: [0, 0.6, 0] }),
    part(new THREE.ConeGeometry(0.05, 0.2, 5), '#58B368', { pos: [-0.07, 0.57, 0], rot: [0, 0, 0.5] }),
    part(new THREE.ConeGeometry(0.05, 0.2, 5), '#58B368', { pos: [0.07, 0.57, 0], rot: [0, 0, -0.5] }),
  ]);
  // 巨型焦糖布丁：盤子＋布丁體＋焦糖頂＋奶油＋櫻桃（底在 y=0，高約 1）
  const pudding = mergeGeometries([
    part(new THREE.CylinderGeometry(0.62, 0.62, 0.06, 10), '#FFFDF9', { pos: [0, 0.03, 0] }),
    part(new THREE.CylinderGeometry(0.36, 0.48, 0.62, 10), '#FFE08A', { pos: [0, 0.37, 0] }),
    part(new THREE.CylinderGeometry(0.34, 0.37, 0.12, 10), '#B5651D', { pos: [0, 0.72, 0] }),
    part(S(0.16, 8, 6), '#FFFDF9', { pos: [0, 0.82, 0], scale: [1, 0.6, 1] }),
    part(S(0.08, 8, 6), '#E63946', { pos: [0, 0.94, 0] }),
  ]);
  // 雙色馬卡龍坐墊（粉＋薄荷夾奶油；顏色由 instanceColor 再乘一次做變化）
  const macaron = mergeGeometries([
    part(new THREE.CylinderGeometry(0.5, 0.46, 0.22, 10), '#FFB7B2', { pos: [0, 0.11, 0] }),
    part(new THREE.CylinderGeometry(0.44, 0.44, 0.1, 10), '#FFFDF9', { pos: [0, 0.27, 0] }),
    part(new THREE.CylinderGeometry(0.46, 0.5, 0.22, 10), '#B5EAD7', { pos: [0, 0.43, 0] }),
  ]);
  const material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8, metalness: 0 });
  shared = { bunnyBody, bunnyEar, carrot, pudding, macaron, material };
  return shared;
}

/** 一個 InstancedMesh（共用材質），矩陣由外部每幀設定 */
export function instanced(geometry, count, { castShadow = true, colors = null } = {}) {
  const m = new THREE.InstancedMesh(geometry, sharedAssets().material, count);
  m.castShadow = castShadow; m.receiveShadow = true; m.frustumCulled = false; // 實例散在全鎮，關掉整體裁切
  if (colors) colors.forEach((c, i) => m.setColorAt(i, new THREE.Color(c)));
  return m;
}

/** 兔子耳朵相對身體的位置（左 -1、右 +1） */
export const EAR_POS = sx => [0.15 * sx, 1.3, 0];

/** 小量三角面統計（給報告用） */
export function triCount(geo) { return (geo.index ? geo.index.count : geo.attributes.position.count) / 3; }

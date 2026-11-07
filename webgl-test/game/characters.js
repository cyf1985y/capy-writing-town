// v5 程序化角色（契約 v5 characters）：長耳小兔兔、頭頂胡蘿蔔。全部用 Three.js 基本幾何合併成少數 Mesh（頂點色），
// 每隻兔子 3 個 draw call（身體＋兩隻耳朵，耳朵要各自擺動），每根胡蘿蔔 1 個。尺寸以水豚原始尺寸（高 1.5）為單位，外面再整體放大。
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

function part(geo, color, { pos = [0, 0, 0], scale = [1, 1, 1], rot = [0, 0, 0] } = {}) {
  geo.scale(...scale); geo.rotateX(rot[0]); geo.rotateY(rot[1]); geo.rotateZ(rot[2]); geo.translate(...pos);
  const c = new THREE.Color(color), n = geo.attributes.position.count, a = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { a[i * 3] = c.r; a[i * 3 + 1] = c.g; a[i * 3 + 2] = c.b; }
  geo.setAttribute('color', new THREE.BufferAttribute(a, 3));
  if (geo.index) geo = geo.toNonIndexed(); // 合併時屬性一致
  geo.deleteAttribute('uv');
  return geo;
}
const mat = () => new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.75, metalness: 0 });

/** 圓滾滾兔子：回傳 {group, ears:[L,R], body}。前方 = 本地 +z，腳底 y=0。 */
export function makeBunny({ fur = '#FFFDF8', inner = '#FFB7B2', cheek = '#FF9AA2' } = {}) {
  const S = (r, w = 16, h = 12) => new THREE.SphereGeometry(r, w, h);
  const body = mergeGeometries([
    part(S(0.46), fur, { pos: [0, 0.46, 0], scale: [1, 0.95, 0.92] }),
    part(S(0.38), fur, { pos: [0, 1.04, 0.06] }),                                  // 頭
    part(S(0.15, 10, 8), fur, { pos: [0, 0.34, -0.44] }),                          // 圓尾巴
    part(S(0.13, 10, 8), fur, { pos: [-0.2, 0.08, 0.26], scale: [1, 0.6, 1.4] }),   // 腳
    part(S(0.13, 10, 8), fur, { pos: [0.2, 0.08, 0.26], scale: [1, 0.6, 1.4] }),
    part(S(0.05, 8, 6), '#3B2A33', { pos: [-0.14, 1.1, 0.38] }),                   // 眼睛
    part(S(0.05, 8, 6), '#3B2A33', { pos: [0.14, 1.1, 0.38] }),
    part(S(0.016, 6, 4), '#ffffff', { pos: [-0.125, 1.12, 0.425] }),               // 眼睛亮點
    part(S(0.016, 6, 4), '#ffffff', { pos: [0.155, 1.12, 0.425] }),
    part(S(0.07, 8, 6), cheek, { pos: [-0.23, 0.98, 0.3], scale: [1, 0.6, 0.5] }),  // 腮紅
    part(S(0.07, 8, 6), cheek, { pos: [0.23, 0.98, 0.3], scale: [1, 0.6, 0.5] }),
    part(S(0.04, 8, 6), '#FF7B8A', { pos: [0, 1.0, 0.43] }),                        // 鼻子
  ]);
  const bodyMesh = new THREE.Mesh(body, mat()); bodyMesh.castShadow = true; bodyMesh.receiveShadow = true;
  const earGeo = mergeGeometries([
    part(new THREE.CapsuleGeometry(0.1, 0.5, 4, 10), fur, { pos: [0, 0.33, 0] }),
    part(new THREE.CapsuleGeometry(0.055, 0.4, 4, 8), inner, { pos: [0, 0.33, 0.06] }),
  ]);
  const group = new THREE.Group(); group.add(bodyMesh);
  const ears = [-1, 1].map(sx => {
    const e = new THREE.Mesh(earGeo, bodyMesh.material); e.castShadow = true;
    e.position.set(0.15 * sx, 1.3, 0.0); e.rotation.z = -0.15 * sx; e.userData.side = sx; group.add(e); return e;
  });
  return { group, ears, body: bodyMesh };
}

/** 低面數大胡蘿蔔（尖端朝下），底部在 y=0 */
export function makeCarrot() {
  const geo = mergeGeometries([
    part(new THREE.ConeGeometry(0.14, 0.5, 8), '#FF9F43', { pos: [0, 0.25, 0], rot: [Math.PI, 0, 0] }),
    part(new THREE.ConeGeometry(0.05, 0.24, 5), '#6BCB77', { pos: [0, 0.6, 0] }),
    part(new THREE.ConeGeometry(0.05, 0.2, 5), '#58B368', { pos: [-0.07, 0.57, 0], rot: [0, 0, 0.5] }),
    part(new THREE.ConeGeometry(0.05, 0.2, 5), '#58B368', { pos: [0.07, 0.57, 0], rot: [0, 0, -0.5] }),
  ]);
  const m = new THREE.Mesh(geo, mat()); m.castShadow = true; m.matrixAutoUpdate = false;
  return m;
}

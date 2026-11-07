// 卡比巴拉圖鑑（契約 v4 album，簡化版）：完成一課解鎖一隻；縮圖在執行時從小鎮近拍，不需要新美術。
// 解鎖狀態由 passedTaskIds 推導，不寫存檔。
import * as THREE from 'three';

const CSS = `
.al-overlay{position:fixed;inset:0;z-index:900;background:rgba(91,58,74,.6);display:flex;align-items:center;justify-content:center;font:16px system-ui,"Noto Sans TC",sans-serif;color:var(--ui-ink,#5B3A4A)}
.al-box{background:#fffdf7;border-radius:20px;box-shadow:0 20px 60px rgba(0,0,0,.35);padding:16px 18px 18px;width:min(94vw,640px);max-height:92vh;overflow:auto;box-sizing:border-box}
.al-head{display:flex;align-items:center;gap:10px;margin-bottom:10px}
.al-head h2{margin:0;font-size:21px}.al-head span{color:#6c7d77;font-size:14px}
.al-head button{margin-left:auto;font:inherit;font-size:18px;padding:6px 14px;border-radius:12px;border:2px solid #F7C9C0;background:#fff;cursor:pointer}
.al-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:10px}
@media (max-width:600px){.al-grid{grid-template-columns:repeat(2,1fr)}}
.al-card{font:inherit;display:flex;flex-direction:column;align-items:center;gap:4px;padding:8px 6px;border-radius:14px;border:3px solid #e3ddd0;background:#fff;cursor:pointer;touch-action:manipulation;color:inherit}
.al-card img{width:100%;aspect-ratio:1;object-fit:cover;border-radius:10px;background:#e9efe6}
.al-card b{font-size:17px}.al-card small{font-size:12px;color:#6c7d77}
.al-card.locked{cursor:default;background:#f4f1ea}
.al-card.locked img{filter:brightness(0) opacity(.35);background:none}
.al-card.new{border-color:#f08c00;animation:al-glow 1.2s ease-in-out 3}
@keyframes al-glow{50%{box-shadow:0 0 0 8px rgba(240,140,0,.3)}}
#albumBtn.al-ping{animation:al-glow 1s ease-in-out 4}
`;

export class Album {
  constructor({ town, lobby, townFx, contract, voice, sound, log = () => {} }) {
    Object.assign(this, { town, lobby, townFx, contract, voice, sound, log });
    this.cfg = contract.album;
    this.thumbs = new Map();
    this.seen = new Set(); try { JSON.parse(localStorage.getItem('capy_album_seen') || '[]').forEach(n => this.seen.add(n)); } catch { /* ignore */ }
    if (!document.getElementById('al-style')) { const s = document.createElement('style'); s.id = 'al-style'; s.textContent = CSS; document.head.append(s); }
  }

  /** 依進度回傳 [{object,name,unlockLesson,unlocked,done,total}] */
  status(passedTaskIds) {
    const passed = new Set(passedTaskIds);
    return this.cfg.residents.map(r => {
      if (r.unlockLesson == null) return { ...r, unlocked: true, done: 0, total: 0 };
      const ids = this.contract.modes['lesson_' + r.unlockLesson]?.writingTaskIds || [];
      const done = ids.filter(id => passed.has(id)).length;
      return { ...r, unlocked: ids.length > 0 && done === ids.length, done, total: ids.length };
    });
  }
  /** 比較前後進度，回傳新解鎖的名字 */
  newlyUnlocked(before, after) {
    const a = new Set(this.status(before).filter(r => r.unlocked).map(r => r.object));
    return this.status(after).filter(r => r.unlocked && !a.has(r.object));
  }
  unseenCount(passed) { return this.status(passed).filter(r => r.unlocked && !this.seen.has(r.object)).length; }

  /** 用遊戲鏡頭方向近拍一隻卡比巴拉（全彩），回傳 dataURL */
  _snap(object) {
    if (this.thumbs.has(object)) return this.thumbs.get(object);
    const fig = this.townFx.figureFor?.(object); if (!fig) return ''; // v6：{objects, box}；兔子、胡蘿蔔是全場共用的 InstancedMesh，取景框由 town-fx 算
    const figs = fig.objects, fbox = fig.box;
    const { renderer, scene, camera } = this.town, canvas = renderer.domElement;
    const box = fbox, c = box.getCenter(new THREE.Vector3()), size = box.getSize(new THREE.Vector3());
    const cam = camera.clone(), off = camera.position.clone().sub(this.townFx.home.target);
    cam.position.copy(c).add(off); cam.lookAt(c);
    const viewH = Math.max(size.x, size.y, size.z) * 1.25;
    cam.zoom = (camera.top - camera.bottom) / viewH; cam.updateProjectionMatrix(); cam.updateMatrixWorld();
    // 只拍這一隻：Mesh 與燈光加到圖層 7，相機只看圖層 7（未解鎖卡片的剪影才會是卡比巴拉的形狀）
    const L = 7, lights = []; scene.traverse(o => { if (o.isLight) { o.layers.enable(L); lights.push(o); } });
    figs.forEach(f => f.traverse(o => o.layers.enable(L))); cam.layers.set(L);
    const bg = scene.background; scene.background = new THREE.Color('#00ff00'); // v5：去背用純綠（白兔、奶油色都離它很遠）
    const u = this.townFx.u, floor0 = u.uZoneFloor.value; u.uZoneFloor.value = 1; // 圖鑑裡一律全彩
    fig.isolate?.(); renderer.render(scene, cam); fig.restore?.();
    scene.background = bg; figs.forEach(f => f.traverse(o => o.layers.disable(L))); lights.forEach(o => o.layers.disable(L));
    const side = Math.min(canvas.width, canvas.height), out = document.createElement('canvas'); out.width = out.height = 160;
    const g2 = out.getContext('2d', { willReadFrequently: true });
    g2.drawImage(canvas, (canvas.width - side) / 2, (canvas.height - side) / 2, side, side, 0, 0, 160, 160);
    // 背景色去掉（透明），未解鎖時 CSS 剪影才只剩卡比巴拉輪廓
    const img = g2.getImageData(0, 0, 160, 160), d = img.data;
    for (let i = 0; i < d.length; i += 4) { const e = Math.abs(d[i]) + Math.abs(d[i + 1] - 0xff) + Math.abs(d[i + 2]); if (e < 60) d[i + 3] = 0; else if (e < 140) { d[i + 3] = Math.round(255 * (e - 60) / 80); d[i + 1] = Math.min(d[i + 1], (d[i] + d[i + 2]) / 2 + 40); /* 邊緣去綠 */ } }
    g2.putImageData(img, 0, 0);
    u.uZoneFloor.value = floor0;
    this.lobby.requestFrame(); // 下一幀畫回原本的小鎮
    const url = out.toDataURL('image/png'); this.thumbs.set(object, url); return url;
  }

  open(passedTaskIds, { highlight = [] } = {}) {
    if (this.el) return;
    const list = this.status(passedTaskIds), got = list.filter(r => r.unlocked).length;
    const el = document.createElement('div'); el.className = 'al-overlay'; el.setAttribute('role', 'dialog'); el.setAttribute('aria-label', this.cfg.title || '卡比巴拉圖鑑');
    el.innerHTML = `<div class="al-box"><div class="al-head"><h2>${this.cfg.title || '卡比巴拉圖鑑'}</h2><span>${got} / ${list.length} 位朋友</span><button type="button" data-close>關閉</button></div><div class="al-grid"></div></div>`;
    const grid = el.querySelector('.al-grid');
    for (const r of list) {
      const b = document.createElement('button'); b.type = 'button'; b.className = 'al-card' + (r.unlocked ? '' : ' locked') + (r.unlocked && (highlight.includes(r.object) || !this.seen.has(r.object)) ? ' new' : '');
      const lessonName = r.unlockLesson === 0 ? '首冊數字' : `第 ${r.unlockLesson} 課`;
      b.innerHTML = `<img alt="" src="${this._snap(r.object)}"><b>${r.unlocked ? r.name : '？？？'}</b><small>${r.unlocked ? (r.note || lessonName + '的朋友') : `寫完${lessonName}（${r.done}/${r.total}）`}</small>`;
      b.disabled = !r.unlocked; b.dataset.object = r.object;
      if (r.unlocked) b.addEventListener('click', () => this.visit(r));
      grid.append(b);
    }
    for (const r of list) if (r.unlocked) this.seen.add(r.object);
    try { localStorage.setItem('capy_album_seen', JSON.stringify([...this.seen])); } catch { /* ignore */ }
    el.addEventListener('click', e => { if (e.target === el || e.target.closest('[data-close]')) this.close(); });
    el.addEventListener('pointerdown', e => e.stopPropagation());
    this._onKey = e => { if (e.key === 'Escape') this.close(); }; document.addEventListener('keydown', this._onKey);
    document.body.append(el); this.el = el; el.querySelector('[data-close]').focus();
    this.log(`album open ${got}/${list.length}`);
    return list;
  }
  close() { this.el?.remove(); this.el = null; document.removeEventListener('keydown', this._onKey); this.onClose?.(); }

  /** 點圖鑑卡：飛過去看牠、跳一下、唸名字 */
  async visit(r) {
    this.close();
    const fx = this.townFx, res = fx.residents.find(x => x.name === r.object); if (!res) return;
    const p = new THREE.Vector3().setFromMatrixPosition(res.mesh.matrixWorld);
    fx._showPins(false); this.sound?.whoosh(); this.voice?.say(r.name);
    if (!(await fx._camTo(p, 4, 0.8))) return;
    const token = fx.camToken; fx.hop(res, 0.05, 1.3); fx.hop(res, 0.65, 1.0);
    await new Promise(ok => setTimeout(ok, 1600));
    if (token === fx.camToken) await fx.flyHome();
    this.lastVisit = r.object;
  }
}

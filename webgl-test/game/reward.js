// 回饋（第 4 步）：只動 Resident_static_N101_160（已從靜態 batch 排除、獨立 Mesh），
// 起點 UVZ (15.2,10.2,3.6) → 終點 (15,12,3.6)（契約 to_uvz；禁止 (17,9.8,3.6)），線性補間 1.81 m 約 0.8 秒。
// 蒸氣只開 Hot_pool_L205_147 那組 4 片。重開時由存檔推導固定終點（applyState），不累加位移。
import * as THREE from 'three';

export class Reward {
  constructor({ town, lobby, contract, log = () => {} }) {
    Object.assign(this, { town, lobby, contract, log });
    const eff = contract.reward.effect;
    if (eff.forbidden_to_uvz.some(p => p.every((v, i) => v === eff.to_uvz[i]))) throw new Error('FORBIDDEN_NPC_TARGET');
    this.npc = town.separate.get(eff.npcInstance);
    if (!this.npc) throw new Error('NPC_NOT_SEPARATED:' + eff.npcInstance);
    this.delta = town.uvzToThree(eff.to_uvz).sub(town.uvzToThree(eff.from_uvz)); // 只取位移向量，套在原世界矩陣的平移上
    this.distance = this.delta.length();
    this.rest = this.npc.userData.restMatrix.clone();
    this.end = this.rest.clone(); this.end.setPosition(new THREE.Vector3().setFromMatrixPosition(this.rest).add(this.delta));
    this.steam = town.steamGroups.get(eff.steam.replace('enable_flag_pool_', 'Hot_pool_')) ?? [];
    if (this.steam.length !== 4) log(`warning: steam group size ${this.steam.length}, expected 4`);
    // 另外兩池的蒸氣常開（與 town-v5 一致，小鎮才有生氣）；只有 147 組由獎勵開啟
    for (const s of town.steamMeshes) s.visible = !this.steam.includes(s);
    this.state = { atPool: false, steamOn: false };
    this.durationMs = 800;
    this.busy = false; // v3：位移／小跳中為 true，town-fx 的呼吸動畫此時不碰 N101
  }
  _setNpc(matrix) { this.npc.matrix.copy(matrix); this.npc.matrixWorld.copy(matrix); }
  /** 重開／載入：由存檔推導固定姿態（不累加） */
  applyState({ rewardCount }) {
    const on = rewardCount > 0;
    this._setNpc(on ? this.end : this.rest);
    for (const s of this.steam) s.visible = on;
    this.state = { atPool: on, steamOn: on };
    this.lobby.requestFrame();
    this.log(`applyState rewardCount=${rewardCount} → npc ${on ? 'pool' : 'rest'}, steam147 ${on ? 'on' : 'off'}`);
  }
  /** 新獎勵（ledger 首次 committed 後才呼叫）：第一次位移＋開蒸氣；之後只做小跳（不再位移） */
  play({ rewardNew }) {
    if (!rewardNew) { this.log('reward replay: no new reward, no displacement'); return Promise.resolve(false); }
    if (this.state.atPool) { return this._hop(); }
    this.busy = true;
    return new Promise(resolve => {
      const from = new THREE.Vector3().setFromMatrixPosition(this.rest), to = new THREE.Vector3().setFromMatrixPosition(this.end), m = this.rest.clone(); let t = 0;
      this.lobby.animators.add(dt => {
        t = Math.min(1, t + dt * 1000 / this.durationMs);
        const e = t < .5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2; // easeInOutQuad
        m.setPosition(from.clone().lerp(to, e)); this._setNpc(m);
        if (t >= 1) { this._setNpc(this.end); for (const s of this.steam) s.visible = true; this.state = { atPool: true, steamOn: true }; this.log(`reward: npc moved ${this.distance.toFixed(3)} m, steam147 on`); this.busy = false; resolve(true); return false; }
        return true;
      });
    });
  }
  _hop() {
    this.busy = true;
    return new Promise(resolve => {
      const base = new THREE.Vector3().setFromMatrixPosition(this.end), m = this.end.clone(); let t = 0;
      this.lobby.animators.add(dt => {
        t = Math.min(1, t + dt * 1000 / 500);
        m.setPosition(base.clone().add(new THREE.Vector3(0, Math.sin(t * Math.PI) * 0.25, 0))); this._setNpc(m);
        if (t >= 1) { this._setNpc(this.end); this.busy = false; resolve(true); return false; }
        return true;
      });
    });
  }
  npcPosition() { return new THREE.Vector3().setFromMatrixPosition(this.npc.matrixWorld).toArray().map(v => +v.toFixed(3)); }
}

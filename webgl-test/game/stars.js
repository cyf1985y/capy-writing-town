// v9 星星評分（契約 v9 feedback.stars）：由作品本身的 mistakes／hints 推導，不新增存檔欄位。
// 3 星＝沒寫錯、沒提示；2 星＝寫錯過但沒用到提示；1 星＝用過提示或看過示範（hints 已含示範次數）。
export const starsOf = a => (a.hints > 0 ? 1 : a.mistakes > 0 ? 2 : 3);

/** 每個 taskId 的最佳星數 */
export function bestStars(artifacts) {
  const best = new Map();
  for (const a of artifacts) best.set(a.taskId, Math.max(best.get(a.taskId) ?? 0, starsOf(a)));
  return best;
}

/** 一課的星星合計：[拿到的, 滿分] */
export function lessonStars(taskIds, best) {
  return [taskIds.reduce((s, id) => s + (best.get(id) ?? 0), 0), taskIds.length * 3];
}

export const starText = n => '★'.repeat(n) + '☆'.repeat(3 - n);

// 題庫與契約載入：核對 contract_v1.json.content.contentSha256，不符即拒載（不靜默繼續）。
// 不修改既有檔案；純瀏覽器 ESM。

export async function sha256Hex(bytes) {
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, '0')).join('');
}

export async function fetchBytes(url) {
  const response = await fetch(url, { cache: 'no-store' });
  if (!response.ok) throw new Error(`${url} HTTP ${response.status}`);
  return new Uint8Array(await response.arrayBuffer());
}

/**
 * @param {string} base  專案根目錄相對於頁面的前綴，例如 '../'
 * @returns {Promise<{contract, content, contentSha256, writingTasks:Map, questions:Map}>}
 */
export async function loadContract(base = '../') {
  const contract = JSON.parse(new TextDecoder().decode(await fetchBytes(base + 'game/contract_v1.json')));
  const bytes = await fetchBytes(base + contract.content.file);
  const hash = await sha256Hex(bytes);
  if (hash !== contract.content.contentSha256) {
    const err = new Error('CONTENT_HASH_MISMATCH');
    err.detail = { expected: contract.content.contentSha256, actual: hash, file: contract.content.file };
    throw err;
  }
  const content = JSON.parse(new TextDecoder().decode(bytes));
  if (content.meta?.version !== contract.content.contentVersion) {
    const err = new Error('CONTENT_VERSION_MISMATCH');
    err.detail = { expected: contract.content.contentVersion, actual: content.meta?.version };
    throw err;
  }
  const writingTasks = new Map(content.writing_tasks.map(t => [t.id, t]));
  const questions = new Map(content.questions.map(q => [q.id, q]));
  // 白名單 ID 必須存在、type=write、lesson=1
  for (const mode of Object.values(contract.modes)) {
    for (const id of mode.writingTaskIds) {
      const t = writingTasks.get(id);
      if (!t || t.type !== 'write' || t.lesson !== 1) {
        const err = new Error(`INVALID_WHITELIST_TASK:${id}`);
        throw err;
      }
    }
  }
  return { contract, content, contentSha256: hash, writingTasks, questions };
}

/** 將載入錯誤轉成給家長看的訊息（中文），不吞掉錯誤碼。 */
export function describeLoadError(err) {
  const code = err?.message || String(err);
  if (code === 'CONTENT_HASH_MISMATCH') return `題庫檔案與契約鎖定的版本不符（SHA256 不一致），已拒絕載入。預期 ${err.detail.expected.slice(0, 12)}…，實際 ${err.detail.actual.slice(0, 12)}…`;
  if (code === 'CONTENT_VERSION_MISMATCH') return `題庫版本不符（預期 ${err.detail.expected}，實際 ${err.detail.actual}），已拒絕載入。`;
  if (code.startsWith('INVALID_WHITELIST_TASK')) return `契約白名單引用了不存在或型別不符的任務：${code.split(':')[1]}，已拒絕載入。`;
  return `載入失敗：${code}`;
}

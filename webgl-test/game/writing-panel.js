// 田字格寫字面板（第 2 步）。
// - Hanzi Writer 固定版本 3.7.3，ESM 由 vendor-v2/hanzi-writer/lib 載入；字形資料只讀本機 data/<字>.json，不向 CDN 取。
// - quiz 回呼 onCorrectStroke/onMistake/onComplete 收 drawnPath 原始軌跡（character 座標，1024 字身、y 向上）。
// - 支援：正常完成、取消、重試、看示範、字形檔缺失（顯示訊息並回報 deferred）。
// - 面板是全螢幕覆層：pointer/wheel/touch/key 事件在覆層層級 stopPropagation，不穿透到 3D 場景。
import HanziWriter from '../vendor-v2/hanzi-writer/lib/dist/index.esm.js';
import { sha256Hex } from './content.js?v=58';
import { bravo, flash, spark } from './fx.js?v=58';
import { starsOf } from './stars.js?v=58'; // 契約 v3 feedback：筆畫閃光、完成慶祝（音效由 o.sound 提供，可省略）；v4 加星光尾巴

export const WRITER_VERSION = 'hanzi-writer@3.7.3';
export const DATA_VERSION = 'hanzi-writer-data@2.0.1';

// 九字核對表 quizConfig 欄位與此一致；改這裡必須同步改核對表。
export const QUIZ_CONFIG = Object.freeze({
  leniency: 1,
  showHintAfterMisses: 3,
  highlightOnComplete: true,
  acceptBackwardsStrokes: false,
  markStrokeCorrectAfterMisses: false,
  quizStartStrokeNum: 0,
  renderer: 'svg',
  drawingWidth: 14,
  strokeWidth: 2,
  padding: 20,
});

// v4 起筆提示（面板自己的提示，不改 QUIZ_CONFIG，九字核對表的 quizConfig 維持一致）：
// - 每一筆開始前在起點放一個會閃的點；
// - 同一筆錯滿 EARLY_HINT_AFTER 次，就自動閃示範這一筆並畫出方向箭頭（Hanzi Writer 自己的提示仍在第 3 次）。
export const EARLY_HINT_AFTER = 2;

// v5 手指寫字（契約 v5 feedback.writing.fatFinger）：QUIZ_CONFIG.leniency 不動（與九字核對表一致，九字都 < 12 畫），
// 執行時對「總筆畫 >= 12 的字」整字放寬，或對「下一筆標準筆畫很短」的那一筆放寬 1.35 倍。
export const FAT_FINGER = Object.freeze({ boost: 1.35, minStrokes: 12, shortStroke: 200 });
/** v17：口訣語音的卡死保險。語音引擎偶爾會卡在「忙碌」不放，自開始唸起超過這個時間就當作講完（要大於最長口訣在 0.75 倍速下的時間）。 */
export const INTRO_STUCK_MS = 30000;
/** v5 唸字句型：一般「字，詞的字」；詞尾是助詞、詞裡同字重複（看看、比一比）、或動詞結尾（這是、和我玩）改停頓句「字，詞，字」，
 *  三字以上且不以該字結尾的短句、詞尾是標點也改停頓句。避免「是，這是的是」「誰，誰的的誰」「的，我的的的」這種繞口令。 */
const PARTICLES = new Set([...'的了嗎呢吧啊呀喔']), PUNCT = new Set([...'！？。，!?']), VERB_END = new Set(['這是', '和我玩']);
export function introText(char, word) {
  if (!word || word === char) return char;
  const pause = PARTICLES.has(word.at(-1)) || PUNCT.has(word.at(-1)) || word.split(char).length > 2 || VERB_END.has(word)
    || ([...word].length >= 3 && word.at(-1) !== char); // 三字以上的短句（走在小路上、他也拍）不接「的字」
  return pause ? `${char}，${word}，${char}` : `${char}，${word}的${char}`;
}
/** v12 漸進褪除：描紅（完整底圖）→ 提示（只剩起筆點）→ 聽寫（什麼都不給，只聽詞語）。過一關解鎖下一關。 */
/** v17：複習聽寫的點餐句。沒有提示詞的字（數字課）只說字。 */
export const orderText = (char, word) => word ? `我要一個「${word}」的「${char}」！` : `我要一個「${char}」！`;
export const LEVELS = Object.freeze([{ n: 1, icon: '🖍️', label: '描紅' }, { n: 2, icon: '💡', label: '提示' }, { n: 3, icon: '👂', label: '聽寫' }]);
export const levelIcon = n => LEVELS[(n ?? 1) - 1]?.icon ?? '';
/** 聽寫時詞語裡的目標字換成○（「你拍手」→「○拍手」） */
export const maskWord = (word, char) => (word ?? '').split(char).join('○');
/** v14 直排注音（課本樣式）：符號由上往下，聲調在最後一個符號右邊，輕聲「˙」在最上面 */
export function zhuyinHTML(zy) {
  if (!zy) return '';
  const light = zy.startsWith('˙'), body = zy.replace(/^˙/, ''), tone = /[ˊˇˋ]$/.test(body) ? body.slice(-1) : '', syms = [...(tone ? body.slice(0, -1) : body)];
  return `<span class="zy" aria-hidden="true"><span class="zy-s">${light ? '<i class="zy-dot">˙</i>' : ''}${syms.map(c => `<b>${c}</b>`).join('')}</span><span class="zy-t">${tone}</span></span>`;
}
/** v14 詞語逐字加注音；mask＝要藏起來的字（聽寫關：字換成○，注音保留＝看注音寫國字） */
export function wordHTML(word, zys, mask = null) {
  const chars = [...(word ?? '')]; let k = 0;
  return chars.map(c => {
    if (/[！!？?，。]/.test(c)) return `<span class="wz-p">${c}</span>`;
    const z = zys?.[k++], hide = mask && c === mask;
    return `<span class="wz${hide ? ' wz-mask' : ''}"><span class="wz-c">${hide ? '○' : c}</span>${zhuyinHTML(z)}</span>`;
  }).join('');
}
/** v12 家長設定：示範動畫速度 */
export const DEMO_SPEED = Object.freeze({ slow: { strokeAnimationSpeed: 0.55, delayBetweenStrokes: 650 }, mid: { strokeAnimationSpeed: 1, delayBetweenStrokes: 350 }, fast: { strokeAnimationSpeed: 1.6, delayBetweenStrokes: 180 } });
export const PART_COLORS = ['rgba(235, 110, 100, 0.38)', 'rgba(85, 165, 230, 0.38)', 'rgba(90, 190, 135, 0.38)'];
const medianLen = m => m.reduce((a, p, i) => i ? a + Math.hypot(p[0] - m[i - 1][0], p[1] - m[i - 1][1]) : 0, 0);

const CSS = `
.wp-overlay{position:fixed;inset:0;z-index:1000;background:rgba(91,58,74,.72);display:flex;align-items:center;justify-content:center;font:16px system-ui,"Noto Sans TC",sans-serif;color:var(--ui-ink,#5B3A4A);touch-action:none;overscroll-behavior:contain}
.wp-dialog{position:relative;background:#fffdf7;border-radius:20px;box-shadow:0 20px 60px rgba(0,0,0,.35);padding:18px 22px 20px;width:min(92vw,520px);max-height:96vh;overflow:auto;box-sizing:border-box;outline:none}
.wp-head{display:flex;align-items:baseline;gap:12px;margin-bottom:8px}
.wp-head h2{margin:0;font-size:22px}
.wp-head .wp-zhuyin{font-size:16px;color:#6c7d77}
.wp-head{align-items:center}
.wp-head .wp-big{display:inline-flex;align-items:center;gap:2px}
.wp-head .wp-big .zy{font-size:19px;color:#2f3e46}
.wp-head .wp-word{display:inline-flex;align-items:center;gap:2px;font-size:24px;color:#2f3e46}
.wp-word .wz{display:inline-flex;align-items:center}
.wp-word .wz-c{font-family:"Kaiti TC","BiauKai","DFKai-SB","Noto Serif TC",serif}
.wp-word .wz .zy{font-size:13px;color:#5B3A4A;margin-left:1px}
.wp-word .wz-mask .wz-c{color:#E55A4E;font-weight:700}
.wp-word .wz-mask .zy{color:#E55A4E;font-weight:700}
.zy{display:inline-flex;align-items:flex-end;line-height:1;font-family:system-ui,"Noto Sans TC",sans-serif;font-style:normal}
.zy-s{display:inline-flex;flex-direction:column;align-items:center}
.zy-s b{font-weight:inherit}
.zy-dot{font-style:normal;line-height:.6}
.zy-t{font-size:.85em;width:.7em;margin-bottom:.15em}
.wp-head .wp-hint{margin-left:auto;font-size:14px;color:#6c7d77}
.wp-grid{position:relative;width:min(80vw,360px);aspect-ratio:1;margin:6px auto 10px;background:#fff;border:3px solid #F4B6A8;border-radius:12px;overflow:hidden;touch-action:none;user-select:none;-webkit-user-select:none;-webkit-touch-callout:none}
.wp-grid .wp-target,.wp-grid .wp-target *{touch-action:none;user-select:none;-webkit-user-select:none}
.wp-guide .wp-mark{font-size:26px;text-anchor:middle;dominant-baseline:central;animation:wp-pulse 1s ease-in-out infinite;transform-box:fill-box;transform-origin:center}
.wp-guide .wp-glow{fill:#FFD6A5;opacity:.75;animation:wp-pulse 1s ease-in-out infinite;transform-box:fill-box;transform-origin:center}
.wp-grid svg.wp-lines{position:absolute;inset:0;width:100%;height:100%;pointer-events:none}
.wp-grid .wp-target{position:absolute;inset:0;width:100%;height:100%}
.wp-grid .wp-target svg{display:block;width:100%;height:100%;touch-action:none}
.wp-msg{min-height:1.5em;text-align:center;font-size:17px;margin:4px 0 10px}
.wp-msg.wp-ok{color:#2b8a3e}.wp-msg.wp-err{color:#c92a2a}
.wp-actions{display:flex;flex-wrap:wrap;gap:10px;justify-content:center}
.wp-actions button{font:inherit;font-size:18px;padding:12px 18px;min-width:96px;border-radius:12px;border:2px solid #F7C9C0;background:#fff;cursor:pointer;touch-action:manipulation}
.wp-actions button.wp-primary{background:var(--ui-primaryDark,#E8665C);border-color:var(--ui-primaryDark,#E8665C);color:#fff}
.wp-actions button:disabled{opacity:.45;cursor:default}
.wp-progress{display:flex;gap:6px;justify-content:center;margin:0 0 6px}
.wp-progress span{width:14px;height:14px;border-radius:50%;background:#e3ddd0;display:inline-block}
.wp-progress span.wp-done{background:var(--ui-primaryDark,#E8665C)}.wp-progress span.wp-now{background:var(--ui-accent,#FFA94D)}
.wp-grid svg.wp-guide{position:absolute;inset:0;width:100%;height:100%;pointer-events:none;z-index:2;overflow:visible}
.wp-guide .wp-dot{fill:#f08c00;stroke:#fff;animation:wp-pulse 1s ease-in-out infinite;transform-box:fill-box;transform-origin:center}
.wp-guide .wp-arrow{fill:none;stroke:#f08c00;stroke-linecap:round;stroke-linejoin:round;opacity:.85;stroke-dasharray:8 6;animation:wp-dash .8s linear infinite}
@keyframes wp-pulse{0%,100%{transform:scale(.75);opacity:.95}50%{transform:scale(1.25);opacity:.6}}
@keyframes wp-dash{to{stroke-dashoffset:-14}}
.wp-say{font:inherit;font-size:20px;line-height:1;background:#fff;border:2px solid #F4B6A8;border-radius:10px;padding:3px 7px;cursor:pointer;touch-action:manipulation}
.wp-card{display:inline-block;background:#fff;border:2px solid #F4B6A8;border-radius:10px;padding:6px}
.wp-talk{display:flex;align-items:center;gap:10px;margin:4px 0 8px}
.wp-buddy{flex:0 0 auto;width:clamp(58px,15vw,78px);text-align:center;transform-origin:50% 100%}
.wp-buddy img{width:100%;aspect-ratio:1;object-fit:contain;display:block}
.wp-buddy small{display:block;font-size:11px;color:#8a6f7c;line-height:1.1}
.wp-buddy.wp-hop{animation:wp-hop .6s ease-out}
@keyframes wp-hop{0%{transform:scale(1.08,.9)}35%{transform:translateY(-22%) scale(.95,1.06)}70%{transform:translateY(0) scale(1.08,.92)}100%{transform:none}}
.wp-talk .wp-msg{flex:1;margin:0}
.wp-buddy:not([hidden])+.wp-msg{position:relative;background:#fff;border:2px solid #F7C9C0;border-radius:14px;padding:8px 10px}
.wp-buddy:not([hidden])+.wp-msg::before{content:'';position:absolute;left:-9px;top:50%;margin-top:-7px;border:7px solid transparent;border-right-color:#F7C9C0;border-left:0}
.wp-formula{display:block;width:fit-content;max-width:100%;box-sizing:border-box;margin:0 auto 8px;background:#FFF8E7;border:2px solid #F5CBA7;border-radius:999px;color:#6E473B;font-weight:bold;font-size:15px;line-height:1.35;padding:6px 16px;box-shadow:0 2px 6px rgba(0,0,0,.08);text-align:center}
.wp-story{flex:0 0 auto;font:inherit;font-size:14px;font-weight:700;color:#6E473B;background:#FFF8E7;border:2px solid #F5CBA7;border-radius:999px;padding:6px 10px;cursor:pointer;touch-action:manipulation;white-space:nowrap}
.wp-stars{display:flex;justify-content:center;gap:6px;margin:-2px 0 8px;height:46px}
.wp-stars>*{width:46px;height:46px;object-fit:contain;animation:wp-star .5s cubic-bezier(.3,1.6,.5,1) backwards}
.wp-stars span{font-size:40px;line-height:46px;text-align:center;color:#FFB800}
.wp-stars .off{filter:grayscale(1) opacity(.3)}
@keyframes wp-star{0%{transform:scale(0) rotate(-40deg)}100%{transform:none}}
.wp-formula[hidden],.wp-story[hidden],.wp-stars[hidden]{display:none} /* v12：class 的 display 會蓋過 hidden（重試後舊星星還在也是這個原因） */
.wp-levels{display:flex;gap:6px;justify-content:center;margin:0 0 8px}
.wp-levels button{font:inherit;font-size:14px;font-weight:700;padding:5px 10px;border-radius:999px;border:2px solid #F5CBA7;background:#fff;color:#6E473B;cursor:pointer;touch-action:manipulation}
.wp-levels button[aria-pressed=true]{background:#FFA94D;border-color:#FFA94D;color:#fff}
.wp-levels button:disabled{opacity:.4;cursor:default}
.wp-levels button.wp-cleared::after{content:' ✓'}
.wp-sname{position:absolute;left:8px;top:8px;z-index:3;pointer-events:none;background:rgba(255,248,231,.94);border:2px solid #F5CBA7;border-radius:999px;padding:2px 10px;font-size:15px;font-weight:700;color:#6E473B}
.wp-sname b{color:#E8665C;font-size:17px}
/* v47 手機橫放（高度 ≤ 560）：寫字格在左邊、用滿高度；字、關卡、說明、按鈕在右邊 */
@media (orientation:landscape) and (max-height:560px){
.wp-dialog{width:min(96vw,900px);max-height:calc(100vh - 10px);max-height:calc(100dvh - 10px);padding:10px 14px;display:grid;grid-template-columns:auto minmax(0,1fr);grid-template-rows:repeat(7,auto) 1fr;column-gap:16px;align-content:start}
.wp-head,.wp-levels,.wp-progress,.wp-formula,.wp-talk,.wp-stars,.wp-actions{grid-column:2}
.wp-dialog>.wp-grid{grid-column:1;grid-row:1/9;align-self:center;width:min(calc(100vh - 34px),50vw);width:min(calc(100dvh - 34px),50vw);margin:0}
.wp-head{margin-bottom:4px;gap:8px;flex-wrap:wrap}
.wp-head h2{font-size:20px}.wp-head .wp-word{font-size:20px}
.wp-levels{margin:0 0 4px}.wp-levels button{font-size:13px;padding:4px 9px}
.wp-progress{margin:0 0 4px}.wp-progress span{width:11px;height:11px}
.wp-formula{font-size:13px;padding:4px 12px;margin:0 auto 6px}
.wp-talk{margin:2px 0 6px}.wp-buddy{width:50px}.wp-msg{font-size:15px}
.wp-stars{height:34px;margin:0 0 4px}.wp-stars>*{width:34px;height:34px}.wp-stars span{font-size:30px;line-height:34px}
.wp-actions{gap:6px;align-self:end}.wp-actions button{font-size:15px;padding:8px 12px;min-width:0}
}
`;

function injectCss() {
  if (document.getElementById('wp-style')) return;
  const s = document.createElement('style'); s.id = 'wp-style'; s.textContent = CSS; document.head.append(s);
}

const uuid = () => (crypto.randomUUID ? crypto.randomUUID() : 'id-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2));

/** 只讀本機字形資料；回傳 {data, bytes, sha256}。檔案缺失或壞 JSON 會 throw。 */
export async function loadCharData(char, dataBase) {
  const url = dataBase + encodeURIComponent(char) + '.json';
  const response = await fetch(url, { cache: 'no-store' });
  if (!response.ok) { const e = new Error('CHAR_DATA_MISSING'); e.detail = { char, url, status: response.status }; throw e; }
  const bytes = new Uint8Array(await response.arrayBuffer());
  let data;
  try { data = JSON.parse(new TextDecoder().decode(bytes)); } catch (err) { const e = new Error('CHAR_DATA_INVALID'); e.detail = { char, url, cause: String(err) }; throw e; }
  if (!Array.isArray(data.strokes) || !Array.isArray(data.medians) || data.strokes.length !== data.medians.length || !data.strokes.length) {
    const e = new Error('CHAR_DATA_INVALID'); e.detail = { char, url, cause: 'strokes/medians 結構不符' }; throw e;
  }
  return { data, bytes, sha256: await sha256Hex(bytes) };
}

/** 作品卡：用孩子的 drawnPaths（character 座標）渲染，不用標準字。 */
export function renderArtifactCard(artifact, { size = 160, color = '#2f3e46', width, grid = true } = {}) {
  const pad = Math.round(size * 0.06), n = artifact.drawnPaths.length;
  width ??= size * 0.09 * (n >= 12 ? 0.62 : n >= 7 ? 0.78 : 1); // v11（規格 5.4）：基準＝卡片邊長 9%（v10 簡單字的粗細），7–11 畫 ×0.78、12 畫以上 ×0.62
  const t = HanziWriter.getScalingTransform(size, size, pad);
  const lines = grid ? `<line x1="${size / 2}" y1="0" x2="${size / 2}" y2="${size}" stroke="#e8e1d2" stroke-dasharray="4 4"/><line x1="0" y1="${size / 2}" x2="${size}" y2="${size / 2}" stroke="#e8e1d2" stroke-dasharray="4 4"/>` : '';
  const paths = artifact.drawnPaths.map(pts => `<polyline points="${pts.map(p => `${p.x},${p.y}`).join(' ')}" fill="none" stroke="${color}" stroke-width="${width / t.scale}" stroke-linecap="round" stroke-linejoin="round"/>`).join('');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}"><rect width="${size}" height="${size}" fill="#fff"/>${lines}<g transform="${t.transform}">${paths}</g></svg>`;
  const wrap = document.createElement('div'); wrap.className = 'wp-card'; wrap.innerHTML = svg; wrap.title = `${artifact.char} ${artifact.createdAt}`;
  return wrap;
}

export class WritingPanel {
  /**
   * @param {object} o
   * @param {string} o.dataBase   字形資料目錄（相對頁面），例如 './vendor-v2/hanzi-writer/data/'
   * @param {(artifact)=>Promise<void>|void} o.onArtifact  完成一字時交出作品（含 drawnPaths）
   * @param {(info)=>void} o.onDeferred  字形缺失：{taskId,char,attemptId,reason}
   * @param {(info)=>void} o.onCancel    取消：{taskId,char,attemptId}
   * @param {()=>void} o.onOpen / o.onClose  供大廳暫停／恢復 RAF
   * @param {import('./fx.js').Sound} [o.sound]  v3：筆畫／完成音效
   */
  constructor(o) {
    injectCss();
    this.o = o;
    this.dataBase = o.dataBase;
    this.open = false;
    this.state = null;
    this.el = null;
    this.log = o.log || (() => {});
    this._onKey = e => this._key(e);
    this.voice = o.voice || null; // v4：fx.js 的 Voice，可省略
  }

  /** v4：唸「字，詞的字」。在 start() 內同步呼叫（仍在按鈕手勢內），iOS 才肯出聲。 */
  _say(kind = 'intro') {
    const s = this.state; if (!s || !this.voice) return false;
    const cfg = this.o.settings?.() ?? {};
    // v11：第一次遇到這個字唸完整口訣，複習時唸短句；「聽故事」一定唸口訣；寫完唸甜點台詞
    const e = s.enrich, text = kind === 'done' ? `一共${s.totalStrokes}畫！${e?.doneSay ?? s.char}` : s.order && s.level === 3 ? orderText(s.char, s.task.hint_word) : e?.introSay && s.level !== 3 && (kind === 'story' || (s.firstMeet && cfg.intro !== 'short')) ? e.introSay : introText(s.char, s.task.hint_word);
    // v17：每次播放一個身分（token）；舊 utterance 被 cancel 觸發的 end/error 不會解除新口訣的保護
    const tok = s.sayToken = (s.sayToken || 0) + 1;
    const ok = this.voice.say(text, { onEnd: () => { if (this.state === s && s.sayToken === tok && s.introPlaying) { s.introPlaying = false; this.log('intro ended'); } } });
    this.log(`say(${kind}) ${text} -> ${ok}`); s.introPlaying = ok && kind !== 'done'; s.introAt = performance.now(); return ok;
  }

  /** v17：口訣還在講嗎？旗標為真且語音引擎忙碌才算；忙碌卡死超過 INTRO_STUCK_MS 就當作講完。 */
  _introActive(s) {
    if (!s?.introPlaying) return false;
    if (this.voice?.busy && performance.now() - s.introAt < INTRO_STUCK_MS) return true;
    s.introPlaying = false; this.log('intro ended (idle)'); return false;
  }

  isOpen() { return this.open; }

  /** 開啟面板寫一個任務。已開啟時忽略（滑鼠／觸控／鍵盤都只能開一次）。 */
  async start(task, { attemptId = uuid(), index = 0, total = 1, level = null, order = false } = {}) {
    if (this.open) { this.log('ignored: panel already open'); return false; }
    this.open = true; this._saving = false;
    this.state = { task, char: task.char, attemptId, index, total, drawnPaths: [], mistakes: 0, hints: 0, demoViews: 0, writer: null, done: false, startedAt: performance.now() };
    this.state.enrich = this.o.enrich?.(task.char) ?? null; // v11 漢字積木：公式、口訣、寫完台詞、部件筆畫數
    this.state.firstMeet = this.o.isFirstMeet?.(task.id) ?? true;
    { const lv = this.o.levels?.(task.id) ?? { unlocked: 1, suggested: 1, done: [] }; Object.assign(this.state, { level: lv.suggested, unlocked: lv.unlocked, cleared: new Set(lv.done) }); } // v12 關卡
    if (LEVELS[level - 1]) { this.state.level = level; this.state.unlocked = Math.max(this.state.unlocked, level); } // v17：呼叫端指定起始關卡（複習＝聽寫）；只影響這一次面板，不寫存檔
    this.state.order = !!order; // v17：複習的聽寫關用客人點餐句型
    this._build();
    this._say('intro');
    this.o.onOpen?.();
    try {
      const base = this.o.dataBaseFor?.(task.char) ?? this.dataBase; // v12：教育部筆順不同的字改讀台灣版 data-tw
      const { data, sha256 } = await loadCharData(task.char, base);
      this.state.glyphSource = base === this.dataBase ? 'hanzi-writer-data' : 'data-tw';
      if (!this.open) return false; // 載入中被取消
      this.state.dataSha256 = sha256;
      this._mountWriter(data);
      this._applyLevel();
      this._startQuiz();
    } catch (err) {
      if (!this.open) return false;
      this._deferred(err);
    }
    return true;
  }

  close(reason = 'close') {
    if (!this.open) return;
    const s = this.state;
    try { s.writer?.cancelQuiz(); } catch { /* ignore */ }
    this.voice?.stop();
    document.removeEventListener('keydown', this._onKey, true);
    window.removeEventListener('touchend', this._onTouchEnd, true); window.removeEventListener('touchcancel', this._onTouchEnd, true);
    this.el?.remove(); this.el = null;
    this.open = false;
    if (!s.done && reason === 'cancel') this.o.onCancel?.({ taskId: s.task.id, char: s.char, attemptId: s.attemptId });
    this.o.onClose?.({ reason, taskId: s.task.id });
    this.state = null;
  }

  // ---------- UI ----------
  _build() {
    const s = this.state;
    const el = document.createElement('div'); el.className = 'wp-overlay'; el.setAttribute('role', 'dialog'); el.setAttribute('aria-modal', 'true'); el.setAttribute('aria-label', `寫字：${s.char}`);
    el.innerHTML = `
      <div class="wp-dialog" tabindex="-1">
        <div class="wp-head"><span class="wp-big"><h2>${s.char}</h2>${zhuyinHTML(s.task.zhuyin)}</span><span class="wp-zhuyin wp-word">${wordHTML(s.task.hint_word, this.o.wordZhuyin?.(s.task.hint_word))}</span><button type="button" class="wp-say" aria-label="再唸一次">🔈</button><span class="wp-hint">第 ${s.index + 1} / ${s.total} 字</span></div>
        <div class="wp-levels" role="group" aria-label="關卡">${LEVELS.map(l => `<button type="button" data-level="${l.n}">${l.icon} ${l.label}</button>`).join('')}</div>
        <div class="wp-progress"></div>
        ${s.enrich?.formula ? `<div class="wp-formula">🧩 漢字積木：${s.enrich.formula}</div>` : ''}
        <div class="wp-grid">
          <svg class="wp-lines" viewBox="0 0 100 100" preserveAspectRatio="none"><line x1="50" y1="0" x2="50" y2="100" stroke="#e8c9a8" stroke-width=".6" stroke-dasharray="2 2"/><line x1="0" y1="50" x2="100" y2="50" stroke="#e8c9a8" stroke-width=".6" stroke-dasharray="2 2"/></svg>
          <div class="wp-target"></div>
          <svg class="wp-guide" aria-hidden="true"></svg>
          <div class="wp-sname" hidden></div>
        </div>
        <div class="wp-talk"><div class="wp-buddy" hidden><img alt=""><small></small></div><div class="wp-msg">載入字形…</div>${s.enrich?.introSay ? '<button type="button" class="wp-story">🔊 聽故事</button>' : ''}</div>
        <div class="wp-stars" hidden></div>
        <div class="wp-actions">
          <button type="button" data-act="demo">看示範</button>
          <button type="button" data-act="retry">重試</button>
          <button type="button" data-act="cancel">取消</button>
          <button type="button" data-act="next" class="wp-primary" hidden>去小鎮看看 ▶</button>
        </div>
      </div>`;
    // 輸入隔離：覆層以下的 3D 場景收不到任何指標起始／移動／滾輪／鍵盤事件。
    // 注意：不攔 mouseup/touchend/pointerup——Hanzi Writer 的筆畫結束監聽掛在 document 上（index.esm.js:1751），
    // 攔了會讓筆畫永遠結束不了；而場景（OrbitControls）從未收到對應的 start 事件，end 事件對它無作用。
    for (const type of ['pointerdown', 'pointermove', 'mousedown', 'mousemove', 'click', 'dblclick', 'contextmenu', 'wheel', 'touchstart', 'touchmove']) {
      el.addEventListener(type, e => { e.stopPropagation(); if (type === 'wheel' || type === 'contextmenu') e.preventDefault(); }, { passive: type !== 'wheel' && type !== 'contextmenu' });
    }
    el.querySelector('.wp-say').addEventListener('click', () => this._say('intro'));
    el.querySelector('.wp-levels').addEventListener('click', e => { const b = e.target.closest('button[data-level]'); if (b && !b.disabled) this._pickLevel(+b.dataset.level); });
    el.querySelector('.wp-story')?.addEventListener('click', () => { this._say('story'); this._setMsg(s.enrich.introSay); });
    // v4：手指／滑鼠寫字時留下星光尾巴（純裝飾，不影響判定）
    const grid = el.querySelector('.wp-grid'); let drawing = false, lastSpark = 0, gridRect = null;
    grid.addEventListener('pointerdown', e => { if (e.isPrimary !== false) { drawing = true; gridRect = grid.getBoundingClientRect(); } /* v15：一筆只量一次格子位置，移動中不再強制排版 */ }); // v17：落筆不再切斷口訣（v12 是一下筆就停）
    el.addEventListener('pointerup', () => { drawing = false; }); el.addEventListener('pointercancel', () => { drawing = false; });
    grid.addEventListener('pointermove', e => {
      if (!drawing || e.isPrimary === false || !this.state || this.state.done) return; const now = performance.now(); if (now - lastSpark < 28) return; lastSpark = now;
      const r = gridRect ?? (gridRect = grid.getBoundingClientRect()); spark(grid, e.clientX - r.left, e.clientY - r.top); this.state.sparks = (this.state.sparks ?? 0) + 1;
    });
    // v5 防手掌誤觸：鎖定第一根手指，第二指以上的 touch 事件在捕獲階段攔下（Hanzi Writer 讀 touches[0]、筆畫結束聽 document 的 touchend）
    const target = el.querySelector('.wp-target'); this._lockId = null;
    const block = e => { e.stopPropagation(); if (e.cancelable) e.preventDefault(); if (this.state) this.state.multiTouchBlocked = (this.state.multiTouchBlocked ?? 0) + 1; };
    target.addEventListener('touchstart', e => {
      if (this._lockId === null) { this._lockId = e.changedTouches[0].identifier; if (e.touches.length > 1) block(e); }
      else block(e);
    }, { capture: true, passive: false });
    target.addEventListener('touchmove', e => { if (this._lockId !== null && e.touches[0]?.identifier !== this._lockId) block(e); }, { capture: true, passive: false });
    this._onTouchEnd = e => {
      if (this._lockId === null) return;
      if ([...e.changedTouches].some(t => t.identifier === this._lockId)) this._lockId = null; else e.stopPropagation(); // 別的手指放開：不讓 Hanzi Writer 以為這一筆結束
    };
    window.addEventListener('touchend', this._onTouchEnd, true); window.addEventListener('touchcancel', this._onTouchEnd, true);
    el.querySelector('.wp-actions').addEventListener('click', e => { const b = e.target.closest('button[data-act]'); if (b) this._act(b.dataset.act); });
    document.body.append(el);
    this.el = el;
    document.addEventListener('keydown', this._onKey, true);
    el.querySelector('.wp-dialog').focus();
    // v9 陪寫小夥伴：已解鎖的朋友坐在訊息旁邊，訊息變成牠說的話
    this._buddy = this.o.buddy?.pick?.() ?? null;
    if (this._buddy) { const b = el.querySelector('.wp-buddy'); b.hidden = false; b.querySelector('small').textContent = this._buddy.name; this._buddyPose('wave', 1300, true); s.buddy = this._buddy.name; }
  }

  /** v9：小夥伴換姿勢（ms 後回到 idle；hop＝跳一下） */
  _buddyPose(pose, ms = 0, hop = false) {
    const b = this._buddy, box = this.el?.querySelector('.wp-buddy'), img = box?.querySelector('img'); if (!b || !img) return;
    img.src = b.urls[pose] ?? b.urls.idle;
    if (hop) { if (box.animate) { box.getAnimations?.().forEach(a => a.cancel()); box.animate([{ transform: 'translateY(0)' }, { transform: 'translateY(-14%)' }, { transform: 'translateY(0)' }], { duration: 450, easing: 'ease-out' }); } else { box.classList.remove('wp-hop'); void box.offsetWidth; box.classList.add('wp-hop'); } } /* v16：用 Web Animations，不再強制重排 */
    clearTimeout(this._buddyT); if (ms) this._buddyT = setTimeout(() => { if (this.el && this._buddy === b) img.src = b.urls.idle; }, ms);
  }
  /** v9：完成時的星星（依序彈出，每顆一個音） */
  _showStars(n) {
    const row = this.el?.querySelector('.wp-stars'); if (!row) return;
    row.innerHTML = ''; row.hidden = false;
    for (let i = 0; i < 3; i++) {
      const e = this.o.starUrl ? Object.assign(document.createElement('img'), { src: this.o.starUrl, alt: '' }) : Object.assign(document.createElement('span'), { textContent: '★' });
      if (i >= n) e.classList.add('off'); e.style.animationDelay = (0.25 + i * 0.28) + 's'; row.append(e);
      if (i < n) setTimeout(() => this.o.sound?.stroke(4 + i * 2), 250 + i * 280);
    }
    row.setAttribute('aria-label', `${n} 顆星`);
  }

  _key(e) {
    if (!this.open) return;
    e.stopPropagation();
    if (e.key === 'Escape') { e.preventDefault(); this._act('cancel'); }
    else if (e.key === 'Enter' && this.state.done) { e.preventDefault(); this._act('next'); }
    // 其餘按鍵不處理也不傳給場景（含方向鍵、空白鍵，避免捲動）
    if ([' ', 'ArrowUp', 'ArrowDown', 'PageUp', 'PageDown'].includes(e.key) && e.target === this.el.querySelector('.wp-dialog')) e.preventDefault();
  }

  _setMsg(text, cls = '') { const m = this.el?.querySelector('.wp-msg'); if (m) { m.textContent = text; m.className = 'wp-msg ' + cls; } }
  _btn(act) { return this.el?.querySelector(`button[data-act="${act}"]`); }
  _setButtons({ demo = true, retry = true, cancel = true, next = false } = {}) {
    this._btn('demo').disabled = !demo; this._btn('retry').disabled = !retry; this._btn('cancel').disabled = !cancel;
    this._btn('next').hidden = !next; if (next) this._btn('next').focus();
  }
  _progress(total, done) {
    const p = this.el.querySelector('.wp-progress'); p.innerHTML = '';
    for (let i = 0; i < total; i++) { const d = document.createElement('span'); if (i < done) d.className = 'wp-done'; else if (i === done) d.className = 'wp-now'; p.append(d); }
  }

  // ---------- Hanzi Writer ----------
  _mountWriter(data) {
    const s = this.state;
    const target = this.el.querySelector('.wp-target');
    const size = target.clientWidth || 360;
    s.writer = HanziWriter.create(target, s.char, {
      width: size, height: size, padding: QUIZ_CONFIG.padding,
      renderer: QUIZ_CONFIG.renderer,
      showOutline: s.level === 1, showCharacter: false,
      strokeColor: '#2f3e46', outlineColor: '#dcd5c6', drawingColor: '#1c5d99', highlightColor: '#f08c00', highlightCompleteColor: '#2b8a3e',
      drawingWidth: QUIZ_CONFIG.drawingWidth, strokeWidth: QUIZ_CONFIG.strokeWidth,
      ...(DEMO_SPEED[this.o.settings?.().speed] ?? DEMO_SPEED.mid), // v12 家長設定
      // 只讀本機、已載入的資料；絕不走預設 CDN loader
      charDataLoader: (char, onLoad, onError) => { if (char === s.char) onLoad(data); else onError(new Error('UNEXPECTED_CHAR:' + char)); },
      onLoadCharDataError: err => this._deferred(err),
    });
    s.totalStrokes = data.strokes.length;
    const names = this.o.strokeNames?.(s.char); s.strokeNames = names?.length === s.totalStrokes ? names : null; // v12 筆畫名稱（台灣用語）
    this._colorParts(s.writer, s.enrich?.componentStrokes, s.totalStrokes);
    s.medians = data.medians; s.guideSize = size;
    s.guideXf = HanziWriter.getScalingTransform(size, size, QUIZ_CONFIG.padding);
    this._progress(s.totalStrokes, 0);
  }

  /** v11 部件分色描紅：描紅底圖（outline 層）依 componentStrokes 分段上色。Hanzi Writer 只設 stroke 屬性，inline style 會蓋過它。
   *  加總不等於總筆畫數就不上色（維持原本淺色底圖）。 */
  async _colorParts(writer, parts, total) {
    if (!parts?.length || parts.reduce((a, b) => a + b, 0) !== total) { if (parts) this.log(`componentStrokes ${parts} != ${total}, skip`); return; }
    await writer.getCharacterData().catch(() => null);
    const rs = writer._hanziWriterRenderer?._outlineCharRenderer?._strokeRenderers; if (!rs) return;
    let i = 0; parts.forEach((n, k) => { for (let j = 0; j < n; j++, i++) rs[i]?._animationPath?.style.setProperty('stroke', PART_COLORS[k % PART_COLORS.length]); });
    if (this.state?.writer === writer) this.state.partColors = parts;
  }

  /** v12：依關卡更新標題、詞語、積木徽章、底圖與按鈕狀態 */
  _applyLevel() {
    const s = this.state, el = this.el; if (!s || !el) return;
    const listen = s.level === 3;
    el.querySelector('.wp-head h2').textContent = listen ? '？' : s.char;
    el.querySelector('.wp-zhuyin').innerHTML = s.task.hint_word ? wordHTML(s.task.hint_word, this.o.wordZhuyin?.(s.task.hint_word), listen ? s.char : null) : ''; /* v14：詞語逐字注音；聽寫關字換○、注音留著（看注音寫國字） */
    for (const sel of ['.wp-formula', '.wp-story']) { const x = el.querySelector(sel); if (x) x.hidden = listen; }
    for (const b of el.querySelectorAll('.wp-levels button')) { const n = +b.dataset.level; b.disabled = n > s.unlocked; b.setAttribute('aria-pressed', String(n === s.level)); b.classList.toggle('wp-cleared', s.cleared.has(n)); }
    try { if (s.writer) (s.level === 1 ? s.writer.showOutline() : s.writer.hideOutline()); } catch { /* ignore */ }
    this._setMsg(listen ? `聽寫：聽一聽「${maskWord(s.task.hint_word, s.char) || '○'}」，把○寫出來！` : s.level === 2 ? `提示關：沒有底圖了，跟著🥕寫「${s.char}」` : s.enrich?.introSay ?? `請照筆順寫「${s.char}」`);
  }
  _applyLevelButtons() { const s = this.state; for (const b of this.el?.querySelectorAll('.wp-levels button') ?? []) { const n = +b.dataset.level; b.disabled = n > s.unlocked; b.classList.toggle('wp-cleared', s.cleared.has(n)); } }
  /** v12：換關卡＝重新開始一個 attempt */
  _pickLevel(n) {
    const s = this.state; if (!s?.writer || n > s.unlocked || (n === s.level && !s.done) || this._saving) return;
    try { s.writer.cancelQuiz(); } catch { /* ignore */ }
    s.level = n; s.nextAttemptReason = 'level'; this._applyLevel(); this._startQuiz(); this._say('intro'); this.log(`level ${n}`);
  }

  /** v12：格子左上角顯示「第 n 筆：橫」；n 超出範圍就收起來 */
  _sname(n) {
    const s = this.state, el = this.el?.querySelector('.wp-sname'); if (!el) return;
    if (n < 0 || n >= s.totalStrokes) { el.hidden = true; return; }
    const name = s.level === 3 ? null : s.strokeNames?.[n]; el.hidden = false; el.innerHTML = `第 ${n + 1} 筆${name ? `：<b>${name}</b>` : ''}`;
  }
  _nameOf(n) { return this.state?.strokeNames?.[n] ?? null; }

  /** v4：畫第 n 筆的起筆點；arrow=true 時再沿筆畫中線畫方向箭頭。n 超出範圍就清掉。 */
  _guide(n, { arrow = false } = {}) {
    const s = this.state, g = this.el?.querySelector('.wp-guide'); if (!g) return;
    const med = s?.medians?.[n];
    if (!med || s.done || (s.level === 3 && !arrow)) { g.innerHTML = ''; s && (s.guide = null); return; } // v12 聽寫關不給起筆點（錯兩次的箭頭仍會出現）
    const t = s.guideXf, sz = s.guideSize, k = 1 / t.scale, [x0, y0] = med[0];
    let h = `<g transform="${t.transform}">`;
    if (arrow && med.length > 1) {
      const pts = med.map(([x, y]) => `${x},${y}`).join(' ');
      const [ax, ay] = med[med.length - 1], [bx, by] = med[Math.max(0, med.length - 2)], a = Math.atan2(ay - by, ax - bx), L = 34 * k;
      const w1 = `${ax - L * Math.cos(a - 0.5)},${ay - L * Math.sin(a - 0.5)}`, w2 = `${ax - L * Math.cos(a + 0.5)},${ay - L * Math.sin(a + 0.5)}`;
      h += `<polyline class="wp-arrow" points="${pts}" stroke-width="${7 * k}" style="stroke-dasharray:${8 * k} ${6 * k}"/><polyline class="wp-arrow" points="${w1} ${ax},${ay} ${w2}" stroke-width="${7 * k}" style="stroke-dasharray:none"/>`;
    }
    h += `</g>`;
    // v5：起筆處放會閃的胡蘿蔔光點（文字不能放進上下翻轉的群組，所以換算成格子座標）
    const px = t.x + x0 * t.scale, py = sz - t.y - y0 * t.scale;
    h += `<circle class="wp-glow" cx="${px}" cy="${py}" r="17"/><text class="wp-mark" x="${px}" y="${py}">🥕</text>`;
    g.setAttribute('viewBox', `0 0 ${sz} ${sz}`); g.innerHTML = h;
    s.guide = { stroke: n, arrow };
  }

  _startQuiz() {
    const s = this.state;
    // 每次 quiz 開始＝一個 attempt：重試、看示範後都換新 attemptId、計數歸零（契約 progressRecord 以 attempt 為單位）
    if (s.quizRuns) { s.previousAttemptIds.push(s.attemptId); s.attemptId = uuid(); this.o.onAttempt?.({ taskId: s.task.id, char: s.char, attemptId: s.attemptId, reason: s.nextAttemptReason ?? 'retry' }); }
    s.previousAttemptIds ??= []; s.nextAttemptReason = null;
    s.drawnPaths = []; s.mistakesByStroke = []; s.mistakes = 0; s.hints = 0; s.demoViews = 0; s.done = false; s.quizStartedAt = performance.now(); s.quizRuns = (s.quizRuns ?? 0) + 1;
    this._progress(s.totalStrokes, 0);
    this._setButtons({ demo: true, retry: true, cancel: true, next: false });
    s.earlyHints = 0; this._guide(0); this._sname(0);
    { const st = this.el?.querySelector('.wp-stars'); if (st) st.hidden = true; } // v9：重寫時先收起星星
    s.leniencyByStroke = []; s.leniencyBoostAll = s.totalStrokes >= FAT_FINGER.minStrokes;
    s.writer.quiz({
      leniency: this._leniencyFor(0),
      showHintAfterMisses: QUIZ_CONFIG.showHintAfterMisses,
      highlightOnComplete: QUIZ_CONFIG.highlightOnComplete,
      acceptBackwardsStrokes: QUIZ_CONFIG.acceptBackwardsStrokes,
      markStrokeCorrectAfterMisses: QUIZ_CONFIG.markStrokeCorrectAfterMisses,
      quizStartStrokeNum: QUIZ_CONFIG.quizStartStrokeNum,
      onCorrectStroke: d => {
        s.drawnPaths.push(d.drawnPath.points.map(p => ({ x: p.x, y: p.y })));
        this._setLeniency(d.strokeNum + 1);
        this._progress(s.totalStrokes, d.strokeNum + 1);
        const done = this._nameOf(d.strokeNum), next = this._nameOf(d.strokeNum + 1);
        if (done && this.voice && this.o.settings?.().strokeVoice !== false) requestAnimationFrame(() => setTimeout(() => { if (this.state === s && !s.done) { if (this._introActive(s)) { this.log(`stroke voice held ${done}`); return; } this.voice.say(done, { rate: 0.9 }); this.log(`say(stroke) ${done}`); } }, 0)); // v17：口訣還在講就不唸這一筆（不插隊、不排隊） // v12：寫對一筆就唸這一筆的名稱；v16：等這一幀畫完再唸，不和筆畫結束搶同一瞬間
        this._setMsg(d.strokesRemaining ? `對了！還有 ${d.strokesRemaining} 筆${next ? `，下一筆是「${next}」` : ''}` : '全部寫完了！', 'wp-ok');
        this._sname(d.strokesRemaining ? d.strokeNum + 1 : -1);
        this.o.sound?.stroke(d.strokeNum); // v16：拿掉格子閃光（陰影動畫每格重畫）與整個字的縮放（iPhone 每格重繪整個 SVG）；回饋留音效、綠字與小幫手
        this._guide(d.strokesRemaining ? d.strokeNum + 1 : -1);
        if (d.strokesRemaining) this._buddyPose('happy', 650, true);
        this.log(`correct stroke ${d.strokeNum + 1}/${s.totalStrokes}, points=${d.drawnPath.points.length}`);
      },
      onMistake: d => {
        s.mistakes += 1; s.mistakesByStroke[d.strokeNum] = (s.mistakesByStroke[d.strokeNum] ?? 0) + 1; // v12 家長面板：錯在第幾筆
        if (QUIZ_CONFIG.showHintAfterMisses !== false && d.mistakesOnStroke >= QUIZ_CONFIG.showHintAfterMisses) s.hints += 1; // 此次會閃示範筆
        else if (d.mistakesOnStroke === EARLY_HINT_AFTER) { // v4：錯第 2 次就示範這一筆＋方向箭頭（算一次提示）
          s.hints += 1; s.earlyHints += 1; this._guide(d.strokeNum, { arrow: true });
          try { s.writer.highlightStroke(d.strokeNum); } catch { /* ignore */ }
        }
        const nm = this._nameOf(d.strokeNum), which = nm ? `這一筆是「${nm}」，` : '';
        this._setMsg(d.isBackwards ? '方向反了，從橘色點開始寫' : d.mistakesOnStroke >= EARLY_HINT_AFTER ? `${which}照著橘色箭頭寫` : `${which}再試一次，從橘色點開始`, 'wp-err');
        this.o.sound?.mistake(); const g = this.el?.querySelector('.wp-grid'); if (g) flash(g, 'fx-shake');
        this._buddyPose('surprised', 900);
        this.log(`mistake on stroke ${d.strokeNum + 1} (onStroke=${d.mistakesOnStroke}, backwards=${d.isBackwards})`);
      },
      onComplete: summary => this._complete(summary),
    });
  }

  /** v5：第 n 筆用的判定容錯（記錄在作品 meta.leniencyByStroke） */
  _leniencyFor(n) {
    const s = this.state, med = s.medians?.[n];
    const v = s.leniencyBoostAll || (med && medianLen(med) < FAT_FINGER.shortStroke) ? QUIZ_CONFIG.leniency * FAT_FINGER.boost : QUIZ_CONFIG.leniency;
    s.leniencyByStroke[n] = v; return v;
  }
  _setLeniency(n) { const q = this.state.writer?._quiz?._options; if (q && n < this.state.totalStrokes) q.leniency = this._leniencyFor(n); } // Hanzi Writer 每筆結束時才讀 leniency

  async _complete(summary) {
    const s = this.state;
    s.done = true; this._guide(-1); this._sname(-1);
    const artifact = {
      artifactId: uuid(), taskId: s.task.id, attemptId: s.attemptId, char: s.char,
      drawnPaths: s.drawnPaths, mistakes: s.mistakes, hints: s.hints + s.demoViews,
      createdAt: new Date().toISOString(), writerVersion: WRITER_VERSION, dataSha256: s.dataSha256,
      // 補充欄位（不在契約最小格式內，但對驗收有用）
      meta: { level: s.level ?? 1, mistakesByStroke: Array.from({ length: s.totalStrokes }, (_, i) => s.mistakesByStroke[i] ?? 0), dataVersion: DATA_VERSION, glyphSource: s.glyphSource ?? 'hanzi-writer-data', pointSpace: 'hanzi-writer character coords (1024 em, y-up)', totalStrokes: s.totalStrokes, durationMs: Math.round(performance.now() - s.quizStartedAt), earlyHints: s.earlyHints ?? 0, leniencyByStroke: s.leniencyByStroke, multiTouchBlocked: s.multiTouchBlocked ?? 0, panelOpenMs: Math.round(performance.now() - s.startedAt), attemptIndex: s.quizRuns, previousAttemptIds: s.previousAttemptIds, demoViews: s.demoViews, quizConfig: QUIZ_CONFIG },
    };
    this._setButtons({ demo: false, retry: false, cancel: false, next: false });
    this._setMsg('寫得好！正在保存…', 'wp-ok');
    this.o.sound?.complete(); setTimeout(() => { if (this.state === s) this._say('done'); }, 700); { const d = this.el?.querySelector('.wp-dialog'); if (d) bravo(d, s.mistakes === 0 ? '太棒了！' : '好棒！'); }
    // v9：星星（由這次的 mistakes／hints 算）＋和之前最佳比較；小夥伴跳起來
    const stars = starsOf(artifact), prevBest = this.o.bestStars?.(s.task.id) ?? 0;
    s.stars = stars; s.prevBest = prevBest; this._showStars(stars); this._buddyPose('happy', 0, true); setTimeout(() => this._buddyPose('wave', 0, true), 900);
    s.cleared.add(s.level); const unlockedNow = s.level === s.unlocked && s.unlocked < 3; if (unlockedNow) s.unlocked += 1;
    const levelNote = unlockedNow ? `解鎖「${LEVELS[s.unlocked - 1].icon} ${LEVELS[s.unlocked - 1].label}」關！` : s.level === 3 ? '聽寫也會了！' : '';
    const starNote = prevBest && stars > prevBest ? `比上次多 ${stars - prevBest} 顆星！` : stars === 3 ? '三顆星！' : stars === 2 ? '下次不寫錯就有三顆星喔！' : '下次自己寫，星星會更多喔！';
    this._saving = true; // v12：保存完成前不能換關卡（保存失敗就一直鎖到重試保存成功）
    try {
      await this.o.onArtifact?.(artifact); this._saving = false;
      this._setMsg(`${s.enrich?.doneSay ?? `「${s.char}」寫好了！`}${starNote}${levelNote}${this.o.doneNote?.(s.task.id) ?? ''}`, 'wp-ok');
      this._applyLevelButtons();
      this._setButtons({ demo: false, retry: true, cancel: false, next: true });
    } catch (err) {
      this.log('save failed: ' + err);
      this._setMsg('保存失敗：' + (err?.message || err) + '，按「重試保存」再試', 'wp-err');
      const b = this._btn('next'); b.hidden = false; b.textContent = '重試保存'; b.dataset.act = 'resave'; this._pendingArtifact = artifact; this._btn('cancel').disabled = false;
    }
  }

  _deferred(err) {
    const s = this.state;
    const reason = err?.message || String(err);
    this.log('deferred: ' + reason + ' ' + JSON.stringify(err?.detail ?? {}));
    this._setMsg(`「${s.char}」的筆順資料還沒準備好，先跳過，之後再補寫。`, 'wp-err');
    this._setButtons({ demo: false, retry: false, cancel: true, next: false });
    this._btn('cancel').textContent = '返回';
    s.done = true; // 不再觸發 onCancel
    this.o.onDeferred?.({ taskId: s.task.id, char: s.char, attemptId: s.attemptId, reason, detail: err?.detail ?? null });
  }

  async _act(act) {
    const s = this.state; if (!s) return;
    if (act === 'cancel') { this.close(s.done ? 'close' : 'cancel'); return; }
    if (act === 'retry') { if (!s.writer) return; s.writer.cancelQuiz(); this._setMsg(`再寫一次「${s.level === 3 ? '○' : s.char}」`); s.nextAttemptReason = 'retry'; this._startQuiz(); return; }
    if (act === 'demo') {
      if (!s.writer) return;
      s.writer.cancelQuiz(); s.nextAttemptReason = 'demo'; const demoViews = s.demoViews + 1; this._guide(-1); this._sname(-1);
      this._setButtons({ demo: false, retry: false, cancel: true, next: false });
      this._setMsg('看看怎麼寫…');
      await s.writer.animateCharacter();
      if (!this.open || this.state !== s) return;
      await s.writer.hideCharacter({ duration: 200 });
      if (!this.open || this.state !== s) return;
      this._setMsg(`換你寫「${s.char}」`);
      this._startQuiz(); s.demoViews = demoViews; // 看示範算進新 attempt 的 hints
      return;
    }
    if (act === 'resave') {
      const b = this._btn('resave'); b.disabled = true;
      try { await this.o.onArtifact?.(this._pendingArtifact); this._saving = false; this._setMsg(`「${s.char}」寫好了！`, 'wp-ok'); b.textContent = '去小鎮看看 ▶'; b.dataset.act = 'next'; b.disabled = false; this._btn('retry').disabled = false; }
      catch (err) { b.disabled = false; this._setMsg('保存仍失敗：' + (err?.message || err), 'wp-err'); }
      return;
    }
    if (act === 'next') { this.close('done'); return; }
  }
}

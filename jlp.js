// jlp.js — 用 kuromoji 斷詞，產生 furigana 標註 / 讀音 / 分詞羅馬拼音。
// 純邏輯（buildFromTokens/furiToken）可測；瀏覽器端延遲載入 kuromoji + 字典。
import { toRomaji } from './romaji.js';

/** 片假名 → 平假名 */
export function kataToHira(s) {
  return (s || '').replace(/[ァ-ヶ]/g, (c) => String.fromCodePoint(c.codePointAt(0) - 0x60));
}
const isKana = (ch) => { const c = ch.codePointAt(0); return (c >= 0x3040 && c <= 0x30ff) || c === 0x30fc; };
const hasKanji = (s) => [...s].some((ch) => { const c = ch.codePointAt(0); return (c >= 0x3400 && c <= 0x9fff) || (c >= 0xf900 && c <= 0xfaff); });

/**
 * 單一詞的 furigana：只把假名注在漢字核心上（自動剝掉共同的送假名）
 * @param {string} surface 詞面（如「調べる」）
 * @param {string} readingHira 該詞讀音（平假名，如「しらべる」）
 * @returns {string} 如「{調|しら}べる」；全假名或無漢字則原樣
 */
export function furiToken(surface, readingHira) {
  if (!readingHira || readingHira === '*') return surface;
  let s = surface, r = readingHira, suf = '', pre = '';
  while (s.length && r.length && s[s.length - 1] === r[r.length - 1] && isKana(s[s.length - 1])) { suf = s[s.length - 1] + suf; s = s.slice(0, -1); r = r.slice(0, -1); }
  while (s.length && r.length && s[0] === r[0] && isKana(s[0])) { pre += s[0]; s = s.slice(1); r = r.slice(1); }
  if (s.length === 0 || !hasKanji(s)) return surface;
  return pre + `{${s}|${r}}` + suf;
}

/**
 * 從 kuromoji tokens 組出 {furigana, reading, romaji}
 * @param {Array} tokens kuromoji.tokenize() 結果
 * @returns {{furigana:string, reading:string, romaji:string}}
 */
export function buildFromTokens(tokens) {
  let furigana = '', reading = '';
  const parts = [];
  for (const t of tokens) {
    const surface = t.surface_form;
    const rd = (t.reading && t.reading !== '*') ? kataToHira(t.reading) : surface;      // 書寫讀音（は→は）
    const pron = (t.pronunciation && t.pronunciation !== '*') ? kataToHira(t.pronunciation) : rd; // 發音（は→わ）
    furigana += furiToken(surface, rd);
    reading += rd;
    if (/^[、。！？!?「」（）()・…～]+$/.test(surface)) parts.push({ punc: surface });
    else parts.push({ w: toRomaji(pron) });
  }
  // 分詞羅馬拼音：詞間空格，標點貼在前一詞後
  let romaji = '';
  for (const p of parts) {
    if (p.punc) romaji += (p.punc === '。' ? '.' : p.punc === '、' ? ',' : p.punc === '！' ? '!' : p.punc === '？' ? '?' : '');
    else if (p.w) romaji += (romaji && !romaji.endsWith(' ') ? ' ' : '') + p.w;
  }
  romaji = romaji.trim();
  if (romaji) romaji = romaji[0].toUpperCase() + romaji.slice(1);
  return { furigana, reading, romaji };
}

// ── 瀏覽器：延遲載入 kuromoji（第一次用才下載 ~17MB 字典，之後快取）──
let tkPromise = null;
function loadScript() {
  return new Promise((res, rej) => {
    if (typeof window !== 'undefined' && window.kuromoji) return res();
    const s = document.createElement('script');
    s.src = './vendor/kuromoji.js';
    s.onload = () => res();
    s.onerror = () => rej(new Error('kuromoji.js 載入失敗'));
    document.head.appendChild(s);
  });
}
/** 取得（並快取）tokenizer */
export function getTokenizer() {
  if (!tkPromise) {
    tkPromise = loadScript().then(() => new Promise((res, rej) => {
      window.kuromoji.builder({ dicPath: './dict/' }).build((err, tk) => (err ? rej(err) : res(tk)));
    }));
  }
  return tkPromise;
}
/** 分析一段日文 → {furigana, reading, romaji} */
export async function analyze(text) {
  const tk = await getTokenizer();
  return buildFromTokens(tk.tokenize(text));
}

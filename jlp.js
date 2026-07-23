// jlp.js — 用 kuromoji 斷詞，產生 furigana 標註 / 讀音 / 分詞羅馬拼音。
// 純邏輯（buildFromTokens/furiToken）可測；瀏覽器端延遲載入 kuromoji + 字典。
import { toRomaji } from './romaji.js';

/** 片假名 → 平假名 */
export function kataToHira(s) {
  return (s || '').replace(/[ァ-ヶ]/g, (c) => String.fromCodePoint(c.codePointAt(0) - 0x60));
}
const isKana = (ch) => { const c = ch.codePointAt(0); return (c >= 0x3040 && c <= 0x30ff) || c === 0x30fc; };
const hasKanji = (s) => [...s].some((ch) => { const c = ch.codePointAt(0); return (c >= 0x3400 && c <= 0x9fff) || (c >= 0xf900 && c <= 0xfaff); });

// ── 特殊讀音修正表（熟字訓／慣用讀音）──────────────────────
// kuromoji 的 IPADIC 對某些詞會給「字面正確但非日常」的讀音（如 明後日→みょうごにち），
// 這裡用「詞面完全相同」時覆寫成日常/初學者該學的讀音。只放讀音單一、不會誤傷的詞。
// key＝詞面（surface），value＝平假名讀音。
const READING_OVERRIDES = {
  // 日期／時間
  明後日: 'あさって', 明々後日: 'しあさって', 一昨日: 'おととい', 一昨年: 'おととし',
  二日: 'ふつか', 三日: 'みっか', 四日: 'よっか', 五日: 'いつか', 六日: 'むいか',
  七日: 'なのか', 八日: 'ようか', 九日: 'ここのか', 十日: 'とおか', 二十日: 'はつか',
  // 人數
  一人: 'ひとり', 二人: 'ふたり',
  // 其他常見特殊讀音
  二十歳: 'はたち', 眼鏡: 'めがね', 大人: 'おとな', 今朝: 'けさ', 果物: 'くだもの',
  // 註：一日（ついたち／いちにち）、上手（じょうず／うわて）等讀音不唯一，不放這裡以免誤判。
};

/**
 * 單一詞的 furigana：只把假名注在漢字上（逐段對位，支援詞中夾假名）
 * 作法：把詞面切成「漢字段 / 假名段」交錯，假名段當成讀音錨點，
 * 每個漢字段吃掉「到下一個假名錨點之前」的讀音。
 * @param {string} surface 詞面（如「取り消し」）
 * @param {string} readingHira 該詞讀音（平假名，如「とりけし」）
 * @returns {string} 如「{取|と}り{消|け}し」；全假名或對不上則安全退回
 */
export function furiToken(surface, readingHira) {
  if (!readingHira || readingHira === '*') return surface;
  if (!hasKanji(surface)) return surface;            // 全是假名 → 不用注
  // 切成連續「漢字段 / 假名段」
  const segs = [];
  for (const ch of surface) {
    const kana = isKana(ch);
    const last = segs[segs.length - 1];
    if (last && last.kana === kana) last.text += ch;
    else segs.push({ kana, text: ch });
  }
  let r = readingHira;
  let out = '';
  for (let i = 0; i < segs.length; i++) {
    const seg = segs[i];
    if (seg.kana) {
      // 假名段本身即讀音，讀音字串應以它開頭；否則對不上 → 整詞退回
      if (r.startsWith(seg.text)) { out += seg.text; r = r.slice(seg.text.length); }
      else return `{${surface}|${readingHira}}`;
    } else {
      const next = segs[i + 1];               // 下一段（假名）當錨點
      if (next && next.kana) {
        // 從 1 起找：漢字段至少吃 1 個讀音字，避免漢字讀音與送假名同字時提早命中
        // （言い訳 いいわけ：言=い、送假名也是 い → 應為 {言|い}い{訳|わけ}）
        const idx = r.indexOf(next.text, 1);
        if (idx < 1) return `{${surface}|${readingHira}}`;
        out += `{${seg.text}|${r.slice(0, idx)}}`;
        r = r.slice(idx);
      } else {
        out += `{${seg.text}|${r}}`;            // 最後一段漢字 → 吃掉剩餘讀音
        r = '';
      }
    }
  }
  return out;
}

// 標點（羅馬拼音不轉音、只保留對應符號）
const PUNC = /^[、。！？!?「」『』（）()・…～〜　\s]+$/;
/**
 * 這個 token 是否「黏在前一詞」（不在它前面插空格）：
 * 助動詞（ます／た／ない…，但 です／だ 例外自成一詞）、接續助詞（て／で…）都黏前面。
 * @param {object} t 目前 token
 * @param {object} [prev] 前一個 token（用來判斷「助詞後的助動詞要另起」）
 */
function attaches(t, prev) {
  if (t.pos === '助詞' && t.pos_detail_1 === '接続助詞') return true;
  if (t.pos === '助動詞') {
    if (t.basic_form === 'です' || t.basic_form === 'だ') return false; // 繫辭自成一詞
    if (prev && prev.pos === '助詞') return false;                       // ではない → de wa nai
    return true;
  }
  return false;
}

/**
 * 合併相鄰 token 以套用「特殊讀音修正表」：kuromoji 常把 二人／三日 拆成 二+人、三+日，
 * 這裡把連續 token 的詞面接起來比對修正表（最長優先，最多看 4 個 token），命中就合成一個 token。
 * @param {Array} tokens kuromoji 原始 tokens
 * @returns {Array} 合併後的 tokens
 */
/** 這個 token 是不是數字（漢數字或 pos 細分類「数」）——用來擋大數字誤合日期/人數 */
function isNumberTok(t) {
  return !!t && (t.pos_detail_1 === '数' || /^[0-9０-９一二三四五六七八九十百千万億兆]+$/.test(t.surface_form || ''));
}

function mergeOverrides(tokens) {
  const out = [];
  let i = 0;
  while (i < tokens.length) {
    let hit = null;
    for (let len = Math.min(4, tokens.length - i); len >= 2; len--) {
      const surf = tokens.slice(i, i + len).map((x) => x.surface_form).join('');
      if (READING_OVERRIDES[surf]) { hit = { surf, len }; break; }
    }
    // 前一個 token 是數字時，命中的短 key（二日／二人…）其實是大數字的一部分，別誤合
    // （十二日 ≠ 十＋二日；三十日 ≠ 三十＋日；避免讀成 じゅうふつか）
    if (hit && i > 0 && isNumberTok(tokens[i - 1])) hit = null;
    if (hit) {
      const rd = READING_OVERRIDES[hit.surf];
      out.push({ surface_form: hit.surf, reading: rd, pronunciation: rd, pos: '名詞', pos_detail_1: '', basic_form: hit.surf });
      i += hit.len;
    } else { out.push(tokens[i]); i += 1; }
  }
  return out;
}

/**
 * 從 kuromoji tokens 組出 {furigana, reading, romaji}
 * 羅馬拼音：把動詞活用＋助動詞黏成一個「詞組」再整組轉寫，
 * 促音「っ」與長音「ー」因此能跨 token 正確（如 行かなかった→ikanakatta）。
 * @param {Array} tokens kuromoji.tokenize() 結果
 * @returns {{furigana:string, reading:string, romaji:string}}
 */
export function buildFromTokens(tokens) {
  let furigana = '';
  let reading = '';
  const groups = [];        // 每項 {pron:'…'} 詞組 或 {punc:'…'} 標點
  let cur = '';
  const flush = () => { if (cur) { groups.push({ pron: cur }); cur = ''; } };

  const merged = mergeOverrides(tokens);
  let prev = null;
  for (const t of merged) {
    const surface = t.surface_form;
    const ov = READING_OVERRIDES[surface];
    const rd = ov || ((t.reading && t.reading !== '*') ? kataToHira(t.reading) : surface);       // 書寫讀音（は→は）
    const pron = ov || ((t.pronunciation && t.pronunciation !== '*') ? kataToHira(t.pronunciation) : rd); // 發音（は→わ）
    furigana += furiToken(surface, rd);
    reading += rd;
    if (PUNC.test(surface)) { flush(); groups.push({ punc: surface }); prev = t; continue; }
    if (!attaches(t, prev)) flush();     // 獨立詞 → 開新詞組（前面補空格）
    cur += pron;
    prev = t;
  }
  flush();

  // 分詞羅馬拼音：詞組間空格，標點貼在前一詞後
  let romaji = '';
  for (const g of groups) {
    if (g.punc) romaji += (g.punc === '。' ? '.' : g.punc === '、' ? ',' : g.punc === '！' ? '!' : g.punc === '？' ? '?' : '');
    else romaji += (romaji && !romaji.endsWith(' ') ? ' ' : '') + toRomaji(g.pron);
  }
  romaji = romaji.trim();
  romaji = romaji.replace(/[a-z]/, (c) => c.toUpperCase());   // 大寫「第一個字母」（句首若是標點也能正確大寫）
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

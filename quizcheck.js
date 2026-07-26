// quizcheck.js — 測驗「打字題」的純判分邏輯（無 DOM，Node 可測）。
// 用於：漢字讀音（看漢字→打假名）、聽寫、寫（聽/看中文→打「日文寫法」＋「假名」）。
// 判分寬鬆度：去空白、片假名⇄平假名視為相同；但促音（っ/ッ）、長音（ー）等差異照抓。

/**
 * 假名比對用正規化：去除所有空白，並把片假名折成平假名。
 * 目的：讓「假名種類」不影響判分（打 えあこん 或 エアコン 都算），
 *       但促音、長音、拗音等仍會保留 → 拼錯照樣抓得到。
 * @param {string} s 原字串
 * @returns {string} 正規化後字串
 */
export function normKana(s) {
  return (s || '').trim().replace(/\s+/g, '')
    .replace(/[ァ-ヶ]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0x60));
}

/**
 * 判斷字串是否含漢字（含 CJK 基本區、擴充 A 區、疊字符 々）。
 * @param {string} s 原字串
 * @returns {boolean} 有漢字為 true
 */
export function hasKanji(s) {
  return /[一-鿿㐀-䶿々]/.test(s || '');
}

/**
 * 這張卡的「聽寫／寫」是否要用兩格（日文寫法＋假名讀音）。
 * 條件：有漢字、且有讀音、且讀音與寫法不同（純假名詞→單格；也決定「讀漢字假名/漢字讀音」是否適用）。
 * @param {{jp?:string, reading?:string}} card 卡片
 * @returns {boolean} 需要兩格為 true
 */
export function isTwoField(card) {
  const jp = card && card.jp;
  const reading = card && card.reading;
  return hasKanji(jp) && !!reading && normKana(reading) !== normKana(jp);
}

/**
 * 「漢字讀音」判分：使用者輸入的假名 === 卡片讀音（經假名正規化）。
 * @param {string} input 使用者輸入
 * @param {string} reading 卡片讀音
 * @returns {boolean} 正確為 true
 */
export function matchReading(input, reading) {
  const a = normKana(input);
  return !!a && a === normKana(reading);
}

/**
 * 「聽寫／寫」判分：日文寫法＋假名讀音兩格都要對；純假名詞只有一格（日文寫法）。
 * @param {string} inJp 「日文寫法」格輸入
 * @param {string} inKana 「假名讀音」格輸入（單格時忽略）
 * @param {{jp?:string, reading?:string}} card 卡片
 * @returns {{ok:boolean, jpOk:boolean, kanaOk:boolean, twoField:boolean}} 判分結果
 */
export function matchDictation(inJp, inKana, card) {
  const twoField = isTwoField(card);
  const jpOk = !!normKana(inJp) && normKana(inJp) === normKana(card && card.jp);
  if (!twoField) return { ok: jpOk, jpOk, kanaOk: true, twoField: false };
  const kanaOk = matchReading(inKana, card.reading);
  return { ok: jpOk && kanaOk, jpOk, kanaOk, twoField: true };
}

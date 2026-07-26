// mdlite.js — 極簡 Markdown → HTML。只處理：粗體 **x**、階層項目（*、-、・）、段落。
// 用途：把 AI 回的 Markdown（如 AI 健檢）渲染成好讀的排版，不引第三方套件。
// 安全：一律先 escape HTML，再套用有限的格式標記（AI 產出視為不可信內容）。

/**
 * HTML 逃脫（防 XSS）。連引號一起逃脫＝防禦縱深：
 * 目前輸出「不含任何帶屬性的標籤」，本函式已足夠安全；但若日後 mdToHtml 擴充成會輸出屬性
 * （如 <a href>），逃脫引號可避免屬性注入。不變量：使用者內容永遠只進入元素文字，不進入屬性。
 * @param {string} s 原字串
 * @returns {string} 逃脫後字串
 */
function esc(s) {
  return String(s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
/** 行內格式：先逃脫，再把 **粗體** 轉成 <strong> @param {string} s 一行文字 @returns {string} HTML */
function inline(s) {
  return esc(s).replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
}

/**
 * 把極簡 Markdown 轉成 HTML 字串。
 * 支援：段落（連續非項目行，行間以 <br> 接）、項目清單（以 * 或 - 或 ・ 開頭，用縮排決定巢狀層級）、粗體。
 * @param {string} text 原始 Markdown 文字（通常來自 AI）
 * @returns {string} 可放進 innerHTML 的 HTML
 */
export function mdToHtml(text) {
  const lines = String(text || '').replace(/\r/g, '').split('\n');
  const out = [];
  const indents = [];               // 目前開著的每層 <ul> 對應的縮排寬度
  let para = [];                    // 累積中的段落文字行
  const flushPara = () => { if (para.length) { out.push('<p>' + para.map(inline).join('<br>') + '</p>'); para = []; } };
  const closeLists = () => { while (indents.length) { out.push('</ul>'); indents.pop(); } };
  for (const raw of lines) {
    const line = raw.replace(/\s+$/, '');
    if (!line.trim()) { flushPara(); continue; } // 空行＝段落分隔（不強制關清單，項目間可留空行）
    const m = line.match(/^(\s*)[*\-・]\s+(.*)$/);
    if (m) {
      flushPara();
      const indent = m[1].replace(/\t/g, '  ').length;
      // 依縮排調整巢狀層級：比目前淺就收，比目前深就開
      while (indents.length && indent < indents[indents.length - 1]) { out.push('</ul>'); indents.pop(); }
      if (!indents.length || indent > indents[indents.length - 1]) { out.push('<ul>'); indents.push(indent); }
      out.push('<li>' + inline(m[2]) + '</li>');
    } else {
      closeLists();
      para.push(line);
    }
  }
  flushPara();
  closeLists();
  return out.join('');
}

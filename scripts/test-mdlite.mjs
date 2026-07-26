// test-mdlite.mjs — 驗證 mdlite.js 的 Markdown→HTML（粗體、項目、巢狀、段落、逃脫）。
// 執行：cd C:\edhong\JP && node scripts/test-mdlite.mjs
import { mdToHtml } from '../mdlite.js';

let pass = 0;
let fail = 0;
function eq(label, got, want) {
  if (got === want) { pass += 1; console.log(`  ✅ ${label}`); }
  else { fail += 1; console.log(`  ❌ ${label}\n      got : ${got}\n      want: ${want}`); }
}

console.log('■ 粗體與段落');
eq('粗體', mdToHtml('**你好**'), '<p><strong>你好</strong></p>');
eq('一行多個粗體', mdToHtml('**A** 與 **B**'), '<p><strong>A</strong> 與 <strong>B</strong></p>');
eq('多行段落以 <br> 接', mdToHtml('第一行\n第二行'), '<p>第一行<br>第二行</p>');
eq('空行分段', mdToHtml('段一\n\n段二'), '<p>段一</p><p>段二</p>');

console.log('\n■ 項目清單');
eq('單層項目', mdToHtml('* 甲\n* 乙'), '<ul><li>甲</li><li>乙</li></ul>');
eq('- 也是項目', mdToHtml('- 甲'), '<ul><li>甲</li></ul>');
eq('・ 也是項目', mdToHtml('・ 甲'), '<ul><li>甲</li></ul>');
eq('項目內粗體', mdToHtml('* **重點**：說明'), '<ul><li><strong>重點</strong>：說明</li></ul>');
eq('巢狀（縮排）', mdToHtml('* 甲\n    * 甲一'), '<ul><li>甲</li><ul><li>甲一</li></ul></ul>');
eq('巢狀後回上層', mdToHtml('* 甲\n    * 甲一\n* 乙'), '<ul><li>甲</li><ul><li>甲一</li></ul><li>乙</li></ul>');

console.log('\n■ 段落與清單混合、逃脫');
eq('段落接清單', mdToHtml('說明：\n* 甲'), '<p>說明：</p><ul><li>甲</li></ul>');
eq('HTML 逃脫', mdToHtml('<b>x</b> & y'), '<p>&lt;b&gt;x&lt;/b&gt; &amp; y</p>');
eq('項目內也逃脫', mdToHtml('* <script>'), '<ul><li>&lt;script&gt;</li></ul>');
eq('引號逃脫（防禦縱深）', mdToHtml(`他說"你好"`), '<p>他說&quot;你好&quot;</p>');
eq('空字串', mdToHtml(''), '');

console.log('\n■ 邊界');
eq('奇數 ** 不成粗體、原樣顯示', mdToHtml('**abc'), '<p>**abc</p>');
eq('句中 ・ 不當項目', mdToHtml('これは・あれ'), '<p>これは・あれ</p>');
eq('忽深忽淺縮排仍平衡', mdToHtml('* a\n    * b\n  * c'), '<ul><li>a</li><ul><li>b</li></ul><ul><li>c</li></ul></ul>');

console.log(`\n總結：${pass} 通過，${fail} 失敗`);
process.exit(fail ? 1 : 0);

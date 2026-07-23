// test-tts.mjs — 驗證 tts.js 的純邏輯（引擎判斷、雲端請求 body）。不含瀏覽器 API。
// 執行：cd C:\edhong\JP && node scripts/test-tts.mjs
import { ttsEngine, cloudBody, cloudVoices } from '../tts.js';

let pass = 0;
let fail = 0;
function eq(label, got, want) {
  const g = JSON.stringify(got);
  const w = JSON.stringify(want);
  if (g === w) { pass += 1; console.log(`  ✅ ${label}: ${g}`); }
  else { fail += 1; console.log(`  ❌ ${label}\n      got : ${g}\n      want: ${w}`); }
}

console.log('■ ttsEngine 引擎判斷');
eq('無設定 → web', ttsEngine({}), 'web');
eq('沒 key → web', ttsEngine({ ttsEngine: undefined }), 'web');
eq('有 key、未指定 → gcloud', ttsEngine({ ttsKey: 'abc' }), 'gcloud');
eq('明指 web（即使有 key）', ttsEngine({ ttsKey: 'abc', ttsEngine: 'web' }), 'web');
eq('明指 gcloud', ttsEngine({ ttsEngine: 'gcloud', ttsKey: 'abc' }), 'gcloud');
eq('非法引擎值被忽略 → 依 key 判斷', ttsEngine({ ttsEngine: 'xxx', ttsKey: 'abc' }), 'gcloud');

console.log('\n■ cloudBody 請求內容');
eq('預設語音 Neural2-B', cloudBody('こんにちは').voice.name, 'ja-JP-Neural2-B');
eq('語言碼', cloudBody('あ').voice.languageCode, 'ja-JP');
eq('帶入文字', cloudBody('明後日').input.text, '明後日');
eq('指定語音', cloudBody('あ', 'ja-JP-Wavenet-C').voice.name, 'ja-JP-Wavenet-C');
eq('音訊格式 MP3', cloudBody('あ').audioConfig.audioEncoding, 'MP3');

console.log('\n■ cloudVoices');
const vs = cloudVoices();
eq('至少 3 個語音', vs.length >= 3, true);
eq('每個都有 id/label', vs.every((v) => v.id && v.label), true);
vs.push({ id: 'x' });
eq('回傳是複本（外部 push 不影響內部）', cloudVoices().length, vs.length - 1);

console.log(`\n總結：${pass} 通過，${fail} 失敗`);
process.exit(fail ? 1 : 0);

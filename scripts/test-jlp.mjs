// test-jlp.mjs — 用 Node + kuromoji 驗證 buildFromTokens 的 furigana / 讀音 / 分詞羅馬拼音
// 執行：cd C:\edhong\JP && node scripts/test-jlp.mjs
import kuromoji from 'kuromoji';
import { buildFromTokens, furiToken } from '../jlp.js';

let pass = 0;
let fail = 0;
/** 斷言相等 */
function eq(label, got, want) {
  if (got === want) { pass += 1; console.log(`  ✅ ${label}: ${got}`); }
  else { fail += 1; console.log(`  ❌ ${label}\n      got : ${got}\n      want: ${want}`); }
}
/** 斷言包含 */
function has(label, got, want) {
  if (String(got).includes(want)) { pass += 1; console.log(`  ✅ ${label}: ${got}`); }
  else { fail += 1; console.log(`  ❌ ${label}\n      got : ${got}\n      want(包含): ${want}`); }
}

// ── 純函式測試：furiToken 逐段對位（不需字典）──────────────
console.log('■ furiToken 逐段對位');
eq('詞中夾假名 取り消し', furiToken('取り消し', 'とりけし'), '{取|と}り{消|け}し');
eq('動詞送假名 調べる', furiToken('調べる', 'しらべる'), '{調|しら}べる');
eq('複合詞 言葉', furiToken('言葉', 'ことば'), '{言葉|ことば}');
eq('全假名不注音', furiToken('あまり', 'あまり'), 'あまり');
eq('い形容詞 大きい', furiToken('大きい', 'おおきい'), '{大|おお}きい');
eq('對不上→整詞退回', furiToken('明後日', 'あさって'), '{明後日|あさって}');
// 迴歸：漢字讀音與送假名同字（言=い＋送假名い），不可提早命中成空讀音
eq('同字碰撞 言い訳', furiToken('言い訳', 'いいわけ'), '{言|い}い{訳|わけ}');
eq('同字碰撞 言い方', furiToken('言い方', 'いいかた'), '{言|い}い{方|かた}');

// ── 需要 kuromoji 字典的整句測試 ──────────────────────────
kuromoji.builder({ dicPath: 'node_modules/kuromoji/dict' }).build((err, tk) => {
  if (err) { console.error(err); process.exit(1); }
  const b = (s) => buildFromTokens(tk.tokenize(s));

  console.log('\n■ 特殊讀音修正表（發音問題）');
  eq('明後日 讀音', b('明後日').reading, 'あさって');
  eq('明後日 注音', b('明後日').furigana, '{明後日|あさって}');
  eq('二人 讀音', b('二人').reading, 'ふたり');
  eq('三日 讀音', b('三日').reading, 'みっか');
  eq('二十日 讀音', b('二十日').reading, 'はつか');
  // 迴歸：大數字＋日期/人數不可誤合短 key（十二日≠十+二日）
  has('十二日 不誤合成 ふつか', b('十二日').reading, 'にち');
  eq('十二日 無 ふつか', b('十二日').reading.includes('ふつか'), false);
  eq('三十日 無 とおか', b('三十日').reading.includes('とおか'), false);
  eq('十二人 無 ふたり', b('十二人').reading.includes('ふたり'), false);

  console.log('\n■ 分詞羅馬拼音（促音／活用黏詞）');
  eq('調べる整句', b('言葉の意味を調べる。').romaji, 'Kotoba no imi o shiraberu.');
  eq('ます不拆開', b('公園へ行きます。').romaji, 'Kooen e ikimasu.');
  has('句末促音 なかった', b('彼は昨日学校へ行かなかった。').romaji, 'ikanakatta');
  has('～ています 黏成 shiteimasu', b('私は毎日日本語を勉強しています。').romaji, 'shite imasu');
  eq('は→wa 助詞', b('野菜はあまり好きではない。').romaji, 'Yasai wa amari suki de wa nai.');

  console.log('\n■ 逐句輸出（人工檢視）');
  for (const s of ['取り消しの手続きをしてください。', 'コーヒーを一杯飲みたいです。', '明後日は友達と映画を見に行きます。']) {
    const r = b(s);
    console.log(`  ${s}\n    furi: ${r.furigana}\n    roma: ${r.romaji}`);
  }

  console.log(`\n總結：${pass} 通過，${fail} 失敗`);
  process.exit(fail ? 1 : 0);
});

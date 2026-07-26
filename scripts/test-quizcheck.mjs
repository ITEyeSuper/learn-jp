// test-quizcheck.mjs — 驗證 quizcheck.js 的打字題判分（促音、長音、片假名容錯、聽寫兩格）。
// 執行：cd C:\edhong\JP && node scripts/test-quizcheck.mjs
import { normKana, hasKanji, isTwoField, matchReading, matchDictation } from '../quizcheck.js';

let pass = 0;
let fail = 0;
function eq(label, got, want) {
  const g = JSON.stringify(got);
  const w = JSON.stringify(want);
  if (g === w) { pass += 1; console.log(`  ✅ ${label}: ${g}`); }
  else { fail += 1; console.log(`  ❌ ${label}\n      got : ${g}\n      want: ${w}`); }
}

console.log('■ normKana（去空白＋片假名折平假名）');
eq('片假名→平假名', normKana('エアコン'), 'えあこん');
eq('去空白', normKana(' えい がかん '), 'えいがかん');
eq('促音保留', normKana('がっこう'), 'がっこう');
eq('長音符保留', normKana('コーヒー'), 'こーひー');

console.log('\n■ hasKanji');
eq('映画館 有漢字', hasKanji('映画館'), true);
eq('取り消し 有漢字', hasKanji('取り消し'), true);
eq('エアコン 無漢字', hasKanji('エアコン'), false);
eq('これ 無漢字', hasKanji('これ'), false);
eq('時々 疊字算漢字', hasKanji('時々'), true);

console.log('\n■ isTwoField（哪種字要兩格 / 適用 讀漢字假名·漢字讀音）');
eq('漢字詞→兩格', isTwoField({ jp: '映画館', reading: 'えいがかん' }), true);
eq('片假名詞→單格', isTwoField({ jp: 'エアコン', reading: 'えあこん' }), false);
eq('平假名詞→單格', isTwoField({ jp: 'これ', reading: '' }), false);
eq('漢字詞無讀音→單格（退化）', isTwoField({ jp: '映画館', reading: '' }), false);

console.log('\n■ matchReading（漢字讀音：打假名）');
eq('正確', matchReading('えいがかん', 'えいがかん'), true);
eq('打片假名也算', matchReading('エイガカン', 'えいがかん'), true);
eq('促音錯（がこう vs がっこう）', matchReading('がこう', 'がっこう'), false);
eq('長音錯（こひ vs こーひー）', matchReading('こひ', 'こーひー'), false);
eq('空字串→錯', matchReading('', 'えいがかん'), false);

console.log('\n■ matchDictation（聽寫／寫）');
const kanjiCard = { jp: '映画館', reading: 'えいがかん' };
eq('漢字詞兩格都對', matchDictation('映画館', 'えいがかん', kanjiCard).ok, true);
eq('只對漢字、假名錯→整題錯', matchDictation('映画館', 'えがかん', kanjiCard).ok, false);
eq('只對假名、漢字錯→整題錯', matchDictation('映画', 'えいがかん', kanjiCard).ok, false);
eq('防作弊：日文格打純假名→漢字算錯', matchDictation('えいがかん', 'えいがかん', kanjiCard).jpOk, false);
eq('回傳分格狀態', matchDictation('映画館', 'えがかん', kanjiCard), { ok: false, jpOk: true, kanaOk: false, twoField: true });
const kataCard = { jp: 'エアコン', reading: 'えあこん' };
eq('片假名詞單格：打エアコン對', matchDictation('エアコン', '', kataCard).ok, true);
eq('片假名詞單格：打えあこん也對', matchDictation('えあこん', '', kataCard).ok, true);
eq('片假名詞單格：假名格被忽略', matchDictation('エアコン', '亂打', kataCard).twoField, false);

console.log(`\n總結：${pass} 通過，${fail} 失敗`);
process.exit(fail ? 1 : 0);

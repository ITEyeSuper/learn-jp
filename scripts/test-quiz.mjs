// test-quiz.mjs — 驗證 srs.js 的 buildQuizItems（單字/例句題庫組建）
// 執行：cd C:\edhong\JP && node scripts/test-quiz.mjs
import { buildQuizItems, addDays, todayISO } from '../srs.js';

let pass = 0;
let fail = 0;
function eq(label, got, want) {
  if (JSON.stringify(got) === JSON.stringify(want)) { pass += 1; console.log(`  ✅ ${label}: ${JSON.stringify(got)}`); }
  else { fail += 1; console.log(`  ❌ ${label}\n      got : ${JSON.stringify(got)}\n      want: ${JSON.stringify(want)}`); }
}

const today = todayISO();
const cards = [
  { id: 'a', type: 'vocab', tags: ['N5'], meaning: '頭', srs: null,
    examples: [{ jp: '頭が痛い', reading: 'あたまがいたい', zh: '頭痛' }, { jp: '無翻譯句', reading: 'x', zh: '' }] },
  { id: 'b', type: 'grammar', tags: ['N4'], meaning: '～ので', srs: { nextReview: addDays(today, 5) }, // 未到期
    examples: [{ jp: '雨なので', reading: 'あめなので', zh: '因為下雨' }] },
  { id: 'c', type: 'vocab', tags: [], meaning: '水', srs: null, examples: [] }, // 無例句
];

console.log('■ content=word');
eq('只出單字題（3 張卡全到期，b 也算 due? 否，b 未到期）',
  buildQuizItems(cards, { content: new Set(['word']), today }).map((i) => i.card.id),
  ['a', 'c']); // b 未到期被排除

console.log('\n■ content=example（只收有 zh 的例句）');
eq('只出例句題（a 的有效例句 1 條；c 無例句；b 未到期）',
  buildQuizItems(cards, { content: new Set(['example']), today }).map((i) => i.kind + ':' + i.card.id),
  ['example:a']);

console.log('\n■ content=word+example');
eq('a 出「單字+1例句」、c 出單字',
  buildQuizItems(cards, { content: new Set(['word', 'example']), today }).map((i) => i.kind + ':' + i.card.id),
  ['word:a', 'example:a', 'word:c']);

console.log('\n■ type / tags 篩選');
eq('type=grammar + dueOnly=false → 只有 b',
  buildQuizItems(cards, { type: 'grammar', content: new Set(['word']), dueOnly: false, today }).map((i) => i.card.id),
  ['b']);
eq('tags=N5 → 只有 a',
  buildQuizItems(cards, { tags: new Set(['N5']), content: new Set(['word']), today }).map((i) => i.card.id),
  ['a']);

console.log('\n■ dueOnly=false 收未到期的 b');
eq('全部單字題（含未到期 b）',
  buildQuizItems(cards, { content: new Set(['word']), dueOnly: false, today }).map((i) => i.card.id),
  ['a', 'b', 'c']);

console.log(`\n總結：${pass} 通過，${fail} 失敗`);
process.exit(fail ? 1 : 0);

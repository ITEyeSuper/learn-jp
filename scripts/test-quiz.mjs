// test-quiz.mjs — 驗證 srs.js 的 buildQuizItems（單字/例句題庫組建）
// 執行：cd C:\edhong\JP && node scripts/test-quiz.mjs
import { buildQuizItems, addDays, todayISO, isLeech, everWrongCards } from '../srs.js';

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

console.log('\n■ 常錯題（leech）');
eq('答錯2次未連對 → 是常錯題', isLeech({ stats: { wrong: 2, streak: 0 } }), true);
eq('答錯2次但連對2次 → 畢業(非常錯)', isLeech({ stats: { wrong: 2, streak: 2 } }), false);
eq('答錯1次 → 還不是常錯', isLeech({ stats: { wrong: 1, streak: 0 } }), false);
eq('無 stats → 非常錯', isLeech({}), false);
// 常錯題即使「未到期」也納入，且單字題多出一次
const leechCard = { id: 'L', type: 'vocab', tags: [], meaning: '難字', srs: { nextReview: addDays(today, 9) }, stats: { wrong: 3, streak: 0 }, examples: [] };
const litems = buildQuizItems([leechCard], { content: new Set(['word']), dueOnly: true, today });
eq('未到期的常錯題仍被納入且出現2次', litems.length, 2);
eq('都標記 leech', litems.every((i) => i.leech), true);

console.log('\n■ everWrongCards（沒有常錯題時的加強複習排序）');
const wc = [
  { id: 'a', stats: { wrong: 3, streak: 2 }, srs: { lastReviewed: '2026-07-10' } },
  { id: 'b', stats: { wrong: 1, streak: 5 }, srs: { lastReviewed: '2026-07-25' } },
  { id: 'c', stats: { wrong: 3, streak: 2 }, srs: { lastReviewed: '2026-07-20' } },
  { id: 'd', stats: { wrong: 0, streak: 9 }, srs: { lastReviewed: '2026-07-25' } },
];
eq('錯多優先、同分最近恢復優先；沒錯過的排除', everWrongCards(wc).map((c) => c.id).join(''), 'cab');
eq('全沒錯過 → 空', everWrongCards([{ id: 'x', stats: { wrong: 0 } }]).length, 0);

console.log(`\n總結：${pass} 通過，${fail} 失敗`);
process.exit(fail ? 1 : 0);

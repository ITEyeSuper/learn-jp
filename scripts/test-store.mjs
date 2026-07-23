// test-store.mjs — 驗證 store.js 的備份匯出／合併匯入邏輯（用記憶體模擬 localStorage）
// 執行：cd C:\edhong\JP && node scripts/test-store.mjs
const mem = {};
globalThis.localStorage = {
  getItem: (k) => (k in mem ? mem[k] : null),
  setItem: (k, v) => { mem[k] = String(v); },
  removeItem: (k) => { delete mem[k]; },
};

const { exportAll, importAll, loadCards, saveCards, loadTagList, saveTagList, sortByNewest, paginate } = await import('../store.js');

let pass = 0;
let fail = 0;
function eq(label, got, want) {
  if (got === want) { pass += 1; console.log(`  ✅ ${label}: ${JSON.stringify(got)}`); }
  else { fail += 1; console.log(`  ❌ ${label}\n      got : ${JSON.stringify(got)}\n      want: ${JSON.stringify(want)}`); }
}

console.log('■ exportAll 內容');
saveCards([{ id: 'a', jp: '頭', tags: ['N5'] }]);
saveTagList(['N5', 'N4']);
const dump = JSON.parse(exportAll());
eq('含 app 標記', dump.app, 'JP');
eq('含卡片', dump.cards.length, 1);
eq('含標籤', dump.tags.includes('N4'), true);
eq('不含 AI key', 'settings' in dump || 'aiKey' in dump, false);

console.log('\n■ importAll 合併（同 id 覆蓋、新卡加入、原卡保留）');
saveCards([{ id: 'a', jp: '舊頭', tags: [] }, { id: 'keep', jp: '保留' }]);
saveTagList(['N5']);
const backup = JSON.stringify({ cards: [{ id: 'a', jp: '新頭' }, { id: 'b', jp: '新卡' }], tags: ['N3'] });
const r1 = importAll(backup);
eq('ok', r1.ok, true);
eq('新增數', r1.added, 1);
eq('更新數', r1.updated, 1);
const cards = loadCards();
eq('總卡片數（a 覆蓋、keep 保留、b 新增）', cards.length, 3);
eq('a 被覆蓋成新頭', cards.find((c) => c.id === 'a').jp, '新頭');
eq('keep 未被弄丟', !!cards.find((c) => c.id === 'keep'), true);
eq('標籤聯集含 N3', loadTagList().includes('N3'), true);

console.log('\n■ 同 id 較新為準（保護較新的編輯／進度）');
saveCards([{ id: 'x', jp: '新編輯', updated: '2026-07-22T10:00:00Z' }]);
saveTagList([]);
const oldBackup = JSON.stringify({ cards: [{ id: 'x', jp: '舊備份', updated: '2026-07-20T10:00:00Z' }] });
const r3 = importAll(oldBackup);
eq('舊備份被略過', r3.skipped, 1);
eq('現有較新未被蓋', loadCards().find((c) => c.id === 'x').jp, '新編輯');
const newBackup = JSON.stringify({ cards: [{ id: 'x', jp: '更新的', updated: '2026-07-25T10:00:00Z' }] });
const r4 = importAll(newBackup);
eq('較新備份覆蓋', r4.updated, 1);
eq('內容更新', loadCards().find((c) => c.id === 'x').jp, '更新的');

console.log('\n■ 邊界／錯誤');
eq('壞 JSON → 失敗', importAll('{不是json').ok, false);
eq('缺 cards → 失敗', importAll('{"foo":1}').ok, false);
const before = loadCards().length;
const r2 = importAll(JSON.stringify({ cards: [{ jp: '沒有id的卡' }] }));
eq('沒 id 的卡 → 當新增', r2.added, 1);
eq('卡片數 +1', loadCards().length, before + 1);
eq('新卡拿到 id', !!loadCards().find((c) => c.jp === '沒有id的卡').id, true);

console.log('\n■ sortByNewest 排序');
const sample = [
  { id: '1', created: '2026-07-20T00:00:00Z' },
  { id: '2', created: '2026-07-22T00:00:00Z' },
  { id: '3', created: '2026-07-21T00:00:00Z' },
];
eq('最新在前', sortByNewest(sample, true).map((c) => c.id).join(''), '231');
eq('最舊在前', sortByNewest(sample, false).map((c) => c.id).join(''), '132');
eq('不改動原陣列', sample.map((c) => c.id).join(''), '123');

console.log('\n■ paginate 分頁');
const list = Array.from({ length: 25 }, (_, i) => ({ id: String(i + 1) }));
const p1 = paginate(list, 1, 10);
eq('第1頁 10 張', p1.items.length, 10);
eq('總頁數', p1.totalPages, 3);
eq('第3頁剩 5 張', paginate(list, 3, 10).items.length, 5);
eq('超界頁碼夾回最後一頁', paginate(list, 99, 10).page, 3);
eq('頁碼<1 夾回第1頁', paginate(list, 0, 10).page, 1);
eq('空清單 totalPages=1', paginate([], 1, 10).totalPages, 1);

console.log(`\n總結：${pass} 通過，${fail} 失敗`);
process.exit(fail ? 1 : 0);

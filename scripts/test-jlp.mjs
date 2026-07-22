// test-jlp.mjs — 用 Node + kuromoji 驗證 buildFromTokens 的 furigana / 讀音 / 分詞羅馬拼音
import kuromoji from 'kuromoji';
import { buildFromTokens } from '../jlp.js';

kuromoji.builder({ dicPath: 'node_modules/kuromoji/dict' }).build((err, tk) => {
  if (err) { console.error(err); process.exit(1); }
  const cases = ['言葉の意味を調べる。', '野菜はあまり好きではない。', '意味', '頭', '公園へ行きます。'];
  for (const s of cases) {
    const r = buildFromTokens(tk.tokenize(s));
    console.log(s);
    console.log('  furigana:', r.furigana);
    console.log('  reading :', r.reading);
    console.log('  romaji  :', r.romaji);
  }
});

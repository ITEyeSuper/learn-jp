// test-readseq.mjs — 驗證 tts.js 的「連續朗讀鎖屏版」排序器 playAudioSequence。
// 用假的 Audio／fetch 模擬瀏覽器：不打真 API、不出聲，只驗控制流程。
// 執行：cd C:\edhong\JP && node scripts/test-readseq.mjs

// ── 假的 <audio>：play() 後排一個微延遲的 'ended'，模擬一段播完會自動接下一段 ──
// AUTO_END=false 時 play() 不自動觸發 ended，改由測試手動 _emit（用來製造 next 競態）
let AUTO_END = true;
class FakeAudio {
  constructor() { this.paused = true; this.src = ''; this._l = {}; globalThis.__lastAudio = this; }
  addEventListener(t, f) { (this._l[t] = this._l[t] || []).push(f); }
  removeEventListener(t, f) { if (this._l[t]) this._l[t] = this._l[t].filter((x) => x !== f); }
  _emit(t) { (this._l[t] || []).slice().forEach((f) => f()); }
  play() {
    this.paused = false;
    if (!AUTO_END) return Promise.resolve();
    const src = this.src; // 記住當下音源；若被換掉（next/取代）就不觸發這一段的 ended
    setTimeout(() => { if (this.src === src && !this.paused) { this.paused = true; this._emit('ended'); } }, 2);
    return Promise.resolve();
  }
  pause() { this.paused = true; }
}

// ── 假的 fetch：回傳一段假的 base64 音訊；記錄呼叫次數以驗快取 ──
let fetchCalls = 0;
globalThis.Audio = FakeAudio;
globalThis.fetch = async () => { fetchCalls += 1; return { ok: true, json: async () => ({ audioContent: 'ZmFrZQ==' }) }; };

const { playAudioSequence } = await import('../tts.js');

let pass = 0;
let fail = 0;
function eq(label, got, want) {
  const g = JSON.stringify(got);
  const w = JSON.stringify(want);
  if (g === w) { pass += 1; console.log(`  ✅ ${label}: ${g}`); }
  else { fail += 1; console.log(`  ❌ ${label}\n      got : ${g}\n      want: ${w}`); }
}
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const S = { ttsKey: 'x', ttsVoiceCloud: 'ja-JP-Neural2-B' };

console.log('■ 依序播完整串');
{
  const order = [];
  let done = false;
  const steps = [
    { text: 'A', lang: 'ja-JP', jp: 'A', meaning: 'a' },
    { text: 'あ', lang: 'zh-TW', jp: 'A', meaning: 'a' },
    { text: 'B', lang: 'ja-JP', jp: 'B', meaning: 'b' },
  ];
  playAudioSequence(steps, S, { onstep: (_s, i) => order.push(i), ondone: () => { done = true; } });
  await wait(120);
  eq('每一段都有輪到（順序）', order, [0, 1, 2]);
  eq('播完呼叫 ondone', done, true);
}

console.log('\n■ stop() 後不再前進');
{
  const order = [];
  let done = false;
  const steps = [
    { text: 'C', lang: 'ja-JP', jp: 'C', meaning: 'c' },
    { text: 'D', lang: 'ja-JP', jp: 'D', meaning: 'd' },
    { text: 'E', lang: 'ja-JP', jp: 'E', meaning: 'e' },
  ];
  const ctl = playAudioSequence(steps, S, { onstep: (_s, i) => order.push(i), ondone: () => { done = true; } });
  await wait(5);
  ctl.stop();
  const snapshot = order.length;
  await wait(60);
  eq('stop 後步數不再增加', order.length, snapshot);
  eq('stop 不觸發 ondone', done, false);
}

console.log('\n■ 同句走快取、不重複呼叫 API（念兩次的第二次免費）');
{
  fetchCalls = 0;
  const steps = [
    { text: '重複', lang: 'ja-JP', jp: 'x', meaning: 'x' },
    { text: '重複', lang: 'ja-JP', jp: 'x', meaning: 'x' },
  ];
  playAudioSequence(steps, S, {});
  await wait(80);
  eq('相同(語音,文字)只打一次 API', fetchCalls, 1);
}

console.log('\n■ 合成失敗會跳過該段、不整串卡死');
{
  const okFetch = globalThis.fetch;
  let n = 0;
  globalThis.fetch = async () => { n += 1; if (n === 1) throw new Error('boom'); return { ok: true, json: async () => ({ audioContent: 'ZmFrZQ==' }) }; };
  const order = [];
  let done = false;
  const steps = [
    { text: 'F1', lang: 'ja-JP', jp: 'F1', meaning: '' },
    { text: 'F2', lang: 'ja-JP', jp: 'F2', meaning: '' },
  ];
  playAudioSequence(steps, S, { onstep: (_s, i) => order.push(i), ondone: () => { done = true; } });
  await wait(120);
  eq('第一段合成失敗仍會跳到後面並收尾', done, true);
  globalThis.fetch = okFetch;
}

console.log('\n■ next() 期間、舊段的 ended 晚到不會跳過下一段（playGen 世代防護）');
{
  const okFetch = globalThis.fetch;
  AUTO_END = false; // 改手動控制 ended
  globalThis.fetch = async () => { await wait(15); return { ok: true, json: async () => ({ audioContent: 'ZmFrZQ==' }) }; }; // 慢合成，撐開競態窗口
  const order = [];
  const steps = [
    { text: 'N0', lang: 'ja-JP', jp: 'N0', meaning: '' },
    { text: 'N1', lang: 'ja-JP', jp: 'N1', meaning: '' },
    { text: 'N2', lang: 'ja-JP', jp: 'N2', meaning: '' },
  ];
  const ctl = playAudioSequence(steps, S, { onstep: (_s, i) => order.push(i) });
  await wait(25);          // 第 0 段已開始播（無自動 ended）
  ctl.next();              // 推進到第 1 段：gen++、onstep(1)，但新段還在合成、playGen 仍是第 0 段
  globalThis.__lastAudio._emit('ended'); // 模擬第 0 段這時才「晚到」的自然結束 → 應被 playGen 擋下
  await wait(30);          // 等第 1 段合成完成並開始播
  eq('未跳過第 1 段（順序為 0,1）', order, [0, 1]);
  AUTO_END = true;
  globalThis.fetch = okFetch;
  ctl.stop();
}

console.log(`\n總結：${pass} 通過，${fail} 失敗`);
process.exit(fail ? 1 : 0);

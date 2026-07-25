// tts.js — 發音引擎：內建 Web Speech（免費、離線）或 Google Cloud TTS（自備 key、較自然）。
// 規則：引擎 = settings.ttsEngine；未指定時，有雲端 key 就用雲端、否則內建。
// 雲端呼叫失敗（CORS／額度／網路）會自動退回內建，確保永遠有聲音。

// 提供的雲端語音（Google Cloud ja-JP）
const CLOUD_VOICES = [
  { id: 'ja-JP-Neural2-B', label: 'Neural2-B（女聲，推薦）' },
  { id: 'ja-JP-Neural2-C', label: 'Neural2-C（男聲）' },
  { id: 'ja-JP-Neural2-D', label: 'Neural2-D（男聲）' },
  { id: 'ja-JP-Wavenet-A', label: 'Wavenet-A（女聲）' },
  { id: 'ja-JP-Wavenet-C', label: 'Wavenet-C（男聲）' },
];
/** 可選雲端語音清單（複本） */
export function cloudVoices() { return CLOUD_VOICES.slice(); }

let webVoices = [];
/**
 * 初始化瀏覽器語音清單（getVoices 是非同步補齊的，靠 onvoiceschanged 補上）
 * @param {(voices:Array)=>void} [onReady] 語音就緒時回呼（給設定頁刷新選單）
 */
export function initWebVoices(onReady) {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;
  const pick = () => { webVoices = window.speechSynthesis.getVoices() || []; if (onReady) onReady(listJaVoices()); };
  pick();
  window.speechSynthesis.onvoiceschanged = pick;
}
/** 目前可用的日語語音（SpeechSynthesisVoice 陣列） */
export function listJaVoices() {
  return webVoices.filter((v) => v.lang && v.lang.toLowerCase().startsWith('ja'));
}

/**
 * 決定要用哪個引擎
 * @param {object} s 設定
 * @returns {'web'|'gcloud'}
 */
export function ttsEngine(s) {
  if (s && (s.ttsEngine === 'web' || s.ttsEngine === 'gcloud')) return s.ttsEngine;
  return (s && s.ttsKey) ? 'gcloud' : 'web';
}

// 中文（台灣華語）預設語音——連續朗讀念中文釋義／翻譯時用
const CLOUD_VOICE_ZH = 'cmn-TW-Standard-A';
/**
 * 組 Google Cloud TTS 的請求 body（純函式，方便測試）
 * @param {string} text 要念的文字
 * @param {string} [voice] 雲端語音名稱（預設日語 Neural2-B）
 * @param {string} [lang] 語言碼（預設 ja-JP；中文段傳 cmn-TW）
 * @returns {object}
 */
export function cloudBody(text, voice, lang) {
  return {
    input: { text },
    voice: { languageCode: lang || 'ja-JP', name: voice || 'ja-JP-Neural2-B' },
    audioConfig: { audioEncoding: 'MP3', speakingRate: 1.0 },
  };
}

/**
 * 依步驟語言決定要用哪組（語言碼, 語音）——連續朗讀鎖屏版用
 * @param {string} lang step.lang（如 'ja-JP' / 'zh-TW'）
 * @param {object} s 設定（取 ttsVoiceCloud 當日語語音）
 * @returns {{langCode:string, voice:string}}
 */
function cloudVoiceFor(lang, s) {
  const isZh = /^(zh|cmn)/i.test(lang || '');
  if (isZh) return { langCode: 'cmn-TW', voice: CLOUD_VOICE_ZH };
  return { langCode: 'ja-JP', voice: (s && s.ttsVoiceCloud) || 'ja-JP-Neural2-B' };
}

const audioCache = new Map(); // 'voice|text' → data URL（同句不重複呼叫、不重複計費）
const AUDIO_CACHE_MAX = 300;  // 快取上限，避免無上限成長吃記憶體
let curAudio = null;
/** 播放一段音訊 URL（會先停掉上一段）；回傳 play() 的 promise 讓呼叫者可在失敗時退回內建 */
function playUrl(url) {
  try { if (curAudio) curAudio.pause(); } catch (e) { /* 忽略 */ }
  curAudio = new Audio(url);
  return curAudio.play();
}

/** 用內建 Web Speech 念 */
function speakWeb(text, s) {
  if (typeof window === 'undefined' || !('speechSynthesis' in window) || !text) return;
  try {
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = 'ja-JP';
    u.rate = 0.9;
    const uri = s && s.ttsVoiceWeb;
    const v = uri ? webVoices.find((x) => x.voiceURI === uri) : listJaVoices()[0];
    if (v) u.voice = v;
    window.speechSynthesis.speak(u);
  } catch (e) { console.error('[tts.web]', e); }
}

/**
 * 呼叫 Cloud TTS 把文字合成成可播放的 data URL（含快取，語言感知）。可能 throw。
 * @param {string} text 要念的文字
 * @param {object} s 設定（需 ttsKey；日語取 ttsVoiceCloud）
 * @param {string} [lang] 語言碼（'ja-JP' 或 'zh-TW'/'cmn-TW'）
 * @returns {Promise<string>} data:audio/mpeg;base64,...
 */
async function synthCloud(text, s, lang) {
  const { langCode, voice } = cloudVoiceFor(lang, s);
  const cacheKey = voice + '|' + text;
  if (audioCache.has(cacheKey)) return audioCache.get(cacheKey); // 同句不重複呼叫、不重複計費
  const url = `https://texttospeech.googleapis.com/v1/text:synthesize?key=${encodeURIComponent(s.ttsKey)}`;
  const r = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(cloudBody(text, voice, langCode)),
  });
  if (!r.ok) throw new Error(`Cloud TTS ${r.status}：${(await r.text()).slice(0, 200)}`);
  const d = await r.json();
  if (!d.audioContent) throw new Error('Cloud TTS 沒有回傳音訊');
  const dataUrl = 'data:audio/mpeg;base64,' + d.audioContent; // 標準 MIME（audio/mpeg）
  if (audioCache.size >= AUDIO_CACHE_MAX) audioCache.delete(audioCache.keys().next().value); // 淘汰最舊
  audioCache.set(cacheKey, dataUrl);
  return dataUrl;
}

/** 用 Google Cloud TTS 念（可能 throw：交給呼叫者退回內建） */
async function speakCloud(text, s) {
  const dataUrl = await synthCloud(text, s); // 回傳 promise，播放失敗可退回
  return playUrl(dataUrl);
}

/**
 * 念一段日文：依設定選引擎；雲端失敗自動退回內建。
 * @param {string} text 要念的日文（假名或含漢字皆可）
 * @param {object} s 設定 {ttsEngine, ttsKey, ttsVoiceCloud, ttsVoiceWeb}
 */
export function speak(text, s) {
  if (!text) return;
  if (ttsEngine(s) === 'gcloud' && s && s.ttsKey) {
    speakCloud(text, s).catch((e) => { console.warn('[tts] 雲端失敗，改用內建', e); speakWeb(text, s); });
  } else {
    speakWeb(text, s);
  }
}

/** 設定頁「測試語音」：雲端會實際打 API（成功會出聲），失敗會 throw 讓呼叫者顯示錯誤 */
export async function testCloud(s) {
  await speakCloud('こんにちは。テストです。', s);
}

/**
 * 連續朗讀一串步驟（用內建語音，方便鏈接與免費；日/中依 step.lang 選音）。
 * 注意：iOS 在螢幕鎖定/切背景時會暫停 Web 語音，屬平台限制。
 * @param {Array<{text:string, lang:string}>} steps
 * @param {{onstep?:Function, ondone?:Function}} [cb]
 * @returns {{stop:Function}} 控制器
 */
export function playSequence(steps, cb = {}) {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) { if (cb.ondone) cb.ondone(); return { stop() {} }; }
  let stopped = false;
  let i = 0;
  window.speechSynthesis.cancel();
  const pick = (lang) => {
    const p = (lang || 'ja').slice(0, 2).toLowerCase();
    return webVoices.find((v) => v.lang && v.lang.toLowerCase().startsWith(p)) || null;
  };
  const next = () => {
    if (stopped) return;
    if (i >= steps.length) { if (cb.ondone) cb.ondone(); return; }
    const step = steps[i];
    i += 1;
    if (cb.onstep) cb.onstep(step, i - 1);
    try {
      const u = new SpeechSynthesisUtterance(step.text);
      u.lang = step.lang || 'ja-JP';
      const v = pick(step.lang);
      if (v) u.voice = v;
      u.rate = 0.9;
      u.onend = () => { if (!stopped) next(); };
      u.onerror = () => { if (!stopped) next(); };
      window.speechSynthesis.speak(u);
    } catch (e) { if (!stopped) next(); }
  };
  next();
  return { stop() { stopped = true; try { window.speechSynthesis.cancel(); } catch (e) { /* 忽略 */ } } };
}

// 極短靜音 WAV：iOS 規定音訊要由使用者點擊觸發才能播；點擊當下先播它把 <audio> 元素「解鎖」，
// 之後非同步合成回來的音檔才 play 得動（否則第一段會被瀏覽器擋下、鎖屏更不用談）。
const SILENT_WAV = 'data:audio/wav;base64,UklGRiwAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQgAAACAgICAgICAgA==';
let seqAudio = null; // 常駐 <audio> 元素：整個 App 共用同一個，iOS 才認得它、鎖屏才續播
/** 取得（必要時建立）常駐播放器 */
function getSeqAudio() {
  if (!seqAudio && typeof Audio !== 'undefined') { seqAudio = new Audio(); seqAudio.preload = 'auto'; }
  return seqAudio;
}

/**
 * 連續朗讀「鎖屏版」：用真正的音檔（Cloud TTS 合成）透過一個常駐 <audio> 播放，
 * 鎖屏／切背景時仍會像音樂 App 一樣續播（Web Speech 做不到）。需要雲端 key。
 * 逐段合成並預抓下一段，開始快、段間近乎無縫；同句走快取不重複計費。
 * @param {Array<{text:string, lang:string}>} steps 朗讀步驟（buildReadQueue 產出）
 * @param {object} s 設定（需 ttsKey）
 * @param {{onstep?:Function, ondone?:Function, onerror?:Function}} [cb]
 * @returns {{stop:Function, pause:Function, resume:Function, next:Function, prev:Function, isPaused:Function}}
 */
export function playAudioSequence(steps, s, cb = {}) {
  const audio = getSeqAudio();
  if (!audio) { if (cb.ondone) cb.ondone(); return { stop() {}, pause() {}, resume() {}, next() {}, prev() {}, isPaused() { return false; } }; }
  let stopped = false;
  let started = false; // 真正第一段開始播後才 true：避免解鎖靜音的 ended 誤觸發跳段
  let i = 0;
  let gen = 0;        // 世代碼：每次 run 都 +1，讓被 next/prev/stop 取代的舊 await 自動作廢
  let playGen = 0;    // 目前正在播放的音檔屬於哪個世代：讓 onended 只在世代相符時前進（防 next/prev 競態跳段）

  // iOS 解鎖：在呼叫者的點擊事件當下播一段靜音（fire-and-forget）
  try { audio.src = SILENT_WAV; audio.play().catch(() => {}); } catch (e) { /* 忽略 */ }

  /** 背景預抓某一段音檔進快取，讓下一段幾乎無縫接上（失敗不影響流程） */
  const prefetch = (idx) => { if (idx >= 0 && idx < steps.length) synthCloud(steps[idx].text, s, steps[idx].lang).catch(() => {}); };

  /** 播放第 idx 段（合成→換音源→播放），並預抓下一段 */
  const run = async (idx) => {
    gen += 1;
    const myGen = gen;
    i = idx < 0 ? 0 : idx;
    if (stopped) return;
    if (i >= steps.length) { finish(); return; }
    const step = steps[i];
    if (cb.onstep) cb.onstep(step, i);
    let url;
    try {
      url = await synthCloud(step.text, s, step.lang);
    } catch (e) {
      if (cb.onerror) cb.onerror(e);
      if (myGen === gen && !stopped) run(i + 1); // 這段合成失敗 → 跳下一段
      return;
    }
    if (myGen !== gen || stopped) return; // 已被 next/prev/stop 取代，這次作廢
    try { audio.src = url; started = true; playGen = myGen; await audio.play(); prefetch(i + 1); }
    catch (e) { /* 換音源打斷上一個 play 會拋 AbortError，忽略即可 */ }
  };
  // 只有「目前這一段自然播完（世代相符）」才前進；若 next/prev 已推進世代，舊 ended 不動作、由新 run 接手
  const onended = () => { if (started && !stopped && playGen === gen) run(i + 1); };
  const onerror = () => { if (started && !stopped && playGen === gen) run(i + 1); }; // 音檔載入失敗 → 跳過
  audio.addEventListener('ended', onended);
  audio.addEventListener('error', onerror);
  const cleanup = () => {
    stopped = true;
    audio.removeEventListener('ended', onended);
    audio.removeEventListener('error', onerror);
    try { audio.pause(); } catch (e) { /* 忽略 */ }
  };
  const finish = () => { cleanup(); if (cb.ondone) cb.ondone(); };

  run(0);

  return {
    stop() { cleanup(); },
    pause() { try { audio.pause(); } catch (e) { /* 忽略 */ } },
    resume() { try { audio.play().catch(() => {}); } catch (e) { /* 忽略 */ } },
    next() { run(i + 1); },
    prev() { run(i - 1); },
    isPaused() { return audio.paused; },
  };
}

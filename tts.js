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

/**
 * 組 Google Cloud TTS 的請求 body（純函式，方便測試）
 * @param {string} text 要念的日文
 * @param {string} [voice] 雲端語音名稱
 * @returns {object}
 */
export function cloudBody(text, voice) {
  return {
    input: { text },
    voice: { languageCode: 'ja-JP', name: voice || 'ja-JP-Neural2-B' },
    audioConfig: { audioEncoding: 'MP3', speakingRate: 1.0 },
  };
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

/** 用 Google Cloud TTS 念（可能 throw：交給呼叫者退回內建） */
async function speakCloud(text, s) {
  const voice = s.ttsVoiceCloud || 'ja-JP-Neural2-B';
  const cacheKey = voice + '|' + text;
  if (audioCache.has(cacheKey)) return playUrl(audioCache.get(cacheKey)); // 回傳 promise，播放失敗可退回
  const url = `https://texttospeech.googleapis.com/v1/text:synthesize?key=${encodeURIComponent(s.ttsKey)}`;
  const r = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(cloudBody(text, voice)),
  });
  if (!r.ok) throw new Error(`Cloud TTS ${r.status}：${(await r.text()).slice(0, 200)}`);
  const d = await r.json();
  if (!d.audioContent) throw new Error('Cloud TTS 沒有回傳音訊');
  const dataUrl = 'data:audio/mpeg;base64,' + d.audioContent; // 標準 MIME（audio/mpeg）
  if (audioCache.size >= AUDIO_CACHE_MAX) audioCache.delete(audioCache.keys().next().value); // 淘汰最舊
  audioCache.set(cacheKey, dataUrl);
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

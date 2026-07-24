// app.js — JP 主動學習 App 主程式（Phase 1：輸入與複習核心）
import { toRomaji } from './romaji.js';
import { analyze } from './jlp.js';
import { isDue, applyResult, todayISO } from './srs.js';
import { askAI, hasAI } from './ai.js';
import { speak as ttsSpeak, initWebVoices, listJaVoices, cloudVoices, ttsEngine, testCloud } from './tts.js';
import {
  loadCards, upsertCard, deleteCard, allTags,
  loadTagList, saveTagList, addTagToList, removeTagFromList,
  loadSettings, saveSettings, exportAll, importAll,
  sortByNewest, paginate,
} from './store.js';

let cards = [];
let tagList = [];                 // 標籤主清單
let activeType = 'all';           // all | vocab | grammar
const activeTags = new Set();     // 已選標籤篩選
const formTags = new Set();       // 表單中已選的標籤
let editingId = null;             // 目前編輯中的卡片 id（null = 新增）
let settings = {};                // AI 等設定
let currentPage = 1;              // 列表目前頁碼（分頁用）
const DEFAULT_PAGE_SIZE = 20;     // 每頁預設張數

// 測驗狀態
let quizPool = [];
let quizIdx = 0;
let quizCorrect = 0;
let quizAnswered = false;
let quizMode = 'read';            // 本題模式 read|listen|write
const quizModes = new Set(['read', 'listen', 'write']); // 已選模式
const qsTags = new Set();         // 測驗標籤篩選
let qsType = 'all';

// 問答狀態
let chatCardId = null;            // 非 null = 針對某張卡問

// 羅馬拼音顯示切換用的眼睛按鈕（像密碼欄位）
const EYE_BTN = '<button class="eye-toggle" type="button" title="顯示／隱藏羅馬拼音" aria-label="顯示或隱藏羅馬拼音">'
  + '<svg class="eye-open" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7S1 12 1 12z"/><circle cx="12" cy="12" r="3"/></svg>'
  + '<svg class="eye-off" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>'
  + '</button>';

// ── 線條圖示（統一用 SVG，取代 emoji，跨裝置渲染一致）──
const ICON_PATHS = {
  speaker: '<polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14"/>',
  chat: '<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>',
  quiz: '<path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/>',
  tag: '<path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/><line x1="7" y1="7" x2="7.01" y2="7"/>',
  settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>',
  plus: '<line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>',
};
/**
 * 產生線條 SVG 圖示字串
 * @param {string} name ICON_PATHS 的鍵
 * @param {number} [size=20] 邊長（px）
 * @param {string} [cls=''] 額外 class
 * @returns {string} SVG HTML
 */
function svgIcon(name, size = 20, cls = '') {
  return `<svg class="ic ${cls}" viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICON_PATHS[name] || ''}</svg>`;
}
/** 切換羅馬拼音顯示（全域、記憶） */
function toggleRomaji() {
  const on = document.body.classList.toggle('hide-romaji');
  settings.hideRomaji = on;
  saveSettings(settings);
}

// ── 啟動 ──────────────────────────────────────
function init() {
  cards = loadCards();
  settings = loadSettings();
  tagList = loadTagList();
  // 遷移：把卡片上已有、但主清單沒有的標籤補進主清單
  const before = tagList.length;
  allTags(cards).forEach((t) => { if (!tagList.includes(t)) tagList.push(t); });
  if (tagList.length !== before) saveTagList(tagList);
  initWebVoices(() => { // 語音清單就緒後，若正停在語音設定子頁就刷新選單
    if (!document.getElementById('settings-tts').hidden) populateWebVoices();
  });
  bindEvents();
  if (settings.hideRomaji) document.body.classList.add('hide-romaji');
  document.getElementById('quiz-eye').innerHTML = EYE_BTN;
  renderTagFilters();
  renderList();
  registerServiceWorker();
  maybeOnboard();
}

// ── 發音（引擎抽象在 tts.js：內建 Web Speech／Google Cloud TTS）──
/** 念出日文（引擎與語音依 settings，見 tts.js） */
function speak(text) { ttsSpeak(text, settings); }

// ── 列表 ──────────────────────────────────────
function filtered() {
  return cards.filter((c) => {
    if (activeType !== 'all' && c.type !== activeType) return false;
    if (activeTags.size && !(c.tags || []).some((t) => activeTags.has(t))) return false;
    return true;
  });
}

function pageSize() { return Number(settings.pageSize) || DEFAULT_PAGE_SIZE; }

function renderList() {
  const list = document.getElementById('card-list');
  const all = sortByNewest(filtered(), settings.newestFirst !== false); // 預設最新在前
  document.getElementById('stats').textContent = `${cards.length} 張卡`;
  if (all.length === 0) {
    list.innerHTML = cards.length === 0
      ? '<li class="empty-hint"><b>還沒有卡片</b><br>按右上「＋ 新增卡片」開始建立你的第一張。</li>'
      : '<li class="empty-hint">沒有符合篩選的卡片</li>';
    renderPager(1, 1);
    return;
  }
  const { page, totalPages, items } = paginate(all, currentPage, pageSize());
  currentPage = page; // 夾回合法範圍（例如刪到剩較少頁）
  list.innerHTML = items.map((c) => `
    <li class="card-row" data-id="${escapeAttr(c.id)}">
      <button class="speak" data-say="${escapeAttr(c.reading || c.jp)}" aria-label="播放發音">${svgIcon('speaker', 20)}</button>
      <span class="cr-jp">${escapeHtml(c.jp)}<span class="cr-reading">${escapeHtml(c.reading || '')}</span></span>
      <span class="cr-meaning">${escapeHtml(c.meaning || '')}</span>
      <span class="cr-badge">${c.type === 'grammar' ? '文法' : escapeHtml(c.pos || '單字')}</span>
    </li>`).join('');
  list.querySelectorAll('.card-row').forEach((row) => {
    row.addEventListener('click', () => openDetail(row.dataset.id));
  });
  list.querySelectorAll('.speak').forEach((b) => {
    b.addEventListener('click', (e) => { e.stopPropagation(); speak(b.dataset.say); });
  });
  renderPager(page, totalPages);
}

/** 渲染分頁列（只有多於一頁時顯示） */
function renderPager(page, totalPages) {
  const pager = document.getElementById('pager');
  if (!pager) return;
  if (totalPages <= 1) { pager.hidden = true; pager.innerHTML = ''; return; }
  pager.hidden = false;
  pager.innerHTML = `
    <button class="pg-btn" id="pg-prev" ${page <= 1 ? 'disabled' : ''} aria-label="上一頁">‹</button>
    <span class="pg-info">${page} / ${totalPages}</span>
    <button class="pg-btn" id="pg-next" ${page >= totalPages ? 'disabled' : ''} aria-label="下一頁">›</button>`;
  const go = (delta) => { currentPage = page + delta; renderList(); window.scrollTo({ top: 0, behavior: 'smooth' }); };
  const prev = document.getElementById('pg-prev');
  const next = document.getElementById('pg-next');
  if (prev && page > 1) prev.addEventListener('click', () => go(-1));
  if (next && page < totalPages) next.addEventListener('click', () => go(1));
}

function renderTagFilters() {
  const box = document.getElementById('tag-filters');
  box.innerHTML = tagList.map((t) =>
    `<button class="chip-btn${activeTags.has(t) ? ' active' : ''}" data-tag="${escapeAttr(t)}">#${escapeHtml(t)}</button>`).join('');
  box.querySelectorAll('.chip-btn').forEach((b) => {
    b.addEventListener('click', () => {
      const t = b.dataset.tag;
      if (activeTags.has(t)) activeTags.delete(t); else activeTags.add(t);
      currentPage = 1;
      renderTagFilters();
      renderList();
    });
  });
}

// ── 新增／編輯表單 ────────────────────────────
function openEdit(card) {
  editingId = card ? card.id : null;
  document.getElementById('edit-title').textContent = card ? '編輯卡片' : '新增卡片';
  setSegType(card ? card.type : 'vocab');
  document.getElementById('fld-pos').value = card?.pos || '';
  document.getElementById('fld-jp').value = card?.jp || '';
  document.getElementById('fld-reading').value = card?.reading || '';
  document.getElementById('fld-meaning').value = card?.meaning || '';
  formTags.clear();
  (card?.tags || []).forEach((t) => formTags.add(t));
  renderFormTags();
  document.getElementById('romaji-preview').textContent = card?.reading ? toRomaji(card.reading) : '';
  // 例句
  const box = document.getElementById('examples');
  box.innerHTML = '';
  (card?.examples || []).forEach((ex) => addExampleRow(ex));
  document.getElementById('edit-delete').hidden = !card;
  document.getElementById('edit-overlay').hidden = false;
}
function closeEdit() { document.getElementById('edit-overlay').hidden = true; }

function setSegType(type) {
  document.querySelectorAll('#fld-type .seg-btn').forEach((b) => b.classList.toggle('active', b.dataset.val === type));
  document.getElementById('fld-pos-wrap').hidden = (type !== 'vocab'); // 文法不顯示詞性
}
function currentSegType() {
  return document.querySelector('#fld-type .seg-btn.active')?.dataset.val || 'vocab';
}

/** 渲染表單裡的標籤選擇（點 chip 複選 + 新標籤） */
function renderFormTags() {
  const box = document.getElementById('fld-tags-chips');
  box.innerHTML = tagList.map((t) =>
    `<button type="button" class="tag-chip${formTags.has(t) ? ' on' : ''}" data-tag="${escapeAttr(t)}">${escapeHtml(t)}</button>`).join('')
    + '<button type="button" class="tag-chip add" id="form-new-tag">＋ 新標籤</button>';
  box.querySelectorAll('.tag-chip[data-tag]').forEach((b) => {
    b.addEventListener('click', () => {
      const t = b.dataset.tag;
      if (formTags.has(t)) formTags.delete(t); else formTags.add(t);
      renderFormTags();
    });
  });
  document.getElementById('form-new-tag').addEventListener('click', () => {
    const name = (prompt('新標籤名稱：') || '').trim();
    if (!name) return;
    addTagToList(tagList, name);
    formTags.add(name);
    renderTagFilters();
    renderFormTags();
  });
}

/** 新增一列例句輸入 */
function addExampleRow(ex = {}) {
  const box = document.getElementById('examples');
  const div = document.createElement('div');
  div.className = 'example-item';
  div.innerHTML = `
    <input class="ex-jp" type="text" placeholder="日文例句（可注音：{漢字|かな}）" value="${escapeAttr(ex.jp || '')}" />
    <input class="ex-reading" type="text" placeholder="例句讀音（假名）" value="${escapeAttr(ex.reading || '')}" />
    <span class="ex-romaji">${ex.reading ? toRomaji(ex.reading) : ''}</span>
    <input class="ex-zh" type="text" placeholder="例句中文" value="${escapeAttr(ex.zh || '')}" />
    <button type="button" class="ex-rm">移除此例句</button>`;
  div.querySelector('.ex-reading').addEventListener('input', (e) => {
    div.querySelector('.ex-romaji').textContent = toRomaji(e.target.value);
  });
  div.querySelector('.ex-rm').addEventListener('click', () => div.remove());
  box.appendChild(div);
}

/** 從表單收集卡片 */
function readForm() {
  const type = currentSegType();
  const reading = document.getElementById('fld-reading').value.trim();
  const examples = [...document.querySelectorAll('#examples .example-item')].map((d) => {
    const jp = d.querySelector('.ex-jp').value.trim();
    const r = d.querySelector('.ex-reading').value.trim();
    const zh = d.querySelector('.ex-zh').value.trim();
    return { jp, reading: r, romaji: d.dataset.romaji || toRomaji(r), zh };
  }).filter((e) => e.jp || e.zh);
  const tags = [...formTags];
  const base = editingId ? cards.find((c) => c.id === editingId) : {};
  return {
    ...base,
    type,
    pos: type === 'vocab' ? document.getElementById('fld-pos').value : '',
    jp: document.getElementById('fld-jp').value.trim(),
    reading,
    romaji: toRomaji(reading),
    meaning: document.getElementById('fld-meaning').value.trim(),
    examples,
    tags,
  };
}

function saveEdit() {
  const card = readForm();
  if (!card.jp && !card.meaning) { alert('至少要填「日文」或「中文」其中一個。'); return; }
  const wasNew = !editingId;               // 儲存前先判斷是不是新增
  const saved = upsertCard(cards, card);
  closeEdit();
  currentPage = 1;                          // 最新卡在第一頁，跳回第一頁看得到
  renderTagFilters();
  renderList();
  if (wasNew) openDetail(saved.id);         // 新增後自動打開該卡（用設定好的檢視）
}
function doDelete() {
  if (!editingId) return;
  if (!confirm('確定刪除這張卡片？')) return;
  deleteCard(cards, editingId);
  closeEdit();
  renderTagFilters();
  renderList();
}

/** 用 kuromoji 自動填讀音／furigana／分詞羅馬拼音（首次會下載字典） */
async function autoFurigana() {
  const btn = document.getElementById('btn-auto-furi');
  const jp = document.getElementById('fld-jp').value.trim();
  const rows = [...document.querySelectorAll('#examples .example-item')];
  if (!jp && rows.length === 0) { alert('先填「日文」或「例句」再自動注音。'); return; }
  const orig = btn.textContent;
  btn.disabled = true;
  btn.textContent = '分析中…（首次需下載字典，請稍候）';
  try {
    // 單字讀音（若空）
    const readingEl = document.getElementById('fld-reading');
    if (jp && !readingEl.value.trim()) {
      const r = await analyze(jp);
      readingEl.value = r.reading;
      document.getElementById('romaji-preview').textContent = toRomaji(r.reading);
    }
    // 每個例句：填 furigana 標註 + 讀音 + 分詞羅馬拼音
    for (const row of rows) {
      const exEl = row.querySelector('.ex-jp');
      const raw = readingFromFuri(exEl.value.trim()); // 若已含標註，先還原純文字再分析
      if (!raw) continue;
      const r = await analyze(raw);
      exEl.value = r.furigana;
      row.querySelector('.ex-reading').value = r.reading;
      row.dataset.romaji = r.romaji;
      row.querySelector('.ex-romaji').textContent = r.romaji;
    }
  } catch (e) {
    alert('自動注音失敗：' + e.message);
    console.error('[autoFurigana]', e);
  } finally {
    btn.disabled = false;
    btn.textContent = orig;
  }
}

// ── 學習卡詳情 ────────────────────────────────
function openDetail(id) {
  const c = cards.find((x) => x.id === id);
  if (!c) return;
  editingId = id;
  document.getElementById('detail-tags').textContent = (c.tags || []).map((t) => '#' + t).join('  ');
  const exHtml = (c.examples || []).map((ex) => {
    const furi = hasFuri(ex.jp);
    const jpHtml = furi ? renderFuri(ex.jp) : escapeHtml(ex.jp);
    const say = furi ? readingFromFuri(ex.jp) : (ex.reading || ex.jp);
    const romaji = ex.romaji || (ex.reading ? toRomaji(ex.reading) : (furi ? toRomaji(readingFromFuri(ex.jp)) : ''));
    // 有 furigana 時假名已標在漢字上，就不再另列假名行；沒有才顯示假名行
    const kanaLine = (!furi && ex.reading) ? `<div class="sc-ex-romaji">${escapeHtml(ex.reading)}</div>` : '';
    return `
    <div class="sc-ex">
      <div class="sc-ex-jp-row">
        <span class="sc-ex-jp">${jpHtml}</span>
        <button class="speak" data-say="${escapeAttr(say)}" aria-label="播放例句">${svgIcon('speaker', 20)}</button>
      </div>
      ${kanaLine}
      ${romaji ? `<div class="sc-ex-romaji romaji">${escapeHtml(romaji)}</div>` : ''}
      ${ex.zh ? `<div class="sc-ex-zh">${escapeHtml(ex.zh)}</div>` : ''}
    </div>`;
  }).join('');
  document.getElementById('study-card').innerHTML = `
    ${EYE_BTN}
    ${settings.ttsKey ? `<button class="tts-switch" id="sc-tts" type="button" title="切換發音引擎">${ttsEngine(settings) === 'gcloud' ? '語音·雲端' : '語音·內建'}</button>` : ''}
    <div class="sc-top">
      <div class="sc-jp-row">
        <span class="sc-jp">${escapeHtml(c.jp)}</span>
        <button class="speak" data-say="${escapeAttr(c.reading || c.jp)}" aria-label="播放發音">${svgIcon('speaker', 22)}</button>
      </div>
      ${c.reading ? `<div class="sc-romaji"><span class="rd">${escapeHtml(c.reading)}</span> <span class="romaji">${escapeHtml(c.romaji || toRomaji(c.reading))}</span></div>` : ''}
      <div class="sc-meaning">${escapeHtml(c.meaning || '')}</div>
    </div>
    ${exHtml ? '<hr class="sc-divider" />' + exHtml : ''}
    <button class="card-ask-btn" id="card-ask">${svgIcon('chat', 18)}<span>問 AI 這張卡</span></button>`;
  document.getElementById('study-card').querySelectorAll('.speak').forEach((b) => {
    b.addEventListener('click', () => speak(b.dataset.say));
  });
  const scTts = document.getElementById('sc-tts');
  if (scTts) scTts.addEventListener('click', () => {
    settings.ttsEngine = ttsEngine(settings) === 'gcloud' ? 'web' : 'gcloud';
    saveSettings(settings);
    scTts.textContent = settings.ttsEngine === 'gcloud' ? '語音·雲端' : '語音·內建';
  });
  document.getElementById('card-ask').addEventListener('click', () => { closeDetail(); openChat(c.id); });
  document.getElementById('detail-overlay').hidden = false;
}
function closeDetail() { document.getElementById('detail-overlay').hidden = true; }

// ── 標籤管理 ──────────────────────────────────
function openTags() { renderTagManage(); document.getElementById('tags-overlay').hidden = false; }
function closeTags() { document.getElementById('tags-overlay').hidden = true; }
function renderTagManage() {
  const ul = document.getElementById('tag-manage-list');
  if (tagList.length === 0) { ul.innerHTML = '<li class="tm-empty">還沒有標籤，用上方新增。</li>'; return; }
  ul.innerHTML = tagList.map((t) => {
    const n = cards.filter((c) => (c.tags || []).includes(t)).length;
    return `<li class="tm-item"><span>#${escapeHtml(t)} <small>(${n})</small></span><button class="tm-del" data-tag="${escapeAttr(t)}">刪除</button></li>`;
  }).join('');
  ul.querySelectorAll('.tm-del').forEach((b) => {
    b.addEventListener('click', () => {
      const t = b.dataset.tag;
      const n = cards.filter((c) => (c.tags || []).includes(t)).length;
      if (!confirm(`刪除標籤 #${t}？${n ? `（${n} 張卡片會移除此標籤）` : ''}`)) return;
      removeTagFromList(tagList, cards, t);
      activeTags.delete(t);
      renderTagManage(); renderTagFilters(); renderList();
    });
  });
}
function addNewTagFromManage() {
  const inp = document.getElementById('new-tag-input');
  if (!inp.value.trim()) return;
  addTagToList(tagList, inp.value.trim());
  inp.value = '';
  renderTagManage(); renderTagFilters();
}

// ── furigana（{漢字|かな} → ruby）───────────────
function renderFuri(text) {
  return escapeHtml(text).replace(/\{([^|{}]+)\|([^|{}]+)\}/g, '<ruby>$1<rt>$2</rt></ruby>');
}
function hasFuri(text) { return /\{[^|{}]+\|[^|{}]+\}/.test(text || ''); }
function readingFromFuri(text) { return (text || '').replace(/\{([^|{}]+)\|([^|{}]+)\}/g, '$2'); }

// ── 事件綁定 ──────────────────────────────────
function bindEvents() {
  document.getElementById('btn-add').addEventListener('click', () => openEdit(null));
  document.getElementById('btn-tags').addEventListener('click', openTags);
  document.getElementById('tags-close').addEventListener('click', closeTags);
  document.getElementById('new-tag-add').addEventListener('click', addNewTagFromManage);
  document.getElementById('tags-overlay').addEventListener('click', (e) => { if (e.target.id === 'tags-overlay') closeTags(); });
  document.getElementById('edit-cancel').addEventListener('click', closeEdit);
  document.getElementById('edit-save').addEventListener('click', saveEdit);
  document.getElementById('edit-delete').addEventListener('click', doDelete);
  document.getElementById('btn-add-example').addEventListener('click', () => addExampleRow());
  document.getElementById('btn-auto-furi').addEventListener('click', autoFurigana);
  document.getElementById('fld-reading').addEventListener('input', (e) => {
    document.getElementById('romaji-preview').textContent = toRomaji(e.target.value);
  });
  document.querySelectorAll('#fld-type .seg-btn').forEach((b) => {
    b.addEventListener('click', () => setSegType(b.dataset.val));
  });
  document.querySelectorAll('#type-filters .chip-btn').forEach((b) => {
    b.addEventListener('click', () => {
      activeType = b.dataset.type;
      currentPage = 1;
      document.querySelectorAll('#type-filters .chip-btn').forEach((x) => x.classList.toggle('active', x === b));
      renderList();
    });
  });
  document.getElementById('detail-close').addEventListener('click', closeDetail);
  document.getElementById('detail-edit').addEventListener('click', () => {
    const c = cards.find((x) => x.id === editingId);
    closeDetail();
    openEdit(c);
  });
  document.getElementById('edit-overlay').addEventListener('click', (e) => { if (e.target.id === 'edit-overlay') closeEdit(); });
  document.getElementById('detail-overlay').addEventListener('click', (e) => { if (e.target.id === 'detail-overlay') closeDetail(); });

  // 測驗
  document.getElementById('btn-quiz').addEventListener('click', openQuizSetup);
  document.getElementById('qs-cancel').addEventListener('click', () => { document.getElementById('quiz-setup-overlay').hidden = true; });
  document.getElementById('qs-start').addEventListener('click', startQuiz);
  document.querySelectorAll('#qs-type .seg-btn').forEach((b) => b.addEventListener('click', () => {
    qsType = b.dataset.val;
    document.querySelectorAll('#qs-type .seg-btn').forEach((x) => x.classList.toggle('active', x === b));
    updateQsInfo();
  }));
  document.querySelectorAll('#qs-modes .tag-chip').forEach((b) => b.addEventListener('click', () => {
    const m = b.dataset.mode;
    if (quizModes.has(m)) quizModes.delete(m); else quizModes.add(m);
    b.classList.toggle('on', quizModes.has(m));
  }));
  document.getElementById('quiz-exit').addEventListener('click', exitQuiz);
  document.getElementById('quiz-continue').addEventListener('click', continueQuiz);
  document.getElementById('quiz-done-back').addEventListener('click', () => { document.getElementById('quiz-done-overlay').hidden = true; });
  document.getElementById('quiz-setup-overlay').addEventListener('click', (e) => { if (e.target.id === 'quiz-setup-overlay') document.getElementById('quiz-setup-overlay').hidden = true; });

  // 設定
  document.getElementById('btn-settings').addEventListener('click', openSettings);
  document.getElementById('set-close').addEventListener('click', closeSettings);
  document.getElementById('set-back').addEventListener('click', () => showSettingsView('home'));
  document.getElementById('set-open-ai').addEventListener('click', openAISubpage);
  document.getElementById('set-open-tts').addEventListener('click', openTtsSubpage);
  document.getElementById('set-save').addEventListener('click', saveSubpage);
  document.getElementById('set-test').addEventListener('click', testAI);
  document.getElementById('tts-engine').addEventListener('change', toggleTtsBoxes);
  document.getElementById('tts-test').addEventListener('click', testTts);
  document.getElementById('set-newest').addEventListener('change', onToggleNewest);
  document.getElementById('set-pagesize').addEventListener('change', applyPageSize);
  document.getElementById('pagesize-chips').addEventListener('click', (e) => {
    const b = e.target.closest('button[data-n]');
    if (!b) return;
    document.getElementById('set-pagesize').value = b.dataset.n;
    applyPageSize();
  });
  document.getElementById('settings-overlay').addEventListener('click', (e) => { if (e.target.id === 'settings-overlay') closeSettings(); });

  // 備份／還原
  document.getElementById('btn-export').addEventListener('click', doExport);
  document.getElementById('btn-import').addEventListener('click', () => document.getElementById('import-file').click());
  document.getElementById('import-file').addEventListener('change', (e) => {
    doImportFile(e.target.files[0]);
    e.target.value = ''; // 清掉才能再選同一個檔
  });

  // 首次引導
  document.getElementById('ob-yes').addEventListener('click', onboardYes);
  document.getElementById('ob-no').addEventListener('click', onboardNo);

  // AI 協助補完
  document.getElementById('btn-ai-assist').addEventListener('click', openAssist);
  document.getElementById('assist-close').addEventListener('click', closeAssist);
  document.getElementById('assist-run').addEventListener('click', runAssist);
  document.getElementById('assist-apply').addEventListener('click', applyAssist);
  document.getElementById('assist-overlay').addEventListener('click', (e) => { if (e.target.id === 'assist-overlay') closeAssist(); });

  // AI 問答
  document.getElementById('btn-ai').addEventListener('click', () => openChat(null));
  document.getElementById('chat-close').addEventListener('click', closeChat);
  document.getElementById('chat-send').addEventListener('click', sendChat);
  document.getElementById('chat-overlay').addEventListener('click', (e) => { if (e.target.id === 'chat-overlay') closeChat(); });

  // 羅馬拼音眼睛（委派：學習卡/測驗裡的都通用）
  document.addEventListener('click', (e) => { if (e.target.closest('.eye-toggle')) toggleRomaji(); });
}

// ── 測驗（SM-2 + 聽/讀/寫）────────────────────
function openQuizSetup() { renderQsTags(); updateQsInfo(); document.getElementById('quiz-setup-overlay').hidden = false; }
function renderQsTags() {
  const box = document.getElementById('qs-tags');
  box.innerHTML = tagList.map((t) => `<button type="button" class="tag-chip${qsTags.has(t) ? ' on' : ''}" data-tag="${escapeAttr(t)}">${escapeHtml(t)}</button>`).join('') || '<span class="qs-info">（沒有標籤）</span>';
  box.querySelectorAll('.tag-chip[data-tag]').forEach((b) => b.addEventListener('click', () => {
    const t = b.dataset.tag; if (qsTags.has(t)) qsTags.delete(t); else qsTags.add(t); renderQsTags(); updateQsInfo();
  }));
}
function quizCandidates() {
  return cards.filter((c) => {
    if (qsType !== 'all' && c.type !== qsType) return false;
    if (qsTags.size && !(c.tags || []).some((t) => qsTags.has(t))) return false;
    return true;
  });
}
function updateQsInfo() {
  const today = todayISO();
  const cand = quizCandidates();
  const due = cand.filter((c) => isDue(c.srs, today)).length;
  document.getElementById('qs-info').textContent = `符合 ${cand.length} 張，其中 ${due} 張到期可測。`;
}
function startQuiz() {
  if (quizModes.size === 0) { alert('至少選一種模式（聽／讀／寫）'); return; }
  const today = todayISO();
  let pool = quizCandidates().filter((c) => isDue(c.srs, today));
  if (pool.length === 0) {
    const cand = quizCandidates();
    if (cand.length === 0) { alert('沒有符合範圍的卡片。'); return; }
    if (!confirm('目前沒有到期的卡片，要複習全部符合範圍的卡片嗎？')) return;
    pool = cand.slice();
  }
  quizPool = shuffle(pool); quizIdx = 0; quizCorrect = 0;
  document.getElementById('quiz-setup-overlay').hidden = true;
  document.getElementById('quiz-overlay').hidden = false;
  renderQuizQuestion();
}
function pickMode() { const a = [...quizModes]; return a[Math.floor(Math.random() * a.length)]; }
function quizDistractors(card) {
  const others = cards.filter((c) => c.id !== card.id && c.meaning && c.meaning !== card.meaning);
  return shuffle(others).slice(0, 3).map((c) => c.meaning);
}
function renderQuizQuestion() {
  quizAnswered = false;
  quizMode = pickMode();
  const c = quizPool[quizIdx];
  document.getElementById('quiz-progress').textContent = `${quizIdx + 1} / ${quizPool.length}`;
  document.getElementById('quiz-continue').hidden = true;
  const body = document.getElementById('quiz-body');
  if (quizMode === 'write') {
    body.innerHTML = `
      <div class="q-mode">寫（看中文 → 寫日文）</div>
      <div class="q-prompt"><span class="q-zh">${escapeHtml(c.meaning || '')}</span></div>
      <input id="q-write-input" class="q-write" type="text" placeholder="輸入日文（漢字或假名皆可）" autocomplete="off" />
      <button id="q-write-submit" class="add-btn">作答</button>
      <div id="q-reveal" class="q-reveal"></div>`;
    body.querySelector('#q-write-submit').addEventListener('click', submitWrite);
    body.querySelector('#q-write-input').addEventListener('keydown', (e) => { if (e.key === 'Enter') submitWrite(); });
    setTimeout(() => body.querySelector('#q-write-input')?.focus(), 60);
    return;
  }
  const listen = quizMode === 'listen';
  const opts = shuffle([c.meaning, ...quizDistractors(c)]).filter(Boolean);
  body.innerHTML = `
    <div class="q-mode">${listen ? '聽（聽發音 → 選意思）' : '讀（看 → 選意思）'}</div>
    <div class="q-prompt">${listen
      ? `<button id="q-replay" class="speak big" aria-label="再聽一次">${svgIcon('speaker', 30)}</button>`
      : `<span class="q-jp">${escapeHtml(c.jp)}</span>${c.reading ? `<div class="q-reading">${escapeHtml(c.reading)}</div>` : ''}`}</div>
    <div id="q-opts" class="quiz-options"></div>
    <div id="q-reveal" class="q-reveal"></div>`;
  const ob = body.querySelector('#q-opts');
  opts.forEach((m) => { const b = document.createElement('button'); b.className = 'quiz-option'; b.textContent = m; b.addEventListener('click', () => answerChoice(m === c.meaning, b, c)); ob.appendChild(b); });
  if (listen) { speak(c.reading || c.jp); body.querySelector('#q-replay').addEventListener('click', () => speak(c.reading || c.jp)); }
}
function answerChoice(correct, btn, c) {
  if (quizAnswered) return; quizAnswered = true;
  document.querySelectorAll('.quiz-option').forEach((b) => { b.classList.add('answered'); if (b.textContent === c.meaning) b.classList.add('correct'); });
  if (!correct) btn.classList.add('wrong');
  gradeCard(c, correct);
  document.getElementById('q-reveal').innerHTML = `<div class="q-ans">${escapeHtml(c.jp)}　${escapeHtml(c.reading || '')}　<span class="romaji">${escapeHtml(toRomaji(c.reading || ''))}</span></div>`;
  speak(c.reading || c.jp);
  showContinue();
}
function submitWrite() {
  if (quizAnswered) return;
  const c = quizPool[quizIdx];
  const val = norm(document.getElementById('q-write-input').value);
  const ok = !!val && (val === norm(c.jp) || val === norm(c.reading));
  quizAnswered = true;
  gradeCard(c, ok);
  document.getElementById('q-write-input').disabled = true;
  document.getElementById('q-write-submit').disabled = true;
  document.getElementById('q-reveal').innerHTML = `<div class="q-ans ${ok ? 'ok' : 'ng'}">${ok ? '✅ 正確' : '❌ 正解：'}${escapeHtml(c.jp)}　${escapeHtml(c.reading || '')}</div>`;
  speak(c.reading || c.jp);
  showContinue();
}
function norm(s) { return (s || '').trim().replace(/\s/g, ''); }
function gradeCard(c, correct) { c.srs = applyResult(c.srs, correct, todayISO()); upsertCard(cards, c); if (correct) quizCorrect += 1; }
function showContinue() { const b = document.getElementById('quiz-continue'); b.hidden = false; b.focus(); }
function continueQuiz() { quizIdx += 1; if (quizIdx >= quizPool.length) finishQuiz(); else renderQuizQuestion(); }
function finishQuiz() {
  document.getElementById('quiz-overlay').hidden = true;
  document.getElementById('quiz-score').textContent = `答對 ${quizCorrect} / ${quizPool.length}`;
  document.getElementById('quiz-done-overlay').hidden = false;
  renderList();
}
function exitQuiz() { document.getElementById('quiz-overlay').hidden = true; renderList(); }

// ── 設定（分組清單首頁 + AI／語音 子頁）─────────
let settingsView = 'home';
/** 切換設定的首頁／子頁（'home'|'ai'|'tts'），並調整頂列按鈕 */
function showSettingsView(view) {
  settingsView = view;
  const home = view === 'home';
  document.getElementById('settings-home').hidden = !home;
  document.getElementById('settings-ai').hidden = view !== 'ai';
  document.getElementById('settings-tts').hidden = view !== 'tts';
  document.getElementById('set-back').hidden = home;         // 子頁才有「返回」
  document.getElementById('set-close').hidden = !home;       // 首頁才有「關閉」
  document.getElementById('set-save').hidden = home;         // 子頁才有「儲存」
  document.getElementById('set-head-spacer').hidden = !home; // 首頁右側用 spacer 佔位置
  document.getElementById('set-title').textContent = home ? '設定' : (view === 'ai' ? 'AI 設定' : '語音發音');
}
/** 頂列「儲存」依目前子頁分派 */
function saveSubpage() {
  if (settingsView === 'ai') saveAIForm();
  else if (settingsView === 'tts') saveTtsForm();
  else showSettingsView('home');
}
function openSettings() {
  // 首頁「顯示」設定
  document.getElementById('set-newest').checked = settings.newestFirst !== false;
  document.getElementById('set-pagesize').value = String(pageSize());
  markPageSizeChip();
  showSettingsView('home');
  document.getElementById('settings-overlay').hidden = false;
}
/** 標記目前每頁張數對應的快選 chip */
function markPageSizeChip() {
  const v = String(pageSize());
  document.querySelectorAll('#pagesize-chips button').forEach((b) => b.classList.toggle('on', b.dataset.n === v));
}
function closeSettings() { document.getElementById('settings-overlay').hidden = true; showSettingsView('home'); }

// 語音發音子頁
/** 填入內建日語語音選單 */
function populateWebVoices() {
  const sel = document.getElementById('tts-voice-web');
  const vs = listJaVoices();
  sel.innerHTML = vs.length
    ? vs.map((v) => `<option value="${escapeAttr(v.voiceURI)}">${escapeHtml(v.name)}</option>`).join('')
    : '<option value="">（此裝置尚無日語語音）</option>';
  if (settings.ttsVoiceWeb) sel.value = settings.ttsVoiceWeb;
}
/** 依引擎顯示對應設定區塊 */
function toggleTtsBoxes() {
  const eng = document.getElementById('tts-engine').value;
  document.getElementById('tts-web-box').hidden = eng !== 'web';
  document.getElementById('tts-cloud-box').hidden = eng !== 'gcloud';
}
function openTtsSubpage() {
  document.getElementById('tts-engine').value = ttsEngine(settings);
  populateWebVoices();
  const cv = document.getElementById('tts-voice-cloud');
  cv.innerHTML = cloudVoices().map((v) => `<option value="${escapeAttr(v.id)}">${escapeHtml(v.label)}</option>`).join('');
  cv.value = settings.ttsVoiceCloud || 'ja-JP-Neural2-B';
  document.getElementById('tts-key').value = settings.ttsKey || '';
  document.getElementById('tts-test-result').textContent = '';
  toggleTtsBoxes();
  showSettingsView('tts');
}
/** 儲存語音設定 → 回首頁 */
function saveTtsForm() {
  settings.ttsEngine = document.getElementById('tts-engine').value;
  settings.ttsKey = document.getElementById('tts-key').value.trim();
  const webVoice = document.getElementById('tts-voice-web').value;
  if (webVoice) settings.ttsVoiceWeb = webVoice; // 空值(語音清單尚未就緒)時保留舊偏好，不清掉
  settings.ttsVoiceCloud = document.getElementById('tts-voice-cloud').value;
  saveSettings(settings);
  showSettingsView('home');
}
/** 測試語音（雲端會實打 API、有聲即成功；失敗提示會退回內建） */
async function testTts() {
  const el = document.getElementById('tts-test-result');
  const engineSel = document.getElementById('tts-engine').value;
  const s = {
    ttsEngine: engineSel,
    ttsKey: document.getElementById('tts-key').value.trim(),
    ttsVoiceWeb: document.getElementById('tts-voice-web').value || '',
    ttsVoiceCloud: document.getElementById('tts-voice-cloud').value,
  };
  if (engineSel === 'gcloud' && !s.ttsKey) {
    ttsSpeak('こんにちは。テストです。', { ttsEngine: 'web', ttsVoiceWeb: s.ttsVoiceWeb });
    el.textContent = '⚠ 尚未填 Cloud key，先播內建語音；填 key 後才會用雲端。';
    return;
  }
  if (engineSel === 'gcloud') {
    el.textContent = '測試雲端語音中…';
    try { await testCloud(s); el.textContent = '✅ 雲端語音成功（有聽到聲音就 OK）'; }
    catch (e) { el.textContent = '❌ ' + e.message + '（實際使用時會自動退回內建語音）'; }
  } else {
    ttsSpeak('こんにちは。テストです。', s);
    el.textContent = '▶ 已用內建語音播放（沒聲音請檢查手機音量／靜音鍵）';
  }
}
/** 進 AI 子頁（填入現值） */
function openAISubpage() {
  document.getElementById('set-provider').value = settings.aiProvider || 'gemini';
  document.getElementById('set-key').value = settings.aiKey || '';
  document.getElementById('set-model').value = settings.aiModel || '';
  document.getElementById('set-endpoint').value = settings.aiEndpoint || '';
  document.getElementById('set-test-result').textContent = '';
  showSettingsView('ai');
}
/** 儲存 AI 子頁 → 回設定首頁 */
function saveAIForm() {
  settings.aiProvider = document.getElementById('set-provider').value;
  settings.aiKey = document.getElementById('set-key').value.trim();
  settings.aiModel = document.getElementById('set-model').value.trim();
  settings.aiEndpoint = document.getElementById('set-endpoint').value.trim();
  settings.aiOnboarded = true;
  saveSettings(settings);
  showSettingsView('home');
}
/** 顯示設定：最新在前（即時套用） */
function onToggleNewest(e) {
  settings.newestFirst = e.target.checked;
  saveSettings(settings);
  currentPage = 1;
  renderList();
}
/** 顯示設定：每頁張數（讀 input 現值，夾在 1~200，即時套用） */
function applyPageSize() {
  const inp = document.getElementById('set-pagesize');
  let n = Math.floor(Number(inp.value));
  if (!Number.isFinite(n) || n < 1) n = DEFAULT_PAGE_SIZE;
  n = Math.min(200, n);
  inp.value = String(n);
  settings.pageSize = n;
  saveSettings(settings);
  markPageSizeChip();
  currentPage = 1;
  renderList();
}
async function testAI() {
  const el = document.getElementById('set-test-result');
  const s = {
    aiProvider: document.getElementById('set-provider').value,
    aiKey: document.getElementById('set-key').value.trim(),
    aiModel: document.getElementById('set-model').value.trim(),
    aiEndpoint: document.getElementById('set-endpoint').value.trim(),
  };
  if (!s.aiKey) { el.textContent = '請先填 API key'; return; }
  el.textContent = '測試中…';
  try { const r = await askAI(s, [{ role: 'user', text: '請用繁體中文只回覆兩個字：成功' }]); el.textContent = '✅ 連線成功：' + r.slice(0, 40); }
  catch (e) { el.textContent = '❌ ' + e.message; }
}

// ── 首次啟用引導 ──────────────────────────────
function maybeOnboard() { if (!settings.aiKey && !settings.aiOnboarded) document.getElementById('onboard-overlay').hidden = false; }
function onboardYes() { settings.aiOnboarded = true; saveSettings(settings); document.getElementById('onboard-overlay').hidden = true; openSettings(); openAISubpage(); }
function onboardNo() { settings.aiOnboarded = true; saveSettings(settings); document.getElementById('onboard-overlay').hidden = true; }

// ── AI 協助補完（指示式 + 逐欄位預覽套用）──────
let assistProposed = null;
function openAssist() {
  if (!hasAI(settings)) { if (confirm('尚未設定 AI，前往設定？')) openSettings(); return; }
  // 預設指示＝補空白（直接按送出就會補空欄、不動已填的），使用者可自行改寫
  document.getElementById('assist-instruction').value = '把空白的欄位幫我補齊，已經有內容的不要更動。';
  document.getElementById('assist-status').textContent = '';
  document.getElementById('assist-preview').innerHTML = '';
  document.getElementById('assist-apply').hidden = true;
  assistProposed = null;
  document.getElementById('assist-overlay').hidden = false;
}
function closeAssist() { document.getElementById('assist-overlay').hidden = true; }
async function runAssist() {
  const instruction = document.getElementById('assist-instruction').value.trim();
  if (!instruction) { alert('請先寫指示，例如「只補例句的中文，其他不要動」'); return; }
  const status = document.getElementById('assist-status');
  status.textContent = 'AI 思考中…';
  const cur = readForm();
  const cardForAI = { type: cur.type, pos: cur.pos, jp: cur.jp, reading: cur.reading, meaning: cur.meaning, examples: (cur.examples || []).map((e) => ({ jp: readingFromFuri(e.jp), zh: e.zh })) };
  const sys = '你是日語學習卡助手。使用者會給你一張卡片「目前的內容」(JSON) 和一個「指示」。請「只」依指示修改或補充，回傳一個 JSON 物件，「只」包含你要新增或修改的欄位，其餘欄位一律不要出現。可用欄位：jp(日文單字或句型)、meaning(繁體中文意思)、pos(名詞/動詞/形容詞/副詞/其他)、examples(陣列，每項 {jp:日文例句, zh:繁體中文翻譯})。不要產生讀音或注音（那由 App 用 kuromoji 處理）。只輸出 JSON，不要多餘文字。';
  try {
    const out = await askAI(settings, [{ role: 'system', text: sys }, { role: 'user', text: '目前卡片：' + JSON.stringify(cardForAI) + '\n指示：' + instruction }], { json: true });
    let obj;
    try { obj = JSON.parse(out); } catch { obj = JSON.parse(out.replace(/```json?/gi, '').replace(/```/g, '').trim()); }
    assistProposed = obj;
    renderAssistPreview(obj, cardForAI);
    status.textContent = '請勾選要採用的變更（未勾的不會動）：';
  } catch (e) { status.textContent = '❌ ' + e.message; }
}
function renderAssistPreview(obj, cur) {
  const box = document.getElementById('assist-preview');
  const disp = (v) => (typeof v === 'string' ? v : JSON.stringify(v));
  const rows = Object.keys(obj).map((k) => `
    <label class="ap-row"><input type="checkbox" class="ap-ck" data-key="${escapeAttr(k)}" checked>
      <div class="ap-body"><b>${escapeHtml(k)}</b>
        <div class="ap-old">原：${escapeHtml(disp(cur[k]) || '（空）')}</div>
        <div class="ap-new">建議：${escapeHtml(disp(obj[k]))}</div></div></label>`);
  box.innerHTML = rows.join('') || '（AI 沒有建議變更）';
  document.getElementById('assist-apply').hidden = rows.length === 0;
}
function applyAssist() {
  if (!assistProposed) return;
  const checked = [...document.querySelectorAll('.ap-ck:checked')].map((c) => c.dataset.key);
  for (const k of checked) {
    const v = assistProposed[k];
    if (k === 'jp') document.getElementById('fld-jp').value = v;
    else if (k === 'meaning') document.getElementById('fld-meaning').value = v;
    else if (k === 'pos') document.getElementById('fld-pos').value = v;
    else if (k === 'examples' && Array.isArray(v)) {
      const box = document.getElementById('examples'); box.innerHTML = '';
      v.forEach((e) => addExampleRow({ jp: e.jp, zh: e.zh }));
    }
  }
  closeAssist();
  alert('已套用勾選的變更。可再按「✨ 自動注音」補上假名／羅馬拼音。');
}

// ── AI 問答（卡內／全域）──────────────────────
function openChat(cardId) {
  if (!hasAI(settings)) { if (confirm('尚未設定 AI，前往設定？')) openSettings(); return; }
  chatCardId = cardId || null;
  const c = chatCardId ? cards.find((x) => x.id === chatCardId) : null;
  document.getElementById('chat-title').textContent = c ? `問 AI（${c.jp}）` : '問 AI';
  document.getElementById('chat-context').textContent = c ? `聚焦這張卡：${c.jp}（${c.meaning || ''}）` : '一般問答：任何日語問題都能問。';
  document.getElementById('chat-log').innerHTML = '';
  document.getElementById('chat-input').value = '';
  document.getElementById('chat-overlay').hidden = false;
}
function closeChat() { document.getElementById('chat-overlay').hidden = true; }
async function sendChat() {
  const inp = document.getElementById('chat-input');
  const q = inp.value.trim();
  if (!q) return;
  const log = document.getElementById('chat-log');
  log.insertAdjacentHTML('beforeend', `<div class="chat-q">${escapeHtml(q)}</div><div class="chat-a" id="chat-pending">…</div>`);
  inp.value = '';
  log.scrollTop = log.scrollHeight;
  const c = chatCardId ? cards.find((x) => x.id === chatCardId) : null;
  const sys = c
    ? `你是日語老師。針對這張卡片，用繁體中文簡潔回答使用者問題。卡片：${JSON.stringify({ jp: c.jp, reading: c.reading, meaning: c.meaning, examples: (c.examples || []).map((e) => ({ jp: readingFromFuri(e.jp), zh: e.zh })) })}`
    : '你是日語老師，用繁體中文簡潔回答日語學習問題。';
  try {
    const r = await askAI(settings, [{ role: 'system', text: sys }, { role: 'user', text: q }]);
    const el = document.getElementById('chat-pending'); if (el) el.outerHTML = `<div class="chat-a">${escapeHtml(r)}</div>`;
  } catch (e) {
    const el = document.getElementById('chat-pending'); if (el) el.outerHTML = `<div class="chat-a err">❌ ${escapeHtml(e.message)}</div>`;
  }
  log.scrollTop = log.scrollHeight;
}

// ── 小工具 ────────────────────────────────────
/** 洗牌（Fisher–Yates），回傳新陣列 */
function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
function escapeAttr(s) { return escapeHtml(s); }

// ── 備份／還原 ──────────────────────────────
/** 匯出備份（iOS 獨立式 PWA 優先用系統分享，其餘用檔案下載；都可存到 Google Drive／iCloud） */
async function doExport() {
  const text = exportAll();
  const filename = `JP-backup-${todayISO()}.json`;
  // iOS 加到主畫面的獨立式模式下 <a download> 不可靠，優先用 Web Share 分享成檔案
  try {
    const file = new File([text], filename, { type: 'application/json' });
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      await navigator.share({ files: [file], title: 'JP 備份' });
      console.log('[doExport] 已透過系統分享', { 卡片數: cards.length });
      return;
    }
  } catch (e) {
    if (e && e.name === 'AbortError') return;                 // 使用者自己取消分享
    console.warn('[doExport] 系統分享不可用，改用下載', e);
  }
  try {
    const blob = new Blob([text], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    console.log('[doExport] 已下載檔案', { 卡片數: cards.length });
  } catch (e) {
    console.error('[doExport] 匯出失敗', e);
    alert('匯出失敗：' + e.message);
  }
}
/** 讀取使用者選的備份檔並合併匯入 */
function doImportFile(file) {
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const res = importAll(String(reader.result));
      if (!res.ok) { alert('匯入失敗：' + res.error); console.error('[doImportFile] 失敗', res); return; }
      cards = loadCards();
      tagList = loadTagList();
      currentPage = 1;
      renderTagFilters();
      renderList();
      console.log('[doImportFile] 匯入成功', res);
      const skip = res.skipped ? `、略過 ${res.skipped} 張（現有的較新）` : '';
      alert(`匯入完成：新增 ${res.added} 張、更新 ${res.updated} 張${skip}。`);
    } catch (e) {
      console.error('[doImportFile] 例外', e);
      alert('匯入失敗：' + e.message);
    }
  };
  reader.onerror = () => alert('讀檔失敗，請再試一次。');
  reader.readAsText(file);
}

// ── Service Worker：註冊 + 更新提示 ───────────
let swRegistration = null;      // 保存 registration，按鈕點下時取最新的 waiting worker
let userClickedUpdate = false;  // 使用者是否按過「立即更新」（controllerchange 用它判斷要不要重載）

/** 顯示「有新版本」橫幅 */
function showUpdateBanner() {
  const bar = document.getElementById('update-bar');
  if (bar) bar.hidden = false;
}
function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  // 只有「使用者主動按過更新」才重載，且只重載一次。
  // 本 SW 從不自行 skipWaiting，controllerchange 只會在「首次安裝 claim」或「使用者按更新」時發生，
  // 用意圖旗標可正確區分：首裝不重載、按更新才重載。
  let reloaded = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (reloaded || !userClickedUpdate) return;
    reloaded = true;
    window.location.reload();
  });

  navigator.serviceWorker.register('./service-worker.js').then((reg) => {
    swRegistration = reg;
    const watch = (w) => {
      if (!w) return;
      w.addEventListener('statechange', () => {
        if (w.state === 'installed' && navigator.serviceWorker.controller) showUpdateBanner();
      });
    };
    if (reg.waiting && navigator.serviceWorker.controller) showUpdateBanner(); // 已有等待中的新版
    watch(reg.installing);                                    // register 當下已在安裝（競態）
    reg.addEventListener('updatefound', () => watch(reg.installing)); // 之後才偵測到新版
  }).catch((e) => console.error('[sw]', e));

  // 「立即更新」：命令等待中的新版換版（取當下最新的 waiting，避免持有過期參照）
  const btn = document.getElementById('update-reload');
  if (btn) btn.addEventListener('click', () => {
    document.getElementById('update-bar').hidden = true;
    userClickedUpdate = true;
    const w = swRegistration && swRegistration.waiting;
    if (w) w.postMessage({ type: 'SKIP_WAITING' }); // 換版後觸發 controllerchange → 重載
    else window.location.reload();                  // 保底：沒有等待版就直接重整
  });
}

init();

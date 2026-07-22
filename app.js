// app.js — JP 主動學習 App 主程式（Phase 1：輸入與複習核心）
import { toRomaji } from './romaji.js';
import { analyze } from './jlp.js';
import { isDue, applyResult, todayISO } from './srs.js';
import { askAI, hasAI } from './ai.js';
import {
  loadCards, upsertCard, deleteCard, allTags,
  loadTagList, saveTagList, addTagToList, removeTagFromList,
  loadSettings, saveSettings,
} from './store.js';

let cards = [];
let tagList = [];                 // 標籤主清單
let activeType = 'all';           // all | vocab | grammar
const activeTags = new Set();     // 已選標籤篩選
const formTags = new Set();       // 表單中已選的標籤
let editingId = null;             // 目前編輯中的卡片 id（null = 新增）
let jaVoice = null;
let settings = {};                // AI 等設定

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
  setupTts();
  bindEvents();
  if (settings.hideRomaji) document.body.classList.add('hide-romaji');
  document.getElementById('quiz-eye').innerHTML = EYE_BTN;
  renderTagFilters();
  renderList();
  registerServiceWorker();
  maybeOnboard();
}

// ── 發音（Web Speech）─────────────────────────
function setupTts() {
  if (!('speechSynthesis' in window)) return;
  const pick = () => {
    const vs = window.speechSynthesis.getVoices();
    jaVoice = vs.find((v) => v.lang && v.lang.toLowerCase().startsWith('ja')) || null;
  };
  pick();
  window.speechSynthesis.onvoiceschanged = pick;
}
/** 念出日文（用假名較準，沒有就念漢字） */
function speak(text) {
  if (!('speechSynthesis' in window) || !text) return;
  try {
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = 'ja-JP';
    if (jaVoice) u.voice = jaVoice;
    u.rate = 0.9;
    window.speechSynthesis.speak(u);
  } catch (e) { console.error('[speak]', e); }
}

// ── 列表 ──────────────────────────────────────
function filtered() {
  return cards.filter((c) => {
    if (activeType !== 'all' && c.type !== activeType) return false;
    if (activeTags.size && !(c.tags || []).some((t) => activeTags.has(t))) return false;
    return true;
  });
}

function renderList() {
  const list = document.getElementById('card-list');
  const items = filtered();
  document.getElementById('stats').textContent = `${cards.length} 張卡`;
  if (items.length === 0) {
    list.innerHTML = cards.length === 0
      ? '<li class="empty-hint"><b>還沒有卡片</b><br>按右上「＋ 新增卡片」開始建立你的第一張。</li>'
      : '<li class="empty-hint">沒有符合篩選的卡片</li>';
    return;
  }
  list.innerHTML = items.map((c) => `
    <li class="card-row" data-id="${c.id}">
      <button class="speak" data-say="${escapeAttr(c.reading || c.jp)}" aria-label="播放發音">🔊</button>
      <span class="cr-jp">${escapeHtml(c.jp)}<span class="cr-reading">${escapeHtml(c.reading || '')}</span></span>
      <span class="cr-meaning">${escapeHtml(c.meaning || '')}</span>
      <span class="cr-badge">${c.type === 'grammar' ? '文法' : (c.pos || '單字')}</span>
    </li>`).join('');
  list.querySelectorAll('.card-row').forEach((row) => {
    row.addEventListener('click', () => openDetail(row.dataset.id));
  });
  list.querySelectorAll('.speak').forEach((b) => {
    b.addEventListener('click', (e) => { e.stopPropagation(); speak(b.dataset.say); });
  });
}

function renderTagFilters() {
  const box = document.getElementById('tag-filters');
  box.innerHTML = tagList.map((t) =>
    `<button class="chip-btn${activeTags.has(t) ? ' active' : ''}" data-tag="${escapeAttr(t)}">#${escapeHtml(t)}</button>`).join('');
  box.querySelectorAll('.chip-btn').forEach((b) => {
    b.addEventListener('click', () => {
      const t = b.dataset.tag;
      if (activeTags.has(t)) activeTags.delete(t); else activeTags.add(t);
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
  upsertCard(cards, card);
  closeEdit();
  renderTagFilters();
  renderList();
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
        <button class="speak" data-say="${escapeAttr(say)}" aria-label="播放例句">🔊</button>
      </div>
      ${kanaLine}
      ${romaji ? `<div class="sc-ex-romaji romaji">${escapeHtml(romaji)}</div>` : ''}
      ${ex.zh ? `<div class="sc-ex-zh">${escapeHtml(ex.zh)}</div>` : ''}
    </div>`;
  }).join('');
  document.getElementById('study-card').innerHTML = `
    ${EYE_BTN}
    <div class="sc-top">
      <div class="sc-jp-row">
        <span class="sc-jp">${escapeHtml(c.jp)}</span>
        <button class="speak" data-say="${escapeAttr(c.reading || c.jp)}" aria-label="播放發音">🔊</button>
      </div>
      ${c.reading ? `<div class="sc-romaji"><span class="rd">${escapeHtml(c.reading)}</span> <span class="romaji">${escapeHtml(c.romaji || toRomaji(c.reading))}</span></div>` : ''}
      <div class="sc-meaning">${escapeHtml(c.meaning || '')}</div>
    </div>
    ${exHtml ? '<hr class="sc-divider" />' + exHtml : ''}
    <button class="card-ask-btn" id="card-ask">💬 問 AI 這張卡</button>`;
  document.getElementById('study-card').querySelectorAll('.speak').forEach((b) => {
    b.addEventListener('click', () => speak(b.dataset.say));
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

  // AI 設定
  document.getElementById('btn-settings').addEventListener('click', openSettings);
  document.getElementById('set-close').addEventListener('click', closeSettings);
  document.getElementById('set-save').addEventListener('click', saveSettingsForm);
  document.getElementById('set-test').addEventListener('click', testAI);
  document.getElementById('settings-overlay').addEventListener('click', (e) => { if (e.target.id === 'settings-overlay') closeSettings(); });

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
      ? '<button id="q-replay" class="speak big" aria-label="再聽一次">🔊</button>'
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

// ── AI 設定 ───────────────────────────────────
function openSettings() {
  document.getElementById('set-provider').value = settings.aiProvider || 'gemini';
  document.getElementById('set-key').value = settings.aiKey || '';
  document.getElementById('set-model').value = settings.aiModel || '';
  document.getElementById('set-endpoint').value = settings.aiEndpoint || '';
  document.getElementById('set-test-result').textContent = '';
  document.getElementById('settings-overlay').hidden = false;
}
function closeSettings() { document.getElementById('settings-overlay').hidden = true; }
function saveSettingsForm() {
  settings.aiProvider = document.getElementById('set-provider').value;
  settings.aiKey = document.getElementById('set-key').value.trim();
  settings.aiModel = document.getElementById('set-model').value.trim();
  settings.aiEndpoint = document.getElementById('set-endpoint').value.trim();
  settings.aiOnboarded = true;
  saveSettings(settings);
  closeSettings();
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
function onboardYes() { settings.aiOnboarded = true; saveSettings(settings); document.getElementById('onboard-overlay').hidden = true; openSettings(); }
function onboardNo() { settings.aiOnboarded = true; saveSettings(settings); document.getElementById('onboard-overlay').hidden = true; }

// ── AI 協助補完（指示式 + 逐欄位預覽套用）──────
let assistProposed = null;
function openAssist() {
  if (!hasAI(settings)) { if (confirm('尚未設定 AI，前往設定？')) openSettings(); return; }
  document.getElementById('assist-instruction').value = '';
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

function registerServiceWorker() {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./service-worker.js').catch((e) => console.error('[sw]', e));
  }
}

init();

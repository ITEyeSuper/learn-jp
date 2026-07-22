// store.js — 學習卡與設定的本機儲存（localStorage）。
// 卡片是使用者自建、可編輯的內容;不內建任何字庫。
// 卡片結構:
//   { id, type:'vocab'|'grammar', pos, jp, reading, romaji, meaning,
//     examples:[{jp,reading,romaji,zh}], tags:[], srs:null|{...}, created, updated }

const KEY_CARDS = 'jp_cards';
const KEY_SETTINGS = 'jp_settings';
const KEY_TAGLIST = 'jp_taglist';

/** 產生唯一 id */
function uid() {
  return (crypto?.randomUUID?.() || 'c-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8));
}

/** 載入全部卡片 */
export function loadCards() {
  try {
    const raw = localStorage.getItem(KEY_CARDS);
    return raw ? JSON.parse(raw) : [];
  } catch (e) {
    console.error('[store.loadCards]', e);
    return [];
  }
}

/** 存回全部卡片 */
export function saveCards(cards) {
  localStorage.setItem(KEY_CARDS, JSON.stringify(cards));
}

/**
 * 新增或更新一張卡（依 id）
 * @param {Array} cards 目前卡片陣列
 * @param {object} card 卡片（無 id 視為新增）
 * @returns {object} 存入後的卡片
 */
export function upsertCard(cards, card) {
  const now = new Date().toISOString();
  if (!card.id) {
    card.id = uid();
    card.created = now;
    card.srs = card.srs || null;
  }
  card.updated = now;
  const idx = cards.findIndex((c) => c.id === card.id);
  if (idx >= 0) cards[idx] = card; else cards.push(card);
  saveCards(cards);
  return card;
}

/** 刪除一張卡 */
export function deleteCard(cards, id) {
  const idx = cards.findIndex((c) => c.id === id);
  if (idx >= 0) { cards.splice(idx, 1); saveCards(cards); }
  return cards;
}

/** 取得所有用過的標籤（去重、排序） */
export function allTags(cards) {
  const set = new Set();
  cards.forEach((c) => (c.tags || []).forEach((t) => set.add(t)));
  return [...set].sort();
}

// ── 標籤主清單（可先建立、再於卡片點選）──
/** 載入標籤主清單 */
export function loadTagList() {
  try { return JSON.parse(localStorage.getItem(KEY_TAGLIST) || '[]'); } catch { return []; }
}
/** 存回標籤主清單 */
export function saveTagList(tags) {
  localStorage.setItem(KEY_TAGLIST, JSON.stringify(tags));
}
/** 新增一個標籤到主清單（去重、保序） */
export function addTagToList(tags, name) {
  name = (name || '').trim();
  if (name && !tags.includes(name)) { tags.push(name); saveTagList(tags); }
  return tags;
}
/** 從主清單刪除標籤，並從所有卡片移除該標籤 */
export function removeTagFromList(tags, cards, name) {
  const i = tags.indexOf(name);
  if (i >= 0) { tags.splice(i, 1); saveTagList(tags); }
  cards.forEach((c) => { if (c.tags) c.tags = c.tags.filter((t) => t !== name); });
  saveCards(cards);
  return tags;
}

// ── 設定（含 AI key，只存本機、不進程式碼庫）──
export function loadSettings() {
  try {
    return JSON.parse(localStorage.getItem(KEY_SETTINGS) || '{}');
  } catch { return {}; }
}
export function saveSettings(s) {
  localStorage.setItem(KEY_SETTINGS, JSON.stringify(s));
}

// ── 備份 ──
export function exportAll() {
  return JSON.stringify({ cards: loadCards(), exportedAt: new Date().toISOString() }, null, 2);
}
export function importAll(text) {
  try {
    const data = JSON.parse(text);
    if (Array.isArray(data.cards)) { saveCards(data.cards); return true; }
    return false;
  } catch { return false; }
}

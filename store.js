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

/**
 * 依建立時間排序（純函式，不改原陣列）
 * @param {Array} cards 卡片
 * @param {boolean} [newestFirst=true] true＝最新在前
 * @returns {Array} 排序後的新陣列
 */
export function sortByNewest(cards, newestFirst = true) {
  const arr = cards.slice();
  arr.sort((a, b) => {
    const cmp = String(a.created || '').localeCompare(String(b.created || ''));
    return newestFirst ? -cmp : cmp;
  });
  return arr;
}

/**
 * 取某一頁的卡片（純函式）
 * @param {Array} items 已排序的卡片
 * @param {number} page 目前頁碼（1 起算，超界會自動夾住）
 * @param {number} size 每頁張數
 * @returns {{page:number, totalPages:number, items:Array}}
 */
export function paginate(items, page, size) {
  const per = Math.max(1, Number(size) || 20);
  const totalPages = Math.max(1, Math.ceil(items.length / per));
  const p = Math.min(Math.max(1, Number(page) || 1), totalPages);
  const start = (p - 1) * per;
  return { page: p, totalPages, items: items.slice(start, start + per) };
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

// ── 備份／還原 ──
const BACKUP_VERSION = 1;

/**
 * 匯出全部資料為備份 JSON 字串（卡片＋標籤；不含 AI key，避免備份檔外流金鑰）
 * @returns {string} 可下載成檔的 JSON 文字
 */
export function exportAll() {
  return JSON.stringify({
    app: 'JP', version: BACKUP_VERSION, exportedAt: new Date().toISOString(),
    cards: loadCards(), tags: loadTagList(),
  }, null, 2);
}

/**
 * 匯入備份：以 id 合併卡片，標籤取聯集。合併而非取代 → 不會刪除現有卡片。
 * 同 id 時採「較新的為準」（比對 updated 時間戳）：匯入的較新才覆蓋，否則保留現有，
 * 避免拿舊備份把裝置上較新的編輯／學習進度(srs)蓋掉。
 * @param {string} text 備份 JSON 文字
 * @returns {{ok:boolean, added:number, updated:number, skipped:number, error?:string}}
 */
export function importAll(text) {
  const fail = (error) => ({ ok: false, added: 0, updated: 0, skipped: 0, error });
  let data;
  try { data = JSON.parse(text); } catch { return fail('不是有效的 JSON 檔'); }
  if (!data || !Array.isArray(data.cards)) return fail('檔案內找不到 cards 卡片陣列');
  const cards = loadCards();
  const idIndex = new Map(cards.map((c, i) => [c.id, i]));
  let added = 0;
  let updated = 0;
  let skipped = 0;
  for (const c of data.cards) {
    if (!c || typeof c !== 'object') continue;
    if (!c.id) c.id = uid();                 // 沒 id 的一律當新卡
    if (idIndex.has(c.id)) {
      const cur = cards[idIndex.get(c.id)];
      // 現有卡沒時間戳、或匯入的較新（含相同）→ 覆蓋；否則保留現有
      if (!cur.updated || (c.updated && c.updated >= cur.updated)) { cards[idIndex.get(c.id)] = c; updated += 1; }
      else skipped += 1;
    } else { idIndex.set(c.id, cards.length); cards.push(c); added += 1; }
  }
  try { saveCards(cards); }
  catch (e) { return fail('儲存失敗（可能空間不足）：' + e.message); } // QuotaExceededError 等 → 不靜默
  // 標籤：備份檔的標籤 ∪ 目前標籤 ∪ 卡片實際用到的標籤
  const tags = loadTagList();
  (Array.isArray(data.tags) ? data.tags : []).forEach((t) => { if (t && !tags.includes(t)) tags.push(t); });
  allTags(cards).forEach((t) => { if (!tags.includes(t)) tags.push(t); });
  try { saveTagList(tags); } catch (e) { console.error('[importAll] 標籤寫入失敗（卡片已存）', e); }
  return { ok: true, added, updated, skipped };
}

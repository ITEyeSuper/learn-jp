// srs.js — SM-2（SuperMemo 2）間隔重複演算法（Anki 使用的那套）。純邏輯，可測。
// 日期用 'YYYY-MM-DD' 字串。每張卡的排程：easeFactor / interval / repetitions / nextReview。

export const DEFAULT_EASE = 2.5;
export const MIN_EASE = 1.3;

/** Date → 'YYYY-MM-DD' */
export function toISO(dt) {
  const y = dt.getFullYear();
  const m = String(dt.getMonth() + 1).padStart(2, '0');
  const d = String(dt.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}
/** 今天 */
export function todayISO() { return toISO(new Date()); }
/** 日期加天數 */
export function addDays(iso, days) {
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() + days);
  return toISO(dt);
}
/** 是否到期（沒有排程 = 新卡 = 到期） */
export function isDue(srs, today) {
  if (!srs || !srs.nextReview) return true;
  return srs.nextReview <= today;
}
/** 新卡初始排程：今天就到期 */
export function startLearning(today) {
  return { easeFactor: DEFAULT_EASE, interval: 0, repetitions: 0, lastReviewed: today, nextReview: today };
}
/** 答對=品質5、答錯=品質1 */
export function qualityFromCorrect(correct) { return correct ? 5 : 1; }
/** 套用四選一/測驗結果 */
export function applyResult(srs, correct, today) {
  return applyQuality(srs || startLearning(today), qualityFromCorrect(correct), today);
}
// 常錯題（leech）門檻：累積答錯達 LEECH_WRONG → 進常錯題庫；之後連對達 LEECH_GRADUATE → 畢業
export const LEECH_WRONG = 2;
export const LEECH_GRADUATE = 2;
/** 是否為常錯題（答錯夠多、且還沒連對夠多次畢業） */
export function isLeech(card) {
  const w = (card && card.stats && card.stats.wrong) || 0;
  const s = (card && card.stats && card.stats.streak) || 0;
  return w >= LEECH_WRONG && s < LEECH_GRADUATE;
}

/**
 * 「曾經錯過」的卡，依優先度排序（純函式）：錯越多越前面；同分則最近複習(恢復)的在前。
 * 用於「沒有常錯題時」的加強複習。
 * @param {Array} cards
 * @returns {Array} 依優先度排序（高→低）的卡片
 */
export function everWrongCards(cards) {
  return cards
    .filter((c) => (((c.stats && c.stats.wrong) || 0) > 0))
    .sort((a, b) => (
      (((b.stats && b.stats.wrong) || 0) - ((a.stats && a.stats.wrong) || 0))
      || String((b.srs && b.srs.lastReviewed) || '').localeCompare(String((a.srs && a.srs.lastReviewed) || ''))
    ));
}

/**
 * 組測驗題目清單（純函式）。單字題與例句題都掛在同一張卡的 SM-2 上。
 * 常錯題：即使未到期也納入，且單字題多出一次（出現率加倍），連對畢業後恢復正常。
 * @param {Array} cards 卡片
 * @param {object} opts {type:'all'|'vocab'|'grammar', tags:Set<string>, content:Set<'word'|'example'>, dueOnly:boolean, today:string}
 * @returns {Array<{kind:'word'|'example', card:object, ex?:object, leech:boolean}>}
 */
export function buildQuizItems(cards, opts = {}) {
  const { type = 'all', tags = new Set(), content = new Set(['word']), dueOnly = true, today } = opts;
  const items = [];
  for (const c of cards) {
    if (type !== 'all' && c.type !== type) continue;
    if (tags.size && !(c.tags || []).some((t) => tags.has(t))) continue;
    const leech = isLeech(c);
    if (dueOnly && !isDue(c.srs, today) && !leech) continue; // 到期 或 常錯題 才納入
    if (content.has('word')) {
      items.push({ kind: 'word', card: c, leech });
      if (leech) items.push({ kind: 'word', card: c, leech }); // 常錯題多出一次
    }
    if (content.has('example')) {
      for (const ex of (c.examples || [])) {
        if (ex && ex.zh && (ex.jp || ex.reading)) items.push({ kind: 'example', card: c, ex, leech });
      }
    }
  }
  return items;
}

/** SM-2 核心 */
export function applyQuality(p, q, today) {
  let ease = p.easeFactor ?? DEFAULT_EASE;
  let reps = p.repetitions ?? 0;
  let interval = p.interval ?? 0;
  if (q < 3) {
    reps = 0; interval = 1;
  } else {
    if (reps === 0) interval = 1;
    else if (reps === 1) interval = 6;
    else interval = Math.round(interval * ease);
    reps += 1;
  }
  ease = ease + (0.1 - (5 - q) * (0.08 + (5 - q) * 0.02));
  if (ease < MIN_EASE) ease = MIN_EASE;
  return {
    easeFactor: Math.round(ease * 100) / 100,
    interval, repetitions: reps,
    lastReviewed: today, nextReview: addDays(today, interval),
  };
}

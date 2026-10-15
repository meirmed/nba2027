// Bonus questions: validation + scoring. Pure, unit-tested; used by the Cloud Functions (authoritative) and the UI (display).
import { DIVISIONS, TEAMS, TEAMS_BY_ABBR } from './teams.js';
import { normalizeName } from './names.js';

export const SCORABLE_TYPES = ['numeric', 'closest', 'choice', 'team', 'player', 'dynamic_score', 'text', 'ranking', 'division_team', 'conference_team'];
/** Types whose answer is ONE team chosen from a fixed group (a division or a conference) set by the admin in q.scope. */
export const SCOPE_TYPES = ['division_team', 'conference_team'];
/** Conference teams, alphabetical by code. A ranking answer = 30 team codes: the 15 EAST teams in predicted order, then the 15 WEST teams. */
export const EAST_TEAMS = TEAMS.filter((t) => t.conf === 'E').map((t) => t.abbr);
export const WEST_TEAMS = TEAMS.filter((t) => t.conf === 'W').map((t) => t.abbr);

/** Places missed: sum over the teams of |predicted place - final place|, per conference. Both lists = 30 valid codes (east first). */
export function rankingMisses(finalOrder, given) {
  const part = (a, b) => { const pos = new Map(a.map((t, i) => [t, i])); return b.reduce((s, t, i) => s + Math.abs(i - pos.get(t)), 0); };
  const east = part(finalOrder.slice(0, 15), given.slice(0, 15));
  const west = part(finalOrder.slice(15), given.slice(15));
  return { east, west, total: east + west };
}
/** The teams a division/conference question offers: division_team + scope 'atlantic'.. | conference_team + scope 'E'|'W'. null = not a scope question or invalid scope. */
export function scopeTeams(q) {
  if (q?.type === 'division_team') return DIVISIONS[q.scope]?.teams ?? null;
  if (q?.type === 'conference_team') return q.scope === 'E' ? EAST_TEAMS : q.scope === 'W' ? WEST_TEAMS : null;
  return null;
}
const OPTION_TYPES = ['choice', 'dynamic_score'];
const MULTI_TYPES = ['choice', 'team', 'player', 'dynamic_score'];
export const isOptionType = (t) => OPTION_TYPES.includes(t);
export const isMultiType = (t) => MULTI_TYPES.includes(t);

const arr = (v) => (Array.isArray(v) ? v : v == null || v === '' ? [] : [v]);
const strs = (v) => arr(v).map((x) => String(x).trim()).filter(Boolean);
const num = (v) => { const s = String(v ?? '').trim(); return s === '' ? NaN : Number(s); };
const round2 = (x) => Math.round(x * 100) / 100;
const limitOf = (q) => (q.multi ? (Number.isInteger(q.maxPicks) && q.maxPicks > 0 ? q.maxPicks : Infinity) : 1);

/** Why a question can't take answers right now (null = open). q.deadlineMs = deadline in epoch ms. */
export function bonusClosedReason(q, nowMs) {
  if (!q) return 'not-found';
  if (!SCORABLE_TYPES.includes(q.type)) return 'not-supported';
  if (arr(q.answer).length > 0) return 'answered'; // setting the correct answer closes the question
  if (!(q.deadlineMs > nowMs)) return 'locked';
  return null;
}

/** Validate + normalize a user's answer for question q. -> {value:[strings]} | {error}. Player existence is checked server-side. */
export function cleanAnswer(q, raw) {
  const list = strs(raw);
  const bad = { error: 'invalid-answer' };
  switch (q?.type) {
    case 'numeric':
    case 'closest': {
      if (list.length !== 1) return bad;
      const v = num(list[0]);
      return Number.isFinite(v) && Math.abs(v) < 1e9 ? { value: [String(v)] } : bad;
    }
    case 'text':
      return list.length === 1 && list[0].length <= 200 ? { value: [list[0]] } : bad;
    case 'choice':
    case 'dynamic_score':
    case 'team':
    case 'player': {
      const picks = [...new Set(list)];
      if (picks.length === 0) return bad;
      if (isOptionType(q.type)) { const ids = new Set((q.options || []).map((o) => o.id)); if (picks.some((p) => !ids.has(p))) return bad; }
      if (q.type === 'team' && picks.some((p) => !TEAMS_BY_ABBR[p])) return bad;
      if (q.type === 'player' && picks.some((p) => p.includes('/') || p.length > 80)) return bad;
      if (picks.length > limitOf(q)) return { error: 'too-many' };
      return { value: picks };
    }
    case 'division_team':
    case 'conference_team': {
      const allowed = scopeTeams(q);
      const picks = [...new Set(list)];
      if (!allowed || picks.length === 0 || picks.some((p) => !allowed.includes(p))) return bad;
      if (picks.length > limitOf(q)) return { error: 'too-many' }; // players pick ONE team; the admin may accept several (a tie)
      return { value: picks };
    }
    case 'ranking': {
      const east = new Set(EAST_TEAMS);
      const west = new Set(WEST_TEAMS);
      if (list.length !== 30 || new Set(list).size !== 30) return bad;
      if (!list.slice(0, 15).every((t) => east.has(t)) || !list.slice(15).every((t) => west.has(t))) return bad;
      return { value: list };
    }
    default:
      return { error: 'not-supported' };
  }
}

/**
 * Points for one user's answer. -> {pts, correct}  (correct = null while no correct answer is set).
 *  numeric: exact number -> pts.   closest: pts - penalty * |distance|, never below 0 (exact = full pts).
 *  choice/team/player: pts per correct pick (several picks allowed when q.multi), no penalty for wrong picks.
 *  dynamic_score: the points of each correct option picked.   text: normalized match against the accepted answers.
 *  ranking: the pool (q.pts) is split equally between East and West; in each conference you lose q.penalty (default 0.5) per place a team
 *           is off from its final place, never below 0 per conference.
 */
export function scoreBonus(q, answer) {
  const correct = strs(q.answer);
  if (correct.length === 0) return { pts: 0, correct: null };
  const given = strs(answer);
  if (given.length === 0) return { pts: 0, correct: false };

  switch (q.type) {
    case 'numeric': {
      const ok = Number.isFinite(num(given[0])) && num(given[0]) === num(correct[0]);
      return { pts: ok ? q.pts : 0, correct: ok };
    }
    case 'closest': {
      const a = num(given[0]);
      const c = num(correct[0]);
      if (!Number.isFinite(a) || !Number.isFinite(c)) return { pts: 0, correct: false };
      const dist = Math.abs(a - c);
      return { pts: Math.max(0, round2(q.pts - (q.penalty ?? 1) * dist)), correct: dist === 0 };
    }
    case 'text': {
      const ok = correct.map(normalizeName).includes(normalizeName(given[0]));
      return { pts: ok ? q.pts : 0, correct: ok };
    }
    case 'choice':
    case 'team':
    case 'division_team':
    case 'conference_team':
    case 'player': {
      const hits = [...new Set(given)].filter((g) => correct.includes(g)).length;
      return { pts: hits * q.pts, correct: hits > 0 };
    }
    case 'ranking': {
      const fin = cleanAnswer(q, correct);
      if (fin.error) return { pts: 0, correct: null };
      const mine = cleanAnswer(q, given);
      if (mine.error) return { pts: 0, correct: false };
      const m = rankingMisses(fin.value, mine.value);
      const half = q.pts / 2;
      const pen = q.penalty ?? 0.5;
      return { pts: round2(Math.max(0, half - pen * m.east) + Math.max(0, half - pen * m.west)), correct: m.total === 0 };
    }
    case 'dynamic_score': {
      const optPts = new Map((q.options || []).map((o) => [o.id, o.pts || 0]));
      const hit = [...new Set(given)].filter((g) => correct.includes(g));
      return { pts: round2(hit.reduce((sum, id) => sum + (optPts.get(id) || 0), 0)), correct: hit.length > 0 };
    }
    default:
      return { pts: 0, correct: null };
  }
}

/** Everyone's bonus points from raw data. questions: [{id, category, month, type, pts, ...}], predictions: {uid:{bonus:{id:{answer}}}} */
export function computeBonusPoints({ questions, predictions, uids }) {
  const out = {};
  uids.forEach((u) => { out[u] = { bonus: 0, byCategory: {}, byQuestion: {} }; });
  questions.forEach((q) => {
    if (arr(q.answer).length === 0) return;
    const key = q.category === 'month' ? (q.month || 'month') : (q.category || 'season');
    uids.forEach((uid) => {
      const given = predictions[uid]?.bonus?.[q.id]?.answer;
      if (strs(given).length === 0) return;
      const { pts } = scoreBonus(q, given);
      const u = out[uid];
      u.bonus = round2(u.bonus + pts);
      u.byCategory[key] = round2((u.byCategory[key] || 0) + pts);
      u.byQuestion[q.id] = pts;
    });
  });
  return out;
}

/** Admin form validation -> list of error keys (empty = valid). q: {question:{he,en}, type, category, month, deadlineMs, pts, penalty, multi, maxPicks, options, answer} */
export function validateQuestion(q) {
  const e = [];
  if (!q.question?.he?.trim() || !q.question?.en?.trim()) e.push('err.bqText');
  if (!SCORABLE_TYPES.includes(q.type)) { e.push('err.bqType'); return e; }
  if (!Number.isFinite(q.pts) || q.pts < 0) e.push('err.bqPts');
  if (!Number.isFinite(q.deadlineMs)) e.push('err.bqDeadline');
  if (!['general', 'season', 'month'].includes(q.category)) e.push('err.bqType');
  if (SCOPE_TYPES.includes(q.type) && !scopeTeams(q)) e.push('err.bqScope');
  if (q.category === 'month' && !/^\d{4}-(0[1-9]|1[0-2])$/.test(q.month || '')) e.push('err.bqMonth');
  if (isOptionType(q.type)) {
    const o = q.options || [];
    const ok = o.length >= 2 && o.every((x) => x.id && x.he?.trim() && x.en?.trim()) && new Set(o.map((x) => x.id)).size === o.length;
    if (!ok) e.push('err.bqOptions');
    if (q.type === 'dynamic_score' && !o.every((x) => Number.isFinite(x.pts) && x.pts >= 0)) e.push('err.bqPts');
  }
  if ((q.type === 'closest' || q.type === 'ranking') && !(Number.isFinite(q.penalty) && q.penalty >= 0)) e.push('err.bqPenalty');
  if (isMultiType(q.type) && q.multi && q.maxPicks != null && !(Number.isInteger(q.maxPicks) && q.maxPicks >= 1)) e.push('err.bqMax');
  if (arr(q.answer).length > 0) {
    const okAns = q.type === 'text'
      ? q.answer.every((a) => typeof a === 'string' && a.trim() && a.length <= 200)
      : !cleanAnswer({ ...q, multi: true, maxPicks: null }, q.answer).error; // several accepted answers are allowed
    if (!okAns) e.push('err.bqAnswer');
  }
  return e;
}

/** The most a player can earn on this question (shown as "max N pts"). */
export function maxBonusPoints(q) {
  const ans = strs(q.answer);
  const picks = () => {
    let k = Number.isInteger(q.maxPicks) && q.maxPicks > 0 ? q.maxPicks : Infinity;
    if (ans.length) k = Math.min(k, ans.length);
    return Number.isFinite(k) ? k : 1;
  };
  if (q.type === 'dynamic_score') {
    const pts = (q.options || []).map((o) => o.pts || 0).sort((a, b) => b - a);
    return round2(pts.slice(0, q.multi ? picks() : 1).reduce((a, b) => a + b, 0));
  }
  if (['choice', 'team', 'player'].includes(q.type) && q.multi) return round2(q.pts * picks());
  return q.pts; // numeric, closest, text, single-answer
}

/**
 * What everyone answered (for the results chart). picks: {uid: {answer:[...]}}.
 * -> {n, buckets:[{value,label?,count,pct}] (most popular first; pct = % of the players who answered), numeric?:{avg,min,max,count}}
 * Multi-pick answers count once per player per option; free text is grouped ignoring case/spaces (label = first spelling).
 */
export function bonusStats(q, picks) {
  const entries = Object.values(picks || {}).map((p) => strs(p?.answer)).filter((a) => a.length);
  const n = entries.length;
  if (q.type === 'ranking') return { n, buckets: [], numeric: null, ranking: true }; // shown as the final order, not as a chart
  if (q.type === 'numeric' || q.type === 'closest') {
    const nums = entries.map((a) => num(a[0])).filter(Number.isFinite);
    if (nums.length === 0) return { n, buckets: [], numeric: null };
    const avg = Math.round((nums.reduce((s, x) => s + x, 0) / nums.length) * 10) / 10;
    return { n, buckets: [], numeric: { avg, min: Math.min(...nums), max: Math.max(...nums), count: nums.length } };
  }
  const counts = new Map();
  entries.forEach((a) => {
    const seen = new Set();
    a.forEach((v) => {
      const key = q.type === 'text' ? normalizeName(v) : v;
      if (seen.has(key)) return;
      seen.add(key);
      const cur = counts.get(key);
      counts.set(key, cur ? { ...cur, count: cur.count + 1 } : { value: key, label: v, count: 1 });
    });
  });
  const buckets = [...counts.values()]
    .map((b) => ({ ...b, pct: n ? Math.round((100 * b.count) / n) : 0 }))
    .sort((a, b) => (b.count - a.count) || String(a.value).localeCompare(String(b.value)));
  return { n, buckets, numeric: null };
}

/** A yes/no question = a choice question whose two options are Yes and No (English "yes"/"no" or Hebrew "כן"/"לא"). */
export function isYesNo(q) {
  if (q?.type !== 'choice' || (q.options || []).length !== 2) return false;
  const norm = (x) => String(x || '').trim().toLowerCase();
  const labels = (o) => [norm(o.en), norm(o.he)];
  const has = (l, set) => l.some((x) => set.includes(x));
  const [a, b] = q.options.map(labels);
  return (has(a, ['yes', 'כן']) && has(b, ['no', 'לא'])) || (has(a, ['no', 'לא']) && has(b, ['yes', 'כן']));
}
/**
 * Display order of the bonus questions BY TYPE (owner's order): team, player, division teams, conference teams, multiple choice
 * (yes/no right after the other multiple-choice ones), and the ranking question last. Kinds not in the owner's list (number, closest,
 * odds-based, free text) sit after the yes/no questions, before the ranking.
 */
export const BONUS_DISPLAY_ORDER = ['team', 'player', 'division_team', 'conference_team', 'choice', 'yesno', 'numeric', 'closest', 'dynamic_score', 'text', 'ranking'];
export const bonusOrderRank = (q) => {
  const i = BONUS_DISPLAY_ORDER.indexOf(isYesNo(q) ? 'yesno' : q?.type);
  return i === -1 ? BONUS_DISPLAY_ORDER.length : i;
};

// ---------------------------------------------------------------- display order: automatic (by type) or set by the admin
/**
 * The admin can put the questions in his own order (`order` = 1..N on each question). Explicit order WINS over the automatic order by type;
 * questions without `order` (e.g. created later) come after the ordered ones of their section, in the automatic order.
 */
export function compareBonusDisplay(a, b) {
  const ao = Number.isFinite(a.order);
  const bo = Number.isFinite(b.order);
  if (ao && bo) return (a.order - b.order) || ((a.deadlineMs ?? 0) - (b.deadlineMs ?? 0));
  if (ao) return -1;
  if (bo) return 1;
  return (bonusOrderRank(a) - bonusOrderRank(b)) || ((a.deadlineMs ?? 0) - (b.deadlineMs ?? 0));
}
export const hasCustomOrder = (questions) => questions.some((q) => Number.isFinite(q.order));

/**
 * The sections shown to players: General, Season, then one per month. -> [[key, questions[]], ...]
 * Automatic mode: sorted by type inside each section and the ranking question(s) in a final 'ranking' section.
 * Custom mode (any question has `order`): sorted by `order`, the ranking question stays where the admin put it.
 */
export function groupBonusQuestions(questions, { forceCustom = false } = {}) {
  const custom = forceCustom || hasCustomOrder(questions);
  const body = custom ? questions : questions.filter((q) => q.type !== 'ranking');
  const m = new Map();
  body.forEach((q) => {
    const k = q.category === 'month' ? q.month : q.category;
    if (!m.has(k)) m.set(k, []);
    m.get(k).push(q);
  });
  const rank = (k) => (k === 'general' ? '0' : k === 'season' ? '1' : `2-${k}`);
  const out = [...m.entries()].sort((a, b) => rank(a[0]).localeCompare(rank(b[0]))).map(([k, list]) => [k, [...list].sort(compareBonusDisplay)]);
  const ranking = custom ? [] : questions.filter((q) => q.type === 'ranking');
  if (ranking.length) out.push(['ranking', ranking]);
  return out;
}

/** Move one question up (delta -1) or down (+1) inside its section. -> {questionId: order} for EVERY question (a full explicit order 1..N), or null if it can't move. */
export function reorderQuestions(questions, id, delta) {
  const sections = groupBonusQuestions(questions, { forceCustom: true }).map(([k, list]) => [k, [...list]]);
  const hit = sections.find(([, list]) => list.some((q) => q.id === id));
  if (!hit) return null;
  const list = hit[1];
  const i = list.findIndex((q) => q.id === id);
  const j = i + delta;
  if (j < 0 || j >= list.length) return null;
  [list[i], list[j]] = [list[j], list[i]];
  const orders = {};
  let n = 0;
  sections.forEach(([, l]) => l.forEach((q) => { n += 1; orders[q.id] = n; }));
  return orders;
}

// Bonus questions: validation + scoring. Pure, unit-tested; used by the Cloud Functions (authoritative) and the UI (display).
import { TEAMS_BY_ABBR } from './teams.js';
import { normalizeName } from './names.js';

export const SCORABLE_TYPES = ['numeric', 'closest', 'choice', 'team', 'player', 'dynamic_score', 'text']; // 'ranking' is reserved, not scorable yet
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
    default:
      return { error: 'not-supported' };
  }
}

/**
 * Points for one user's answer. -> {pts, correct}  (correct = null while no correct answer is set).
 *  numeric: exact number -> pts.   closest: pts - penalty * |distance|, never below 0 (exact = full pts).
 *  choice/team/player: pts per correct pick (several picks allowed when q.multi), no penalty for wrong picks.
 *  dynamic_score: the points of each correct option picked.   text: normalized match against the accepted answers.
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
    case 'player': {
      const hits = [...new Set(given)].filter((g) => correct.includes(g)).length;
      return { pts: hits * q.pts, correct: hits > 0 };
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
  if (q.category === 'month' && !/^\d{4}-(0[1-9]|1[0-2])$/.test(q.month || '')) e.push('err.bqMonth');
  if (isOptionType(q.type)) {
    const o = q.options || [];
    const ok = o.length >= 2 && o.every((x) => x.id && x.he?.trim() && x.en?.trim()) && new Set(o.map((x) => x.id)).size === o.length;
    if (!ok) e.push('err.bqOptions');
    if (q.type === 'dynamic_score' && !o.every((x) => Number.isFinite(x.pts) && x.pts >= 0)) e.push('err.bqPts');
  }
  if (q.type === 'closest' && !(Number.isFinite(q.penalty) && q.penalty >= 0)) e.push('err.bqPenalty');
  if (isMultiType(q.type) && q.multi && q.maxPicks != null && !(Number.isInteger(q.maxPicks) && q.maxPicks >= 1)) e.push('err.bqMax');
  if (arr(q.answer).length > 0) {
    const okAns = q.type === 'text'
      ? q.answer.every((a) => typeof a === 'string' && a.trim() && a.length <= 200)
      : !cleanAnswer({ ...q, multi: true, maxPicks: null }, q.answer).error; // several accepted answers are allowed
    if (!okAns) e.push('err.bqAnswer');
  }
  return e;
}

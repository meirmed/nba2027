// Pure scoring functions. Used by client (provisional) and Cloud Functions (authoritative).
import { DEFAULT_SCORING } from './constants.js';

/** Always merge saved config over defaults ({...DEFAULTS, ...saved}); never use bare defaults in a display. */
export function mergeScoring(saved) {
  const s = saved || {};
  return {
    ...DEFAULT_SCORING,
    ...s,
    risk: { ...DEFAULT_SCORING.risk, ...(s.risk || {}) },
    roundMultipliers: { ...DEFAULT_SCORING.roundMultipliers, ...(s.roundMultipliers || {}) },
    diffBonus: Array.isArray(s.diffBonus) ? s.diffBonus : DEFAULT_SCORING.diffBonus,
    tiebreakers: Array.isArray(s.tiebreakers) ? s.tiebreakers : DEFAULT_SCORING.tiebreakers,
  };
}

const isNum = (n) => typeof n === 'number' && Number.isFinite(n);

/**
 * Score one game prediction.
 * pred:   { s1, s2, autoFilled? }
 * result: { s1, s2, status }   (status must be 'finished'; s1/s2 per the OT policy decided by the owner)
 * ctx:    { round, joker, pickPct, isUniqueExact, scoring }
 */
export function scoreGame(pred, result, ctx = {}) {
  const zero = { pts: 0, winnerCorrect: false, exact: false, diffPts: 0, riskPts: 0, uniquePts: 0 };
  if (!pred || !result || result.status !== 'finished') return zero;
  if (![pred.s1, pred.s2, result.s1, result.s2].every(isNum)) return zero;

  const sc = mergeScoring(ctx.scoring);
  const predMargin = pred.s1 - pred.s2;
  const realMargin = result.s1 - result.s2;
  const winnerCorrect = predMargin !== 0 && Math.sign(predMargin) === Math.sign(realMargin);
  const exact = pred.s1 === result.s1 && pred.s2 === result.s2;

  let base = 0;
  let diffPts = 0;
  let riskPts = 0;
  let uniquePts = 0;

  if (winnerCorrect) {
    base += sc.winner;
    const err = Math.abs(predMargin - realMargin); // the margin pays for EVERY right winner, an exact score has an exact margin too
    if (err === 0) diffPts = sc.diffExact;
    else { const tier = [...sc.diffBonus].sort((a, b) => a.maxErr - b.maxErr).find((t) => err <= t.maxErr); if (tier) diffPts = tier.pts; }
    base += diffPts;
    if (isNum(ctx.pickPct) && ctx.pickPct <= sc.risk.maxPickPct) { riskPts = sc.risk.pts; base += riskPts; }
  }
  if (exact) {
    base += sc.exact;
    if (ctx.isUniqueExact && !pred.autoFilled) { uniquePts = sc.unique; base += uniquePts; } // auto-filled never gets unique
  }

  let pts = base * (sc.roundMultipliers[ctx.round] ?? 1);
  if (ctx.joker) pts *= sc.jokerMultiplier;
  if (pred.autoFilled) pts = Math.floor(pts * sc.autoFillFactor);

  return { pts, winnerCorrect, exact, diffPts, riskPts, uniquePts };
}

const norm = (v) => String(v).trim().toLowerCase();

/** ONE helper for UI and functions (WC lesson #13). correct = array of accepted answers. Returns null if no answer set yet. */
export function isAnswerCorrect(correct, answer) {
  const accepted = (Array.isArray(correct) ? correct : correct == null || correct === '' ? [] : [correct]).map(norm);
  if (accepted.length === 0) return null;
  const given = (Array.isArray(answer) ? answer : answer == null || answer === '' ? [] : [answer]).map(norm);
  if (given.length === 0) return false;
  return given.every((g) => accepted.includes(g));
}

/** Leaderboard comparator driven by config tiebreakers. Rows: points/{uid} docs (+ any extra fields). */
export function compareRows(a, b, tiebreakers = DEFAULT_SCORING.tiebreakers) {
  const val = (r, k) => (k === 'total' ? r.total : k === 'bonus' ? r.bonus : r[k]) ?? 0;
  for (const k of tiebreakers) {
    const d = val(b, k) - val(a, k);
    if (d !== 0) return d;
  }
  return 0;
}

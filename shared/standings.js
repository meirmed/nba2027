// Authoritative points computation from RAW data (games + predictions). Used by the Cloud Functions (recalc, trigger,
// reconciliation) and unit-tested. Pure: no Firestore here. One module = one source of truth for every total.
import { scoreGame, mergeScoring, compareRows } from './scoring.js';
import { countsForStandings } from './games.js';
import { dayKeyOfMs } from './daykeys.js';

const sideOf = (a, b) => (a > b ? 1 : a < b ? 2 : 0);
const validPick = (p) => p && Number.isInteger(p.s1) && Number.isInteger(p.s2) && p.s1 !== p.s2;

export const emptyStats = () => ({
  gamePts: 0, gamePtsByRound: {}, gameHits: 0, exactHits: 0, winnerCorrect: 0, uniqueHits: 0, riskHits: 0, noScore: 0, jokersUsed: 0,
  gamesPlayed: 0, bestStreak: 0, curStreak: 0, bestMiss: 0, curMiss: 0,
});

/**
 * Score every pick on ONE finished game (the only place the per-game rules are applied across players).
 * game: {round, s1, s2}   picks: [{uid, p:{s1,s2,autoFilled?}, joker}]   -> {uid: scoreGame result}
 * "unique" = exactly ONE non-auto-filled exact pick.  Risk % = share of ALL valid picks on the game with the same winner.
 */
export function scoreGamePicks({ game, picks, scoring }) {
  const sc = mergeScoring(scoring);
  const valid = picks.filter(({ p }) => validPick(p));
  const out = {};
  if (valid.length === 0) return out;
  const counts = { 1: 0, 2: 0 };
  valid.forEach(({ p }) => { counts[sideOf(p.s1, p.s2)] += 1; });
  const exactManual = valid.filter(({ p }) => !p.autoFilled && p.s1 === game.s1 && p.s2 === game.s2);
  const uniqueUid = exactManual.length === 1 ? exactManual[0].uid : null;
  // exact MARGIN (right winner): includes the players who also hit the exact score, so a margin is unique only when nobody else has it
  const realMargin = game.s1 - game.s2;
  const marginManual = valid.filter(({ p }) => !p.autoFilled && realMargin !== 0 && p.s1 - p.s2 === realMargin);
  const uniqueMarginUid = marginManual.length === 1 ? marginManual[0].uid : null;
  valid.forEach(({ uid, p, joker }) => {
    out[uid] = scoreGame(p, { s1: game.s1, s2: game.s2, status: 'finished' }, {
      round: game.round, joker: !!joker, pickPct: (100 * counts[sideOf(p.s1, p.s2)]) / valid.length, isUniqueExact: uid === uniqueUid, isUniqueMargin: uid === uniqueMarginUid, scoring: sc,
    });
  });
  return out;
}

/**
 * games: [{id, round, status, t1, t2, s1, s2, tipoffMs}]   predictions: {uid: {games:{id:{s1,s2,autoFilled?}}, jokers:{id:true}}}
 * Returns {uid: {...stats, byGame:{gameId:{pts,w,x,u,r,d}}}}.  gameHits === winnerCorrect (a hit needs the right winner).
 * "unique" = exactly ONE non-auto-filled exact pick on that game.  Risk % = share of ALL picks on the game with the same winner.
 */
export function computeAllPoints({ games, predictions, uids, scoring, countedRounds, timezone = 'Asia/Jerusalem' }) {
  const sc = mergeScoring(scoring);
  const out = {};
  const seq = {};
  uids.forEach((u) => { out[u] = { ...emptyStats(), gamePtsByRound: {}, byGame: {}, byDay: {} }; seq[u] = []; });

  const finished = games
    .filter((g) => g.status === 'finished' && countsForStandings(g, countedRounds) && Number.isInteger(g.s1) && Number.isInteger(g.s2) && g.s1 !== g.s2)
    .sort((a, b) => (a.tipoffMs - b.tipoffMs) || a.id.localeCompare(b.id));

  finished.forEach((g) => {
    const picks = [];
    uids.forEach((uid) => {
      const p = predictions[uid]?.games?.[g.id];
      if (validPick(p)) picks.push({ uid, p, joker: !!predictions[uid]?.jokers?.[g.id] });
    });
    const day = dayKeyOfMs(g.tipoffMs, timezone);
    const pickBy = new Map(picks.map((x) => [x.uid, x]));
    Object.entries(scoreGamePicks({ game: g, picks, scoring: sc })).forEach(([uid, r]) => {
      const u = out[uid];
      u.gamePts += r.pts;
      u.gamePtsByRound[g.round] = (u.gamePtsByRound[g.round] || 0) + r.pts;
      u.gamesPlayed += 1;
      if (r.winnerCorrect) { u.winnerCorrect += 1; u.gameHits += 1; }
      if (r.exact) u.exactHits += 1;
      if (r.uniquePts > 0) u.uniqueHits += 1;
      if (r.riskPts > 0) u.riskHits += 1;
      const cell = (u.byDay[day] ||= [0, 0, 0, 0]); // [game points, exact hits, unique hits, correct winners] per Israel day
      cell[0] += r.pts; if (r.exact) cell[1] += 1; if (r.uniquePts > 0) cell[2] += 1; if (r.winnerCorrect) cell[3] += 1;
      const pk = pickBy.get(uid);
      // pts/w/x/u/r/d = scoring flags; s1/s2/j/a = the pick itself (score, joker, auto-filled). Only FINISHED games are here, and those picks are public.
      u.byGame[g.id] = { pts: r.pts, w: r.winnerCorrect ? 1 : 0, x: r.exact ? 1 : 0, u: r.uniquePts > 0 ? 1 : 0, r: r.riskPts > 0 ? 1 : 0, d: r.diffPts, s1: pk.p.s1, s2: pk.p.s2, j: pk.joker ? 1 : 0, a: pk.p.autoFilled ? 1 : 0 };
      seq[uid].push(r.winnerCorrect);
    });
  });

  uids.forEach((uid) => {
    let cur = 0; let best = 0; let miss = 0; let bestMiss = 0;
    seq[uid].forEach((hit) => {
      if (hit) { cur += 1; miss = 0; best = Math.max(best, cur); } else { miss += 1; cur = 0; bestMiss = Math.max(bestMiss, miss); }
    });
    // games where the player scored NOTHING (wrong winner, or no pick at all): every finished counted game minus the games that earned points
    const scored = Object.values(out[uid].byGame).filter((x) => x.pts > 0).length;
    Object.assign(out[uid], { bestStreak: best, curStreak: cur, bestMiss, curMiss: miss, noScore: finished.length - scored });
  });
  return out;
}

/**
 * Sorts by the tiebreakers and numbers the rows 1..N: every player gets his OWN number, even when two players are equal on every tiebreaker.
 * Players still tied after all the tiebreakers are ordered by name (then uid), so the order is stable and never jumps around on refresh.
 */
export function rankRows(rows, tiebreakers) {
  const byName = (r) => String(r.name || '');
  const sorted = [...rows].sort((a, b) => compareRows(a, b, tiebreakers) || byName(a).localeCompare(byName(b), 'he') || String(a.uid || '').localeCompare(String(b.uid || '')));
  return sorted.map((r, i) => ({ ...r, rank: i + 1 }));
}

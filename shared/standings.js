// Authoritative points computation from RAW data (games + predictions). Used by the Cloud Functions (recalc, trigger,
// reconciliation) and unit-tested. Pure: no Firestore here. One module = one source of truth for every total.
import { scoreGame, mergeScoring, compareRows } from './scoring.js';
import { countsForStandings } from './games.js';

const sideOf = (a, b) => (a > b ? 1 : a < b ? 2 : 0);
const validPick = (p) => p && Number.isInteger(p.s1) && Number.isInteger(p.s2) && p.s1 !== p.s2;

export const emptyStats = () => ({
  gamePts: 0, gamePtsByRound: {}, gameHits: 0, exactHits: 0, winnerCorrect: 0, uniqueHits: 0, riskHits: 0,
  gamesPlayed: 0, bestStreak: 0, curStreak: 0, bestMiss: 0, curMiss: 0,
});

/**
 * games: [{id, round, status, t1, t2, s1, s2, tipoffMs}]   predictions: {uid: {games:{id:{s1,s2,autoFilled?}}, jokers:{id:true}}}
 * Returns {uid: {...stats, byGame:{gameId:{pts,w,x,u,r,d}}}}.  gameHits === winnerCorrect (a hit needs the right winner).
 * "unique" = exactly ONE non-auto-filled exact pick on that game.  Risk % = share of ALL picks on the game with the same winner.
 */
export function computeAllPoints({ games, predictions, uids, scoring, countedRounds }) {
  const sc = mergeScoring(scoring);
  const out = {};
  const seq = {};
  uids.forEach((u) => { out[u] = { ...emptyStats(), gamePtsByRound: {}, byGame: {} }; seq[u] = []; });

  const finished = games
    .filter((g) => g.status === 'finished' && countsForStandings(g, countedRounds) && Number.isInteger(g.s1) && Number.isInteger(g.s2) && g.s1 !== g.s2)
    .sort((a, b) => (a.tipoffMs - b.tipoffMs) || a.id.localeCompare(b.id));

  finished.forEach((g) => {
    const picks = [];
    uids.forEach((uid) => { const p = predictions[uid]?.games?.[g.id]; if (validPick(p)) picks.push({ uid, p }); });
    if (picks.length === 0) return;
    const counts = { 1: 0, 2: 0 };
    picks.forEach(({ p }) => { counts[sideOf(p.s1, p.s2)] += 1; });
    const exactManual = picks.filter(({ p }) => !p.autoFilled && p.s1 === g.s1 && p.s2 === g.s2);
    const uniqueUid = exactManual.length === 1 ? exactManual[0].uid : null;

    picks.forEach(({ uid, p }) => {
      const r = scoreGame(p, { s1: g.s1, s2: g.s2, status: 'finished' }, {
        round: g.round, joker: !!predictions[uid]?.jokers?.[g.id],
        pickPct: (100 * counts[sideOf(p.s1, p.s2)]) / picks.length, isUniqueExact: uid === uniqueUid, scoring: sc,
      });
      const u = out[uid];
      u.gamePts += r.pts;
      u.gamePtsByRound[g.round] = (u.gamePtsByRound[g.round] || 0) + r.pts;
      u.gamesPlayed += 1;
      if (r.winnerCorrect) { u.winnerCorrect += 1; u.gameHits += 1; }
      if (r.exact) u.exactHits += 1;
      if (r.uniquePts > 0) u.uniqueHits += 1;
      if (r.riskPts > 0) u.riskHits += 1;
      u.byGame[g.id] = { pts: r.pts, w: r.winnerCorrect ? 1 : 0, x: r.exact ? 1 : 0, u: r.uniquePts > 0 ? 1 : 0, r: r.riskPts > 0 ? 1 : 0, d: r.diffPts };
      seq[uid].push(r.winnerCorrect);
    });
  });

  uids.forEach((uid) => {
    let cur = 0; let best = 0; let miss = 0; let bestMiss = 0;
    seq[uid].forEach((hit) => {
      if (hit) { cur += 1; miss = 0; best = Math.max(best, cur); } else { miss += 1; cur = 0; bestMiss = Math.max(bestMiss, miss); }
    });
    Object.assign(out[uid], { bestStreak: best, curStreak: cur, bestMiss, curMiss: miss });
  });
  return out;
}

/** Sorts by tiebreakers and assigns competition ranks (ties share a rank: 1,2,2,4). */
export function rankRows(rows, tiebreakers) {
  const sorted = [...rows].sort((a, b) => compareRows(a, b, tiebreakers));
  return sorted.map((r, i) => {
    const same = i > 0 && compareRows(sorted[i - 1], r, tiebreakers) === 0;
    return { ...r, rank: same ? null : i + 1 };
  }).reduce((acc, r, i) => { acc.push({ ...r, rank: r.rank ?? acc[i - 1].rank }); return acc; }, []);
}

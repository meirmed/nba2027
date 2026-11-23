// READ-ONLY report: who played a joker in a range of days, on which game, and how many points it gave (0 = the joker landed on nothing).
// Pure: scripts/joker-report.mjs reads the database. A joker counts only on a game where the player has a pick; a cancelled game never counts (the joker is free again).
import { countsForStandings } from './games.js';
import { scoreGamePicks } from './standings.js';
import { dayKeyOfMs } from './daykeys.js';

const validPick = (p) => p && Number.isInteger(p.s1) && Number.isInteger(p.s2) && p.s1 !== p.s2;

/**
 * games: [{id, round, status, t1, t2, s1, s2, tipoffMs}]  predictions: {uid: {games, jokers}}  uids: the competitors  names: {uid: name}  from / to: Israel day keys (inclusive)
 * -> { rows, finished, zero, pending }  rows: [{uid, name, day, id, t1, t2, pick, result, status, finished, pts}] (pts = the points of the pick WITH the joker, null until the game ends)
 */
export function jokerReport({ games, predictions, uids, names = {}, scoring, countedRounds, timezone = 'Asia/Jerusalem', from = null, to = null }) {
  const rows = [];
  games
    .filter((g) => g.tipoffMs && g.status !== 'cancelled' && countsForStandings(g, countedRounds))
    .forEach((g) => {
      const day = dayKeyOfMs(g.tipoffMs, timezone);
      if ((from && day < from) || (to && day > to)) return;
      const jokers = uids.filter((u) => predictions[u]?.jokers?.[g.id] && validPick(predictions[u]?.games?.[g.id]));
      if (jokers.length === 0) return;
      const finished = g.status === 'finished' && Number.isInteger(g.s1) && Number.isInteger(g.s2) && g.s1 !== g.s2;
      let res = {};
      if (finished) {
        const picks = uids.filter((u) => validPick(predictions[u]?.games?.[g.id])).map((u) => ({ uid: u, p: predictions[u].games[g.id], joker: !!predictions[u].jokers?.[g.id] }));
        res = scoreGamePicks({ game: g, picks, scoring });
      }
      jokers.forEach((u) => {
        const p = predictions[u].games[g.id];
        rows.push({ uid: u, name: names[u] || u, day, id: g.id, t1: g.t1, t2: g.t2, pick: `${p.s1}-${p.s2}`, result: finished ? `${g.s1}-${g.s2}` : '', status: g.status, finished, pts: finished ? (res[u]?.pts ?? 0) : null });
      });
    });
  rows.sort((a, b) => a.day.localeCompare(b.day) || String(a.name).localeCompare(String(b.name), 'he'));
  return { rows, finished: rows.filter((r) => r.finished), zero: rows.filter((r) => r.finished && r.pts === 0), pending: rows.filter((r) => !r.finished) };
}

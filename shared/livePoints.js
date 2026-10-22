// LIVE leaderboard: the saved points (written by the server when a game FINISHES) + the PROVISIONAL points of the games that are being played now,
// computed with the current score by the same scoring code as the server. Pure and tested; the app calls it with the live data.
import { countsForStandings } from './games.js';
import { scoreGamePicks } from './standings.js';

const r2 = (x) => Math.round(x * 100) / 100;
const RECENT_MS = 15 * 60000; // a game that just finished stays in the overlay only until the server has saved its points (and never longer than this)

/** Games that are being played, or finished a moment ago and are NOT yet in the saved points (their picks are needed). g: {id, round, status, s1, s2, updatedMs} */
export function liveGameIds({ games, countedRounds = ['RS'], lastRecalcMs = 0, nowMs = Date.now() }) {
  return games.filter((g) => countsForStandings(g, countedRounds) && (g.status === 'live' || (g.status === 'finished' && g.updatedMs > lastRecalcMs && nowMs - g.updatedMs < RECENT_MS))).map((g) => g.id);
}

/**
 * rows: points docs ({uid, total, gamePts, winnerCorrect, gameHits, exactHits, uniqueHits, noScore, ...}); picksByGame: {gameId: {uid: {s1, s2, joker, autoFilled}} | null | undefined}
 * (undefined / null = the picks are not loaded / not published yet: that game is skipped). A live game that is TIED has no winner: not scored yet.
 * Adds, for every game in play: the provisional points to total + gamePts, the correct-winner / exact / unique hits, and a "no score" for players with 0 points
 * (or no pick). Returns NEW row objects (the input is not changed). Streaks and bonus stay official. byDay stays official too, unless trackDays is on
 * (the monthly table): then byDay[g.day] = [points, exact, unique, correct winners] also gets the provisional points (g.day = the Israel date of the tip-off).
 */
export function applyLiveGames({ rows, games, picksByGame, scoring, countedRounds = ['RS'], lastRecalcMs = 0, nowMs = Date.now(), trackDays = false }) {
  const ids = new Set(liveGameIds({ games, countedRounds, lastRecalcMs, nowMs }));
  const toScore = games.filter((g) => ids.has(g.id) && Number.isInteger(g.s1) && Number.isInteger(g.s2) && g.s1 !== g.s2 && picksByGame[g.id]);
  if (toScore.length === 0) return rows;
  const scored = toScore.map((g) => {
    const picks = Object.entries(picksByGame[g.id]).map(([uid, p]) => ({ uid, p, joker: !!p.joker }));
    return { g, res: scoreGamePicks({ game: { ...g, status: 'finished' }, picks, scoring }) };
  });
  return rows.map((row) => {
    const out = { ...row };
    scored.forEach(({ g, res }) => {
      const sc = res[row.uid];
      if (!sc) { out.noScore = (out.noScore ?? 0) + 1; return; } // no pick in this game
      out.gamePts = r2((out.gamePts ?? 0) + sc.pts);
      out.total = r2((out.total ?? 0) + sc.pts);
      if (sc.winnerCorrect) { out.winnerCorrect = (out.winnerCorrect ?? 0) + 1; out.gameHits = (out.gameHits ?? 0) + 1; }
      if (sc.exact) out.exactHits = (out.exactHits ?? 0) + 1;
      if (sc.uniquePts > 0) out.uniqueHits = (out.uniqueHits ?? 0) + 1;
      if (sc.pts === 0) out.noScore = (out.noScore ?? 0) + 1;
      if (trackDays && g.day) { // the per-day cell of the monthly table: [game points, exact hits, unique hits]
        const cell = [0, 1, 2, 3].map((i) => out.byDay?.[g.day]?.[i] ?? 0); // older saved days have only 3 numbers
        cell[0] = r2(cell[0] + sc.pts);
        if (sc.exact) cell[1] += 1;
        if (sc.uniquePts > 0) cell[2] += 1;
        if (sc.winnerCorrect) cell[3] += 1;
        out.byDay = { ...out.byDay, [g.day]: cell };
      }
    });
    return out;
  });
}

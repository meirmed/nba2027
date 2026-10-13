import { dayKeyOfMs } from './daykeys.js';
import { countsForStandings } from './games.js';

/** A game "night" runs 08:00 -> 08:00 Israel time, so a 03:00 tip-off still belongs to the evening before. */
export const NIGHT_SHIFT_MS = 8 * 3600000;

/**
 * ⭐ Star of the night = the player with the most GAME points in the latest night whose games have ALL finished
 * (ties: more exact hits, then more unique hits). Bonus points / manual adjustments are not part of it.
 * games: [{id, round, status, tipoffMs}], results: {uid: {byGame: {gameId: {pts, x, u}}}} (from computeAllPoints).
 * -> null (no complete night yet) | {night: 'YYYY-MM-DD', games: n, top: [{uid, pts, exact, unique}] (best first, up to `top`)}
 */
export function starOfNight({ games, results, countedRounds = ['RS'], timezone = 'Asia/Jerusalem', top = 3 }) {
  const nights = new Map();
  games.filter((g) => countsForStandings(g, countedRounds)).forEach((g) => {
    const k = dayKeyOfMs(g.tipoffMs - NIGHT_SHIFT_MS, timezone);
    if (!nights.has(k)) nights.set(k, []);
    nights.get(k).push(g);
  });
  const complete = [...nights.entries()].filter(([, gs]) => gs.every((g) => g.status === 'finished')).sort((a, b) => b[0].localeCompare(a[0]));
  if (complete.length === 0) return null;
  const [night, gs] = complete[0];
  const rows = Object.entries(results).map(([uid, r]) => {
    let pts = 0; let exact = 0; let unique = 0; let played = 0;
    gs.forEach((g) => { const x = r.byGame?.[g.id]; if (x) { pts += x.pts; exact += x.x; unique += x.u; played += 1; } });
    return { uid, pts, exact, unique, played };
  }).filter((r) => r.played > 0 && r.pts > 0)
    .sort((a, b) => (b.pts - a.pts) || (b.exact - a.exact) || (b.unique - a.unique) || a.uid.localeCompare(b.uid))
    .slice(0, top).map(({ uid, pts, exact, unique }) => ({ uid, pts, exact, unique }));
  return { night, games: gs.length, top: rows };
}

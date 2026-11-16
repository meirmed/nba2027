// Where the players stood at the end of a day, and how far each of them moved over the latest day with points (the arrows of the Home page top 5).
import { addDaysToKey } from './daykeys.js';

const r2 = (x) => Math.round(x * 100) / 100;
const byName = (a, b) => String(a.name || '').localeCompare(String(b.name || ''), 'he') || String(a.uid).localeCompare(String(b.uid));

/**
 * The table as it was at the end of `uptoDay`: the game points of the days up to it (byDay, with the joker) + the bonus and adjustments as they are now.
 * rank = 1 + the number of players with MORE points (equal points share a rank, so a tie at the start of the season is not a "move").
 */
export function rankAt(rows, uptoDay) {
  const list = rows.map((r) => {
    let g = 0;
    Object.entries(r.byDay || {}).forEach(([day, c]) => { if (day <= uptoDay) g += c[0] || 0; });
    return { uid: r.uid, name: r.name, pts: r2(g + (r.bonus ?? 0) + (r.adjust ?? 0)) };
  }).sort((a, b) => b.pts - a.pts || byName(a, b));
  return list.map((x) => ({ ...x, rank: 1 + list.filter((y) => y.pts > x.pts).length }));
}

/**
 * Movement over the LATEST day that has points: rank at the end of the day before it -> rank now (equal points share a rank).
 * rows: points rows with byDay (the live ones are fine). -> {day, moves: {uid: places climbed (positive) or lost (negative)}}; no moves on the first game day (everybody was at 0).
 */
export function rankMoves(rows) {
  let last = null;
  rows.forEach((r) => Object.entries(r.byDay || {}).forEach(([d, c]) => { if ((c[0] || 0) > 0 && (!last || d > last)) last = d; }));
  if (!last) return { day: null, moves: {} };
  const beforeTable = rankAt(rows, addDaysToKey(last, -1));
  if (!beforeTable.some((x) => x.pts > 0)) return { day: last, moves: {} }; // the first game day of the season: everybody was tied at 0, so nobody "moved"
  const was = new Map(beforeTable.map((x) => [x.uid, x.rank]));
  const moves = {};
  rankAt(rows, last).forEach((x) => { const w = was.get(x.uid); if (w && w !== x.rank) moves[x.uid] = w - x.rank; });
  return { day: last, moves };
}

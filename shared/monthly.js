// "Champion of the month": a separate ranking for every calendar month, from November, made ONLY of game points (no bonus questions), built from the
// per-day points the server already stores (points/{uid}.byDay[day] = [game points, exact hits, unique hits], day = Israel date of the tip-off).

export const MONTHLY_CHAMPION_FROM = '2026-11'; // the first month (the season starts on Oct 20; October is not part of it)
export const MONTHLY_CHAMPION_UNTIL = '2027-04'; // the last month of the regular season (Apr 1-11)

const nextMonth = (m) => { const [y, mo] = m.split('-').map(Number); return mo === 12 ? `${y + 1}-01` : `${y}-${String(mo + 1).padStart(2, '0')}`; };
const r2 = (x) => Math.round(x * 100) / 100;

/** The months to show as tabs: from November up to the CURRENT month (a new one appears on the 1st), never past the last month of the season. */
export function monthKeys(todayKey, from = MONTHLY_CHAMPION_FROM, until = MONTHLY_CHAMPION_UNTIL) {
  const current = todayKey.slice(0, 7);
  const last = current < until ? current : until;
  const out = [];
  for (let m = from; m <= last; m = nextMonth(m)) out.push(m);
  return out;
}

/** rows + {mPts, mExact, mUnique} = game points / exact hits / unique hits of that month (rows are not changed). */
export function monthlyRows(rows, monthKey) {
  const lo = `${monthKey}-01`;
  const hi = `${monthKey}-31`;
  return rows.map((r) => {
    let pts = 0; let ex = 0; let un = 0;
    Object.entries(r.byDay || {}).forEach(([day, cell]) => { if (day >= lo && day <= hi) { pts += cell[0] || 0; ex += cell[1] || 0; un += cell[2] || 0; } });
    return { ...r, mPts: r2(pts), mExact: ex, mUnique: un };
  });
}

/** The leader(s) of the month: the best (points, exact hits, unique hits); everyone equal on all three shares the lead (a real tie). [] while nobody has points. */
export function monthChampions(monthRows) {
  const cmp = (a, b) => (b.mPts - a.mPts) || (b.mExact - a.mExact) || (b.mUnique - a.mUnique);
  const sorted = [...monthRows].sort(cmp);
  if (sorted.length === 0 || sorted[0].mPts <= 0) return [];
  return sorted.filter((r) => cmp(r, sorted[0]) === 0);
}

/** A month is OVER when its last day has passed AND none of its games is still waiting / being played (so a champion is never crowned too early). games: [{dayKey, status}] */
export function monthFinished({ monthKey, todayKey, games }) {
  if (todayKey <= `${monthKey}-31`) return false;
  return !games.some((g) => g.dayKey.startsWith(monthKey) && (g.status === 'scheduled' || g.status === 'live'));
}

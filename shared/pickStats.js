// Statistics of the picks of ONE game ("Everyone's picks"): who the players think will win, the average score and margin, the most popular exact
// score and how the predicted margins are spread. Only REAL picks count: the auto-filled ones are random numbers and would distort everything.

const BUCKETS = [['1-5', 1, 5], ['6-10', 6, 10], ['11-15', 11, 15], ['16+', 16, Infinity]];

/** Percentages that add up to exactly 100 (largest remainder), for counts out of `total`. */
function percents(counts, total) {
  const raw = counts.map((c) => (100 * c) / total);
  const out = raw.map(Math.floor);
  let left = 100 - out.reduce((a, b) => a + b, 0);
  raw.map((r, i) => [r - Math.floor(r), i]).sort((a, b) => b[0] - a[0] || a[1] - b[1]).forEach(([, i]) => { if (left > 0 && counts[i] > 0) { out[i] += 1; left -= 1; } });
  return out;
}

/**
 * picks: [{s1, s2, autoFilled?}] (s1 = the home team's score). -> null when there is no real pick, else
 * { n, home, away, tie, homePct, awayPct, tiePct, avgHome, avgAway, avgMargin, popular: {count, scores: ['110-105', ...]}, buckets: [{key, count}] }
 * avgMargin = the average SIZE of the predicted win (|home - away|); popular.scores is empty when every pick is different (count 1).
 */
export function pickStats(picks) {
  const real = (picks || []).filter((p) => p && !p.autoFilled && Number.isInteger(p.s1) && Number.isInteger(p.s2));
  const n = real.length;
  if (n === 0) return null;
  let home = 0; let away = 0; let tie = 0; let sumHome = 0; let sumAway = 0; let sumAbs = 0;
  const scores = new Map();
  const buckets = BUCKETS.map(([key]) => ({ key, count: 0 }));
  real.forEach((p) => {
    const m = p.s1 - p.s2;
    sumHome += p.s1; sumAway += p.s2; sumAbs += Math.abs(m);
    if (m > 0) home += 1; else if (m < 0) away += 1; else tie += 1;
    const key = `${p.s1}-${p.s2}`;
    scores.set(key, (scores.get(key) || 0) + 1);
    if (m !== 0) buckets[BUCKETS.findIndex(([, lo, hi]) => Math.abs(m) >= lo && Math.abs(m) <= hi)].count += 1;
  });
  const [homePct, awayPct, tiePct] = percents([home, away, tie], n);
  const top = Math.max(...scores.values());
  const popular = { count: top, scores: top >= 2 ? [...scores.entries()].filter(([, c]) => c === top).map(([s]) => s).sort().slice(0, 3) : [] };
  return { n, home, away, tie, homePct, awayPct, tiePct, avgHome: Math.round(sumHome / n), avgAway: Math.round(sumAway / n), avgMargin: Math.round(sumAbs / n), popular, buckets };
}

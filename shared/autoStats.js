// The "🎲" tab of the leaderboard: how many games each player got a RANDOM (auto-filled) result in, the points those picks earned and the % of them with the right winner.
// Source: pointsDetail/{uid}.byGame (finished games only; any signed-in user can read it): per game {pts, w: right winner 0/1, a: auto-filled 0/1, ...}.
const r2 = (x) => Math.round(x * 100) / 100;
const byName = (a, b) => String(a.name || '').localeCompare(String(b.name || ''), 'he') || String(a.uid).localeCompare(String(b.uid));

/** One player: {games, pts, winners} of the auto-filled picks. pts is what the pick really got (the auto-fill factor is already applied). */
export function autoStatsOf(byGame = {}) {
  let games = 0; let pts = 0; let winners = 0;
  Object.values(byGame || {}).forEach((g) => {
    if (g?.a !== 1) return;
    games += 1; pts += g.pts || 0;
    if (g.w === 1) winners += 1;
  });
  return { games, pts: r2(pts), winners };
}

/** The table: every player with the stats of his auto-filled picks, from the most random games to the fewest (ties: more points, then the name). pct = winners / games (0 without games). */
export function autoRows(players, detailByUid = {}) {
  return players
    .map((p) => { const s = autoStatsOf(detailByUid[p.uid]?.byGame); return { ...p, ...s, pct: s.games > 0 ? s.winners / s.games : 0 }; })
    .sort((a, b) => b.games - a.games || b.pts - a.pts || byName(a, b));
}

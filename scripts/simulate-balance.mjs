// Is the bonus worth enough compared with the games? Simulates whole seasons with the REAL scoring code.
// Run:  node scripts/simulate-balance.mjs        (edit the ASSUMPTIONS below to match your real questions)
import { TEAMS } from '../shared/teams.js';
import { makeAutoPick } from '../shared/autofill.js';
import { computeAllPoints } from '../shared/standings.js';
import { computeBonusPoints, EAST_TEAMS, WEST_TEAMS, maxBonusPoints } from '../shared/bonus.js';
import { rng } from './lib/simulate.mjs';

// ------------------------------------------------------------------ ASSUMPTIONS (edit me)
const A = {
  players: 60, days: 165, seasons: 120,       // 120 simulated seasons per scenario, for stable averages
  gamesPerDayChoices: [1, 2],                 // "1 or 2 games per day" -> ~248 games
  missRates: [[0.6, 0.02], [0.3, 0.08], [0.1, 0.25]], // share of players -> share of games they forget (auto-filled)
  sigmaRange: [4.5, 11],                      // a player's typical error (points) in predicting the margin: lower = better predictor
  bonusScales: [1, 1.5, 2, 3],                // multiply every bonus point value: what if the bonus were worth more?
};
// bonus questions: type + points. EXISTING = what you already created (I don't know them: replace with yours). NEW = the 15 more.
const opts3 = (pts) => [{ id: 'a', pts: pts[0] }, { id: 'b', pts: pts[1] }, { id: 'c', pts: pts[2] }];
const EXISTING = [
  { type: 'numeric', pts: 6 }, { type: 'numeric', pts: 4 }, { type: 'closest', pts: 10, truth: 20, sd: 5 }, { type: 'closest', pts: 8, truth: 120, sd: 18 },
  { type: 'choice', pts: 5, k: 3 }, { type: 'dynamic_score', pts: 0, options: opts3([4, 12, 30]), odds: [0.5, 0.35, 0.15] },
  { type: 'team', pts: 3, multi: true, maxPicks: 4 }, { type: 'text', pts: 4 }, { type: 'ranking', pts: 50, penalty: 0.5 },
];
const NEW15 = [
  ...Array(4).fill({ type: 'choice', pts: 10, k: 5 }), ...Array(3).fill({ type: 'player', pts: 10 }),
  ...Array(2).fill({ type: 'closest', pts: 10, truth: 50, sd: 9 }), ...Array(2).fill({ type: 'numeric', pts: 8 }),
  ...Array(2).fill({ type: 'dynamic_score', pts: 0, options: opts3([5, 15, 40]), odds: [0.5, 0.35, 0.15] }),
  ...Array(2).fill({ type: 'team', pts: 3, multi: true, maxPicks: 4 }),
];
// ------------------------------------------------------------------

const mean = (a) => a.reduce((s, x) => s + x, 0) / a.length;
const sd = (a) => { const m = mean(a); return Math.sqrt(mean(a.map((x) => (x - m) ** 2))); };

function season(seed, scale) {
  const r = rng(seed);
  const int = (lo, hi) => lo + Math.floor(r() * (hi - lo + 1));
  const normal = (m = 0, s = 1) => m + s * Math.sqrt(-2 * Math.log(1 - r())) * Math.cos(2 * Math.PI * r());
  const uids = Array.from({ length: A.players }, (_, i) => `u${i}`);

  // players: game skill (sigma), forgetfulness, bonus skill (correlated with game skill)
  const P = uids.map(() => {
    const u = r(); const sigma = A.sigmaRange[0] + u * (A.sigmaRange[1] - A.sigmaRange[0]);
    let roll = r(); let miss = A.missRates[0][1]; for (const [share, m] of A.missRates) { if (roll < share) { miss = m; break; } roll -= share; }
    const s = Math.min(1, Math.max(0, 1 - u + normal(0, 0.2)));
    return { sigma, miss, s };
  });

  // games: 1 or 2 per day
  const games = []; const truth = [];
  for (let d = 0; d < A.days; d += 1) {
    const n = A.gamesPerDayChoices[int(0, A.gamesPerDayChoices.length - 1)];
    for (let k = 0; k < n; k += 1) {
      const mu = normal(2, 6); let margin = Math.round(mu + normal(0, 12)); if (margin === 0) margin = 1;
      const total = Math.round(normal(224, 14)); const s1 = Math.round((total + margin) / 2);
      const t1 = TEAMS[int(0, 29)].abbr; let t2 = TEAMS[int(0, 29)].abbr; if (t2 === t1) t2 = TEAMS[(TEAMS.findIndex((x) => x.abbr === t1) + 1) % 30].abbr;
      games.push({ id: `g${d}-${k}`, round: 'RS', status: 'finished', t1, t2, s1, s2: s1 - margin, tipoffMs: Date.UTC(2026, 9, 21) + d * 86400000 + k * 3600000 });
      truth.push(mu);
    }
  }
  const predictions = {}; let correct = 0; let picks = 0;
  uids.forEach((uid, i) => {
    const p = P[i]; const gm = {}; const conf = [];
    games.forEach((g, gi) => {
      if (r() < p.miss) { gm[g.id] = { ...makeAutoPick(r), autoFilled: true }; return; }
      let pm = Math.round(truth[gi] + normal(0, p.sigma)); if (pm === 0) pm = r() < 0.5 ? 1 : -1;
      const tot = Math.round(normal(224, 8)); const s1 = Math.round((tot + pm) / 2);
      gm[g.id] = { s1, s2: s1 - pm }; conf.push([g.id, Math.abs(pm)]);
      picks += 1; if ((pm > 0) === (g.s1 > g.s2)) correct += 1;
    });
    const jokers = {}; conf.sort((a, b) => b[1] - a[1]).slice(0, 3).forEach(([id]) => { jokers[id] = true; }); // jokers on the most confident picks
    predictions[uid] = { games: gm, jokers, bonus: {} };
  });

  // bonus questions (scaled), answers by skill
  const qs = [...EXISTING, ...NEW15].map((spec, qi) => {
    const q = { id: `q${qi}`, category: 'season', type: spec.type, pts: spec.pts * scale, penalty: spec.penalty, multi: spec.multi, maxPicks: spec.maxPicks };
    if (spec.options) q.options = spec.options.map((o) => ({ ...o, pts: o.pts * scale }));
    return { q, spec };
  });
  const fin = [...EAST_TEAMS, ...WEST_TEAMS];
  qs.forEach(({ q, spec }) => {
    const T = spec.truth ?? int(5, 25);
    if (q.type === 'numeric') q.answer = [String(T)];
    else if (q.type === 'closest') q.answer = [String(T)];
    else if (q.type === 'choice') q.answer = ['o0'];
    else if (q.type === 'player') q.answer = ['p0'];
    else if (q.type === 'team') q.answer = ['BOS', 'DEN', 'OKC', 'NYK'];
    else if (q.type === 'text') q.answer = ['jokic'];
    else if (q.type === 'ranking') q.answer = fin;
    else if (q.type === 'dynamic_score') { const x = r(); q.answer = [x < spec.odds[0] ? 'a' : x < spec.odds[0] + spec.odds[1] ? 'b' : 'c']; }
    uids.forEach((uid, i) => {
      const s = P[i].s; if (r() < 0.04) return; // a few players skip a question
      let a;
      if (q.type === 'numeric') a = [String(r() < 0.06 + 0.12 * s ? T : T + (r() < 0.5 ? -1 : 1) * int(1, 6))];
      else if (q.type === 'closest') a = [String(Math.round(T + normal(0, spec.sd * (1.8 - 1.2 * s))))];
      else if (q.type === 'choice') a = [r() < 1 / spec.k + 0.3 * s ? 'o0' : `o${int(1, spec.k - 1)}`];
      else if (q.type === 'player') a = [r() < 0.05 + 0.25 * s ? 'p0' : `p${int(1, 24)}`];
      else if (q.type === 'text') a = [r() < 0.15 + 0.3 * s ? 'Jokic' : 'someone'];
      else if (q.type === 'dynamic_score') { const x = r(); a = [x < spec.odds[0] ? 'a' : x < spec.odds[0] + spec.odds[1] ? 'b' : 'c']; }
      else if (q.type === 'team') { const pickSet = new Set(); while (pickSet.size < 4) pickSet.add(r() < 0.13 + 0.35 * s ? q.answer[int(0, 3)] : TEAMS[int(0, 29)].abbr); a = [...pickSet]; }
      else { const sg = 1.5 + 3.5 * (1 - s); const ord = (list) => list.map((t, k) => [t, k + normal(0, sg)]).sort((x, y) => x[1] - y[1]).map(([t]) => t); a = [...ord(EAST_TEAMS), ...ord(WEST_TEAMS)]; }
      predictions[uid].bonus[q.id] = { answer: a };
    });
  });
  const questions = qs.map(({ q }) => q);
  const G = computeAllPoints({ games, predictions, uids, scoring: undefined, countedRounds: ['RS'], timezone: 'Asia/Jerusalem' });
  const B = computeBonusPoints({ questions, predictions, uids });
  return { uids, games: games.length, acc: correct / picks, G: uids.map((u) => G[u].gamePts), B: uids.map((u) => B[u].bonus), maxBonus: questions.reduce((s, q) => s + maxBonusPoints(q), 0) };
}

const rank = (a) => { const o = a.map((v, i) => [v, i]).sort((x, y) => y[0] - x[0]); const rk = []; o.forEach(([, i], k) => { rk[i] = k; }); return rk; };
console.log(`players ${A.players}, ${A.days} days, 1-2 games/day, bonus questions: ${EXISTING.length} assumed existing + ${NEW15.length} new = ${EXISTING.length + NEW15.length}\n`);
const header = ['bonus value', 'max bonus', 'avg game pts', 'avg bonus pts', 'bonus share of total', 'spread (sd) games / bonus', 'winner changes by bonus', 'avg rank shift by bonus', 'top-10 changes'];
console.log(header.join(' | '));
for (const scale of A.bonusScales) {
  const rows = { gAvg: [], bAvg: [], share: [], sdG: [], sdB: [], winner: [], shift: [], top10: [], maxB: 0, acc: [], games: 0 };
  for (let k = 0; k < A.seasons; k += 1) {
    const s = season(1000 + k, scale);
    const T = s.G.map((g, i) => g + s.B[i]);
    rows.gAvg.push(mean(s.G)); rows.bAvg.push(mean(s.B)); rows.share.push(mean(s.B) / mean(T));
    rows.sdG.push(sd(s.G)); rows.sdB.push(sd(s.B)); rows.maxB = s.maxBonus; rows.acc.push(s.acc); rows.games = s.games;
    const rg = rank(s.G); const rt = rank(T);
    rows.winner.push(rg.indexOf(0) !== rt.indexOf(0) ? 1 : 0);
    rows.shift.push(mean(rg.map((x, i) => Math.abs(x - rt[i]))));
    const top = (rk) => new Set(rk.map((x, i) => [x, i]).filter(([x]) => x < 10).map(([, i]) => i));
    const a = top(rg); const b = top(rt); rows.top10.push([...a].filter((x) => !b.has(x)).length);
  }
  console.log([`x${scale}`, Math.round(rows.maxB), Math.round(mean(rows.gAvg)), Math.round(mean(rows.bAvg)), `${(100 * mean(rows.share)).toFixed(1)}%`,
    `${Math.round(mean(rows.sdG))} / ${Math.round(mean(rows.sdB))}`, `${Math.round(100 * mean(rows.winner))}%`, mean(rows.shift).toFixed(1), `${mean(rows.top10).toFixed(1)} of 10`].join(' | '));
  if (scale === 1) console.log(`   (games per season: ${rows.games}, average winner accuracy of the players: ${(100 * mean(rows.acc)).toFixed(0)}%)`);
}

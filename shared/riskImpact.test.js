import { describe, it, expect } from 'vitest';
import { groupsImpact, riskImpact, scoreGamePicksLegacy, scoreGamePicksProposed } from './riskImpact.js';
import { buildSeason } from '../scripts/lib/simulate.mjs';

// a game that ends away: 100 - 110 (the home team scores s1)
const GAME = { id: 'g1', round: 'RS', status: 'finished', s1: 100, s2: 110, tipoffMs: Date.parse('2026-11-05T18:00:00Z') };
const home = (extra = {}) => ({ s1: 110, s2: 100, ...extra });
const away = (extra = {}) => ({ s1: 100, s2: 108, ...extra }); // the right winner (away), margin 8 (the real margin is 10)
const picksOf = (spec) => Object.entries(spec).map(([uid, [p, joker]]) => ({ uid, p, joker: !!joker }));
const many = (prefix, n, p) => Object.fromEntries(Array.from({ length: n }, (_, i) => [`${prefix}${i}`, [p]]));

describe('the courage bonus: the rule that runs now vs the old rule', () => {
  it('REAL picks only: autos on the other side no longer dilute the percentage (2 of 20 real = 10%: bonus; before: 5 of 26 = 19%: none)', () => {
    const picks = picksOf({ ...many('h', 18, home()), ...many('a', 2, away()), ...many('xh', 3, home({ autoFilled: true })), ...many('xa', 3, away({ autoFilled: true })) });
    const today = scoreGamePicksLegacy({ game: GAME, picks });
    const proposed = scoreGamePicksProposed({ game: GAME, picks });
    expect(today.a0.riskPts).toBe(0);
    expect(proposed.a0.riskPts).toBe(2); // the default bonus
    expect(proposed.a0.pts).toBe(today.a0.pts + 2);
    expect(proposed.xa0.riskPts).toBe(0); // an auto-filled pick never gets it
  });
  it('an auto-filled pick that got the bonus today loses it (its points were halved, floored)', () => {
    const picks = picksOf({ ...many('h', 19, home()), r: [away()], x: [away({ autoFilled: true })] });
    const today = scoreGamePicksLegacy({ game: GAME, picks });
    expect(today.x.riskPts).toBeGreaterThan(0); // 2 of 21 = 9.5% <= 10%
    const proposed = scoreGamePicksProposed({ game: GAME, picks });
    expect(proposed.x.riskPts).toBe(0);
    expect(proposed.x.pts).toBeLessThan(today.x.pts);
    expect(proposed.r.riskPts).toBeGreaterThan(0); // the real pick keeps it (1 of 20 = 5%)
  });
  it('a REAL pick can lose the bonus too: 3 of 20 real = 15% (before: 4 of 40 = 10%, thanks to the autos)', () => {
    const picks = picksOf({ ...many('h', 17, home()), ...many('a', 3, away()), ...many('xh', 19, home({ autoFilled: true })), x1: [away({ autoFilled: true })] });
    expect(scoreGamePicksLegacy({ game: GAME, picks }).a0.riskPts).toBeGreaterThan(0);
    expect(scoreGamePicksProposed({ game: GAME, picks }).a0.riskPts).toBe(0);
  });
  it('only auto-filled picks on the game: nobody gets the bonus, nothing breaks', () => {
    const out = scoreGamePicksProposed({ game: GAME, picks: picksOf(many('x', 4, away({ autoFilled: true }))) });
    expect(Object.values(out).every((r) => r.riskPts === 0)).toBe(true);
  });
  it('everything else is unchanged: winner, margin, exact score, the unique bonuses, the joker', () => {
    const picks = picksOf({ ...many('h', 10, home()), e: [{ s1: 100, s2: 110 }, true], m: [{ s1: 90, s2: 100 }], x: [{ s1: 100, s2: 110, autoFilled: true }] });
    const a = scoreGamePicksLegacy({ game: GAME, picks }); const b = scoreGamePicksProposed({ game: GAME, picks });
    Object.keys(a).forEach((u) => {
      expect(b[u].winnerCorrect).toBe(a[u].winnerCorrect); expect(b[u].exact).toBe(a[u].exact); expect(b[u].uniquePts).toBe(a[u].uniquePts);
      expect(b[u].diffPts).toBe(a[u].diffPts);
    });
  });
});

describe('riskImpact: the comparison over a season', () => {
  const season = buildSeason({ users: 23, days: 40, gamesPerDay: 1.5, seed: 5 });
  const base = { games: season.games, predictions: season.predictions, uids: season.uids, countedRounds: ['RS'] };

  it('if nobody was auto-filled, NOTHING changes: no game, no player, no rank', () => {
    const real = Object.fromEntries(Object.entries(season.predictions).map(([u, d]) => [u, { ...d, games: Object.fromEntries(Object.entries(d.games).filter(([, p]) => !p.autoFilled)) }]));
    const r = riskImpact({ ...base, predictions: real, totals: Object.fromEntries(season.uids.map((u) => [u, 100])) });
    expect(r.summary.gamesAffected).toBe(0);
    expect(r.summary.autoPicks).toBe(0);
    expect(r.summary.pointsRemoved + r.summary.pointsAdded).toBe(0);
    expect(r.rankChanges).toEqual([]);
    expect(Object.keys(r.byPlayer)).toEqual([]);
  });
  it('with auto-filled picks: counts, totals that add up, and only games that have an auto-filled pick can change', () => {
    const r = riskImpact(base);
    expect(season.autoFilledCount).toBeGreaterThan(0);
    expect(r.summary.autoPicks).toBe(season.autoFilledCount);
    expect(r.summary.gamesAffected).toBeLessThanOrEqual(r.summary.gamesWithAuto);
    const sumPlayers = Object.values(r.byPlayer).reduce((a, x) => a + x.delta, 0);
    expect(Math.round((r.summary.pointsAdded - r.summary.pointsRemoved) * 100) / 100).toBe(Math.round(sumPlayers * 100) / 100);
    expect(r.games.every((x) => x.autos > 0)).toBe(true);
    // the bonus counts: today - lost + gained = proposed
    expect(r.summary.riskBonusesOld - r.summary.autoLost - r.summary.realLost + r.summary.realGained).toBe(r.summary.riskBonusesNew);
    expect(r.summary.uniqueChanged).toBe(0); // the unique rules did not change
  });
  it('the check against the database: equal numbers = no mismatch; a different stored number is reported', () => {
    const t = riskImpact({ ...base, storedGamePts: {} }).check.mismatches.length; // empty stored values: everybody differs
    expect(t).toBeGreaterThan(0);
    const today = Object.fromEntries(season.uids.map((u) => [u, 0]));
    // use the very same engine to build "the database"
    return import('./standings.js').then(({ computeAllPoints }) => {
      const res = computeAllPoints({ ...base, scoring: undefined, countedRounds: ['RS'] });
      Object.keys(res).forEach((u) => { today[u] = res[u].gamePts; });
      expect(riskImpact({ ...base, storedGamePts: today }).check.mismatches).toEqual([]);
    });
  });
  it('rank changes are computed from the current totals plus the player deltas', () => {
    const r0 = riskImpact(base);
    const totals = Object.fromEntries(season.uids.map((u, i) => [u, 1000 - i])); // one point apart: any change of 2 points moves somebody
    const r = riskImpact({ ...base, totals });
    r.rankChanges.forEach((c) => { expect(c.after).toBeCloseTo(c.total + (r0.byPlayer[c.uid]?.delta ?? 0), 6); expect(c.from).not.toBe(c.to); });
  });
});

describe('groupsImpact: the mid-season tournament groups under both rules', () => {
  const cell = (x) => [x, 0, 0, 0, x];
  const prow = (uid, o) => ({ uid, name: uid, byDay: Object.fromEntries(Object.entries(o).map(([d, x]) => [d, cell(x)])), total: 100 });
  const rows = [prow('a', { '2026-11-02': 10 }), prow('b', { '2026-11-02': 9 }), prow('c', { '2026-11-02': 5 }), prow('d', { '2026-11-02': 1 }),
    prow('e', { '2026-11-02': 20 }), prow('f', { '2026-11-02': 10 }), prow('g', { '2026-11-02': 9 }), prow('h', {}), prow('x', { '2026-11-02': 7 }), prow('y', { '2026-11-02': 3 }), prow('z', {})];
  const mid = { groups: { A: ['a', 'b', 'c', 'd'], B: ['e', 'f', 'g', 'h'], C: ['x', 'y', 'z'] } };
  const delta = (noJoker, pts = noJoker) => ({ delta: pts, deltaNoJoker: noJoker, games: 1, byDay: { '2026-11-02': { pts, noJoker } } });
  const run = (byPlayer) => groupsImpact({ mid, pointsRows: rows, byPlayer, todayKey: '2026-11-18' });

  it('+2 for b passes a: the order of group A changes, but the two qualifiers are the same players', () => {
    const g = run({ b: delta(2) }).groups.find((x) => x.group === 'A');
    expect(g.before.map((r) => r.uid)).toEqual(['a', 'b', 'c', 'd']);
    expect(g.after.map((r) => r.uid)).toEqual(['b', 'a', 'c', 'd']);
    expect(g).toMatchObject({ touched: true, orderChanged: true, topTwoChanged: false });
  });
  it('+2 for g passes f: the second qualifying place of group B changes hands', () => {
    const r = run({ g: delta(2) });
    const g = r.groups.find((x) => x.group === 'B');
    expect(g).toMatchObject({ orderChanged: true, topTwoChanged: true, gapBefore: 1 });
    expect(r.anyTopTwoChange).toBe(true);
  });
  it('a group nobody touched does not change; the gap between the 2nd and 3rd place is reported', () => {
    const r = run({ b: delta(2) });
    const c = r.groups.find((x) => x.group === 'C');
    expect(c).toMatchObject({ touched: false, orderChanged: false, topTwoChanged: false });
    expect(r.anyTopTwoChange).toBe(false);
    expect(r.groups.find((x) => x.group === 'A')).toMatchObject({ gapBefore: 4, gapAfter: 5 }); // 2nd-3rd place: b 9 - c 5 = 4 before; after b's +2 the 2nd is a (10): 10 - 5 = 5
  });
  it('the tournament counts the points WITHOUT the joker: a joker-only difference does not move the table', () => {
    const r = run({ b: delta(0, 18) }); // b's points grow only by the joker's doubling (18 with it, 0 without)
    expect(r.groups.find((x) => x.group === 'A').orderChanged).toBe(false);
  });
  it('no groups set: nothing to compare', () => {
    expect(groupsImpact({ mid: null, pointsRows: rows, byPlayer: {}, todayKey: '2026-11-18' })).toBeNull();
    expect(groupsImpact({ mid: { groups: { A: [], B: [], C: [], D: [] } }, pointsRows: rows, byPlayer: {}, todayKey: '2026-11-18' })).toBeNull();
  });
});

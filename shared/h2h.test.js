import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { windowStats, decideMatch, resolvePair, rankGroup, drawGroups, seedQualifiers, pairSeeds, closeStagePatch, activeStageId, prevDayKey, DEFAULT_H2H_TIEBREAKERS, funPairResult } from './h2h.js';

const side = (pts, exactHits = 0, uniqueHits = 0, seed = null, adv = 0, winners = 0, total = 0) => ({ stats: { pts, winners, exactHits, uniqueHits, total }, seed, adv });

describe('windowStats', () => {
  const byDay = { '2026-10-20': [10, 1, 0], '2026-10-21': [5, 0, 1], '2026-10-25': [7, 1, 1] };
  it('sums inclusive windows and handles open ends', () => {
    expect(windowStats(byDay, '2026-10-21', '2026-10-25')).toEqual({ pts: 12, winners: 0, exactHits: 1, uniqueHits: 2 });
    expect(windowStats(byDay, null, '2026-10-20')).toEqual({ pts: 10, winners: 0, exactHits: 1, uniqueHits: 0 });
    expect(windowStats(byDay)).toEqual({ pts: 22, winners: 0, exactHits: 2, uniqueHits: 2 });
    expect(windowStats(undefined)).toEqual({ pts: 0, winners: 0, exactHits: 0, uniqueHits: 0 });
  });
  it('the JOKER doubling does not count: the 5th number of the day is used (an older day falls back to its points); correct winners are summed', () => {
    const days = { '2026-11-10': [44, 1, 1, 1, 22], '2026-11-11': [10, 0, 0, 1], '2026-11-12': [6, 0, 0, 2, 6] };
    expect(windowStats(days)).toEqual({ pts: 22 + 10 + 6, winners: 4, exactHits: 1, uniqueHits: 1 }); // not 44 + 10 + 6
  });
});

describe('decideMatch', () => {
  it('points decide; head start counts', () => {
    expect(decideMatch({ a: side(10), b: side(8) }).winner).toBe('a');
    expect(decideMatch({ a: side(10), b: side(8, 0, 0, null, 3) })).toMatchObject({ winner: 'b', scoreB: 11 });
  });
  it('tie-break order (the same as the mid-season tournament): correct winners, exact hits, unique hits, then the overall total', () => {
    expect(decideMatch({ a: side(10, 0, 0, null, 0, 3), b: side(10, 5, 5, null, 0, 2) })).toMatchObject({ winner: 'a', reason: 'winners' });
    expect(decideMatch({ a: side(10, 1, 0, null, 0, 2), b: side(10, 2, 0, null, 0, 2) })).toMatchObject({ winner: 'b', reason: 'exactHits' });
    expect(decideMatch({ a: side(10, 2, 1, null, 0, 2), b: side(10, 2, 0, null, 0, 2) })).toMatchObject({ winner: 'a', reason: 'uniqueHits' });
    expect(decideMatch({ a: side(10, 2, 1, null, 0, 2, 400), b: side(10, 2, 1, null, 0, 2, 500) })).toMatchObject({ winner: 'b', reason: 'total' });
  });
  it('the better seed no longer decides by default: a tie in everything is left to the admin', () => {
    expect(decideMatch({ a: side(10, 2, 1, 5, 0, 2, 500), b: side(10, 2, 1, 2, 0, 2, 500) })).toMatchObject({ winner: null, reason: 'tie' });
  });
  it('configurable order and unresolved tie', () => {
    expect(decideMatch({ a: side(10, 5, 0, 1), b: side(10, 1, 0, 2), tiebreakers: ['seed', 'exactHits'] })).toMatchObject({ winner: 'a', reason: 'seed' });
    expect(decideMatch({ a: side(10), b: side(10) })).toMatchObject({ winner: null, reason: 'tie' });
  });
  it('bye advances automatically', () => expect(decideMatch({ a: side(0), b: null })).toMatchObject({ winner: 'a', reason: 'bye' }));
});

describe('resolvePair', () => {
  const stats = { A: { pts: 5, exactHits: 0, uniqueHits: 0 }, B: { pts: 9, exactHits: 0, uniqueHits: 0 } };
  const pair = { a: 'A', b: 'B', seedA: 1, seedB: 2, advA: 0, advB: 0 };
  it('auto winner and admin override', () => {
    expect(resolvePair(pair, (u) => stats[u]).winnerUid).toBe('B');
    expect(resolvePair({ ...pair, winnerOverride: 'a' }, (u) => stats[u])).toMatchObject({ winnerUid: 'A', reason: 'override' });
  });
});

describe('groups', () => {
  it('rankGroup orders by points, exact, unique and marks ties', () => {
    const s = { x: { pts: 10, exactHits: 1, uniqueHits: 0 }, y: { pts: 10, exactHits: 1, uniqueHits: 0 }, z: { pts: 12, exactHits: 0, uniqueHits: 0 } };
    const r = rankGroup(['x', 'y', 'z'], (u) => s[u]);
    expect(r.map((x) => x.uid)).toEqual(['z', 'x', 'y']);
    expect(r.map((x) => x.rank)).toEqual([1, 2, 2]);
    expect(r[1].tied && r[2].tied).toBe(true);
  });
  it('rankGroup: equal points -> correct winners, then exact, unique, then the overall total; only then a tie', () => {
    const s = {
      a: { pts: 10, winners: 2, exactHits: 5, uniqueHits: 5, total: 900 }, b: { pts: 10, winners: 3, exactHits: 0, uniqueHits: 0, total: 0 },
      c: { pts: 10, winners: 3, exactHits: 0, uniqueHits: 0, total: 100 }, d: { pts: 10, winners: 3, exactHits: 0, uniqueHits: 0, total: 100 },
    };
    const r = rankGroup(['a', 'b', 'c', 'd'], (u) => s[u]);
    expect(r.map((x) => x.uid)).toEqual(['c', 'd', 'b', 'a']); // c, d (3 winners, total 100) > b (3 winners, total 0) > a (2 winners)
    expect(r.map((x) => x.rank)).toEqual([1, 1, 3, 4]); // c and d are a real tie
    expect(r[0].tied && r[1].tied).toBe(true);
  });
  it('drawGroups is balanced and uses every player once', () => {
    const uids = Array.from({ length: 11 }, (_, i) => `u${i}`);
    const g = drawGroups(uids, 3, () => 0.3);
    expect(Object.keys(g)).toEqual(['A', 'B', 'C']);
    expect(Object.values(g).map((a) => a.length).sort()).toEqual([3, 4, 4]);
    expect(Object.values(g).flat().sort()).toEqual([...uids].sort());
  });
  it('seedQualifiers: group winners first, then runners-up; takes top X per group', () => {
    const t = {
      A: [{ uid: 'a1', pos: 1, pts: 50, exactHits: 0, uniqueHits: 0 }, { uid: 'a2', pos: 2, pts: 40, exactHits: 0, uniqueHits: 0 }, { uid: 'a3', pos: 3, pts: 1, exactHits: 0, uniqueHits: 0 }],
      B: [{ uid: 'b1', pos: 1, pts: 60, exactHits: 0, uniqueHits: 0 }, { uid: 'b2', pos: 2, pts: 45, exactHits: 0, uniqueHits: 0 }],
    };
    expect(seedQualifiers(t, 2).map((x) => x.uid)).toEqual(['b1', 'a1', 'b2', 'a2']);
  });
});

describe('pairSeeds', () => {
  it('best vs worst; odd count gives the middle seed a bye', () => {
    const p = pairSeeds([1, 2, 3, 4].map((s) => ({ uid: `u${s}`, seed: s })));
    expect([p.p1.a, p.p1.b, p.p2.a, p.p2.b]).toEqual(['u1', 'u4', 'u2', 'u3']);
    const q = pairSeeds([1, 2, 3, 4, 5].map((s) => ({ uid: `u${s}`, seed: s })));
    expect(q.p3).toMatchObject({ a: 'u3', b: null });
    expect(Object.keys(q)).toEqual(['p1', 'p2', 'p3']);
  });
});

describe('closeStagePatch', () => {
  const tournament = { stages: { K1: { stageNum: 1, startDay: '2026-11-01', endDay: null, pairs: pairSeeds([1, 2, 3, 4].map((s) => ({ uid: `u${s}`, seed: s }))) } } };
  it('records winners, ends the stage the day before, and builds the next stage (winners re-paired by seed)', () => {
    const results = { p1: { winnerUid: 'u4' }, p2: { winnerUid: 'u2' } };
    const r = closeStagePatch(tournament, results, '2026-11-08');
    expect(r.patch['stages.K1.endDay']).toBe('2026-11-07');
    expect(r.patch['stages.K1.pairs.p1.winner']).toBe('u4');
    expect(r.patch['stages.K2']).toMatchObject({ stageNum: 2, startDay: '2026-11-08', endDay: null });
    expect(r.patch['stages.K2'].pairs.p1).toMatchObject({ a: 'u2', b: 'u4', seedA: 2, seedB: 4 });
  });
  it('refuses unresolved ties; the final closes the tournament', () => {
    expect(closeStagePatch(tournament, { p1: { winnerUid: 'u1' }, p2: { winnerUid: null } }, '2026-11-08').error).toBe('unresolved');
    const final = { stages: { K2: { stageNum: 2, startDay: '2026-11-08', endDay: null, pairs: pairSeeds([{ uid: 'u2', seed: 2 }, { uid: 'u4', seed: 4 }]) } } };
    const r = closeStagePatch(final, { p1: { winnerUid: 'u2' } }, '2026-11-15');
    expect(r).toMatchObject({ finished: true, championUid: 'u2' });
    expect(r.patch.status).toBe('finished');
  });
  it('activeStageId reads a MAP and ignores closed stages', () => {
    expect(activeStageId({ K1: { stageNum: 1, endDay: '2026-11-07' }, K2: { stageNum: 2, endDay: null } })).toBe('K2');
    expect(activeStageId({ K1: { stageNum: 1, endDay: '2026-11-07' } })).toBeNull();
    expect(prevDayKey('2026-11-01')).toBe('2026-10-31');
    expect(DEFAULT_H2H_TIEBREAKERS).toEqual(['winners', 'exactHits', 'uniqueHits', 'total']);
  });
});


// ---------------------------------------------------------------- the joker: "pairs for fun" count it, every other competition does not
describe('the joker in Head to Head', () => {
  // a day with a joker: 44 points with it, 22 without (the 5th number); a day without a joker; an old day without the 5th number
  const byDay = { '2026-11-10': [44, 1, 1, 1, 22], '2026-11-11': [10, 0, 0, 1, 10], '2026-11-12': [6, 0, 0, 2] };
  it('windowStats: without the joker by default (league, knockout), with it on request (pairs for fun)', () => {
    expect(windowStats(byDay).pts).toBe(22 + 10 + 6);
    expect(windowStats(byDay, null, null, { joker: true }).pts).toBe(44 + 10 + 6);
    expect(windowStats(byDay, null, null, { joker: false }).pts).toBe(38);
  });
  it('the other numbers do not depend on the joker, and the window still applies', () => {
    const a = windowStats(byDay, '2026-11-11', null);
    const b = windowStats(byDay, '2026-11-11', null, { joker: true });
    expect(b).toEqual(a); // no joker on those days: the same
    expect({ ...windowStats(byDay), pts: 0 }).toEqual({ ...windowStats(byDay, null, null, { joker: true }), pts: 0 });
    expect(windowStats(byDay, '2026-11-10', '2026-11-10', { joker: true }).pts).toBe(44);
  });
  it('an older day without the 5th number counts the same either way', () => {
    expect(windowStats({ d: [9, 0, 0, 1] }, null, null, { joker: true }).pts).toBe(9);
    expect(windowStats({ d: [9, 0, 0, 1] }).pts).toBe(9);
  });

  const A = { byDay: { '2026-11-10': [44, 1, 1, 1, 22] } }; // the joker doubled a good game
  const B = { byDay: { '2026-11-10': [30, 0, 0, 1, 30] } };
  it('a pair for fun counts the joker: A (44 with the joker) beats B (30)', () => {
    expect(funPairResult(A, B)).toEqual({ a: 44, b: 30, winner: 'a' });
  });
  it('the SAME two players in the league / knockout (no joker): B (30) is ahead of A (22)', () => {
    const a = windowStats(A.byDay).pts; const b = windowStats(B.byDay).pts;
    expect([a, b]).toEqual([22, 30]);
    const table = rankGroup(['A', 'B'], (u) => windowStats({ A: A.byDay, B: B.byDay }[u]), (u) => u);
    expect(table.map((r) => r.uid)).toEqual(['B', 'A']);
  });
  it('a pair for fun: the window of days, a draw, and a player without a points row', () => {
    const two = { byDay: { '2026-11-10': [10, 0, 0, 1, 5], '2026-11-20': [8, 0, 0, 1, 8] } };
    expect(funPairResult(two, A, '2026-11-15', null)).toEqual({ a: 8, b: 0, winner: 'a' });
    expect(funPairResult({ byDay: { d: [10] } }, { byDay: { d: [10] } })).toEqual({ a: 10, b: 10, winner: null });
    expect(funPairResult(undefined, undefined)).toEqual({ a: 0, b: 0, winner: null });
    expect(funPairResult(undefined, B)).toEqual({ a: 0, b: 30, winner: 'b' });
  });
  it('no bonus points: only the days of the games count', () => {
    expect(funPairResult({ byDay: {}, bonus: 100, total: 500 }, { byDay: { d: [1] } })).toEqual({ a: 0, b: 1, winner: 'b' });
  });

  // a guard on the screens: only the two screens of the pairs for fun use funResult; the league and the knockout never ask for the joker
  const src = (f) => fs.readFileSync(new URL(`../src/${f}`, import.meta.url), 'utf8');
  it('the pairs for fun screens (players and admin) use funResult', () => {
    ['pages/h2h/FunTab.jsx', 'pages/admin/FunPairsManager.jsx'].forEach((f) => { expect(src(f)).toContain('funResult'); expect(src(f)).not.toContain('statsOf('); });
  });
  it('the Head to Head competition (the groups, the round of 16, the knockout) never counts the joker', () => {
    ['pages/h2h/CupTab.jsx', 'pages/admin/CupManager.jsx', 'hooks/useH2HCup.js'].forEach((f) => { expect(src(f)).not.toContain('funResult'); expect(src(f)).not.toMatch(/joker:\s*true/); });
    expect(fs.readFileSync(new URL('./h2hCup.js', import.meta.url), 'utf8')).not.toMatch(/joker:\s*true/);
  });
  it('the mid-season tournament has its own windowStats and never counts the joker', () => {
    const mid = fs.readFileSync(new URL('./midTournament.js', import.meta.url), 'utf8');
    expect(mid).not.toMatch(/joker:\s*true/);
    expect(mid).not.toContain('funPairResult');
  });
});

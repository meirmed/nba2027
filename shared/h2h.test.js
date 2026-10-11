import { describe, it, expect } from 'vitest';
import { windowStats, decideMatch, resolvePair, rankGroup, drawGroups, seedQualifiers, pairSeeds, closeStagePatch, activeStageId, prevDayKey, DEFAULT_H2H_TIEBREAKERS } from './h2h.js';

const side = (pts, exactHits = 0, uniqueHits = 0, seed = null, adv = 0) => ({ stats: { pts, exactHits, uniqueHits }, seed, adv });

describe('windowStats', () => {
  const byDay = { '2026-10-20': [10, 1, 0], '2026-10-21': [5, 0, 1], '2026-10-25': [7, 1, 1] };
  it('sums inclusive windows and handles open ends', () => {
    expect(windowStats(byDay, '2026-10-21', '2026-10-25')).toEqual({ pts: 12, exactHits: 1, uniqueHits: 2 });
    expect(windowStats(byDay, null, '2026-10-20')).toEqual({ pts: 10, exactHits: 1, uniqueHits: 0 });
    expect(windowStats(byDay)).toEqual({ pts: 22, exactHits: 2, uniqueHits: 2 });
    expect(windowStats(undefined)).toEqual({ pts: 0, exactHits: 0, uniqueHits: 0 });
  });
});

describe('decideMatch', () => {
  it('points decide; head start counts', () => {
    expect(decideMatch({ a: side(10), b: side(8) }).winner).toBe('a');
    expect(decideMatch({ a: side(10), b: side(8, 0, 0, null, 3) })).toMatchObject({ winner: 'b', scoreB: 11 });
  });
  it('tie-break order: exact hits, unique hits, then better seed', () => {
    expect(decideMatch({ a: side(10, 1), b: side(10, 2) })).toMatchObject({ winner: 'b', reason: 'exactHits' });
    expect(decideMatch({ a: side(10, 2, 1), b: side(10, 2, 0) })).toMatchObject({ winner: 'a', reason: 'uniqueHits' });
    expect(decideMatch({ a: side(10, 2, 1, 5), b: side(10, 2, 1, 2) })).toMatchObject({ winner: 'b', reason: 'seed' });
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
    expect(DEFAULT_H2H_TIEBREAKERS).toEqual(['exactHits', 'uniqueHits', 'seed']);
  });
});

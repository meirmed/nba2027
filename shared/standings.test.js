import { describe, it, expect } from 'vitest';
import { computeAllPoints, rankRows, scoreGamePicks } from './standings.js';

const sc = { winner: 5, exact: 7, diffBonus: [{ maxErr: 1, pts: 4 }, { maxErr: 2, pts: 3 }, { maxErr: 3, pts: 2 }, { maxErr: 4, pts: 1 }],
  risk: { maxPickPct: 10, pts: 2 }, unique: 5, roundMultipliers: { RS: 1 }, jokerMultiplier: 2, autoFillFactor: 0.5 };
const game = (id, t, s1, s2, over = {}) => ({ id, round: 'RS', status: 'finished', t1: 'BOS', t2: 'NYK', s1, s2, tipoffMs: t, ...over });
const run = (games, predictions) => computeAllPoints({ games, predictions, uids: Object.keys(predictions), scoring: sc, countedRounds: ['RS'] });
const P = (s1, s2, extra = {}) => ({ s1, s2, ...extra });

describe('computeAllPoints', () => {
  const g1 = game('g1', 1, 110, 100);
  it('exact+unique, margin tier, wrong winner', () => {
    const r = run([g1], { A: { games: { g1: P(110, 100) } }, B: { games: { g1: P(108, 100) } }, C: { games: { g1: P(90, 100) } } });
    expect(r.A.gamePts).toBe(5 + 7 + 5); // winner + exact + unique, no margin bonus
    expect(r.B.gamePts).toBe(5 + 3); // margin error 2
    expect(r.C.gamePts).toBe(0);
    expect(r.A).toMatchObject({ exactHits: 1, uniqueHits: 1, winnerCorrect: 1, gamesPlayed: 1 });
    expect(r.A.byGame.g1).toMatchObject({ pts: 17, x: 1, u: 1, s1: 110, s2: 100, j: 0, a: 0 });
  });
  it('two exact picks -> nobody is unique', () => {
    const r = run([g1], { A: { games: { g1: P(110, 100) } }, B: { games: { g1: P(110, 100) } } });
    expect(r.A.gamePts).toBe(12);
    expect(r.A.uniqueHits).toBe(0);
  });
  it('joker doubles everything on that game', () => {
    const r = run([g1], { A: { games: { g1: P(110, 100) }, jokers: { g1: true } } });
    expect(r.A.gamePts).toBe((5 + 7 + 5) * 2);
  });
  it('auto-filled exact: halved, no unique, and does not block a manual unique', () => {
    const r = run([g1], { A: { games: { g1: P(110, 100, { autoFilled: true }) } }, B: { games: { g1: P(110, 100) } } });
    expect(r.A.gamePts).toBe(Math.floor((5 + 7) * 0.5));
    expect(r.A.uniqueHits).toBe(0);
    expect(r.B.uniqueHits).toBe(1);
  });
  it('risk bonus when <=10% of picks chose the winning side', () => {
    const g = game('g', 1, 100, 110); // away wins
    const predictions = { X: { games: { g: P(100, 110) } } };
    for (let i = 0; i < 9; i += 1) predictions[`H${i}`] = { games: { g: P(110, 100) } }; // 9 of 10 picked home (wrong)
    const r = run([g], predictions);
    expect(r.X.riskHits).toBe(1);
    expect(r.X.gamePts).toBe(5 + 7 + 5 + 2);
    expect(r.H0.gamePts).toBe(0);
  });
  it('ignores live/scheduled games, uncounted rounds, cancelled and tied results', () => {
    const games = [game('a', 1, 100, 90, { status: 'live' }), game('b', 2, 100, 90, { round: 'R1' }), game('c', 3, 100, 90, { status: 'cancelled' }), game('d', 4, 100, 100)];
    const pred = { A: { games: { a: P(100, 90), b: P(100, 90), c: P(100, 90), d: P(100, 90) } } };
    expect(run(games, pred).A.gamePts).toBe(0);
  });
  it('streaks follow game order and only count predicted games', () => {
    const games = [game('g1', 1, 100, 90), game('g2', 2, 100, 90), game('g3', 3, 100, 90), game('g4', 4, 100, 90)];
    const r = run(games, { A: { games: { g1: P(101, 90), g2: P(102, 90), g3: P(90, 100) } } });
    expect(r.A).toMatchObject({ bestStreak: 2, curStreak: 0, bestMiss: 1, curMiss: 1, gamesPlayed: 3 });
  });
  it('users with no picks get zero stats', () => {
    const r = computeAllPoints({ games: [g1], predictions: {}, uids: ['Z'], scoring: sc, countedRounds: ['RS'] });
    expect(r.Z.gamePts).toBe(0);
    expect(r.Z.byGame).toEqual({});
  });
});

describe('scoreGamePicks (drives the "Everyone\'s picks" badges)', () => {
  it('flags exact/unique/diff/auto per user', () => {
    const picks = [
      { uid: 'A', p: P(110, 100) }, { uid: 'B', p: P(108, 100) }, { uid: 'C', p: P(90, 100) }, { uid: 'D', p: P(110, 100, { autoFilled: true }) },
    ];
    const r = scoreGamePicks({ game: { round: 'RS', s1: 110, s2: 100 }, picks, scoring: sc });
    expect(r.A).toMatchObject({ pts: 17, exact: true, uniquePts: 5, diffPts: 0, winnerCorrect: true });
    expect(r.B).toMatchObject({ pts: 8, exact: false, diffPts: 3 });
    expect(r.C).toMatchObject({ pts: 0, winnerCorrect: false });
    expect(r.D).toMatchObject({ pts: 6, exact: true, uniquePts: 0 });
  });
  it('returns nothing when there are no valid picks', () => {
    expect(scoreGamePicks({ game: { round: 'RS', s1: 1, s2: 0 }, picks: [], scoring: sc })).toEqual({});
  });
});

describe('byDay (feeds Head to Head)', () => {
  it('sums points / exact / unique per day in the given timezone; bonus is never part of it', () => {
    const d1 = Date.parse('2026-10-30T20:00:00Z');
    const d2 = Date.parse('2026-10-30T23:30:00Z'); // 01:30 next day in Israel
    const games = [game('g1', d1, 110, 100), game('g2', d2, 110, 100)];
    const r = computeAllPoints({ games, predictions: { A: { games: { g1: P(110, 100), g2: P(108, 100) } } }, uids: ['A'], scoring: sc, countedRounds: ['RS'], timezone: 'Asia/Jerusalem' });
    expect(r.A.byDay).toEqual({ '2026-10-30': [17, 1, 1], '2026-10-31': [8, 0, 0] });
    expect(computeAllPoints({ games, predictions: { A: { games: { g1: P(110, 100), g2: P(108, 100) } } }, uids: ['A'], scoring: sc, countedRounds: ['RS'], timezone: 'UTC' }).A.byDay).toEqual({ '2026-10-30': [25, 1, 1] });
  });
});

describe('rankRows', () => {
  it('uses tiebreakers and gives tied rows the same rank', () => {
    const rows = [{ id: 'a', total: 10, exactHits: 1 }, { id: 'b', total: 10, exactHits: 3 }, { id: 'c', total: 12 }, { id: 'd', total: 10, exactHits: 1 }];
    const r = rankRows(rows, ['total', 'exactHits']);
    expect(r.map((x) => x.id)).toEqual(['c', 'b', 'a', 'd']);
    expect(r.map((x) => x.rank)).toEqual([1, 2, 3, 3]);
  });
});

import { describe, it, expect } from 'vitest';
import { computeAllPoints, rankRows, scoreGamePicks } from './standings.js';

const sc = { winner: 5, diffExact: 6, exact: 6, uniqueDiff: 5, diffBonus: [{ maxErr: 1, pts: 4 }, { maxErr: 2, pts: 3 }, { maxErr: 3, pts: 2 }, { maxErr: 4, pts: 1 }],
  risk: { maxPickPct: 10, pts: 2 }, unique: 5, roundMultipliers: { RS: 1 }, jokerMultiplier: 2, autoFillFactor: 0.5 };
const game = (id, t, s1, s2, over = {}) => ({ id, round: 'RS', status: 'finished', t1: 'BOS', t2: 'NYK', s1, s2, tipoffMs: t, ...over });
const run = (games, predictions) => computeAllPoints({ games, predictions, uids: Object.keys(predictions), scoring: sc, countedRounds: ['RS'] });
const P = (s1, s2, extra = {}) => ({ s1, s2, ...extra });

describe('computeAllPoints', () => {
  const g1 = game('g1', 1, 110, 100);
  it('exact+unique, margin tier, wrong winner', () => {
    const r = run([g1], { A: { games: { g1: P(110, 100) } }, B: { games: { g1: P(108, 100) } }, C: { games: { g1: P(90, 100) } } });
    expect(r.A.gamePts).toBe(5 + 6 + 6 + 5); // winner + exact margin + exact score + unique = 22
    expect(r.B.gamePts).toBe(5 + 3); // margin error 2
    expect(r.C.gamePts).toBe(0);
    expect(r.A).toMatchObject({ exactHits: 1, uniqueHits: 1, winnerCorrect: 1, gamesPlayed: 1 });
    expect(r.A.byGame.g1).toMatchObject({ pts: 22, x: 1, u: 1, s1: 110, s2: 100, j: 0, a: 0 });
  });
  it('two exact picks -> nobody is unique', () => {
    const r = run([g1], { A: { games: { g1: P(110, 100) } }, B: { games: { g1: P(110, 100) } } });
    expect(r.A.gamePts).toBe(5 + 6 + 6); // 17, nobody is unique
    expect(r.A.uniqueHits).toBe(0);
  });
  it('joker doubles everything on that game', () => {
    const r = run([g1], { A: { games: { g1: P(110, 100) }, jokers: { g1: true } } });
    expect(r.A.gamePts).toBe((5 + 6 + 6 + 5) * 2); // 44: the joker doubles ALL the bonuses of that game
  });
  it('auto-filled exact: halved, no unique, and does not block a manual unique', () => {
    const r = run([g1], { A: { games: { g1: P(110, 100, { autoFilled: true }) } }, B: { games: { g1: P(110, 100) } } });
    expect(r.A.gamePts).toBe(Math.floor((5 + 6 + 6) * 0.5)); // 8
    expect(r.A.uniqueHits).toBe(0);
    expect(r.B.uniqueHits).toBe(1);
  });
  it('risk bonus when <=10% of picks chose the winning side', () => {
    const g = game('g', 1, 100, 110); // away wins
    const predictions = { X: { games: { g: P(100, 110) } } };
    for (let i = 0; i < 9; i += 1) predictions[`H${i}`] = { games: { g: P(110, 100) } }; // 9 of 10 picked home (wrong)
    const r = run([g], predictions);
    expect(r.X.riskHits).toBe(1);
    expect(r.X.gamePts).toBe(5 + 6 + 6 + 5 + 2); // winner + exact margin + exact + unique + risk = 24
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
    expect(r.A).toMatchObject({ pts: 22, exact: true, uniquePts: 5, diffPts: 6, winnerCorrect: true });
    expect(r.B).toMatchObject({ pts: 8, exact: false, diffPts: 3 });
    expect(r.C).toMatchObject({ pts: 0, winnerCorrect: false });
    expect(r.D).toMatchObject({ pts: 8, exact: true, uniquePts: 0 }); // floor(17 * 0.5)
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
    expect(r.A.byDay).toEqual({ '2026-10-30': [22, 1, 1, 1, 22], '2026-10-31': [8, 0, 0, 1, 8] }); // [points, exact, unique, correct winners, points without the joker]
    expect(computeAllPoints({ games, predictions: { A: { games: { g1: P(110, 100), g2: P(108, 100) } } }, uids: ['A'], scoring: sc, countedRounds: ['RS'], timezone: 'UTC' }).A.byDay).toEqual({ '2026-10-30': [30, 1, 1, 2, 30] }); // 22 + 8, two correct winners
  });
});

describe('the joker and the per-day points', () => {
  it('a joker doubles the game points and byDay[0] (main table) but NOT byDay[4] (the mid-season tournament)', () => {
    const games = [game('g1', Date.parse('2026-10-30T20:00:00Z'), 110, 100)];
    const r = run(games, { A: { games: { g1: P(110, 100) }, jokers: { g1: true } }, B: { games: { g1: P(108, 100) } } });
    expect(r.A.gamePts).toBe(44); // 22 x 2 in the main table
    expect(r.A.byDay['2026-10-30']).toEqual([44, 1, 1, 1, 22]); // ... but 22 for the tournament
    expect(r.B.byDay['2026-10-30']).toEqual([8, 0, 0, 1, 8]); // no joker: both numbers are equal
  });
});

describe('players only: a user left out of `uids` (an admin) has no influence', () => {
  it("an admin's picks do not change anyone's risk % or unique bonus", () => {
    const g = game('g', 1, 110, 100);
    const preds = { A: { games: { g: P(110, 100) } }, B: { games: { g: P(90, 100) } }, ADMIN: { games: { g: P(110, 100) } } };
    const without = computeAllPoints({ games: [g], predictions: preds, uids: ['A', 'B'], scoring: sc, countedRounds: ['RS'] });
    const withAdmin = computeAllPoints({ games: [g], predictions: preds, uids: ['A', 'B', 'ADMIN'], scoring: sc, countedRounds: ['RS'] });
    expect(without.A.uniqueHits).toBe(1); // A is the only exact pick among the players
    expect(withAdmin.A.uniqueHits).toBe(0); // if the admin counted, A would lose the unique bonus
    expect(without.ADMIN).toBeUndefined();
  });
});

describe('unique exact MARGIN (right winner + exact margin, without the exact score)', () => {
  const g = game('g', 1, 110, 100); // margin 10
  it('the only player with the exact margin: 5 + 6 + 5 = 16; the others keep their normal points', () => {
    const r = run([g], { A: { games: { g: P(105, 95) } }, B: { games: { g: P(107, 100) } }, C: { games: { g: P(90, 100) } } });
    expect(r.A.gamePts).toBe(16);
    expect(r.A).toMatchObject({ uniqueHits: 1, exactHits: 0 });
    expect(r.B.gamePts).toBe(5 + 2); // margin 7 vs 10: error 3
    expect(r.C.gamePts).toBe(0);
  });
  it('two players with the exact margin: nobody is unique (11 each)', () => {
    const r = run([g], { A: { games: { g: P(105, 95) } }, B: { games: { g: P(120, 110) } } });
    expect(r.A.gamePts).toBe(11);
    expect(r.B.gamePts).toBe(11);
  });
  it('a player who hit the EXACT SCORE counts as having the exact margin, so he blocks the unique margin of another', () => {
    const r = run([g], { A: { games: { g: P(110, 100) } }, B: { games: { g: P(105, 95) } } });
    expect(r.A.gamePts).toBe(5 + 6 + 6 + 5); // 22: unique exact score
    expect(r.B.gamePts).toBe(11); // margin is NOT unique: A has it too
  });
  it('an auto-filled pick with the exact margin neither gets the bonus nor blocks a manual one', () => {
    const r = run([g], { A: { games: { g: P(105, 95) } }, D: { games: { g: P(106, 96, { autoFilled: true }) } } });
    expect(r.A.gamePts).toBe(16);
    expect(r.D.gamePts).toBe(Math.floor(11 * 0.5));
  });
  it('the joker doubles the unique margin bonus too: 32', () => {
    const r = run([g], { A: { games: { g: P(105, 95) }, jokers: { g: true } } });
    expect(r.A.gamePts).toBe(32);
  });
});

describe('noScore = games with no points (wrong winner or no pick)', () => {
  it('counts every finished counted game the player earned nothing on', () => {
    const games = [game('g1', 1, 110, 100), game('g2', 2, 100, 90), game('g3', 3, 100, 90)];
    const preds = {
      A: { games: { g1: P(110, 100), g2: P(80, 99), g3: P(100, 90) } }, // exact, wrong winner, exact -> 1 game without points
      B: { games: { g1: P(90, 100) } }, // wrong winner on g1, nothing predicted on g2 and g3 -> 3 games without points
    };
    const r = computeAllPoints({ games, predictions: preds, uids: ['A', 'B'], scoring: sc, countedRounds: ['RS'] });
    expect(r.A.noScore).toBe(1);
    expect(r.B.noScore).toBe(3);
    expect(r.A.winnerCorrect + r.A.noScore).toBe(3);
  });
  it('a game that is not finished does not count as "no score"', () => {
    const live = { ...game('g2', 2, 0, 0), status: 'live' };
    const r = computeAllPoints({ games: [game('g1', 1, 110, 100), live], predictions: { A: { games: { g1: P(110, 100) } } }, uids: ['A'], scoring: sc, countedRounds: ['RS'] });
    expect(r.A.noScore).toBe(0);
  });
});

describe('rankRows: every player gets a unique number 1..N', () => {
  it('the tiebreakers still decide the order; players equal on all of them are ordered by name and still numbered 1,2,3,4', () => {
    const rows = [{ id: 'a', name: 'Dan', total: 10, exactHits: 1 }, { id: 'b', name: 'Ben', total: 10, exactHits: 3 }, { id: 'c', name: 'Cy', total: 12 }, { id: 'd', name: 'Al', total: 10, exactHits: 1 }];
    const r = rankRows(rows, ['total', 'exactHits']);
    expect(r.map((x) => x.id)).toEqual(['c', 'b', 'd', 'a']); // 12 first, then exact hits 3, then the tie Al / Dan by name
    expect(r.map((x) => x.rank)).toEqual([1, 2, 3, 4]);
  });
  it('a table where EVERYONE is tied (the start of the season) still shows 1..N, alphabetical, and never changes with the input order', () => {
    const names = ['עומר ורדי', 'אלעד כהן', 'Yosi Medler', 'Arik Safran', 'דור כהני'];
    const rows = names.map((name, i) => ({ id: `u${i}`, uid: `u${i}`, name, total: 0, bonus: 0, exactHits: 0, uniqueHits: 0 }));
    const a = rankRows(rows, ['total', 'exactHits', 'uniqueHits', 'bonus']);
    const b = rankRows([...rows].reverse(), ['total', 'exactHits', 'uniqueHits', 'bonus']);
    expect(a.map((x) => x.rank)).toEqual([1, 2, 3, 4, 5]);
    expect(new Set(a.map((x) => x.rank)).size).toBe(5);
    expect(b.map((x) => x.id)).toEqual(a.map((x) => x.id));
  });
});

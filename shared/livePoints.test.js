import { describe, it, expect } from 'vitest';
import { applyLiveGames, liveGameIds } from './livePoints.js';
import { rankRows } from './standings.js';
import { DEFAULT_SCORING } from './constants.js';

const NOW = 10_000_000;
const live = (s1, s2, over = {}) => ({ id: 'g1', round: 'RS', status: 'live', s1, s2, updatedMs: NOW - 1000, ...over });
const base = (uid, total, extra = {}) => ({ uid, name: uid, total, gamePts: total, bonus: 0, winnerCorrect: 0, gameHits: 0, exactHits: 0, uniqueHits: 0, noScore: 0, ...extra });
const picks = (o) => Object.fromEntries(Object.entries(o).map(([uid, [s1, s2, x = {}]]) => [uid, { s1, s2, ...x }]));
const run = (rows, games, picksByGame, extra = {}) => applyLiveGames({ rows, games, picksByGame, scoring: DEFAULT_SCORING, countedRounds: ['RS'], lastRecalcMs: 0, nowMs: NOW, ...extra });
const by = (rows) => Object.fromEntries(rows.map((r) => [r.uid, r]));

describe('live leaderboard: the home team leads 60-55 (margin 5)', () => {
  const rows = ['A', 'B', 'C', 'D', 'E'].map((u, i) => base(u, 100 - i * 10));
  const pk = { g1: picks({ A: [110, 100], B: [62, 57], C: [60, 55], D: [50, 60], E: [61, 55] }) };

  it('adds the provisional points to the totals (A 5, B 11, C 22 exact + unique, D 0, E 9)', () => {
    const r = by(run(rows, [live(60, 55)], pk));
    expect([r.A.total, r.B.total, r.C.total, r.D.total, r.E.total]).toEqual([105, 101, 102, 70, 69]);
    expect(r.C.gamePts).toBe(80 + 22);
  });
  it('updates the hits: correct winners, exact, unique, and "no score" for the wrong winner', () => {
    const r = by(run(rows, [live(60, 55)], pk));
    expect(r.C).toMatchObject({ winnerCorrect: 1, gameHits: 1, exactHits: 1, uniqueHits: 1, noScore: 0 });
    expect(r.A).toMatchObject({ winnerCorrect: 1, exactHits: 0, uniqueHits: 0 });
    expect(r.D).toMatchObject({ winnerCorrect: 0, noScore: 1 });
  });
  it('the positions move: with the live points the table order changes', () => {
    const before = rankRows(rows, ['total']).map((x) => x.uid);
    const after = rankRows(run(rows, [live(60, 55)], pk), ['total']).map((x) => x.uid);
    expect(before).toEqual(['A', 'B', 'C', 'D', 'E']);
    expect(after).toEqual(['A', 'C', 'B', 'D', 'E']); // C (100-20+22=102) passes B (101)
    expect(rankRows(run(rows, [live(60, 55)], pk), ['total']).map((x) => x.rank)).toEqual([1, 2, 3, 4, 5]);
  });
  it('does not change the input rows', () => {
    const copy = JSON.parse(JSON.stringify(rows));
    run(rows, [live(60, 55)], pk);
    expect(rows).toEqual(copy);
  });
  it('a player with no pick in the live game gets a "no score" and no points', () => {
    const r = by(run([...rows, base('Z', 50)], [live(60, 55)], pk));
    expect(r.Z).toMatchObject({ total: 50, noScore: 1 });
  });
});

describe('when nothing should be added', () => {
  const rows = [base('A', 10)];
  const pk = { g1: picks({ A: [110, 100] }) };
  it('a TIED live game has no winner: nothing is scored yet', () => {
    expect(run(rows, [live(40, 40)], pk)).toBe(rows);
  });
  it('the picks are not loaded (undefined) or not published yet (null): the game is skipped', () => {
    expect(run(rows, [live(60, 55)], {})).toBe(rows);
    expect(run(rows, [live(60, 55)], { g1: null })).toBe(rows);
  });
  it('a game that is not live, is cancelled, or is in a round that does not count is ignored', () => {
    expect(run(rows, [live(60, 55, { status: 'scheduled' })], pk)).toBe(rows);
    expect(run(rows, [live(60, 55, { status: 'cancelled' })], pk)).toBe(rows);
    expect(run(rows, [live(60, 55, { round: 'R1' })], pk)).toBe(rows);
  });
  it('no live score yet (null) = nothing', () => {
    expect(run(rows, [live(null, null)], pk)).toBe(rows);
  });
});

describe('the moment a game finishes (no flicker, no double counting)', () => {
  const rows = [base('A', 10)];
  const pk = { g1: picks({ A: [110, 100] }) };
  const done = (over = {}) => ({ id: 'g1', round: 'RS', status: 'finished', s1: 110, s2: 100, updatedMs: NOW - 60_000, ...over });

  it('finished a minute ago and the server has not saved the points yet: still added (the table does not drop)', () => {
    const r = run(rows, [done()], pk, { lastRecalcMs: NOW - 120_000 });
    expect(r[0].total).toBe(10 + 22);
  });
  it('once the server has saved the points (a later recalculation) the overlay stops: nothing is counted twice', () => {
    expect(run(rows, [done()], pk, { lastRecalcMs: NOW - 30_000 })).toBe(rows);
  });
  it('a game that finished long ago is never added', () => {
    expect(run(rows, [done({ updatedMs: NOW - 20 * 60_000 })], pk, { lastRecalcMs: 0 })).toBe(rows);
  });
  it('liveGameIds lists the games whose picks are needed', () => {
    const games = [live(1, 2, { id: 'a' }), done({ id: 'b' }), done({ id: 'c', updatedMs: NOW - 20 * 60_000 }), live(1, 2, { id: 'd', round: 'R1' })];
    expect(liveGameIds({ games, countedRounds: ['RS'], lastRecalcMs: 0, nowMs: NOW }).sort()).toEqual(['a', 'b']);
  });
});

describe('several games at the same time', () => {
  it('the points of every live game are added', () => {
    const rows = [base('A', 0)];
    const games = [live(60, 55, { id: 'g1' }), live(30, 40, { id: 'g2' })];
    const pk = { g1: picks({ A: [60, 55] }), g2: picks({ A: [50, 60] }) }; // exact (22) and a right away winner with margin 10 vs 10 (exact margin + unique)
    const r = run(rows, games, pk)[0];
    expect(r.total).toBe(22 + 5 + 6 + 5); // g2: pick 50-60 vs live 30-40: margin -10 = -10 -> winner 5 + exact margin 6 + unique margin 5
    expect(r).toMatchObject({ winnerCorrect: 2, exactHits: 1, uniqueHits: 2 });
  });
});

describe('per-day points for the monthly table (trackDays)', () => {
  const rows = [{ ...base('A', 100), byDay: { '2026-11-05': [10, 1, 0] } }, base('B', 50)];
  const pk = { g1: picks({ A: [60, 55], B: [110, 100] }) };
  const game = (day) => live(60, 55, { day });
  it('adds the provisional points, exact and unique hits to the game\'s day', () => {
    const r = by(run(rows, [game('2026-11-05')], pk, { trackDays: true }));
    expect(r.A.byDay['2026-11-05']).toEqual([10 + 22, 2, 1, 1, 10 + 22]); // exact + unique = 22 points; an older 3-number cell is upgraded
    expect(r.B.byDay['2026-11-05']).toEqual([5, 0, 0, 1, 5]); // right winner only, a new cell
  });
  it('is OFF by default: Head to Head (which uses byDay) does not move live', () => {
    const r = by(run(rows, [game('2026-11-05')], pk));
    expect(r.A.byDay).toEqual({ '2026-11-05': [10, 1, 0] });
    expect(r.B.byDay).toBeUndefined();
  });
  it('does not change the input byDay', () => {
    run(rows, [game('2026-11-05')], pk, { trackDays: true });
    expect(rows[0].byDay['2026-11-05']).toEqual([10, 1, 0]);
  });
});

describe('a live game with a JOKER in the per-day points', () => {
  const rows = [base('A', 100)];
  const pk = { g1: picks({ A: [60, 55, { joker: true }] }) }; // exact + unique = 22 points, doubled = 44
  it('the main total is doubled; the per-day points without the joker (5th number) are not', () => {
    const r = applyLiveGames({ rows, games: [{ ...live(60, 55), day: '2026-11-05' }], picksByGame: pk, scoring: DEFAULT_SCORING, countedRounds: ['RS'], lastRecalcMs: 0, nowMs: NOW, trackDays: true })[0];
    expect(r.total).toBe(100 + 44);
    expect(r.byDay['2026-11-05']).toEqual([44, 1, 1, 1, 22]);
  });
});

import { describe, it, expect } from 'vitest';
import { rankAt, rankMoves } from './rankMoves.js';

const row = (uid, byDay, extra = {}) => ({ uid, name: uid, byDay, bonus: 0, adjust: 0, ...extra });

describe('rankMoves: the arrows of the Home page top 5', () => {
  const rows = [row('A', { '2026-11-01': [100] }), row('B', { '2026-11-01': [90] }), row('C', { '2026-11-01': [80], '2026-11-02': [30] })];
  it('places gained / lost over the latest day with points: C climbs two places, A and B fall one', () => {
    const r = rankMoves(rows);
    expect(r.day).toBe('2026-11-02');
    expect(r.moves).toEqual({ C: 2, A: -1, B: -1 });
  });
  it('a player who did not move has no entry', () => {
    const r = rankMoves([row('A', { '2026-11-01': [100], '2026-11-02': [10] }), row('B', { '2026-11-01': [50] })]);
    expect(r.moves).toEqual({});
  });
  it('nothing before the first points, and days with only 0 points do not count', () => {
    expect(rankMoves([row('A', {}), row('B', { '2026-11-01': [0] })])).toEqual({ day: null, moves: {} });
  });
  it('the movement is measured over the LATEST day only (an older day is history)', () => {
    const r = rankMoves([row('A', { '2026-11-01': [10], '2026-11-02': [50] }), row('B', { '2026-11-01': [60], '2026-11-03': [1] })]);
    expect(r.day).toBe('2026-11-03');
    expect(r.moves).toEqual({ A: -1 }); // before 11-03 A and B shared first place (60 each); B's 61 puts A second. B stays first: no arrow
  });
  it('equal points share a rank, so a tie does not create an arrow', () => {
    const r = rankMoves([row('A', { '2026-11-01': [10], '2026-11-02': [5] }), row('B', { '2026-11-01': [15] })]);
    expect(r.moves).toEqual({ A: 1 }); // before: B 15, A 10; now both 15: A shares first place
  });
  it('the first game day of the season: everybody was tied at 0, so there are no arrows (nobody "fell" behind the others)', () => {
    const r = rankMoves([row('A', { '2026-11-01': [10] }), row('B', {}), row('C', { '2026-11-01': [4] })]);
    expect(r.day).toBe('2026-11-01');
    expect(r.moves).toEqual({});
  });
  it('from the second game day on the arrows work, also for a player who joined late (no points before)', () => {
    const r = rankMoves([row('A', { '2026-11-01': [10] }), row('B', { '2026-11-01': [5] }), row('L', { '2026-11-02': [20] })]);
    expect(r.day).toBe('2026-11-02');
    expect(r.moves).toEqual({ L: 2, A: -1, B: -1 }); // L: from third place (0 points) to first = 2 places up; A and B one place down each
  });
  it('rankAt is the same function the weekly summary uses (bonus and adjustments are kept)', () => {
    expect(rankAt([row('A', { '2026-11-01': [10] }, { bonus: 3 })], '2026-11-01')[0].pts).toBe(13);
  });
});

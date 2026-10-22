import { describe, it, expect } from 'vitest';
import { monthChampions, monthFinished, monthKeys, monthlyRows } from './monthly.js';

describe('months shown as tabs', () => {
  it('nothing before November; a new month appears on the 1st; never past April', () => {
    expect(monthKeys('2026-10-31')).toEqual([]);
    expect(monthKeys('2026-11-01')).toEqual(['2026-11']);
    expect(monthKeys('2027-01-15')).toEqual(['2026-11', '2026-12', '2027-01']);
    expect(monthKeys('2027-04-09')).toEqual(['2026-11', '2026-12', '2027-01', '2027-02', '2027-03', '2027-04']);
    expect(monthKeys('2027-06-01')).toHaveLength(6);
  });
});

describe('monthly points = only the days of that month, only game points', () => {
  const rows = [
    { uid: 'A', total: 500, bonus: 90, byDay: { '2026-10-30': [10, 1, 0], '2026-11-01': [7, 0, 0], '2026-11-30': [12, 1, 1], '2026-12-01': [20, 2, 1] } },
    { uid: 'B', total: 300, bonus: 0, byDay: { '2026-11-15': [3.5, 0, 0] } },
    { uid: 'C', total: 0 }, // no byDay at all
  ];
  it('sums the days of the month and ignores the other months and the bonus', () => {
    const nov = Object.fromEntries(monthlyRows(rows, '2026-11').map((r) => [r.uid, r]));
    expect(nov.A).toMatchObject({ mPts: 19, mExact: 1, mUnique: 1 });
    expect(nov.B).toMatchObject({ mPts: 3.5, mExact: 0, mUnique: 0 });
    expect(nov.C).toMatchObject({ mPts: 0, mExact: 0, mUnique: 0 });
    const dec = Object.fromEntries(monthlyRows(rows, '2026-12').map((r) => [r.uid, r]));
    expect(dec.A.mPts).toBe(20);
  });
  it('does not change the input rows', () => {
    const copy = JSON.parse(JSON.stringify(rows));
    monthlyRows(rows, '2026-11');
    expect(rows).toEqual(copy);
  });
});

describe('the champion of the month', () => {
  const m = (uid, mPts, mExact = 0, mUnique = 0) => ({ uid, mPts, mExact, mUnique });
  it('most points; then exact hits; then unique hits', () => {
    expect(monthChampions([m('A', 50), m('B', 60), m('C', 40)]).map((r) => r.uid)).toEqual(['B']);
    expect(monthChampions([m('A', 60, 2), m('B', 60, 3)]).map((r) => r.uid)).toEqual(['B']);
    expect(monthChampions([m('A', 60, 3, 0), m('B', 60, 3, 1)]).map((r) => r.uid)).toEqual(['B']);
  });
  it('a real tie shares the title (nobody is crowned by the alphabet)', () => {
    expect(monthChampions([m('A', 60, 3, 1), m('B', 60, 3, 1), m('C', 10)]).map((r) => r.uid).sort()).toEqual(['A', 'B']);
  });
  it('nobody has points yet = no champion', () => {
    expect(monthChampions([m('A', 0), m('B', 0)])).toEqual([]);
    expect(monthChampions([])).toEqual([]);
  });
});

describe('when a month is over', () => {
  const g = (dayKey, status) => ({ dayKey, status });
  it('not before its last day has passed', () => {
    expect(monthFinished({ monthKey: '2026-11', todayKey: '2026-11-30', games: [] })).toBe(false);
    expect(monthFinished({ monthKey: '2026-11', todayKey: '2026-12-01', games: [g('2026-11-30', 'finished')] })).toBe(true);
  });
  it('and not while one of its games is still waiting or being played', () => {
    expect(monthFinished({ monthKey: '2026-11', todayKey: '2026-12-01', games: [g('2026-11-30', 'live')] })).toBe(false);
    expect(monthFinished({ monthKey: '2026-11', todayKey: '2026-12-01', games: [g('2026-11-29', 'scheduled')] })).toBe(false);
    expect(monthFinished({ monthKey: '2026-11', todayKey: '2026-12-01', games: [g('2026-11-29', 'cancelled'), g('2026-12-02', 'scheduled')] })).toBe(true); // other months / cancelled do not count
  });
});

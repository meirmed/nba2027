import { describe, it, expect } from 'vitest';
import { MID_WINDOWS, buildBracket, cleanGroups, compareStats, groupTable, pairState, stageOver, windowStats } from './midTournament.js';

// players u1..u23; every row has the points of ONE day in each window: byDay { day: [points, exact, unique] }
const day = { G: '2026-11-20', QF: '2026-12-09', SF: '2026-12-16', F: '2026-12-23' };
const row = (uid, pts = {}) => ({ uid, name: uid, byDay: Object.fromEntries(Object.entries(pts).map(([st, v]) => [day[st], Array.isArray(v) ? v : [v, 0, 0]])) });
const rowsOf = (list) => Object.fromEntries(list.map((r) => [r.uid, r]));
const AFTER = { G: '2026-12-07', QF: '2026-12-14', SF: '2026-12-21', F: '2026-12-28' };

describe('window stats', () => {
  it('sums only the days of the window; the edges are inclusive; other days and the bonus do not count', () => {
    const r = { bonus: 99, byDay: { '2026-11-08': [50, 5, 5], '2026-11-09': [10, 1, 0], '2026-12-06': [7, 0, 1], '2026-12-07': [100, 9, 9] } };
    expect(windowStats(r, MID_WINDOWS.G)).toEqual({ pts: 17, exact: 1, unique: 1 });
    expect(windowStats(undefined, MID_WINDOWS.G)).toEqual({ pts: 0, exact: 0, unique: 0 });
  });
  it('better = points, then exact hits, then unique hits', () => {
    expect(compareStats({ pts: 5, exact: 0, unique: 0 }, { pts: 4, exact: 9, unique: 9 })).toBeLessThan(0);
    expect(compareStats({ pts: 5, exact: 2, unique: 0 }, { pts: 5, exact: 1, unique: 9 })).toBeLessThan(0);
    expect(compareStats({ pts: 5, exact: 1, unique: 2 }, { pts: 5, exact: 1, unique: 1 })).toBeLessThan(0);
    expect(compareStats({ pts: 5, exact: 1, unique: 1 }, { pts: 5, exact: 1, unique: 1 })).toBe(0);
  });
});

describe('group table', () => {
  const rows = rowsOf([row('a', { G: 30 }), row('b', { G: 50 }), row('c', { G: 40 }), row('d', { G: 10 }), row('e', { G: 5 })]);
  it('ranks 1..N by group-stage points; the top 2 qualify', () => {
    const { table, needsDecision } = groupTable({ members: ['a', 'b', 'c', 'd', 'e'], rowsByUid: rows, window: MID_WINDOWS.G });
    expect(table.map((t) => t.uid)).toEqual(['b', 'c', 'a', 'd', 'e']);
    expect(table.map((t) => t.rank)).toEqual([1, 2, 3, 4, 5]);
    expect(table.map((t) => t.qualified)).toEqual([true, true, false, false, false]);
    expect(needsDecision).toBe(false);
  });
  it('a real tie between places 1-2 or 2-3 needs the admin; a tie lower down does not', () => {
    const tie12 = rowsOf([row('a', { G: 50 }), row('b', { G: 50 }), row('c', { G: 10 })]);
    expect(groupTable({ members: ['a', 'b', 'c'], rowsByUid: tie12, window: MID_WINDOWS.G }).needsDecision).toBe(true);
    const tie23 = rowsOf([row('a', { G: 60 }), row('b', { G: 50 }), row('c', { G: 50 }), row('d', { G: 1 })]);
    expect(groupTable({ members: ['a', 'b', 'c', 'd'], rowsByUid: tie23, window: MID_WINDOWS.G }).needsDecision).toBe(true);
    const tie34 = rowsOf([row('a', { G: 60 }), row('b', { G: 50 }), row('c', { G: 5 }), row('d', { G: 5 })]);
    expect(groupTable({ members: ['a', 'b', 'c', 'd'], rowsByUid: tie34, window: MID_WINDOWS.G }).needsDecision).toBe(false);
  });
  it('exact hits and then unique hits break the tie', () => {
    const r = rowsOf([row('a', { G: [50, 1, 0] }), row('b', { G: [50, 2, 0] }), row('c', { G: [50, 2, 1] })]);
    expect(groupTable({ members: ['a', 'b', 'c'], rowsByUid: r, window: MID_WINDOWS.G }).table.map((t) => t.uid)).toEqual(['c', 'b', 'a']);
  });
  it('the admin decision puts the chosen first and second on top; an invalid decision is ignored', () => {
    const tie = rowsOf([row('a', { G: 50 }), row('b', { G: 50 }), row('c', { G: 50 })]);
    const ok = groupTable({ members: ['a', 'b', 'c'], rowsByUid: tie, window: MID_WINDOWS.G, top: ['c', 'a'] });
    expect(ok.table.map((t) => t.uid)).toEqual(['c', 'a', 'b']);
    expect(ok.needsDecision).toBe(false);
    const bad = groupTable({ members: ['a', 'b', 'c'], rowsByUid: tie, window: MID_WINDOWS.G, top: ['x', 'a'] });
    expect(bad.needsDecision).toBe(true);
  });
});

describe('stages end by the calendar and by the games', () => {
  it('not over until the last day has passed and no game of the window is waiting or live', () => {
    expect(stageOver(MID_WINDOWS.G, '2026-12-06', [])).toBe(false);
    expect(stageOver(MID_WINDOWS.G, '2026-12-07', [])).toBe(true);
    expect(stageOver(MID_WINDOWS.G, '2026-12-07', [{ dayKey: '2026-12-06', status: 'live' }])).toBe(false);
    expect(stageOver(MID_WINDOWS.G, '2026-12-07', [{ dayKey: '2026-12-06', status: 'finished' }, { dayKey: '2026-12-08', status: 'scheduled' }])).toBe(true); // a later stage's game does not matter
  });
});

describe('a pair', () => {
  const rows = rowsOf([row('x', { QF: 40 }), row('y', { QF: 30 }), row('p', { QF: 25 }), row('q', { QF: 25 })]);
  it('the player with more points wins once the stage is over; before that only a leader', () => {
    const live = pairState({ aUid: 'x', bUid: 'y', rowsByUid: rows, window: MID_WINDOWS.QF, over: false });
    expect(live).toMatchObject({ leader: 'a', winner: null, needsDecision: false });
    const done = pairState({ aUid: 'x', bUid: 'y', rowsByUid: rows, window: MID_WINDOWS.QF, over: true });
    expect(done).toMatchObject({ winner: 'x', needsDecision: false });
  });
  it('a full tie needs the admin; his decision must be one of the two', () => {
    expect(pairState({ aUid: 'p', bUid: 'q', rowsByUid: rows, window: MID_WINDOWS.QF, over: true })).toMatchObject({ winner: null, needsDecision: true });
    expect(pairState({ aUid: 'p', bUid: 'q', rowsByUid: rows, window: MID_WINDOWS.QF, over: true, winnerOverride: 'q' })).toMatchObject({ winner: 'q', needsDecision: false });
    expect(pairState({ aUid: 'p', bUid: 'q', rowsByUid: rows, window: MID_WINDOWS.QF, over: true, winnerOverride: 'zzz' }).needsDecision).toBe(true);
  });
  it('an empty slot has no winner', () => {
    expect(pairState({ aUid: 'x', bUid: null, rowsByUid: rows, window: MID_WINDOWS.QF, over: true })).toMatchObject({ b: null, winner: null, needsDecision: false });
  });
});

describe('the whole tournament: 23 players, groups of 6 + 6 + 6 + 5', () => {
  const ids = Array.from({ length: 23 }, (_, i) => `u${i + 1}`);
  const groups = { A: ids.slice(0, 6), B: ids.slice(6, 12), C: ids.slice(12, 18), D: ids.slice(18, 23) };
  // group stage: in every group the first player of the list scores most (A: u1 > u2 > ..., B: u7 > u8 ...), so seeds are A1=u1 A2=u2 B1=u7 B2=u8 C1=u13 C2=u14 D1=u19 D2=u20
  const gPts = (i) => 100 - i * 10;
  const rows = (extra = () => ({})) => rowsOf(ids.map((u, i) => row(u, { G: gPts(i % 6), ...extra(u) })));
  const build = (todayKey, rs, overrides = {}) => buildBracket({ groups, rowsByUid: rs, overrides, todayKey, games: [] });

  it('before the group stage is over nothing is decided: no quarter-final players yet', () => {
    const b = build('2026-11-25', rows());
    expect(b.over.G).toBe(false);
    expect(b.status.G).toBe('live');
    expect(b.pairs.QF1.a).toBeNull();
    expect(b.champion).toBeNull();
  });
  it('quarter finals: first of a group against the second of another (A1-B2, C1-D2, B1-A2, D1-C2)', () => {
    const b = build(AFTER.G, rows());
    const names = (k) => [b.pairs[k].a.uid, b.pairs[k].b.uid];
    expect(names('QF1')).toEqual(['u1', 'u8']); // A1 - B2
    expect(names('QF2')).toEqual(['u13', 'u20']); // C1 - D2
    expect(names('QF3')).toEqual(['u7', 'u2']); // B1 - A2
    expect(names('QF4')).toEqual(['u19', 'u14']); // D1 - C2
    expect(b.status.QF).toBe('live'); // Dec 7 is the first day of the quarter-final window
    expect(build('2026-12-06', rows()).status.QF).toBe('upcoming');
  });
  it('the winners of the quarter finals meet in the semi finals (QF1 v QF2, QF3 v QF4), then the final, then the champion', () => {
    // QF: the first-named player of each pair wins; SF: u1 beats u13, u7 beats u19; F: u7 beats u1
    const rs = rows((u) => ({ u1: { QF: 50, SF: 40 }, u8: { QF: 10 }, u13: { QF: 50, SF: 30 }, u20: { QF: 10 }, u7: { QF: 50, SF: 60, F: 70 }, u2: { QF: 10 }, u19: { QF: 50, SF: 20 }, u14: { QF: 10 } }[u] || {}));
    const rsWithFinal = { ...rs, u1: { ...rs.u1, byDay: { ...rs.u1.byDay, [day.F]: [55, 0, 0] } } };
    const b = build(AFTER.F, rsWithFinal);
    expect(b.pairs.QF1.winner).toBe('u1');
    expect([b.pairs.SF1.a.uid, b.pairs.SF1.b.uid]).toEqual(['u1', 'u13']);
    expect([b.pairs.SF2.a.uid, b.pairs.SF2.b.uid]).toEqual(['u7', 'u19']);
    expect(b.pairs.SF1.winner).toBe('u1');
    expect(b.pairs.SF2.winner).toBe('u7');
    expect([b.pairs.F.a.uid, b.pairs.F.b.uid]).toEqual(['u1', 'u7']);
    expect(b.pairs.F.winner).toBe('u7'); // 70 > 55
    expect(b.champion).toBe('u7');
  });
  it('the final is open (no champion) until its stage is over', () => {
    const rs = rows((u) => ({ u1: { QF: 50 }, u13: { QF: 50 }, u7: { QF: 50 }, u19: { QF: 50 } }[u] || {}));
    const b = build('2026-12-24', rs); // inside the final week; the semi finals are over, the final is on
    expect(b.status.F).toBe('live');
    expect(b.champion).toBeNull();
  });
  it('a tie in a group blocks the bracket until the admin decides places 1 and 2', () => {
    const tiedA = rows((u) => (['u1', 'u2'].includes(u) ? {} : {}));
    const rs = { ...tiedA, u2: row('u2', { G: 100 }) }; // u1 and u2 both 100 in group A
    const blocked = build(AFTER.G, rs);
    expect(blocked.groupDecisions).toEqual(['A']);
    const decided = build(AFTER.G, rs, { groupTop: { A: ['u2', 'u1'] } });
    expect(decided.groupDecisions).toEqual([]);
    expect(decided.pairs.QF1.a.uid).toBe('u2'); // A1 is now u2
  });
  it('a tied pair is listed for the admin and his decision moves the winner on', () => {
    const rs = rows((u) => ({ u1: { QF: 30 }, u8: { QF: 30 } }[u] || {}));
    const b = build(AFTER.QF, rs);
    expect(b.pairDecisions).toContain('QF1');
    const decided = build(AFTER.QF, rs, { pairWinner: { QF1: 'u8' } });
    expect(decided.pairs.QF1.winner).toBe('u8');
    expect(decided.pairs.SF1.a.uid).toBe('u8'); // the decided winner is already in the semi final
  });
});

describe('clean groups', () => {
  it('a player is kept once only, unknown groups are dropped', () => {
    expect(cleanGroups({ A: ['x', 'y', 'x'], B: ['y', 'z'], Z: ['q'] })).toEqual({ A: ['x', 'y'], B: ['z'], C: [], D: [] });
  });
});

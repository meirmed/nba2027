import { describe, it, expect } from 'vitest';
import { MID_WINDOWS, buildBracket, cleanGroups, compareStats, groupTable, pairState, stageOver, windowStats } from './midTournament.js';

// players u1..u23; every row has the points of ONE day in each window: byDay { day: [points, exact, unique] }
const day = { G: '2026-11-10', QF: '2026-11-24', SF: '2026-12-01', F: '2026-12-08' }; // a day inside each window
const row = (uid, pts = {}) => ({ uid, name: uid, byDay: Object.fromEntries(Object.entries(pts).map(([st, v]) => [day[st], Array.isArray(v) ? v : [v, 0, 0]])) });
const rowsOf = (list) => Object.fromEntries(list.map((r) => [r.uid, r]));
const AFTER = { G: '2026-11-21', QF: '2026-11-28', SF: '2026-12-05', F: '2026-12-12' }; // the day after each window ends

describe('window stats', () => {
  it('sums only the days of the window; the edges are inclusive; other days and the bonus do not count', () => {
    const r = { total: 321, bonus: 99, byDay: { '2026-10-29': [50, 5, 5, 5], '2026-10-30': [10, 1, 0, 2], '2026-11-20': [7, 0, 1, 1], '2026-11-21': [100, 9, 9, 9] } };
    expect(windowStats(r, MID_WINDOWS.G)).toEqual({ pts: 17, winners: 3, exact: 1, unique: 1, total: 321 }); // total = the overall score, only for the last tiebreaker
    expect(windowStats(undefined, MID_WINDOWS.G)).toEqual({ pts: 0, winners: 0, exact: 0, unique: 0, total: 0 });
    expect(windowStats({ byDay: { '2026-11-10': [5, 0, 0] } }, MID_WINDOWS.G).winners).toBe(0); // an older day with only 3 numbers
  });
  it('the JOKER doubling does not count: the 5th number of the day is used, an older day falls back to its points', () => {
    const r = { byDay: { '2026-11-10': [44, 1, 1, 1, 22], '2026-11-11': [10, 0, 0, 1], '2026-11-12': [6, 0, 0, 0, 6] } };
    expect(windowStats(r, MID_WINDOWS.G).pts).toBe(22 + 10 + 6); // not 44 + 10 + 6
  });
  it('better = points; then correct winners, then exact hits, then unique hits, then the overall score in the main table', () => {
    const S = (pts, winners, exact, unique, total) => ({ pts, winners, exact, unique, total });
    expect(compareStats(S(5, 0, 0, 0, 0), S(4, 9, 9, 9, 999))).toBeLessThan(0); // points come first
    expect(compareStats(S(5, 3, 0, 0, 0), S(5, 2, 9, 9, 999))).toBeLessThan(0); // then correct winners
    expect(compareStats(S(5, 3, 2, 0, 0), S(5, 3, 1, 9, 999))).toBeLessThan(0); // then exact hits
    expect(compareStats(S(5, 3, 1, 2, 0), S(5, 3, 1, 1, 999))).toBeLessThan(0); // then unique hits
    expect(compareStats(S(5, 3, 1, 1, 200), S(5, 3, 1, 1, 150))).toBeLessThan(0); // then the overall total
    expect(compareStats(S(5, 3, 1, 1, 150), S(5, 3, 1, 1, 150))).toBe(0); // a real tie: only now the admin decides
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
  it('correct winners, then exact hits, then unique hits, then the overall score break the tie', () => {
    const r = rowsOf([row('a', { G: [50, 0, 0, 5] }), row('b', { G: [50, 0, 0, 7] }), row('c', { G: [50, 1, 0, 5] }), row('d', { G: [50, 1, 1, 5] })]);
    // same points: b has the most correct winners; then c and d (5 winners): d has more unique hits; then a (5 winners, no exact hit)
    expect(groupTable({ members: ['a', 'b', 'c', 'd'], rowsByUid: r, window: MID_WINDOWS.G }).table.map((t) => t.uid)).toEqual(['b', 'd', 'c', 'a']);
  });
  it('everything equal in the window: the overall score in the main table decides, and only a real tie needs the admin', () => {
    const base = (u, total) => ({ ...row(u, { G: [50, 1, 1, 5] }), total });
    const r = rowsOf([base('a', 100), base('b', 300), base('c', 200)]);
    const g = groupTable({ members: ['a', 'b', 'c'], rowsByUid: r, window: MID_WINDOWS.G });
    expect(g.table.map((t) => t.uid)).toEqual(['b', 'c', 'a']);
    expect(g.needsDecision).toBe(false);
    const tied = rowsOf([base('a', 300), base('b', 300), base('c', 100)]);
    expect(groupTable({ members: ['a', 'b', 'c'], rowsByUid: tied, window: MID_WINDOWS.G }).needsDecision).toBe(true);
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
    expect(stageOver(MID_WINDOWS.G, '2026-11-20', [])).toBe(false);
    expect(stageOver(MID_WINDOWS.G, '2026-11-21', [])).toBe(true);
    expect(stageOver(MID_WINDOWS.G, '2026-11-21', [{ dayKey: '2026-11-20', status: 'live' }])).toBe(false);
    expect(stageOver(MID_WINDOWS.G, '2026-11-21', [{ dayKey: '2026-11-20', status: 'finished' }, { dayKey: '2026-11-24', status: 'scheduled' }])).toBe(true); // a later stage's game does not matter
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
  it('equal in the window: the overall score in the main table decides the pair', () => {
    const r = rowsOf([{ ...row('p', { QF: [25, 2, 1, 4] }), total: 500 }, { ...row('q', { QF: [25, 2, 1, 4] }), total: 450 }]);
    expect(pairState({ aUid: 'p', bUid: 'q', rowsByUid: r, window: MID_WINDOWS.QF, over: true })).toMatchObject({ winner: 'p', needsDecision: false });
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
    const b = build('2026-11-15', rows());
    expect(b.over.G).toBe(false);
    expect(b.status.G).toBe('live');
    expect(b.pairs.QF1.a).toBeNull();
    expect(b.champion).toBeNull();
  });
  it('quarter finals in the owner\'s order: A1-B2, B1-A2, C1-D2, D1-C2', () => {
    const b = build(AFTER.G, rows());
    const names = (k) => [b.pairs[k].a.uid, b.pairs[k].b.uid];
    expect(names('QF1')).toEqual(['u1', 'u8']); // A1 - B2
    expect(names('QF2')).toEqual(['u7', 'u2']); // B1 - A2
    expect(names('QF3')).toEqual(['u13', 'u20']); // C1 - D2
    expect(names('QF4')).toEqual(['u19', 'u14']); // D1 - C2
    expect(b.status.QF).toBe('live'); // Dec 7 is the first day of the quarter-final window
    expect(build('2026-11-20', rows()).status.QF).toBe('upcoming'); // the last day of the group stage
  });
  it('semi finals = the winner of QF1 v the winner of QF3, and the winner of QF2 v the winner of QF4; then the final and the champion', () => {
    // QF: the first-named player of each pair wins (u1, u7, u13, u19); SF1: u1 beats u13; SF2: u7 beats u19; final: u7 beats u1
    const pts = { u1: { QF: 50, SF: 40, F: 55 }, u8: { QF: 10 }, u7: { QF: 50, SF: 60, F: 70 }, u2: { QF: 10 }, u13: { QF: 50, SF: 30 }, u20: { QF: 10 }, u19: { QF: 50, SF: 20 }, u14: { QF: 10 } };
    const b = build(AFTER.F, rows((u) => pts[u] || {}));
    expect(['QF1', 'QF2', 'QF3', 'QF4'].map((k) => b.pairs[k].winner)).toEqual(['u1', 'u7', 'u13', 'u19']);
    expect([b.pairs.SF1.a.uid, b.pairs.SF1.b.uid]).toEqual(['u1', 'u13']); // winner of A1-B2 v winner of C1-D2
    expect([b.pairs.SF2.a.uid, b.pairs.SF2.b.uid]).toEqual(['u7', 'u19']); // winner of B1-A2 v winner of D1-C2
    expect(b.pairs.SF1.winner).toBe('u1');
    expect(b.pairs.SF2.winner).toBe('u7');
    expect([b.pairs.F.a.uid, b.pairs.F.b.uid]).toEqual(['u1', 'u7']);
    expect(b.pairs.F.winner).toBe('u7'); // 70 > 55
    expect(b.champion).toBe('u7');
  });
  it('the final is open (no champion) until its stage is over', () => {
    const rs = rows((u) => ({ u1: { QF: 50 }, u13: { QF: 50 }, u7: { QF: 50 }, u19: { QF: 50 } }[u] || {}));
    const b = build('2026-12-08', rs); // inside the final week; the semi finals are over, the final is on
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

describe('the joker in the tournament: only the main table is doubled', () => {
  it('a player with a joker is NOT ahead of a player with the same real points in a group', () => {
    const rows = { a: { ...row('a'), total: 500, byDay: { '2026-11-10': [100, 0, 0, 3, 50] } }, b: { ...row('b'), total: 200, byDay: { '2026-11-10': [60, 0, 0, 3, 60] } } };
    const { table } = groupTable({ members: ['a', 'b'], rowsByUid: rows, window: MID_WINDOWS.G });
    expect(table.map((x) => [x.uid, x.pts])).toEqual([['b', 60], ['a', 50]]); // a: 100 in the main table, but only 50 here
  });
  it('a pair is decided by the points without the joker', () => {
    const rows = { x: { ...row('x'), byDay: { '2026-11-24': [90, 0, 0, 2, 45] } }, y: { ...row('y'), byDay: { '2026-11-24': [50, 0, 0, 2, 50] } } };
    const p = pairState({ aUid: 'x', bUid: 'y', rowsByUid: rows, window: MID_WINDOWS.QF, over: true });
    expect(p.winner).toBe('y'); // 50 > 45, although x has 90 in the main table
  });
});

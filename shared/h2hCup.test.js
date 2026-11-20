import { describe, it, expect } from 'vitest';
import { CUP_ADVANCE_1, CUP_GROUPS_2, R_SLOTS, buildCup, cleanWindows, cupGroupTable, windowsProblem } from './h2hCup.js';

const cell = (x) => [x, 0, 0, 0, x];
const prow = (uid, o = {}, extra = {}) => ({ uid, name: uid, total: 0, byDay: Object.fromEntries(Object.entries(o).map(([d, x]) => [d, cell(x)])), ...extra });
const W = { G: { lo: '2026-12-01', hi: '2026-12-10' }, R: { lo: '2026-12-11', hi: '2026-12-20' }, QF: { lo: '2026-12-21', hi: '2026-12-27' }, SF: { lo: '2026-12-28', hi: '2027-01-03' }, F: { lo: '2027-01-04', hi: '2027-01-10' } };

describe('the dates of the stages', () => {
  it('only complete and valid windows are used; the rest is "not set yet"', () => {
    expect(cleanWindows({ G: W.G, R: { lo: '2026-12-11' }, QF: { lo: '2026-12-30', hi: '2026-12-20' }, SF: { lo: 'x', hi: 'y' } })).toEqual({ G: W.G });
    expect(cleanWindows(undefined)).toEqual({});
  });
  it('what is wrong with the typed dates: a bad format, from after to, an overlap; a stage may stay empty', () => {
    expect(windowsProblem(W)).toBeNull();
    expect(windowsProblem({ G: W.G, QF: W.QF })).toBeNull(); // R left empty
    expect(windowsProblem({ G: { lo: '1.12.2026', hi: '2026-12-10' } })).toEqual({ code: 'format', stage: 'G' });
    expect(windowsProblem({ G: { lo: '2026-12-10', hi: '2026-12-01' } })).toEqual({ code: 'order', stage: 'G' });
    expect(windowsProblem({ G: W.G, R: { lo: '2026-12-10', hi: '2026-12-20' } })).toEqual({ code: 'overlap', stage: 'R' }); // R starts on the last day of G
    expect(windowsProblem({ G: W.G, R: {} })).toBeNull();
  });
});

describe('a group table with 4 advancing places', () => {
  const rows = Object.fromEntries(['a', 'b', 'c', 'd', 'e', 'f'].map((u, i) => [u, prow(u, { '2026-12-02': 60 - i * 10 })]));
  const t = (extra = {}) => cupGroupTable({ members: ['a', 'b', 'c', 'd', 'e', 'f'], rowsByUid: rows, window: W.G, qualifiers: CUP_ADVANCE_1, ...extra });
  it('the top 4 of 6 advance, the last two are out', () => {
    const r = t();
    expect(r.table.map((x) => x.uid)).toEqual(['a', 'b', 'c', 'd', 'e', 'f']);
    expect(r.table.map((x) => x.qualified)).toEqual([true, true, true, true, false, false]);
    expect(r.needsDecision).toBe(false);
  });
  it('a real tie between the 4th and the 5th place (the cut) needs the admin; a tie between the 5th and 6th does not', () => {
    const tied = { ...rows, e: prow('e', { '2026-12-02': 30 }) }; // d = 30 as well: equal on everything
    expect(cupGroupTable({ members: ['a', 'b', 'c', 'd', 'e', 'f'], rowsByUid: tied, window: W.G, qualifiers: 4 }).needsDecision).toBe(true);
    const lowTie = { ...rows, f: prow('f', { '2026-12-02': 20 }) }; // e = 20 and f = 20: both are out anyway
    expect(cupGroupTable({ members: ['a', 'b', 'c', 'd', 'e', 'f'], rowsByUid: lowTie, window: W.G, qualifiers: 4 }).needsDecision).toBe(false);
  });
  it('a tie INSIDE the top 4 also needs a decision (the order decides who goes to which new group)', () => {
    const tied = { ...rows, b: prow('b', { '2026-12-02': 60 }) }; // a = 60, b = 60
    expect(cupGroupTable({ members: ['a', 'b', 'c', 'd', 'e', 'f'], rowsByUid: tied, window: W.G, qualifiers: 4 }).needsDecision).toBe(true);
  });
  it('the admin\'s decision is the ordered list of the 4; it must be 4 different members of the group', () => {
    const tied = { ...rows, e: prow('e', { '2026-12-02': 30 }) };
    const ok = cupGroupTable({ members: ['a', 'b', 'c', 'd', 'e', 'f'], rowsByUid: tied, window: W.G, qualifiers: 4, top: ['a', 'b', 'c', 'e'] });
    expect(ok.decided).toBe(true); expect(ok.needsDecision).toBe(false);
    expect(ok.table.slice(0, 4).map((x) => x.uid)).toEqual(['a', 'b', 'c', 'e']);
    expect(ok.table[4].uid).toBe('d'); // d is out
    ['wrong length', ['a', 'b', 'c'], ['a', 'a', 'b', 'c'], ['a', 'b', 'c', 'zzz']].forEach((bad) => expect(cupGroupTable({ members: ['a', 'b', 'c', 'd', 'e', 'f'], rowsByUid: tied, window: W.G, qualifiers: 4, top: bad }).decided).toBe(false));
  });
  it('a group of 5 (the smallest): the 5th place is the only one out', () => {
    const r = cupGroupTable({ members: ['a', 'b', 'c', 'd', 'e'], rowsByUid: rows, window: W.G, qualifiers: 4 });
    expect(r.table.filter((x) => !x.qualified).map((x) => x.uid)).toEqual(['e']);
  });
});

describe('the whole competition: 23 players, 7 out, 16 in the new groups E-H, 8 in the knockout, a champion', () => {
  const groups = { A: ['a1', 'a2', 'a3', 'a4', 'a5', 'a6'], B: ['b1', 'b2', 'b3', 'b4', 'b5', 'b6'], C: ['c1', 'c2', 'c3', 'c4', 'c5', 'c6'], D: ['d1', 'd2', 'd3', 'd4', 'd5'] };
  const pts = {};
  // stage G: the places of every group by points (60, 50, 40, 30, 20, 10)
  Object.values(groups).forEach((m) => m.forEach((u, i) => { pts[u] = { '2026-12-02': 60 - i * 10 }; }));
  const add = (u, day, x) => { pts[u] = { ...pts[u], [day]: x }; };
  // stage R (11-20 Dec): E = a1 d2 c3 b4, F = b1 a2 d3 c4, G = c1 b2 a3 d4, H = d1 c2 b3 a4
  [['a1', 10], ['d2', 40], ['c3', 30], ['b4', 20], ['b1', 5], ['a2', 50], ['d3', 20], ['c4', 10], ['c1', 10], ['b2', 20], ['a3', 5], ['d4', 30], ['d1', 50], ['c2', 40], ['b3', 20], ['a4', 10]].forEach(([u, x]) => add(u, '2026-12-15', x));
  // the knockout: QF1 d2 v d3, QF2 a2 v c3, QF3 d4 v c2, QF4 d1 v b2
  [['d2', 20], ['d3', 10], ['a2', 5], ['c3', 15], ['d4', 7], ['c2', 9], ['d1', 30], ['b2', 1]].forEach(([u, x]) => add(u, '2026-12-22', x));
  [['d2', 10], ['c2', 12], ['c3', 20], ['d1', 5]].forEach(([u, x]) => add(u, '2026-12-30', x)); // SF1 d2 v c2, SF2 c3 v d1
  [['c2', 8], ['c3', 9]].forEach(([u, x]) => add(u, '2027-01-05', x)); // the final c2 v c3
  const rowsByUid = Object.fromEntries(Object.keys(pts).map((u) => [u, prow(u, pts[u])]));
  const cfg = { groups, windows: W };
  const at = (todayKey, c = cfg) => buildCup({ cfg: c, rowsByUid, todayKey });

  it('before the dates are set: nothing is "live", nobody is placed in E-H', () => {
    const c = buildCup({ cfg: { groups }, rowsByUid, todayKey: '2026-12-15' });
    expect(Object.values(c.status)).toEqual(['undated', 'undated', 'undated', 'undated', 'undated']);
    expect(Object.values(c.groupsR).flat()).toEqual([]);
    expect(c.started).toBe(true);
    expect(c.champion).toBeNull();
  });
  it('during the group stage: live, the cut after the 4th place, nobody is in E-H yet', () => {
    const c = at('2026-12-05');
    expect(c.status).toMatchObject({ G: 'live', R: 'upcoming', QF: 'upcoming' });
    expect(c.tablesG.A.table.filter((x) => x.qualified).map((x) => x.uid)).toEqual(['a1', 'a2', 'a3', 'a4']);
    expect(Object.values(c.groupsR).flat()).toEqual([]);
    expect(c.out).toEqual([]); // nobody is out before the stage is over
  });
  it('when the group stage is over: 16 advance (4 of every group), 7 are out, and the new groups follow the rotation', () => {
    const c = at('2026-12-11');
    expect(c.status).toMatchObject({ G: 'over', R: 'live' });
    expect(c.groupsR.E).toEqual(['a1', 'd2', 'c3', 'b4']);
    expect(c.groupsR.F).toEqual(['b1', 'a2', 'd3', 'c4']);
    expect(c.groupsR.G).toEqual(['c1', 'b2', 'a3', 'd4']);
    expect(c.groupsR.H).toEqual(['d1', 'c2', 'b3', 'a4']);
    expect(Object.values(c.groupsR).flat()).toHaveLength(16);
    expect(c.out.map((x) => x.uid).sort()).toEqual(['a5', 'a6', 'b5', 'b6', 'c5', 'c6', 'd5']); // 2 + 2 + 2 + 1 = 7
    expect(23 - c.out.length).toBe(16);
  });
  it('the rotation table: one of every old group and one of every place in every new group', () => {
    CUP_GROUPS_2.forEach((e) => {
      expect(R_SLOTS[e].map((s) => s[0]).sort()).toEqual(['A', 'B', 'C', 'D']);
      expect(R_SLOTS[e].map((s) => Number(s[1])).sort()).toEqual([1, 2, 3, 4]);
    });
    expect(R_SLOTS.E[0]).toBe('A1'); expect(R_SLOTS.F[1]).toBe('A2'); expect(R_SLOTS.G[2]).toBe('A3'); expect(R_SLOTS.H[3]).toBe('A4'); // the owner's own example for group A
  });
  it('stage R starts from ZERO: only the points of its own window count', () => {
    const c = at('2026-12-18');
    expect(c.tablesR.E.table.find((x) => x.uid === 'a1').pts).toBe(10); // not 60 + 10
    expect(c.tablesR.E.table.map((x) => x.uid)).toEqual(['d2', 'c3', 'b4', 'a1']); // E: 40, 30, 20, 10
    expect(c.tablesR.E.table.map((x) => x.qualified)).toEqual([true, true, false, false]); // the top 2 advance
  });
  it('the knockout is the mid-season one: E1-F2, F1-E2, G1-H2, H1-G2, then QF1 v QF3 and QF2 v QF4', () => {
    const c = at('2026-12-21');
    expect(c.status).toMatchObject({ R: 'over', QF: 'live' });
    expect(Object.values(c.pairs).slice(0, 4).map((p) => p.slots)).toEqual([['E1', 'F2'], ['F1', 'E2'], ['G1', 'H2'], ['H1', 'G2']]);
    expect([c.pairs.QF1, c.pairs.QF2, c.pairs.QF3, c.pairs.QF4].map((p) => [p.a.uid, p.b.uid])).toEqual([['d2', 'd3'], ['a2', 'c3'], ['d4', 'c2'], ['d1', 'b2']]);
    expect(c.pairs.SF1.slots).toEqual(['QF1', 'QF3']);
    expect(c.pairs.SF2.slots).toEqual(['QF2', 'QF4']);
  });
  it('a champion at the end of the final', () => {
    expect(at('2027-01-11').champion).toBe('c3');
    expect(at('2026-12-29').pairs.SF1.a.uid).toBe('d2'); // the winners of the quarter finals meet in the semi finals
    expect(at('2026-12-29').pairs.SF1.b.uid).toBe('c2');
    expect(at('2027-01-05').champion).toBeNull(); // the final is still on
  });
  it('a real tie at the cut blocks the next round until the admin decides (the ordered 4); nothing is guessed', () => {
    const tiedRows = { ...rowsByUid, a5: prow('a5', { '2026-12-02': 30 }) }; // a4 = 30 as well
    const blocked = buildCup({ cfg, rowsByUid: tiedRows, todayKey: '2026-12-11' });
    expect(blocked.decisions.G).toEqual(['A']);
    expect(blocked.pending).toBe(1);
    expect(Object.values(blocked.groupsR).flat()).toEqual([]);
    const decided = buildCup({ cfg: { ...cfg, overrides: { groupTop: { A: ['a1', 'a2', 'a3', 'a5'] } } }, rowsByUid: tiedRows, todayKey: '2026-12-11' });
    expect(decided.decisions.G).toEqual([]);
    expect(decided.groupsR.H).toContain('a5'); // a5 took the 4th place, so he goes to H instead of a4
    expect(decided.groupsR.H).not.toContain('a4');
    expect(decided.out.map((x) => x.uid)).toContain('a4');
  });
  it('a tie in a new group (the 2nd and 3rd place) or in a pair is decided by the admin too', () => {
    const tiedRows = { ...rowsByUid, c3: prow('c3', { ...pts.c3, '2026-12-15': 40 }) }; // c3 = d2 = 40 in group E
    const c = buildCup({ cfg, rowsByUid: tiedRows, todayKey: '2026-12-21' });
    expect(c.decisions.R).toEqual(['E']);
    const decided = buildCup({ cfg: { ...cfg, overrides: { rTop: { E: ['c3', 'd2'] } } }, rowsByUid: tiedRows, todayKey: '2026-12-21' });
    expect(decided.decisions.R).toEqual([]);
    expect(decided.tablesR.E.table[0].uid).toBe('c3');
  });
  it('the JOKER does not count in any stage (the 5th number of the day is used)', () => {
    const jr = { ...rowsByUid, a1: { ...rowsByUid.a1, byDay: { ...rowsByUid.a1.byDay, '2026-12-02': [120, 0, 0, 0, 60] } } }; // 120 with a joker, 60 without
    expect(buildCup({ cfg, rowsByUid: jr, todayKey: '2026-12-05' }).tablesG.A.table[0].pts).toBe(60);
  });
  it('a stage that is over but has a game still waiting is not over (the same rule as the mid-season tournament)', () => {
    const c = buildCup({ cfg, rowsByUid, todayKey: '2026-12-11', games: [{ dayKey: '2026-12-10', status: 'live' }] });
    expect(c.status.G).toBe('live');
    expect(Object.values(c.groupsR).flat()).toEqual([]);
  });
});

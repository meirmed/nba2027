import { describe, it, expect } from 'vitest';
import { H2H_COMP, MAX_WORDS, MID_COMP, claudePrompt, computeFacts, factLine, rankAt, selectFacts, weekOptions, wordCount, writeSummary } from './weeklySummary.js';

const row = (uid, byDay, extra = {}) => ({ uid, name: uid, byDay, bonus: 0, adjust: 0, ...extra });
const LO = '2026-11-08'; // a Sunday
const HI = '2026-11-14'; // the Saturday

describe('the weeks to choose from', () => {
  it('this week so far, then the last completed Sunday-Saturday weeks', () => {
    const w = weekOptions('2026-11-11'); // a Wednesday
    expect(w[0]).toEqual({ lo: '2026-11-08', hi: '2026-11-11', current: true });
    expect(w[1]).toEqual({ lo: '2026-11-01', hi: '2026-11-07', current: false });
    expect(w[2]).toEqual({ lo: '2026-10-25', hi: '2026-10-31', current: false });
    expect(w).toHaveLength(6);
    expect(weekOptions('2026-11-08')[0]).toEqual({ lo: '2026-11-08', hi: '2026-11-08', current: true }); // on a Sunday
  });
});

describe('the table at a day', () => {
  it('game points up to the day (with the joker) + bonus + adjustments; equal points share a rank', () => {
    const r = rankAt([row('a', { '2026-11-01': [10], '2026-11-09': [5] }, { bonus: 3 }), row('b', { '2026-11-01': [10] }, { adjust: 3 }), row('c', {})], '2026-11-05');
    expect(r.map((x) => [x.uid, x.pts, x.rank])).toEqual([['a', 13, 1], ['b', 13, 1], ['c', 0, 3]]);
    expect(rankAt([row('a', { '2026-11-09': [5] })], '2026-11-09')[0].pts).toBe(5);
  });
});

describe('rank facts: climber, faller, leader change', () => {
  const rows = [
    row('A', { '2026-11-01': [100] }), row('B', { '2026-11-01': [90] }), row('C', { '2026-11-01': [80] }),
    row('D', { '2026-11-01': [70] }), row('E', { '2026-11-01': [60], '2026-11-12': [5] }), row('F', { '2026-11-01': [50], '2026-11-10': [60] }),
  ];
  const facts = computeFacts({ rows, games: [], picksByGame: {}, weekLo: LO, weekHi: HI });
  const get = (t) => facts.find((f) => f.type === t);

  it('the biggest climber (6th -> 1st) and the new leader', () => {
    expect(get('climber')).toMatchObject({ name: 'F', from: 6, to: 1, delta: 5 });
    expect(get('leaderChange')).toMatchObject({ name: 'F', prev: 'A' });
  });
  it('no faller when nobody fell by 2 places or more', () => {
    expect(get('faller')).toBeUndefined();
  });
  it('a faller: 1st place overtaken by three players', () => {
    const r = [row('A', { '2026-11-01': [100] }), row('B', { '2026-11-01': [90], '2026-11-10': [30] }), row('C', { '2026-11-01': [80], '2026-11-10': [30] }), row('D', { '2026-11-01': [70], '2026-11-10': [40] })];
    const f = computeFacts({ rows: r, games: [], picksByGame: {}, weekLo: LO, weekHi: HI }).find((x) => x.type === 'faller');
    expect(f).toMatchObject({ name: 'A', from: 1, to: 4, drop: 3 });
  });
  it('the start of the season (everybody at 0) is not a move', () => {
    const r = ['a', 'b', 'c', 'd'].map((u) => row(u, {}));
    expect(computeFacts({ rows: r, games: [], picksByGame: {}, weekLo: LO, weekHi: HI })).toEqual([]);
  });
  it('the leader of the month changed during the week', () => {
    const r = [row('A', { '2026-11-02': [30] }), row('B', { '2026-11-03': [20], '2026-11-10': [30] })]; // November: A 30, B 20 -> after the week A 30, B 50
    expect(computeFacts({ rows: r, games: [], picksByGame: {}, weekLo: LO, weekHi: HI }).find((x) => x.type === 'monthLeader')).toMatchObject({ name: 'B', prev: 'A', month: '2026-11' });
  });
});

describe('facts from the games of the week', () => {
  const NAMES = ['p1', 'p2', 'p3', 'p4', 'p5', 'p6', 'p7', 'p8'];
  const rows = NAMES.map((u) => row(u, {}));
  const G = (id, day) => ({ id, round: 'RS', status: 'finished', t1: 'BOS', t2: 'NYK', s1: 110, s2: 100, tipoffMs: Date.parse(`2026-11-${day}T18:00:00Z`) });
  const games = [G('g1', '09'), G('g2', '10'), G('g3', '11'), G('g4', '12'), G('g5', '13')]; // every game ends 110-100
  const win = (s1 = 108, s2 = 100) => ({ s1, s2 });
  const lose = { s1: 90, s2: 100 };
  const picksByGame = {
    // g1 is HARD: only p1 (exact score) and p3 picked the winner
    g1: { p1: { ...win(110, 100), joker: true }, p3: win(105, 100), p2: lose, p4: lose, p5: lose, p6: lose, p7: lose, p8: lose },
    // g2..g5: p1 always right, p2 always wrong (a joker on g2: 0 points), the others right
    g2: { p1: win(), p2: { ...lose, joker: true }, p3: win(), p4: win(), p5: win(), p6: win(), p7: win(), p8: win() },
    g3: { p1: win(), p2: lose, p3: win(), p4: win(), p5: win(), p6: win(), p7: win(), p8: win() },
    g4: { p1: win(), p2: lose, p3: win(), p4: win(), p5: win(), p6: win(), p7: win(), p8: win() },
    g5: { p1: win(), p2: lose, p3: win(), p4: win(), p5: win(), p6: win(), p7: win(), p8: win() },
  };
  const facts = computeFacts({ rows, games, picksByGame, weekLo: LO, weekHi: HI, teamName: (a) => ({ BOS: 'בוסטון', NYK: 'ניו יורק' }[a] || a) });
  const get = (t) => facts.find((f) => f.type === t);

  it('a hard game: only 2 of 8 picked the winner, and the hero hit the exact score', () => {
    expect(get('hardGame')).toMatchObject({ name: 'p1', k: 2, n: 8, kind: 'exact', kindNoun: 'תוצאה מדויקת', game: 'בוסטון נגד ניו יורק' });
  });
  it('a hit streak of 5 and a miss streak of 5', () => {
    expect(get('hotStreak')).toMatchObject({ name: 'p1', n: 5 });
    expect(get('coldStreak')).toMatchObject({ name: 'p2', n: 5 });
  });
  it('jokers: a golden one (exact and unique, doubled) and one that landed on zero', () => {
    expect(get('jokerWin')).toMatchObject({ name: 'p1' });
    expect(get('jokerWin').pts).toBeGreaterThanOrEqual(20);
    expect(get('jokerFail')).toMatchObject({ name: 'p2' });
  });
  it('the best and the worst of the week, and the exact / unique counters', () => {
    expect(get('mvp').name).toBe('p1');
    expect(get('ghost').name).toBe('p2');
    expect(facts.find((f) => f.type === 'exactKing')).toBeUndefined(); // p1 has only one exact score
  });
  it('auto-filled picks do not make streaks, and games outside the week are ignored', () => {
    const auto = Object.fromEntries(Object.entries(picksByGame).map(([id, m]) => [id, { ...m, p1: { ...m.p1, autoFilled: true } }]));
    const f = computeFacts({ rows, games, picksByGame: auto, weekLo: LO, weekHi: HI });
    expect(f.find((x) => x.type === 'hotStreak')?.name).not.toBe('p1');
    expect(computeFacts({ rows, games, picksByGame, weekLo: '2026-11-15', weekHi: '2026-11-21' }).find((x) => x.type === 'mvp')).toBeUndefined();
  });
  it('facts are sorted by their interest, best first', () => {
    const s = facts.map((f) => f.score);
    expect([...s].sort((a, b) => b - a)).toEqual(s);
  });

  describe('the text', () => {
    it('3-4 paragraphs and at most 380 words, whatever the version (seed)', () => {
      expect(MAX_WORDS).toBe(380);
      for (let seed = 0; seed < 40; seed += 1) {
        const w = writeSummary(facts, { seed });
        expect(w.paragraphs.length).toBeGreaterThanOrEqual(3);
        expect(w.paragraphs.length).toBeLessThanOrEqual(4);
        expect(w.words).toBe(wordCount(w.paragraphs.join(' ')));
        expect(w.words).toBeLessThanOrEqual(MAX_WORDS);
      }
    });
    it('the text is about twice as long as before (the first version was ~75 words for four facts): 4 facts give 130+ words, many facts 200+', () => {
      const four = writeSummary(facts.slice(0, 4), { seed: 0 });
      expect(four.facts).toHaveLength(4);
      expect(four.words).toBeGreaterThanOrEqual(130);
      const many = writeSummary(facts, { seed: 0 });
      expect(many.facts.length).toBeGreaterThanOrEqual(6);
      expect(many.words).toBeGreaterThanOrEqual(200);
    });
    it('with more than four facts they are shared between four paragraphs (the strongest ones get two)', () => {
      const w = writeSummary(facts, { seed: 0 });
      expect(w.facts.length).toBeGreaterThan(4);
      expect(w.paragraphs).toHaveLength(4);
    });
    it('the same seed gives the same text; every "another version" is a new mix of sentences, not a short cycle', () => {
      expect(writeSummary(facts, { seed: 3 }).paragraphs).toEqual(writeSummary(facts, { seed: 3 }).paragraphs);
      const texts = Array.from({ length: 30 }, (_, s) => writeSummary(facts, { seed: s }).paragraphs.join('|'));
      expect(new Set(texts).size).toBe(30); // thirty clicks, thirty different texts
      expect(texts[0]).not.toBe(texts[1]);
    });
    it('the facts stay the same in every version (only the sentences change)', () => {
      const ids = (s) => writeSummary(facts, { seed: s }).facts.map((f) => `${f.type}:${f.name}`).join(',');
      expect(ids(0)).toBe(ids(7));
    });
    it('a quiet week: one short paragraph; two facts: two paragraphs', () => {
      expect(writeSummary([]).paragraphs).toHaveLength(1);
      expect(writeSummary(facts.slice(0, 2)).paragraphs).toHaveLength(2);
    });
    it('the names of the facts are in the text', () => {
      const w = writeSummary(facts, { seed: 0 });
      const all = w.paragraphs.join(' ');
      w.facts.forEach((f) => expect(all).toContain(f.name));
    });
    it('a person is never in more than three facts', () => {
      const same = Array.from({ length: 6 }, (_, i) => ({ type: 'mvp', score: 90 - i, name: 'X', pts: 9 }));
      expect(selectFacts(same, 8)).toHaveLength(3);
    });
    it('a Hebrew prefix letter is attached to a Hebrew name ("לדן") and hyphenated to a Latin one ("ל-Nir"), in every version', () => {
      const all = (name, prev) => Array.from({ length: 30 }, (_, s) => writeSummary([{ type: 'leaderChange', score: 100, name, prev }], { seed: s }).paragraphs.join(' ')).join(' ');
      const heb = all('דן כהן', 'מאיה לוי');
      expect(heb).not.toMatch(/[לו]-[\u0590-\u05FF]/); // never "ל-מאיה"
      expect(heb).toContain('למאיה לוי');
      expect(heb).toContain('ודן כהן');
      const lat = all('Nir Moalem', 'Arik Safran');
      expect(lat).not.toMatch(/[לו][A-Za-z]/); // never "לArik"
      expect(lat).toContain('ל-Arik Safran');
      expect(lat).toContain('ו-Nir Moalem');
    });
    it('the paragraph of a month leader shows the month name', () => {
      const w = writeSummary([{ type: 'monthLeader', score: 70, name: 'B', prev: 'A', month: '2026-11' }], { monthName: () => 'נובמבר' });
      expect(w.paragraphs[0]).toContain('נובמבר');
    });
  });

  it('the lines of the facts and the prompt for Claude', () => {
    expect(factLine(get('hotStreak'))).toContain('5');
    const p = claudePrompt(facts);
    expect(p).toContain(String(MAX_WORDS));
    expect(p).toContain(factLine(get('hardGame')));
    expect(claudePrompt([])).toContain('שבוע שקט');
  });
});


// ---------------------------------------------------------------- the two tournaments
const cell = (x) => [x, 0, 0, 0, x];
const days = (o) => Object.fromEntries(Object.entries(o).map(([d, x]) => [d, cell(x)]));
const prow = (uid, o) => ({ uid, name: uid, byDay: days(o), bonus: 0, adjust: 0, total: 0 });

describe('facts about the mid-season tournament', () => {
  const g3 = { A: ['a1', 'a2', 'a3'], B: ['b1', 'b2', 'b3'], C: ['c1', 'c2', 'c3'], D: ['d1', 'd2', 'd3'] };
  it('while the group stage runs: a group changed its leader, and a tight fight for the last place that qualifies', () => {
    const rows = [prow('a1', { '2026-11-02': 10 }), prow('a2', { '2026-11-02': 5, '2026-11-10': 20 }), prow('a3', {}),
      prow('b1', { '2026-11-03': 30 }), prow('b2', { '2026-11-03': 20 }), prow('b3', { '2026-11-04': 19 }), ...['c1', 'c2', 'c3', 'd1', 'd2', 'd3'].map((u) => prow(u, {}))];
    const f = computeFacts({ rows, games: [], picksByGame: {}, weekLo: '2026-11-08', weekHi: '2026-11-14', mid: { groups: g3 } });
    expect(f.find((x) => x.type === 'groupLeader')).toMatchObject({ comp: MID_COMP, group: 'A', name: 'a2', prev: 'a1' });
    expect(f.find((x) => x.type === 'bubble')).toMatchObject({ comp: MID_COMP, group: 'B', name2: 'b2', name3: 'b3', gap: 1 });
  });
  it('the group stage ended in the week: who qualified (the top two of every group)', () => {
    const pts = { 1: 50, 2: 40, 3: 10 };
    const rows = Object.entries(g3).flatMap(([, m]) => m.map((u, i) => prow(u, { '2026-11-05': pts[i + 1] })));
    const q = computeFacts({ rows, games: [], picksByGame: {}, weekLo: '2026-11-15', weekHi: '2026-11-21', mid: { groups: g3 } }).find((x) => x.type === 'qualified');
    expect(q).toMatchObject({ comp: MID_COMP, names: 'a1, a2, b1, b2, c1, c2, d1, d2' });
  });

  // 8 players, 2 per group; the quarter finals A1-B2, B1-A2, C1-D2, D1-C2
  const g2 = { A: ['p1', 'p2'], B: ['p3', 'p4'], C: ['p5', 'p6'], D: ['p7', 'p8'] };
  const rows8 = [
    prow('p1', { '2026-11-05': 100, '2026-11-24': 30, '2026-12-01': 50, '2026-12-08': 33 }), prow('p2', { '2026-11-05': 50, '2026-11-24': 5 }),
    prow('p3', { '2026-11-05': 100, '2026-11-24': 40, '2026-12-01': 20 }), prow('p4', { '2026-11-05': 50, '2026-11-24': 10 }),
    prow('p5', { '2026-11-05': 100, '2026-11-24': 20 }), prow('p6', { '2026-11-05': 50, '2026-11-24': 5 }),
    prow('p7', { '2026-11-05': 100, '2026-11-24': 15, '2026-12-01': 25, '2026-12-08': 30 }), prow('p8', { '2026-11-05': 50, '2026-11-24': 25, '2026-12-01': 10 }),
  ];
  const run8 = (weekLo, weekHi, rows = rows8) => computeFacts({ rows, games: [], picksByGame: {}, weekLo, weekHi, mid: { groups: g2 } });
  it('a knockout stage ended in the week: the winners and the closest decision', () => {
    const f = run8('2026-11-22', '2026-11-28').find((x) => x.type === 'stageDone');
    expect(f).toMatchObject({ comp: MID_COMP, stage: 'רבע הגמר', winners: 'p1, p3, p8, p7' });
    expect(f.closest).toEqual({ winner: 'p8', loser: 'p5', margin: 5 });
  });
  it('the final ended in the week: the champion, the runner-up and the margin', () => {
    expect(run8('2026-12-06', '2026-12-12').find((x) => x.type === 'champion')).toMatchObject({ comp: MID_COMP, name: 'p1', runner: 'p7', margin: 3 });
    expect(run8('2026-12-06', '2026-12-12').find((x) => x.type === 'stageDone')).toBeUndefined(); // the semi finals ended in an earlier week
  });
  it('a close fight inside a stage that is still running (and not a pair nobody has scored in)', () => {
    const rows = rows8.map((r) => (r.uid === 'p3' ? prow('p3', { ...Object.fromEntries(Object.entries(r.byDay).map(([d, c]) => [d, c[0]])), '2026-11-28': 20 }) : r.uid === 'p7' ? prow('p7', { ...Object.fromEntries(Object.entries(r.byDay).map(([d, c]) => [d, c[0]])), '2026-11-28': 22 }) : r));
    const f = run8('2026-11-22', '2026-11-28', rows).find((x) => x.type === 'pairLive');
    expect(f).toMatchObject({ comp: MID_COMP, stage: 'חצי הגמר', a: 'p3', b: 'p7', margin: 2 });
  });
  it('not set up: no facts', () => {
    expect(computeFacts({ rows: rows8, games: [], picksByGame: {}, weekLo: '2026-11-22', weekHi: '2026-11-28', mid: null }).filter((x) => x.comp)).toEqual([]);
    expect(computeFacts({ rows: rows8, games: [], picksByGame: {}, weekLo: '2026-11-22', weekHi: '2026-11-28', mid: { groups: { A: [], B: [], C: [], D: [] } } }).filter((x) => x.comp)).toEqual([]);
  });
});

describe('facts about Head to Head', () => {
  const rows = [prow('x1', { '2026-12-15': 10, '2026-12-22': 0 }), prow('x2', { '2026-12-15': 5, '2026-12-22': 20 }), prow('x3', {}), prow('y1', { '2026-12-16': 20 }), prow('y2', { '2026-12-16': 19 }), prow('y3', {})];
  const league = { startDay: '2026-12-14', endDay: null, groups: { A: { members: ['x1', 'x2', 'x3'] }, B: { members: ['y1', 'y2', 'y3'] } } };
  it('the league: a group changed its leader; a tight fight for the last place that qualifies', () => {
    const f = computeFacts({ rows, games: [], picksByGame: {}, weekLo: '2026-12-20', weekHi: '2026-12-26', h2h: { status: 'league', advancePerGroup: 1, league, stages: {} } });
    expect(f.find((x) => x.type === 'groupLeader')).toMatchObject({ comp: H2H_COMP, group: 'A', name: 'x2', prev: 'x1' });
    expect(f.find((x) => x.type === 'bubble')).toMatchObject({ comp: H2H_COMP, group: 'B', name2: 'y1', name3: 'y2', gap: 1 });
  });
  const kRows = [prow('x1', { '2026-12-22': 30 }), prow('x2', { '2026-12-22': 25 }), prow('x3', { '2026-12-23': 10 }), prow('x4', { '2026-12-23': 12 })];
  const closedLeague = { ...league, endDay: '2026-12-20' };
  it('a knockout stage closed in the week: the winners and the closest decision', () => {
    const h2h = { status: 'knockout', advancePerGroup: 1, league: closedLeague, stages: { K1: { stageNum: 1, startDay: '2026-12-21', endDay: '2026-12-24', pairs: { p1: { a: 'x1', b: 'x2', advA: 0, advB: 0, winner: 'x1' }, p2: { a: 'x3', b: 'x4', advA: 0, advB: 0, winner: 'x4' } } } } };
    const f = computeFacts({ rows: kRows, games: [], picksByGame: {}, weekLo: '2026-12-20', weekHi: '2026-12-26', h2h }).find((x) => x.type === 'stageDone');
    expect(f).toMatchObject({ comp: H2H_COMP, stage: 'שלב 1', winners: 'x1, x4' });
    expect(f.closest).toEqual({ winner: 'x4', loser: 'x3', margin: 2 });
  });
  it('the last stage (one pair) closed and the tournament finished: the champion', () => {
    const h2h = { status: 'finished', championUid: 'x1', league: closedLeague, stages: { K2: { stageNum: 2, startDay: '2026-12-21', endDay: '2026-12-24', pairs: { p1: { a: 'x1', b: 'x2', advA: 0, advB: 0, winner: 'x1' } } } } };
    expect(computeFacts({ rows: kRows, games: [], picksByGame: {}, weekLo: '2026-12-20', weekHi: '2026-12-26', h2h }).find((x) => x.type === 'champion')).toMatchObject({ comp: H2H_COMP, name: 'x1', runner: 'x2', margin: 5 });
  });
  it('a head start is part of the margin; a stage that closed in another week and a missing setup give nothing', () => {
    const h2h = { status: 'knockout', league: closedLeague, stages: { K1: { stageNum: 1, startDay: '2026-12-21', endDay: '2026-12-24', pairs: { p1: { a: 'x1', b: 'x2', advA: 0, advB: 4, winner: 'x2' } } } } };
    const f = computeFacts({ rows: kRows, games: [], picksByGame: {}, weekLo: '2026-12-20', weekHi: '2026-12-26', h2h }).find((x) => x.type === 'stageDone');
    expect(f.closest.margin).toBe(1); // 30 vs 25 + 4
    expect(computeFacts({ rows: kRows, games: [], picksByGame: {}, weekLo: '2027-01-03', weekHi: '2027-01-09', h2h }).filter((x) => x.comp)).toEqual([]);
    expect(computeFacts({ rows: kRows, games: [], picksByGame: {}, weekLo: '2026-12-20', weekHi: '2026-12-26', h2h: null }).filter((x) => x.comp)).toEqual([]);
  });
});

describe('the summary mentions both tournaments', () => {
  const generic = Array.from({ length: 12 }, (_, i) => ({ type: 'mvp', score: 90 - i, name: `n${i}`, pts: 9 }));
  const midF = { type: 'stageDone', score: 40, comp: MID_COMP, stage: 'רבע הגמר', winners: 'a, b', closest: { winner: 'a', loser: 'c', margin: 2 } };
  const h2hF = { type: 'groupLeader', score: 41, comp: H2H_COMP, group: 'A', name: 'z1', prev: 'z2' };
  it('the best fact of each competition is always chosen, even when many generic facts are stronger; at most two of each', () => {
    const sel = selectFacts([...generic, midF, h2hF, { ...midF, score: 39 }, { ...midF, score: 38 }], 10);
    expect(sel).toHaveLength(10);
    expect(sel.some((f) => f.comp === MID_COMP)).toBe(true);
    expect(sel.some((f) => f.comp === H2H_COMP)).toBe(true);
    expect(sel.filter((f) => f.comp === MID_COMP).length).toBeLessThanOrEqual(2);
  });
  it('the text names the competitions, within the limit, in every version', () => {
    for (let seed = 0; seed < 30; seed += 1) {
      const w = writeSummary([...generic, midF, h2hF], { seed });
      const all = w.paragraphs.join(' ');
      expect(all).toContain('טורניר אמצע');
      expect(all).toContain('ראש בראש');
      expect(w.words).toBeLessThanOrEqual(MAX_WORDS);
      expect(w.paragraphs.length).toBeLessThanOrEqual(4);
    }
  });
  it('every tournament fact type has a text, a line and survives the word limit', () => {
    const all = [
      { type: 'groupLeader', score: 60, comp: MID_COMP, group: 'A', name: 'דן', prev: 'מאיה' }, { type: 'bubble', score: 55, comp: MID_COMP, group: 'B', name2: 'נועה', name3: 'אורי', gap: 1 },
      { type: 'qualified', score: 95, comp: MID_COMP, names: 'א, ב, ג' }, { type: 'stageDone', score: 85, comp: H2H_COMP, stage: 'שלב 1', winners: 'א, ב', closest: { winner: 'א', loser: 'ג', margin: 2 } },
      { type: 'champion', score: 100, comp: H2H_COMP, name: 'דן', runner: 'מאיה', margin: 3 }, { type: 'pairLive', score: 58, comp: MID_COMP, stage: 'חצי הגמר', a: 'דן', b: 'נועה', margin: 2 },
    ];
    all.forEach((f) => {
      const w = writeSummary([f], { seed: 4 });
      expect(w.paragraphs[0]).not.toContain('undefined');
      expect(w.paragraphs[0].length).toBeGreaterThan(60);
      expect(factLine(f)).not.toContain('{');
    });
    for (let seed = 0; seed < 20; seed += 1) expect(writeSummary(all, { seed }).words).toBeLessThanOrEqual(MAX_WORDS);
  });
});

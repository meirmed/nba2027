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
  it('star of the night: the record of the week, with the joker and the hard game behind it; a tie at the top is not a star', () => {
    const r = get('nightRecord');
    expect(r).toMatchObject({ name: 'p1', day: '2026-11-09', dayName: 'יום שני' });
    expect(r.pts).toBeGreaterThanOrEqual(40);
    expect(r.lead).toBeGreaterThan(0);
    expect(r.reason).toContain('ג׳וקר');
    expect(r.reason).toContain('הקשה');
    expect(get('repeatStar')).toBeUndefined(); // the other four days: everybody who was right has the same points, so there is no star
    expect(get('starSpecial')).toBeUndefined();
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

describe('facts about Head to Head (groups A-D -> round of 16 E-H -> knockout)', () => {
  const groups = { A: ['a1', 'a2', 'a3', 'a4', 'a5', 'a6'], B: ['b1', 'b2', 'b3', 'b4', 'b5', 'b6'], C: ['c1', 'c2', 'c3', 'c4', 'c5', 'c6'], D: ['d1', 'd2', 'd3', 'd4', 'd5'] };
  const W = { G: { lo: '2026-12-01', hi: '2026-12-10' }, R: { lo: '2026-12-11', hi: '2026-12-20' }, QF: { lo: '2026-12-21', hi: '2026-12-27' }, SF: { lo: '2026-12-28', hi: '2027-01-03' }, F: { lo: '2027-01-04', hi: '2027-01-10' } };
  const pts = {};
  Object.values(groups).forEach((m) => m.forEach((u, i) => { pts[u] = { '2026-12-02': 60 - i * 10 }; })); // the group stage: 60, 50, 40, 30, 20, 10
  const add = (u, day, x) => { pts[u] = { ...pts[u], [day]: x }; };
  [['a1', 10], ['d2', 40], ['c3', 30], ['b4', 20], ['b1', 5], ['a2', 50], ['d3', 20], ['c4', 10], ['c1', 10], ['b2', 20], ['a3', 5], ['d4', 30], ['d1', 50], ['c2', 40], ['b3', 20], ['a4', 10]].forEach(([u, x]) => add(u, '2026-12-15', x)); // round of 16
  [['d2', 20], ['d3', 10], ['a2', 5], ['c3', 15], ['d4', 7], ['c2', 9], ['d1', 30], ['b2', 1]].forEach(([u, x]) => add(u, '2026-12-22', x)); // quarter finals
  [['d2', 10], ['c2', 12], ['c3', 20], ['d1', 5]].forEach(([u, x]) => add(u, '2026-12-30', x)); // semi finals
  [['c2', 8], ['c3', 9]].forEach(([u, x]) => add(u, '2027-01-05', x)); // the final
  const rows = Object.keys(pts).map((u) => prow(u, pts[u]));
  const run = (cup, weekLo, weekHi) => computeFacts({ rows, games: [], picksByGame: {}, weekLo, weekHi, h2h: cup });
  const get = (f, ty) => f.find((x) => x.type === ty && x.comp === H2H_COMP);

  it('while the group stage runs: a group changed its leader, and the fight for the 4th place (the last one that advances)', () => {
    const r2 = rows.map((r) => (r.uid === 'a2' ? prow('a2', { '2026-12-02': 50, '2026-12-08': 20 }) : r.uid === 'b5' ? prow('b5', { '2026-12-02': 29 }) : r.uid === 'b4' ? prow('b4', { '2026-12-02': 30 }) : r));
    const f = computeFacts({ rows: r2, games: [], picksByGame: {}, weekLo: '2026-12-06', weekHi: '2026-12-09', h2h: { groups, windows: { G: W.G } } });
    expect(get(f, 'groupLeader')).toMatchObject({ group: 'A', name: 'a2', prev: 'a1' });
    expect(get(f, 'bubble')).toMatchObject({ group: 'B', name2: 'b4', name3: 'b5', gap: 1 });
  });
  it('the group stage ended in the week: the 7 who are out (2 + 2 + 2 + 1) and the 16 who stay', () => {
    const f = get(run({ groups, windows: W }, '2026-12-06', '2026-12-12'), 'cupEliminated');
    expect(f).toMatchObject({ out: 7, stay: 16, names: 'a5, a6, b5, b6, c5, c6, d5' });
  });
  it('the round of 16 ended in the week: the 8 who go to the knockout (the top two of E, F, G, H)', () => {
    const f = run({ groups, windows: W }, '2026-12-20', '2026-12-26').find((x) => x.type === 'qualified' && x.comp === H2H_COMP);
    expect(f).toMatchObject({ done: 'שלב שמינית הגמר', next: 'רבע הגמר', from: 'משמינית הגמר', names: 'd2, c3, a2, d3, d4, b2, d1, c2' });
  });
  it('the quarter finals ended in the week: the winners and the closest decision', () => {
    const f = get(run({ groups, windows: W }, '2026-12-27', '2027-01-02'), 'stageDone');
    expect(f).toMatchObject({ stage: 'רבע הגמר', winners: 'd2, c3, c2, d1' });
    expect(f.closest).toEqual({ winner: 'c2', loser: 'd4', margin: 2 });
  });
  it('the final ended in the week: the champion', () => {
    expect(get(run({ groups, windows: W }, '2027-01-10', '2027-01-16'), 'champion')).toMatchObject({ name: 'c3', runner: 'c2', margin: 1 });
  });
  it('not set up, no groups or no dates: nothing to say; a stage that ended in another week gives nothing', () => {
    expect(run(null, '2026-12-06', '2026-12-12').filter((x) => x.comp === H2H_COMP)).toEqual([]);
    expect(run({ groups: {} , windows: W }, '2026-12-06', '2026-12-12').filter((x) => x.comp === H2H_COMP)).toEqual([]);
    expect(run({ groups }, '2026-12-06', '2026-12-12').filter((x) => x.comp === H2H_COMP)).toEqual([]); // the dates are not set yet
    expect(get(run({ groups, windows: W }, '2027-02-01', '2027-02-07'), 'champion')).toBeUndefined();
  });
  it('the text of the eliminated players, in every version, with the right numbers and the name of the competition', () => {
    const f = { type: 'cupEliminated', score: 95, comp: H2H_COMP, out: 7, stay: 16, names: 'דן, מאיה' };
    for (let seed = 0; seed < 12; seed += 1) {
      const text = writeSummary([f], { seed }).paragraphs.join(' ');
      expect(text).toContain('16'); expect(text).toContain('דן, מאיה'); expect(text).toContain('ראש בראש'); expect(text).not.toContain('undefined');
    }
    expect(factLine(f)).toContain('7 הודחו');
  });
  it('the sentences of "who goes on" fit both rounds ("לשמינית" after the group stage, "לרבע" after the round of 16)', () => {
    const g = { type: 'qualified', score: 95, comp: MID_COMP, names: 'x' }; // the mid-season tournament: no extra fields
    const r = { type: 'qualified', score: 95, comp: H2H_COMP, names: 'x', done: 'שלב שמינית הגמר', next: 'רבע הגמר', from: 'משמינית הגמר' };
    for (let seed = 0; seed < 12; seed += 1) {
      expect(writeSummary([g], { seed }).paragraphs.join(' ')).toMatch(/שלב הבתים|מהבתים/);
      expect(writeSummary([r], { seed }).paragraphs.join(' ')).toMatch(/שמינית הגמר|משמינית הגמר/);
    }
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


describe('stars of the nights (calendar days)', () => {
  const ids = ['a', 'b', 'c', 'd', 'e', 'f'];
  const rows = ids.map((x) => row(x, {}));
  const G = (id, day) => ({ id, round: 'RS', status: 'finished', t1: 'BOS', t2: 'NYK', s1: 110, s2: 100, tipoffMs: Date.parse(`2026-11-${day}T18:00:00Z`) });
  const games = [G('g1', '09'), G('g2', '10'), G('g3', '11'), G('g4', '12')];
  const P = (s1, s2, extra = {}) => ({ s1, s2, ...extra });
  const away = P(90, 100);
  const base = {
    g1: { a: P(110, 100), b: P(108, 100), c: P(107, 100), d: away }, // a: the only exact score = 22 points
    g2: { a: P(108, 100), b: P(110, 100), c: away }, // b: 22
    g3: { a: P(110, 100), b: P(108, 100) }, // a: 22
    g4: { a: away, b: away, c: P(105, 95), d: away, e: away, f: away }, // a HARD game: only c (1 of 6) picked the winner, with the exact margin
  };
  const run = (extra = {}, picksByGame = base) => computeFacts({ rows, games, picksByGame, weekLo: '2026-11-08', weekHi: '2026-11-14', teamName: (x) => x, ...extra });
  const get = (f, t) => f.find((x) => x.type === t);

  it('the record: the highest nightly score of the week and the lead over the second place', () => {
    expect(get(run(), 'nightRecord')).toMatchObject({ name: 'a', pts: 22, lead: 14, day: '2026-11-09', dayName: 'יום שני', reason: '' });
  });
  it('a star who repeats: a was the star of two nights', () => {
    expect(get(run(), 'repeatStar')).toMatchObject({ name: 'a', n: 2, dayNames: 'יום שני, יום רביעי' });
  });
  it('a star of another night with a hard game behind it', () => {
    const f = get(run(), 'starSpecial');
    expect(f).toMatchObject({ name: 'c', kind: 'hard', dayName: 'יום חמישי', pts: 16 });
    expect(f.reason).toContain('1 מתוך 6');
  });
  it('a joker that paid is the reason of the star (the record night)', () => {
    const joker = { ...base, g1: { ...base.g1, a: P(110, 100, { joker: true }) } };
    const r = get(run({}, joker), 'nightRecord');
    expect(r).toMatchObject({ name: 'a', pts: 44, lead: 36 });
    expect(r.reason).toBe('ג׳וקר של 44 נקודות על BOS נגד NYK');
  });
  it('a day that still has a game waiting or being played has no star', () => {
    const f = run({ unfinishedDays: ['2026-11-09'] });
    expect(get(f, 'nightRecord')).toMatchObject({ name: 'b', day: '2026-11-10' });
    expect(get(f, 'repeatStar')).toBeUndefined(); // a was the star of one night only
  });
  it('the texts of the three star facts', () => {
    const facts = [get(run(), 'nightRecord'), get(run(), 'repeatStar'), get(run(), 'starSpecial')];
    for (let seed = 0; seed < 20; seed += 1) {
      const w = writeSummary(facts, { seed });
      const all = w.paragraphs.join(' ');
      expect(all).not.toContain('undefined');
      expect(all).toContain('a');
      expect(w.paragraphs).toHaveLength(3);
      expect(w.words).toBeLessThanOrEqual(MAX_WORDS);
    }
    facts.forEach((f) => expect(factLine(f)).toContain(f.name));
  });
});

describe('records: daily record, weekly high, weekly low, a star of the week who repeats', () => {
  const D = (n) => `2026-11-${String(n).padStart(2, '0')}`; // 2026-11-01 is a Sunday
  // a and b: weeks of 01-07 and 08-14 (and 15-21 = the week under test); days with points
  const mk = (a, b, c) => [row('a', a), row('b', b), row('c', c)];
  const week = (days, pts) => Object.fromEntries(days.map((d, i) => [D(d), [pts[i]]]));
  const run = (rows, lo = '2026-11-15', hi = '2026-11-21', extra = {}) => computeFacts({ rows, games: [], picksByGame: {}, weekLo: lo, weekHi: hi, ...extra });
  const get = (f, t) => f.find((x) => x.type === t);
  const rows = mk(
    { ...week([2, 3, 4], [20, 30, 25]), ...week([9, 10, 11], [20, 20, 20]), ...week([16, 17, 18], [40, 35, 30]) }, // a: 75, 60, 105
    { ...week([2, 3, 4], [10, 10, 10]), ...week([9, 10, 11], [30, 30, 30]), ...week([16, 17, 18], [10, 10, 10]) }, // b: 30, 90, 30
    { ...week([2, 3, 4], [12, 12, 12]), ...week([9, 10, 11], [15, 15, 15]), ...week([16, 17, 18], [1, 1, 1]) }, // c: 36, 45, 3
  );
  it('a daily record broken: a 40 against the old 30', () => {
    expect(get(run(rows), 'dayRecord')).toMatchObject({ name: 'a', pts: 40, prevPts: 30, dayName: 'יום שני', day: D(16) });
  });
  it('no daily record when the best day equals the old one', () => {
    const r = mk({ [D(3)]: [40], [D(16)]: [40] }, {}, {});
    expect(get(run(r), 'dayRecord')).toBeUndefined();
  });
  it('a weekly high: 105 against 90', () => {
    expect(get(run(rows), 'weekHigh')).toMatchObject({ name: 'a', pts: 105, prevPts: 90, prevName: 'b' });
  });
  it('a weekly low: c has 3 against the old low of 30 (the first week is partial, so only the 2nd week counts as a comparison)', () => {
    // the season started on 2026-11-04 (a Wednesday), so the week of 01-07 is partial: its low (30) is not compared
    const r = mk({ [D(4)]: [20], [D(5)]: [20], [D(6)]: [20], ...week([9, 10, 11], [20, 20, 20]), ...week([16, 17, 18], [40, 35, 30]) },
      { [D(4)]: [1], [D(5)]: [1], [D(6)]: [1], ...week([9, 10, 11], [30, 30, 30]), ...week([16, 17, 18], [10, 10, 10]) },
      { ...week([9, 10, 11], [15, 15, 15]), ...week([16, 17, 18], [1, 1, 1]) });
    expect(get(run(r), 'weekLow')).toMatchObject({ name: 'c', pts: 3, prevPts: 45, prevName: 'c' });
  });
  it('the star of the week who repeats: a won the week of 01-07 and 15-21', () => {
    const f = get(run(rows), 'weekStarRepeat');
    expect(f).toMatchObject({ name: 'a', n: 2, pts: 105, consecutive: false });
  });
  it('a consecutive star of the week', () => {
    const r = mk({ ...week([2, 3, 4], [20, 30, 25]), ...week([9, 10, 11], [40, 40, 40]), ...week([16, 17, 18], [40, 35, 30]) }, { ...week([2, 3, 4], [10, 10, 10]), ...week([9, 10, 11], [30, 30, 30]), ...week([16, 17, 18], [10, 10, 10]) }, {});
    expect(get(run(r), 'weekStarRepeat')).toMatchObject({ name: 'a', n: 3, consecutive: true });
  });
  it('no weekly facts for a partial week or a week with a game still open; the daily record still counts for finished days', () => {
    expect(get(run(rows, '2026-11-15', '2026-11-18'), 'weekHigh')).toBeUndefined();
    const f = run(rows, '2026-11-15', '2026-11-21', { unfinishedDays: [D(20)] });
    expect(get(f, 'weekHigh')).toBeUndefined();
    expect(get(f, 'dayRecord')).toBeDefined();
  });
  it('the records are always in the summary, and the texts have no holes', () => {
    const f = run(rows);
    const used = selectFacts([...f, ...Array.from({ length: 14 }, (_, i) => ({ type: 'exactKing', score: 90 + i, name: `x${i}`, n: 3 }))], 10);
    ['dayRecord', 'weekHigh', 'weekStarRepeat'].forEach((t) => expect(used.some((x) => x.type === t)).toBe(true));
    for (let seed = 0; seed < 20; seed += 1) {
      const w = writeSummary(f, { seed });
      expect(w.paragraphs.join(' ')).not.toContain('undefined');
      expect(w.facts.some((x) => x.type === 'dayRecord')).toBe(true);
    }
    f.filter((x) => x.must).forEach((x) => expect(factLine(x)).not.toContain('undefined'));
  });
});

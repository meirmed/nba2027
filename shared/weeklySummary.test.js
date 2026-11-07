import { describe, it, expect } from 'vitest';
import { MAX_WORDS, claudePrompt, computeFacts, factLine, rankAt, selectFacts, weekOptions, wordCount, writeSummary } from './weeklySummary.js';

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
    it('3-4 paragraphs and at most 150 words, whatever the version (seed)', () => {
      for (let seed = 0; seed < 25; seed += 1) {
        const w = writeSummary(facts, { seed });
        expect(w.paragraphs.length).toBeGreaterThanOrEqual(3);
        expect(w.paragraphs.length).toBeLessThanOrEqual(4);
        expect(w.words).toBe(wordCount(w.paragraphs.join(' ')));
        expect(w.words).toBeLessThanOrEqual(MAX_WORDS);
      }
    });
    it('the same seed gives the same text, another seed another version', () => {
      expect(writeSummary(facts, { seed: 3 }).paragraphs).toEqual(writeSummary(facts, { seed: 3 }).paragraphs);
      expect(writeSummary(facts, { seed: 0 }).paragraphs.join('|')).not.toBe(writeSummary(facts, { seed: 1 }).paragraphs.join('|'));
    });
    it('a quiet week: one short paragraph; two facts: two paragraphs', () => {
      expect(writeSummary([]).paragraphs).toHaveLength(1);
      expect(writeSummary(facts.slice(0, 2)).paragraphs).toHaveLength(2);
    });
    it('the names of the facts are in the text', () => {
      const w = writeSummary(facts, { seed: 0 });
      w.facts.forEach((f, i) => expect(w.paragraphs[i]).toContain(f.name));
    });
    it('a person is never in more than two paragraphs', () => {
      const same = Array.from({ length: 6 }, (_, i) => ({ type: 'mvp', score: 90 - i, name: 'X', pts: 9 }));
      expect(selectFacts(same, 4)).toHaveLength(2);
    });
    it('a Hebrew prefix letter is attached to a Hebrew name ("לדן") and hyphenated to a Latin one ("ל-Nir")', () => {
      const heb = writeSummary([{ type: 'leaderChange', score: 100, name: 'דן כהן', prev: 'מאיה לוי' }], { seed: 2 }).paragraphs[0];
      expect(heb).toContain('ולמאיה'.slice(1)); // "למאיה"
      expect(heb).toContain('ודן כהן');
      expect(heb).not.toMatch(/[לו]-[\u0590-\u05FF]/);
      const lat = writeSummary([{ type: 'leaderChange', score: 100, name: 'Nir Moalem', prev: 'Arik Safran' }], { seed: 2 }).paragraphs[0];
      expect(lat).toContain('ו-Nir Moalem');
      expect(lat).toContain('ל-Arik Safran');
    });
    it('the paragraph of a month leader shows the month name', () => {
      const w = writeSummary([{ type: 'monthLeader', score: 70, name: 'B', prev: 'A', month: '2026-11' }], { monthName: () => 'נובמבר' });
      expect(w.paragraphs[0]).toContain('נובמבר');
    });
  });

  it('the lines of the facts and the prompt for Claude', () => {
    expect(factLine(get('hotStreak'))).toContain('5');
    const p = claudePrompt(facts);
    expect(p).toContain('150');
    expect(p).toContain(factLine(get('hardGame')));
    expect(claudePrompt([])).toContain('שבוע שקט');
  });
});

import { describe, it, expect } from 'vitest';
import { EAST_TEAMS, WEST_TEAMS, scopeTeams, rankingMisses, scoreBonus, cleanAnswer, bonusClosedReason, computeBonusPoints, validateQuestion, maxBonusPoints, bonusStats } from './bonus.js';

const opts = [{ id: 'a', he: 'א', en: 'A', pts: 10 }, { id: 'b', he: 'ב', en: 'B', pts: 25 }, { id: 'c', he: 'ג', en: 'C', pts: 4 }];

describe('scoreBonus', () => {
  it('no correct answer yet -> pts 0, correct null', () => {
    expect(scoreBonus({ type: 'numeric', pts: 5, answer: [] }, ['3'])).toEqual({ pts: 0, correct: null });
  });
  it('unanswered -> 0', () => {
    expect(scoreBonus({ type: 'numeric', pts: 5, answer: ['3'] }, [])).toEqual({ pts: 0, correct: false });
  });
  it('numeric: exact only', () => {
    const q = { type: 'numeric', pts: 6, answer: ['20'] };
    expect(scoreBonus(q, ['20']).pts).toBe(6);
    expect(scoreBonus(q, ['20.0']).pts).toBe(6);
    expect(scoreBonus(q, ['19']).pts).toBe(0);
  });
  it('closest: owner example (correct 20, max 10, -1 per unit)', () => {
    const q = { type: 'closest', pts: 10, penalty: 1, answer: ['20'] };
    expect(scoreBonus(q, ['20'])).toEqual({ pts: 10, correct: true });
    expect(scoreBonus(q, ['18']).pts).toBe(8); // loses 2
    expect(scoreBonus(q, ['24']).pts).toBe(6); // loses 4
    expect(scoreBonus(q, ['35']).pts).toBe(0); // never below 0
  });
  it('closest: custom penalty and decimals', () => {
    expect(scoreBonus({ type: 'closest', pts: 10, penalty: 0.5, answer: ['20'] }, ['23']).pts).toBe(8.5);
    expect(scoreBonus({ type: 'closest', pts: 10, answer: ['20'] }, ['21']).pts).toBe(9); // default penalty 1
  });
  it('choice: single correct, and several accepted answers', () => {
    const q = { type: 'choice', pts: 5, options: opts, answer: ['a', 'b'] };
    expect(scoreBonus(q, ['a']).pts).toBe(5);
    expect(scoreBonus(q, ['c']).pts).toBe(0);
  });
  it('multi pick: points per correct pick, no penalty for wrong ones', () => {
    const q = { type: 'team', pts: 3, multi: true, answer: ['BOS', 'NYK', 'MIA', 'CLE'] };
    expect(scoreBonus(q, ['BOS', 'NYK', 'LAL', 'DEN']).pts).toBe(6);
    expect(scoreBonus(q, ['BOS', 'BOS']).pts).toBe(3);
  });
  it('player ids are compared exactly', () => {
    expect(scoreBonus({ type: 'player', pts: 8, answer: ['Xy7Ab'] }, ['Xy7Ab']).pts).toBe(8);
    expect(scoreBonus({ type: 'player', pts: 8, answer: ['Xy7Ab'] }, ['xy7ab']).pts).toBe(0);
  });
  it('dynamic_score: points of the option you picked (multi sums)', () => {
    const q = { type: 'dynamic_score', pts: 0, options: opts, answer: ['b'] };
    expect(scoreBonus(q, ['b']).pts).toBe(25);
    expect(scoreBonus(q, ['a']).pts).toBe(0);
    expect(scoreBonus({ ...q, multi: true, answer: ['a', 'b'] }, ['a', 'b', 'c']).pts).toBe(35);
  });
  it('text: normalized match against accepted answers', () => {
    const q = { type: 'text', pts: 4, answer: ['Jokic', 'יוקיץ׳'] };
    expect(scoreBonus(q, ['  jokic ']).pts).toBe(4);
    expect(scoreBonus(q, ['Embiid']).pts).toBe(0);
  });
});

describe('cleanAnswer', () => {
  it('numbers', () => {
    expect(cleanAnswer({ type: 'numeric' }, ' 12 ')).toEqual({ value: ['12'] });
    expect(cleanAnswer({ type: 'closest' }, '12.50')).toEqual({ value: ['12.5'] });
    expect(cleanAnswer({ type: 'numeric' }, 'abc').error).toBe('invalid-answer');
    expect(cleanAnswer({ type: 'numeric' }, ['1', '2']).error).toBe('invalid-answer');
  });
  it('options must exist; single vs multi limits', () => {
    const q = { type: 'choice', options: opts };
    expect(cleanAnswer(q, ['a']).value).toEqual(['a']);
    expect(cleanAnswer(q, ['zzz']).error).toBe('invalid-answer');
    expect(cleanAnswer(q, ['a', 'b']).error).toBe('too-many');
    expect(cleanAnswer({ ...q, multi: true, maxPicks: 2 }, ['a', 'b']).value).toEqual(['a', 'b']);
    expect(cleanAnswer({ ...q, multi: true, maxPicks: 2 }, ['a', 'b', 'c']).error).toBe('too-many');
  });
  it('teams, players, text, ranking', () => {
    expect(cleanAnswer({ type: 'team' }, ['BOS']).value).toEqual(['BOS']);
    expect(cleanAnswer({ type: 'team' }, ['XXX']).error).toBe('invalid-answer');
    expect(cleanAnswer({ type: 'player', multi: true }, ['p1', 'p2']).value).toEqual(['p1', 'p2']);
    expect(cleanAnswer({ type: 'player' }, ['a/b']).error).toBe('invalid-answer');
    expect(cleanAnswer({ type: 'text' }, 'x'.repeat(201)).error).toBe('invalid-answer');
    expect(cleanAnswer({ type: 'bogus' }, ['a']).error).toBe('not-supported');
  });
});

describe('bonusClosedReason', () => {
  const q = { type: 'numeric', deadlineMs: 1000, answer: [] };
  it('open / locked / answered / unsupported', () => {
    expect(bonusClosedReason(q, 999)).toBeNull();
    expect(bonusClosedReason(q, 1000)).toBe('locked');
    expect(bonusClosedReason({ ...q, answer: ['1'] }, 0)).toBe('answered');
    expect(bonusClosedReason({ ...q, type: 'bogus' }, 0)).toBe('not-supported');
    expect(bonusClosedReason(undefined, 0)).toBe('not-found');
  });
});

describe('computeBonusPoints', () => {
  it('sums per user and per category; skips unanswered questions and unset answers', () => {
    const questions = [
      { id: 'q1', category: 'season', type: 'numeric', pts: 6, answer: ['20'] },
      { id: 'q2', category: 'month', month: '2026-11', type: 'closest', pts: 10, penalty: 1, answer: ['20'] },
      { id: 'q3', category: 'general', type: 'numeric', pts: 9, answer: [] },
    ];
    const predictions = {
      A: { bonus: { q1: { answer: ['20'] }, q2: { answer: ['18'] }, q3: { answer: ['1'] } } },
      B: { bonus: { q1: { answer: ['5'] } } },
    };
    const r = computeBonusPoints({ questions, predictions, uids: ['A', 'B', 'C'] });
    expect(r.A).toEqual({ bonus: 14, byCategory: { season: 6, '2026-11': 8 }, byQuestion: { q1: 6, q2: 8 } });
    expect(r.B.bonus).toBe(0);
    expect(r.C).toEqual({ bonus: 0, byCategory: {}, byQuestion: {} });
  });
});

describe('validateQuestion', () => {
  const base = { question: { he: 'ש', en: 'Q' }, type: 'numeric', category: 'season', deadlineMs: 5, pts: 5, answer: [] };
  it('valid basics', () => expect(validateQuestion(base)).toEqual([]));
  it('texts, points, deadline, month, ranking', () => {
    expect(validateQuestion({ ...base, question: { he: '', en: 'Q' } })).toContain('err.bqText');
    expect(validateQuestion({ ...base, pts: -1 })).toContain('err.bqPts');
    expect(validateQuestion({ ...base, deadlineMs: NaN })).toContain('err.bqDeadline');
    expect(validateQuestion({ ...base, category: 'month', month: '2026-13' })).toContain('err.bqMonth');
    expect(validateQuestion({ ...base, type: 'bogus' })).toContain('err.bqType');
  });
  it('options, penalty, max answers, answers', () => {
    expect(validateQuestion({ ...base, type: 'choice', options: [{ id: 'a', he: 'א', en: 'A' }] })).toContain('err.bqOptions');
    expect(validateQuestion({ ...base, type: 'dynamic_score', options: opts.map((o) => ({ ...o, pts: undefined })) })).toContain('err.bqPts');
    expect(validateQuestion({ ...base, type: 'closest', penalty: -1 })).toContain('err.bqPenalty');
    expect(validateQuestion({ ...base, type: 'team', multi: true, maxPicks: 0 })).toContain('err.bqMax');
    expect(validateQuestion({ ...base, type: 'choice', options: opts, answer: ['zzz'] })).toContain('err.bqAnswer');
    expect(validateQuestion({ ...base, type: 'choice', options: opts, answer: ['a', 'b'] })).toEqual([]);
    expect(validateQuestion({ ...base, type: 'text', answer: ['Jokic', 'Nikola'] })).toEqual([]);
  });
});

describe('maxBonusPoints', () => {
  it('single answers, closest and text = the question points', () => {
    expect(maxBonusPoints({ type: 'numeric', pts: 6 })).toBe(6);
    expect(maxBonusPoints({ type: 'closest', pts: 15 })).toBe(15);
    expect(maxBonusPoints({ type: 'choice', pts: 5 })).toBe(5);
  });
  it('multi: points per pick x the picks that can be right', () => {
    expect(maxBonusPoints({ type: 'team', pts: 3, multi: true, maxPicks: 4 })).toBe(12);
    expect(maxBonusPoints({ type: 'team', pts: 3, multi: true, maxPicks: 4, answer: ['A', 'B'] })).toBe(6);
    expect(maxBonusPoints({ type: 'team', pts: 3, multi: true })).toBe(3);
  });
  it('odds-based: the best option (or the best N options when several picks are allowed)', () => {
    const options = [{ id: 'a', pts: 4 }, { id: 'b', pts: 12 }, { id: 'c', pts: 30 }];
    expect(maxBonusPoints({ type: 'dynamic_score', options })).toBe(30);
    expect(maxBonusPoints({ type: 'dynamic_score', options, multi: true, maxPicks: 2 })).toBe(42);
  });
});

describe('bonusStats', () => {
  const picks = { u1: { answer: ['a'] }, u2: { answer: ['a'] }, u3: { answer: ['b'] }, u4: { answer: [] } };
  it('percentages of the players who answered, most popular first', () => {
    const r = bonusStats({ type: 'choice' }, picks);
    expect(r.n).toBe(3);
    expect(r.buckets.map((b) => [b.value, b.count, b.pct])).toEqual([['a', 2, 67], ['b', 1, 33]]);
  });
  it('multi picks count once per player per option', () => {
    const r = bonusStats({ type: 'team', multi: true }, { u1: { answer: ['BOS', 'DEN', 'BOS'] }, u2: { answer: ['BOS'] } });
    expect(r.buckets.map((b) => [b.value, b.pct])).toEqual([['BOS', 100], ['DEN', 50]]);
  });
  it('free text is grouped ignoring case and spaces', () => {
    const r = bonusStats({ type: 'text' }, { u1: { answer: ['Jokic'] }, u2: { answer: [' jokic '] }, u3: { answer: ['Embiid'] } });
    expect(r.buckets[0]).toMatchObject({ value: 'jokic', label: 'Jokic', count: 2 });
  });
  it('numbers: average / min / max', () => {
    const r = bonusStats({ type: 'closest' }, { u1: { answer: ['10'] }, u2: { answer: ['15'] }, u3: { answer: ['x'] } });
    expect(r.numeric).toEqual({ avg: 12.5, min: 10, max: 15, count: 2 });
    expect(bonusStats({ type: 'numeric' }, {}).numeric).toBeNull();
  });
});

describe('ranking questions (East + West, option D: pool split per conference, 0.5 per place)', () => {
  const FINAL = [...EAST_TEAMS, ...WEST_TEAMS]; // the real final order (any valid order works as the truth)
  const q = { type: 'ranking', pts: 50, penalty: 0.5, answer: FINAL };
  const swap = (arr, i, j) => { const a = [...arr]; [a[i], a[j]] = [a[j], a[i]]; return a; };

  it('a valid answer = 15 East then 15 West teams, all distinct', () => {
    expect(EAST_TEAMS).toHaveLength(15);
    expect(WEST_TEAMS).toHaveLength(15);
    expect(cleanAnswer({ type: 'ranking' }, FINAL).value).toEqual(FINAL);
    expect(cleanAnswer({ type: 'ranking' }, FINAL.slice(1)).error).toBe('invalid-answer'); // 29 teams
    expect(cleanAnswer({ type: 'ranking' }, [...WEST_TEAMS, ...EAST_TEAMS]).error).toBe('invalid-answer'); // conferences swapped
    expect(cleanAnswer({ type: 'ranking' }, [...FINAL.slice(0, 29), FINAL[0]]).error).toBe('invalid-answer'); // duplicate
  });
  it('perfect ranking = the full pool (25 + 25)', () => {
    expect(scoreBonus(q, FINAL)).toEqual({ pts: 50, correct: true });
  });
  it('two neighbours swapped = 2 places missed = -1 point', () => {
    expect(rankingMisses(FINAL, swap(FINAL, 3, 4))).toEqual({ east: 2, west: 0, total: 2 });
    expect(scoreBonus(q, swap(FINAL, 3, 4)).pts).toBe(49);
  });
  it('each conference has its own pool: a bad East does not touch the West points', () => {
    const reversedEast = [...EAST_TEAMS].reverse();
    const given = [...reversedEast, ...WEST_TEAMS];
    const m = rankingMisses(FINAL, given);
    expect(m.east).toBe(112); // reversing 15 places: 14+12+...+0+...+14
    expect(m.west).toBe(0);
    expect(scoreBonus(q, given).pts).toBe(25); // East floored at 0, West full
  });
  it('never below 0, and the penalty per place is a setting', () => {
    const worst = [...[...EAST_TEAMS].reverse(), ...[...WEST_TEAMS].reverse()];
    expect(scoreBonus(q, worst).pts).toBe(0);
    expect(scoreBonus({ ...q, penalty: 1 }, swap(FINAL, 3, 4)).pts).toBe(48);
    expect(scoreBonus({ ...q, pts: 100 }, FINAL).pts).toBe(100);
  });
  it('invalid answer = 0; no final order yet = not scored', () => {
    expect(scoreBonus(q, ['BOS'])).toEqual({ pts: 0, correct: false });
    expect(scoreBonus({ ...q, answer: [] }, FINAL)).toEqual({ pts: 0, correct: null });
  });
  it('question settings: needs a valid final order and a penalty; max points = the pool', () => {
    const base = { question: { he: 'ש', en: 'Q' }, type: 'ranking', category: 'season', deadlineMs: 5, pts: 50, penalty: 0.5, answer: [] };
    expect(validateQuestion(base)).toEqual([]);
    expect(validateQuestion({ ...base, answer: FINAL })).toEqual([]);
    expect(validateQuestion({ ...base, answer: FINAL.slice(5) })).toContain('err.bqAnswer');
    expect(validateQuestion({ ...base, penalty: -1 })).toContain('err.bqPenalty');
    expect(maxBonusPoints(base)).toBe(50);
  });
  it('closing logic works for ranking and its stats are not a chart', () => {
    expect(bonusClosedReason({ type: 'ranking', deadlineMs: 10, answer: [] }, 0)).toBeNull();
    expect(bonusStats(q, { u1: { answer: FINAL } }).ranking).toBe(true);
  });
});

describe('division / conference team questions', () => {
  const base = { question: { he: 'ש', en: 'Q' }, category: 'season', deadlineMs: 5, pts: 8, answer: [] };
  const div = (scope, over = {}) => ({ ...base, type: 'division_team', scope, ...over });
  const conf = (scope, over = {}) => ({ ...base, type: 'conference_team', scope, ...over });

  it('the 6 divisions are a clean partition of the 30 teams, inside the right conference', async () => {
    const { DIVISIONS, TEAMS } = await import('./teams.js');
    const all = Object.values(DIVISIONS).flatMap((d) => d.teams);
    expect(all).toHaveLength(30);
    expect(new Set(all).size).toBe(30);
    Object.values(DIVISIONS).forEach((d) => {
      expect(d.teams).toHaveLength(5);
      d.teams.forEach((a) => expect(TEAMS.find((t) => t.abbr === a)?.conf).toBe(d.conf));
    });
  });
  it('the drop-down offers only the teams of the chosen division / conference', () => {
    expect(scopeTeams(div('pacific'))).toEqual(['GSW', 'LAC', 'LAL', 'PHX', 'SAC']);
    expect(scopeTeams(conf('E'))).toEqual(EAST_TEAMS);
    expect(scopeTeams(conf('W'))).toEqual(WEST_TEAMS);
    expect(scopeTeams(div('nope'))).toBeNull();
    expect(scopeTeams(conf('X'))).toBeNull();
    expect(scopeTeams({ type: 'choice' })).toBeNull();
  });
  it('an answer must be ONE team from that group', () => {
    expect(cleanAnswer(div('pacific'), ['LAL'])).toEqual({ value: ['LAL'] });
    expect(cleanAnswer(div('pacific'), ['BOS']).error).toBe('invalid-answer'); // a team from another division
    expect(cleanAnswer(div('pacific'), ['LAL', 'GSW']).error).toBe('too-many');
    expect(cleanAnswer(conf('E'), ['BOS'])).toEqual({ value: ['BOS'] });
    expect(cleanAnswer(conf('E'), ['LAL']).error).toBe('invalid-answer'); // a West team in an East question
    expect(cleanAnswer(conf('E'), []).error).toBe('invalid-answer');
    expect(cleanAnswer({ ...conf('E'), scope: undefined }, ['BOS']).error).toBe('invalid-answer');
  });
  it('a correct pick earns the question points, anything else 0; the max is the question points', () => {
    const q = div('pacific', { answer: ['GSW'] });
    expect(scoreBonus(q, ['GSW'])).toEqual({ pts: 8, correct: true });
    expect(scoreBonus(q, ['LAL'])).toEqual({ pts: 0, correct: false });
    expect(scoreBonus(div('pacific'), ['GSW']).correct).toBeNull(); // no final answer yet
    expect(maxBonusPoints(q)).toBe(8);
  });
  it('a tie can be accepted by the admin (two correct teams)', () => {
    const q = conf('W', { answer: ['DEN', 'OKC'] });
    expect(validateQuestion(q)).toEqual([]);
    expect(scoreBonus(q, ['OKC']).pts).toBe(8);
    expect(scoreBonus(q, ['DEN']).pts).toBe(8);
  });
  it('question settings: the division / conference must be chosen, the correct answer must belong to it', () => {
    expect(validateQuestion(div('atlantic'))).toEqual([]);
    expect(validateQuestion(div(''))).toContain('err.bqScope');
    expect(validateQuestion(conf(undefined))).toContain('err.bqScope');
    expect(validateQuestion(div('atlantic', { answer: ['LAL'] }))).toContain('err.bqAnswer');
    expect(validateQuestion(conf('E', { answer: ['BOS'] }))).toEqual([]);
  });
  it('open / closed logic works and the answers are charted like a normal choice', () => {
    expect(bonusClosedReason(div('atlantic', { deadlineMs: 10 }), 0)).toBeNull();
    const r = bonusStats(div('atlantic'), { u1: { answer: ['BOS'] }, u2: { answer: ['BOS'] }, u3: { answer: ['NYK'] } });
    expect(r.buckets.map((b) => [b.value, b.pct])).toEqual([['BOS', 67], ['NYK', 33]]);
  });
});

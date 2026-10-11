import { describe, it, expect } from 'vitest';
import { scoreBonus, cleanAnswer, bonusClosedReason, computeBonusPoints, validateQuestion } from './bonus.js';

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
    expect(cleanAnswer({ type: 'ranking' }, ['a']).error).toBe('not-supported');
  });
});

describe('bonusClosedReason', () => {
  const q = { type: 'numeric', deadlineMs: 1000, answer: [] };
  it('open / locked / answered / unsupported', () => {
    expect(bonusClosedReason(q, 999)).toBeNull();
    expect(bonusClosedReason(q, 1000)).toBe('locked');
    expect(bonusClosedReason({ ...q, answer: ['1'] }, 0)).toBe('answered');
    expect(bonusClosedReason({ ...q, type: 'ranking' }, 0)).toBe('not-supported');
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
    expect(validateQuestion({ ...base, type: 'ranking' })).toContain('err.bqType');
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

import { describe, it, expect } from 'vitest';
import { scoreGame, mergeScoring, isAnswerCorrect, compareRows } from './scoring.js';
import { PREV_ROUND, ROUNDS, DEFAULT_SCORING } from './constants.js';

const fin = (s1, s2) => ({ s1, s2, status: 'finished' });
const sc = { winner: 2, exact: 5, diffBonus: [{ maxErr: 0, pts: 3 }, { maxErr: 3, pts: 2 }], risk: { maxPickPct: 10, pts: 4 }, unique: 3 };

describe('constants', () => {
  it('PREV_ROUND is explicit and consistent with ROUNDS', () => {
    expect(PREV_ROUND.R1).toBeNull();
    expect(PREV_ROUND.F).toBe('CF');
    ROUNDS.slice(1).forEach((r, i) => expect(PREV_ROUND[r]).toBe(ROUNDS[i]));
  });
});

describe('mergeScoring', () => {
  it('falls back to defaults and deep-merges nested config', () => {
    expect(mergeScoring(undefined)).toEqual(DEFAULT_SCORING);
    const m = mergeScoring({ winner: 9, risk: { pts: 7 } });
    expect(m.winner).toBe(9);
    expect(m.risk).toEqual({ maxPickPct: DEFAULT_SCORING.risk.maxPickPct, pts: 7 });
    expect(m.exact).toBe(DEFAULT_SCORING.exact);
  });
});

describe('scoreGame', () => {
  it('returns 0 when game not finished or pick missing', () => {
    expect(scoreGame({ s1: 100, s2: 90 }, { s1: 100, s2: 90, status: 'live' }, { scoring: sc }).pts).toBe(0);
    expect(scoreGame(null, fin(100, 90), { scoring: sc }).pts).toBe(0);
  });
  it('wrong winner = 0', () => {
    expect(scoreGame({ s1: 90, s2: 100 }, fin(110, 100), { scoring: sc }).pts).toBe(0);
  });
  it('winner + margin tier', () => {
    const r = scoreGame({ s1: 105, s2: 100 }, fin(110, 103), { scoring: sc }); // margin err 2 -> tier 2
    expect(r).toMatchObject({ pts: 4, winnerCorrect: true, exact: false, diffPts: 2 });
  });
  it('exact score = winner + exact, and NO margin bonus', () => {
    const r = scoreGame({ s1: 110, s2: 100 }, fin(110, 100), { scoring: sc });
    expect(r).toMatchObject({ pts: 2 + 5, diffPts: 0, exact: true });
  });
  it('unique + risk bonuses on an exact pick', () => {
    const r = scoreGame({ s1: 110, s2: 100 }, fin(110, 100), { scoring: sc, isUniqueExact: true, pickPct: 5 });
    expect(r.pts).toBe(2 + 5 + 4 + 3);
  });
  it('risk bonus is inclusive at the threshold and needs a correct winner', () => {
    expect(scoreGame({ s1: 105, s2: 100 }, fin(120, 100), { scoring: sc, pickPct: 10 }).riskPts).toBe(4);
    expect(scoreGame({ s1: 105, s2: 100 }, fin(120, 100), { scoring: sc, pickPct: 10.1 }).riskPts).toBe(0);
    expect(scoreGame({ s1: 90, s2: 100 }, fin(120, 100), { scoring: sc, pickPct: 1 }).pts).toBe(0);
  });
  it('auto-filled pick never earns the unique bonus (even if exact)', () => {
    const r = scoreGame({ s1: 110, s2: 100, autoFilled: true }, fin(110, 100), { scoring: sc, isUniqueExact: true });
    expect(r.uniquePts).toBe(0);
    expect(r.pts).toBe(Math.floor((2 + 5) * 0.5));
  });
  it('round multiplier, joker, auto-fill floor', () => {
    const cfg = { ...sc, roundMultipliers: { F: 2 }, jokerMultiplier: 2, autoFillFactor: 0.5 };
    expect(scoreGame({ s1: 105, s2: 100 }, fin(108, 100), { scoring: cfg, round: 'F', joker: true }).pts).toBe((2 + 2) * 2 * 2);
    expect(scoreGame({ s1: 105, s2: 100, autoFilled: true }, fin(108, 100), { scoring: sc }).pts).toBe(Math.floor(4 * 0.5));
  });
  it('predicted tie never counts as correct winner', () => {
    expect(scoreGame({ s1: 100, s2: 100 }, fin(100, 99), { scoring: sc }).winnerCorrect).toBe(false);
  });
});

describe('isAnswerCorrect', () => {
  it('null when no correct answer set', () => {
    expect(isAnswerCorrect([], 'x')).toBeNull();
    expect(isAnswerCorrect(undefined, 'x')).toBeNull();
  });
  it('multi-answer + case/space insensitive + numeric strings', () => {
    expect(isAnswerCorrect(['Jokic', 'Embiid'], ' jokic ')).toBe(true);
    expect(isAnswerCorrect(['Jokic', 'Embiid'], 'Tatum')).toBe(false);
    expect(isAnswerCorrect([12], '12')).toBe(true);
    expect(isAnswerCorrect(['BOS', 'DEN'], ['BOS', 'DEN'])).toBe(true);
    expect(isAnswerCorrect(['BOS'], ['BOS', 'DEN'])).toBe(false);
    expect(isAnswerCorrect(['BOS'], '')).toBe(false);
  });
});

describe('compareRows', () => {
  it('sorts by total then tiebreakers', () => {
    const rows = [{ id: 'a', total: 10, exactHits: 1 }, { id: 'b', total: 10, exactHits: 3 }, { id: 'c', total: 12 }];
    expect(rows.sort((x, y) => compareRows(x, y)).map((r) => r.id)).toEqual(['c', 'b', 'a']);
  });
});

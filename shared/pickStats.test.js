import { describe, it, expect } from 'vitest';
import { pickStats } from './pickStats.js';

const P = (s1, s2, extra = {}) => ({ s1, s2, ...extra });
const many = (n, s1, s2, extra) => Array.from({ length: n }, () => P(s1, s2, extra));

describe('pick statistics of one game', () => {
  it('auto-filled picks and invalid entries are ignored', () => {
    const s = pickStats([P(110, 100), P(105, 99, { autoFilled: true }), P(null, 3), P(1.5, 2), undefined, P(98, 104)]);
    expect(s.n).toBe(2);
    expect(pickStats([P(1, 2, { autoFilled: true })])).toBeNull();
    expect(pickStats([])).toBeNull();
    expect(pickStats(undefined)).toBeNull();
  });

  it('winner split: counts and percentages that add up to 100', () => {
    const s = pickStats([...many(14, 110, 100), ...many(9, 100, 108)]);
    expect(s).toMatchObject({ n: 23, home: 14, away: 9, tie: 0, homePct: 61, awayPct: 39, tiePct: 0 });
    const three = pickStats([P(1, 0), P(0, 1), P(2, 2)]);
    expect(three.homePct + three.awayPct + three.tiePct).toBe(100);
    expect([three.homePct, three.awayPct, three.tiePct].sort()).toEqual([33, 33, 34]);
  });

  it('average predicted score and the average size of the predicted win', () => {
    const s = pickStats([P(110, 100), P(114, 104), P(100, 108)]); // margins 10, 10, 8
    expect(s.avgHome).toBe(108); // (110 + 114 + 100) / 3 = 108
    expect(s.avgAway).toBe(104); // (100 + 104 + 108) / 3 = 104
    expect(s.avgMargin).toBe(9); // (10 + 10 + 8) / 3 = 9.33
  });

  it('the most popular exact score; ties are listed; no repeated score = empty', () => {
    expect(pickStats([...many(4, 110, 105), ...many(2, 100, 98), P(90, 91)]).popular).toEqual({ count: 4, scores: ['110-105'] });
    expect(pickStats([...many(3, 110, 105), ...many(3, 100, 98)]).popular).toEqual({ count: 3, scores: ['100-98', '110-105'] });
    expect(pickStats([P(110, 100), P(111, 100)]).popular).toEqual({ count: 1, scores: [] });
  });

  it('margin spread: 1-5, 6-10, 11-15, 16+ (the edges belong to the lower bucket); a tie pick is in none', () => {
    const picks = [P(105, 100), P(106, 100), P(100, 110), P(111, 100), P(115, 100), P(116, 100), P(130, 100), P(100, 100)];
    expect(pickStats(picks).buckets).toEqual([{ key: '1-5', count: 1 }, { key: '6-10', count: 2 }, { key: '11-15', count: 2 }, { key: '16+', count: 2 }]);
    expect(pickStats(picks).tie).toBe(1);
  });
});

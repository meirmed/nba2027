import { describe, it, expect } from 'vitest';
import { makeAutoPick } from './autofill.js';
import { pickIssue } from './predictions.js';

describe('makeAutoPick', () => {
  it('always within 90..120, margin 1..30, never a tie, and a valid pick', () => {
    for (let i = 0; i < 5000; i += 1) {
      const { s1, s2 } = makeAutoPick();
      expect(Math.min(s1, s2)).toBeGreaterThanOrEqual(90);
      expect(Math.max(s1, s2)).toBeLessThanOrEqual(120);
      const d = Math.abs(s1 - s2);
      expect(d).toBeGreaterThanOrEqual(1);
      expect(d).toBeLessThanOrEqual(30);
      expect(pickIssue({ s1, s2 })).toBeNull();
    }
  });
  it('covers the extremes and both winners', () => {
    expect(makeAutoPick(() => 0)).toEqual({ s1: 91, s2: 90 }); // the smallest: margin 1 from 90
    expect(makeAutoPick(() => 0.999999)).toEqual({ s1: 90, s2: 120 }); // the largest: margin 30, 90 and 120
    const winners = new Set();
    for (let i = 0; i < 200; i += 1) { const p = makeAutoPick(); winners.add(p.s1 > p.s2 ? 'home' : 'away'); }
    expect(winners.size).toBe(2);
  });
  it('the other rules did not change: the margin is spread over 1..30 and both scores reach both ends of 90..120', () => {
    const margins = new Set(); const scores = new Set();
    for (let i = 0; i < 20000; i += 1) { const { s1, s2 } = makeAutoPick(); margins.add(Math.abs(s1 - s2)); scores.add(s1); scores.add(s2); }
    expect(margins.size).toBe(30);
    expect(Math.min(...scores)).toBe(90);
    expect(Math.max(...scores)).toBe(120);
  });
});

import { describe, it, expect } from 'vitest';
import { makeAutoPick } from './autofill.js';
import { pickIssue } from './predictions.js';

describe('makeAutoPick', () => {
  it('always within 20..99, margin 1..30, never a tie, and a valid pick', () => {
    for (let i = 0; i < 5000; i += 1) {
      const { s1, s2 } = makeAutoPick();
      expect(Math.min(s1, s2)).toBeGreaterThanOrEqual(20);
      expect(Math.max(s1, s2)).toBeLessThanOrEqual(99);
      const d = Math.abs(s1 - s2);
      expect(d).toBeGreaterThanOrEqual(1);
      expect(d).toBeLessThanOrEqual(30);
      expect(pickIssue({ s1, s2 })).toBeNull();
    }
  });
  it('covers the extremes and both winners', () => {
    expect(makeAutoPick(() => 0)).toEqual({ s1: 21, s2: 20 });
    expect(makeAutoPick(() => 0.999999)).toEqual({ s1: 69, s2: 99 });
    const winners = new Set();
    for (let i = 0; i < 200; i += 1) { const p = makeAutoPick(); winners.add(p.s1 > p.s2 ? 'home' : 'away'); }
    expect(winners.size).toBe(2);
  });
});

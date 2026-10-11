import { describe, it, expect } from 'vitest';
import { rangeFor, inRange } from './period.js';

describe('rangeFor / inRange', () => {
  const today = '2026-10-20';
  it('presets', () => {
    expect(rangeFor({ preset: '7', today })).toEqual({ lo: '2026-10-14', hi: today });
    expect(rangeFor({ preset: '30', today })).toEqual({ lo: '2026-09-21', hi: today });
    expect(rangeFor({ preset: 'upcoming', today })).toEqual({ lo: '2026-10-21', hi: null });
    expect(rangeFor({ preset: 'all', today })).toEqual({ lo: null, hi: null });
    expect(rangeFor({ preset: 'custom', today, from: '2026-10-01', to: '' })).toEqual({ lo: '2026-10-01', hi: null });
  });
  it('inclusive on both ends', () => {
    const r = rangeFor({ preset: '7', today });
    expect(inRange('2026-10-14', r)).toBe(true);
    expect(inRange('2026-10-20', r)).toBe(true);
    expect(inRange('2026-10-13', r)).toBe(false);
    expect(inRange('2026-10-21', r)).toBe(false);
  });
});

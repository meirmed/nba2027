import { describe, it, expect } from 'vitest';
import { addDaysToKey } from './daykeys.js';

describe('addDaysToKey', () => {
  it('moves across month and year boundaries', () => {
    expect(addDaysToKey('2026-11-01', -1)).toBe('2026-10-31');
    expect(addDaysToKey('2026-10-10', -6)).toBe('2026-10-04');
    expect(addDaysToKey('2026-12-31', 1)).toBe('2027-01-01');
  });
  it('handles leap day and zero', () => {
    expect(addDaysToKey('2028-02-28', 1)).toBe('2028-02-29');
    expect(addDaysToKey('2026-10-10', 0)).toBe('2026-10-10');
  });
});

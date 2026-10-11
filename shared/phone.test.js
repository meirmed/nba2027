import { describe, it, expect } from 'vitest';
import { normalizePhone } from './phone.js';

describe('normalizePhone', () => {
  it('accepts common formats and strips punctuation', () => {
    expect(normalizePhone('050-123-4567')).toBe('0501234567');
    expect(normalizePhone('(050) 123 4567')).toBe('0501234567');
    expect(normalizePhone(' +972 50 123 4567 ')).toBe('+972501234567');
    expect(normalizePhone('0501234567')).toBe('0501234567');
  });
  it('rejects empty, letters, too short and too long', () => {
    expect(normalizePhone('')).toBeNull();
    expect(normalizePhone(null)).toBeNull();
    expect(normalizePhone('050-abc-4567')).toBeNull();
    expect(normalizePhone('12345')).toBeNull();
    expect(normalizePhone('1234567890123456')).toBeNull();
  });
});

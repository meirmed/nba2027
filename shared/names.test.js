import { describe, it, expect } from 'vitest';
import { normalizeName } from './names.js';

describe('normalizeName', () => {
  it('trims, collapses spaces and ignores Latin case', () => {
    expect(normalizeName('  John   SMITH ')).toBe('john smith');
  });
  it('treats non-breaking spaces and invisible direction marks as nothing', () => {
    expect(normalizeName('\u200Fמאיר\u00A0 כהן\u200E')).toBe('מאיר כהן');
  });
  it('keeps different Hebrew names different', () => {
    expect(normalizeName('מאיר כהן')).not.toBe(normalizeName('מאיר לוי'));
  });
  it('handles null/undefined', () => {
    expect(normalizeName(null)).toBe('');
    expect(normalizeName(undefined)).toBe('');
  });
});

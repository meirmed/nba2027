import { describe, it, expect } from 'vitest';
import { normalizeName, parseFullName } from './names.js';

describe('parseFullName (self-registration)', () => {
  it('accepts Hebrew, English and mixed names, no language is forced', () => {
    expect(parseFullName('מאיר', 'מדלר')).toMatchObject({ displayName: 'מאיר מדלר', firstName: 'מאיר', lastName: 'מדלר' });
    expect(parseFullName('Meir', 'Medler').displayName).toBe('Meir Medler');
    expect(parseFullName('Meir', 'מדלר').displayName).toBe('Meir מדלר');
  });
  it('allows two-part names, hyphens and apostrophes', () => {
    expect(parseFullName('Mary Ann', "O'Neil")).not.toBeNull();
    expect(parseFullName('Jean-Luc', 'Picard')).not.toBeNull();
    expect(parseFullName('שרה', 'בן-דוד')).not.toBeNull();
    expect(parseFullName('Dan', 'ג׳רבי')).not.toBeNull();
  });
  it('both names are required, at least 2 letters each', () => {
    expect(parseFullName('Meir', '')).toBeNull();
    expect(parseFullName('', 'Medler')).toBeNull();
    expect(parseFullName('M', 'Medler')).toBeNull();
    expect(parseFullName('Meir', 'M')).toBeNull();
    expect(parseFullName(null, undefined)).toBeNull();
  });
  it('rejects digits, symbols and emoji, and absurdly long names', () => {
    expect(parseFullName('Meir2', 'Medler')).toBeNull();
    expect(parseFullName('Meir', 'Med!er')).toBeNull();
    expect(parseFullName('Meir 🏀', 'Medler')).toBeNull();
    expect(parseFullName('-Meir', 'Medler')).toBeNull();
    expect(parseFullName('A'.repeat(31), 'Medler')).toBeNull();
  });
  it('cleans spaces and invisible direction marks (copy-paste) and compares ignoring case', () => {
    const a = parseFullName('  \u200FMeir  ', ' Medler\u200E ');
    expect(a.displayName).toBe('Meir Medler');
    expect(parseFullName('MEIR', 'medler').normalized).toBe(a.normalized);
    expect(a.normalized).toBe(normalizeName('Meir Medler'));
  });
});

describe('normalizeName (used for matching names everywhere)', () => {
  it('ignores case, extra spaces and invisible direction marks', () => {
    expect(normalizeName('  Meir   MEDLER ')).toBe('meir medler');
    expect(normalizeName('\u200Fמאיר\u200E  מדלר')).toBe('מאיר מדלר');
  });
  it('treats equivalent unicode forms as equal and survives empty input', () => {
    expect(normalizeName('e\u0301')).toBe(normalizeName('\u00e9')); // é as one character or as e + accent
    expect(normalizeName(null)).toBe('');
    expect(normalizeName(undefined)).toBe('');
    expect(normalizeName('   ')).toBe('');
  });
});

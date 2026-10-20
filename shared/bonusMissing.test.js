import { describe, it, expect } from 'vitest';
import { reminderMessage, summaryLine } from './bonusMissing.js';

const Q = (n, over = {}) => ({ id: `q${n}`, he: `שאלה ${n}`, en: `Question ${n}`, deadlineMs: Date.UTC(2026, 10, 1, 17, 0), closed: false, ...over });
describe('reminder message', () => {
  it('lists the open questions in the player\'s language, with the next deadline and the link', () => {
    const he = reminderMessage({ name: 'דן', lang: 'he', missing: [Q(1), Q(2)], url: 'https://x/predictions?tab=bonus' });
    expect(he).toContain('שלום דן');
    expect(he).toContain('עדיין חסרות לך 2 תשובות');
    expect(he).toContain('1. שאלה 1');
    expect(he).toContain('2. שאלה 2');
    expect(he).toContain('המועד האחרון הקרוב');
    expect(he).toContain('https://x/predictions?tab=bonus');
    const en = reminderMessage({ name: 'Dan', lang: 'en', missing: [Q(1), Q(2)], url: 'https://x' });
    expect(en).toContain('You still have 2 bonus questions');
    expect(en).toContain('1. Question 1');
  });
  it('singular wording for one question', () => {
    expect(reminderMessage({ name: 'דן', lang: 'he', missing: [Q(1)], url: 'u' })).toContain('חסרה לך תשובה אחת');
    expect(reminderMessage({ name: 'Dan', lang: 'en', missing: [Q(1)], url: 'u' })).toContain('1 bonus question to answer');
  });
  it('closed questions are not in the reminder; nothing open = no message', () => {
    const m = reminderMessage({ name: 'Dan', lang: 'en', missing: [Q(1, { closed: true }), Q(2)], url: 'u' });
    expect(m).not.toContain('Question 1');
    expect(m).toContain('1. Question 2');
    expect(reminderMessage({ name: 'Dan', lang: 'en', missing: [Q(1, { closed: true })], url: 'u' })).toBe('');
  });
  it('the next deadline is the EARLIEST open one, and a missing deadline is simply left out', () => {
    const m = reminderMessage({ name: 'Dan', lang: 'en', missing: [Q(1, { deadlineMs: Date.UTC(2026, 11, 5) }), Q(2, { deadlineMs: Date.UTC(2026, 10, 2) })], url: 'u' });
    expect(m).toContain('November');
    expect(m).not.toContain('December');
    expect(reminderMessage({ name: 'Dan', lang: 'en', missing: [Q(1, { deadlineMs: null })], url: 'u' })).not.toContain('Next deadline');
  });
});
describe('summary line', () => {
  it('name, phone and the missing questions, closed ones tagged', () => {
    expect(summaryLine({ name: 'Dan', phone: '0501234567', missing: [Q(1), Q(2, { closed: true })] }, 'en')).toBe('Dan (0501234567): Question 1; Question 2 [closed]');
    expect(summaryLine({ name: 'דן', phone: '', missing: [Q(1)] }, 'he')).toBe('דן: שאלה 1');
  });
});

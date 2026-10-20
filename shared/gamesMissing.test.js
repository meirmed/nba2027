import { describe, it, expect } from 'vitest';
import { gameLabel, gamesReminderMessage, gamesSummaryLine } from './gamesMissing.js';

// 2026-11-03 17:42 UTC = 19:42 in Israel (winter time), a Tuesday
const G = (n, ms, h = 'Denver', a = 'Detroit') => ({ id: `g${n}`, home: { he: `בית${n}`, en: h }, away: { he: `חוץ${n}`, en: a }, tipoffMs: ms });
const T1 = Date.UTC(2026, 10, 3, 17, 42);
const T2 = Date.UTC(2026, 10, 4, 18, 0);
describe('games reminder', () => {
  it('lists the games earliest first, in the player\'s language, with day / time and the link', () => {
    const en = gamesReminderMessage({ name: 'Dan', lang: 'en', missing: [G(2, T2), G(1, T1)], url: 'https://x/predictions?tab=week', days: 3 });
    expect(en).toContain('You still need to predict 2 games in the next 3 days');
    expect(en.indexOf('Tuesday')).toBeLessThan(en.indexOf('Wednesday')); // sorted by tip-off
    expect(en).toContain('Denver – Detroit');
    expect(en).toContain('https://x/predictions?tab=week');
    const he = gamesReminderMessage({ name: 'דן', lang: 'he', missing: [G(1, T1)], url: 'u', days: 3 });
    expect(he).toContain('שלום דן');
    expect(he).toContain('עדיין חסר לך ניחוש למשחק אחד ב-3 הימים הקרובים');
    expect(he).toContain('בית1 – חוץ1');
  });
  it('shows the time in the given time zone', () => {
    expect(gamesReminderMessage({ name: 'Dan', lang: 'en', missing: [G(1, T1)], url: 'u' })).toContain('19:42'); // Asia/Jerusalem is the default
  });
  it('nothing missing = no message', () => {
    expect(gamesReminderMessage({ name: 'Dan', lang: 'en', missing: [], url: 'u' })).toBe('');
  });
  it('summary line: name, phone and the games', () => {
    expect(gamesSummaryLine({ name: 'Dan', phone: '050', missing: [G(1, T1)] }, 'en')).toBe('Dan (050): Denver – Detroit (Tuesday 19:42)');
    expect(gameLabel(G(3, T1), 'he')).toBe('בית3 – חוץ3');
  });
});

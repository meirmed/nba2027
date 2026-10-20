// Texts for the "players who have not predicted the next games" report: a one-line summary and a reminder to paste into WhatsApp.

const nameOf = (side, lang) => (lang === 'he' ? side.he || side.en : side.en || side.he) || '';
const when = (ms, lang, timezone) => new Intl.DateTimeFormat(lang === 'he' ? 'he-IL' : 'en-GB', { weekday: 'long', hour: '2-digit', minute: '2-digit', timeZone: timezone }).format(ms);
/** "Denver – Detroit" (home first) */
export const gameLabel = (g, lang) => `${nameOf(g.home, lang)} – ${nameOf(g.away, lang)}`;

/** "Name (phone): game 1; game 2" - one line per player. */
export function gamesSummaryLine(player, lang = 'he', timezone = 'Asia/Jerusalem') {
  return `${player.name}${player.phone ? ` (${player.phone})` : ''}: ${player.missing.map((g) => `${gameLabel(g, lang)} (${when(g.tipoffMs, lang, timezone)})`).join('; ')}`;
}

/** Reminder in the PLAYER's language: the games (earliest first) that still have no prediction, with the day and time, and the link. '' if none. */
export function gamesReminderMessage({ name, lang = 'he', missing, url, timezone = 'Asia/Jerusalem', days = 3 }) {
  if (missing.length === 0) return '';
  const sorted = [...missing].sort((a, b) => a.tipoffMs - b.tipoffMs);
  const list = sorted.map((g) => `• ${gameLabel(g, lang)} (${when(g.tipoffMs, lang, timezone)})`).join('\n');
  if (lang === 'he') {
    const head = sorted.length === 1 ? `עדיין חסר לך ניחוש למשחק אחד ב-${days} הימים הקרובים:` : `עדיין חסרים לך ניחושים ל-${sorted.length} משחקים ב-${days} הימים הקרובים:`;
    return `שלום ${name},\n${head}\n${list}\nאפשר לנחש כאן: ${url}`;
  }
  const head = sorted.length === 1 ? `You still need to predict 1 game in the next ${days} days:` : `You still need to predict ${sorted.length} games in the next ${days} days:`;
  return `Hi ${name},\n${head}\n${list}\nYou can predict here: ${url}`;
}

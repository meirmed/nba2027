// Texts for the "players with missing bonus answers" report: a one-line summary and a reminder message the admin can paste into WhatsApp.

const fmtDate = (ms, lang, timezone) => new Intl.DateTimeFormat(lang === 'he' ? 'he-IL' : 'en-GB', { weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit', timeZone: timezone }).format(ms);
const qText = (q, lang) => (lang === 'he' ? q.he || q.en : q.en || q.he) || '';

/** "Name (phone): question 1; question 2 [closed]" - one line per player. */
export function summaryLine(player, lang = 'he') {
  const qs = player.missing.map((q) => `${qText(q, lang)}${q.closed ? ' [closed]' : ''}`).join('; ');
  return `${player.name}${player.phone ? ` (${player.phone})` : ''}: ${qs}`;
}

/** Reminder in the PLAYER's language, listing only questions that are still OPEN (a closed one can't be answered any more). '' if nothing is open. */
export function reminderMessage({ name, lang = 'he', missing, url, timezone = 'Asia/Jerusalem' }) {
  const open = missing.filter((q) => !q.closed);
  if (open.length === 0) return '';
  const list = open.map((q, i) => `${i + 1}. ${qText(q, lang)}`).join('\n');
  const deadlines = open.map((q) => q.deadlineMs).filter(Number.isFinite);
  const next = deadlines.length ? Math.min(...deadlines) : null;
  if (lang === 'he') {
    const head = open.length === 1 ? 'עדיין חסרה לך תשובה אחת בשאלות הבונוס:' : `עדיין חסרות לך ${open.length} תשובות בשאלות הבונוס:`;
    return `שלום ${name},\n${head}\n${list}\n${next ? `המועד האחרון הקרוב: ${fmtDate(next, 'he', timezone)}\n` : ''}אפשר לענות כאן: ${url}`;
  }
  const head = open.length === 1 ? 'You still have 1 bonus question to answer:' : `You still have ${open.length} bonus questions to answer:`;
  return `Hi ${name},\n${head}\n${list}\n${next ? `Next deadline: ${fmtDate(next, 'en', timezone)}\n` : ''}You can answer here: ${url}`;
}

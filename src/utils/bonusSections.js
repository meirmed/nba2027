/** Heading of a bonus-question section: General / Season / Ranking, or the month name ("2026-11" -> "November 2026"). */
export function bonusSectionTitle(k, t, lang) {
  if (k === 'general' || k === 'season' || k === 'ranking') return t(`bq.cat.${k}`);
  return new Intl.DateTimeFormat(lang === 'he' ? 'he-IL' : 'en-GB', { month: 'long', year: 'numeric' }).format(new Date(`${k}-01T12:00:00Z`));
}

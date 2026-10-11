// Day keys are "YYYY-MM-DD" strings in the competition timezone (see src/utils/dates.js dayKey). Pure calendar math only.
export function addDaysToKey(key, n) {
  const d = new Date(`${key}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** "YYYY-MM-DD" of an instant in a timezone (same grouping the app uses for "days": Israel date by default). */
export function dayKeyOfMs(ms, tz = 'Asia/Jerusalem') {
  return new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(ms));
}

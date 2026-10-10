// Day keys are "YYYY-MM-DD" strings in the competition timezone (see src/utils/dates.js dayKey). Pure calendar math only.
export function addDaysToKey(key, n) {
  const d = new Date(`${key}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

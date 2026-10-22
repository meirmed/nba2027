// Times are stored as UTC (Timestamp/ISO) and displayed in the user's zone (default Asia/Jerusalem).
export function toDate(v) {
  if (!v) return null;
  if (typeof v.toDate === 'function') return v.toDate();
  return new Date(v);
}
export function formatDateTime(v, lang = 'he', tz = 'Asia/Jerusalem') {
  const d = toDate(v);
  if (!d || Number.isNaN(d.getTime())) return '';
  return new Intl.DateTimeFormat(lang === 'he' ? 'he-IL' : 'en-GB', {
    timeZone: tz, dateStyle: 'medium', timeStyle: 'short',
  }).format(d);
}

export function dayKey(v, tz = 'Asia/Jerusalem') {
  const d = toDate(v);
  if (!d || Number.isNaN(d.getTime())) return 'unknown';
  return new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
}
export function formatDay(v, lang = 'he', tz = 'Asia/Jerusalem') {
  const d = toDate(v);
  if (!d || Number.isNaN(d.getTime())) return '';
  return new Intl.DateTimeFormat(lang === 'he' ? 'he-IL' : 'en-GB', { timeZone: tz, dateStyle: 'full' }).format(d);
}
export function formatTime(v, lang = 'he', tz = 'Asia/Jerusalem') {
  const d = toDate(v);
  if (!d || Number.isNaN(d.getTime())) return '';
  return new Intl.DateTimeFormat(lang === 'he' ? 'he-IL' : 'en-GB', { timeZone: tz, timeStyle: 'short' }).format(d);
}
/** Date -> value for <input type="datetime-local"> in the browser's local zone. */
export function toLocalInput(v) {
  const d = toDate(v);
  if (!d) return '';
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

/** 93,000,000 ms -> "1d 1h"; 3,725,000 -> "1h 2m"; 125,000 -> "2m 05s". */
export function formatCountdown(ms) {
  const s = Math.max(0, Math.floor(ms / 1000));
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m ${String(s % 60).padStart(2, '0')}s`;
}

/** '2026-11-09' -> "9 בנובמבר" / "9 November" (a plain Israel date key, no time zone shift). */
export const formatKeyDay = (key, lang) => new Intl.DateTimeFormat(lang === 'he' ? 'he-IL' : 'en-GB', { day: 'numeric', month: 'long', timeZone: 'UTC' }).format(new Date(`${key}T12:00:00Z`));

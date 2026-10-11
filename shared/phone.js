/** "+972 50-123-4567", "(050) 123 4567", "0501234567" -> "+972501234567" / "0501234567". null = not a valid phone number. */
export function normalizePhone(raw) {
  const s = String(raw ?? '').trim();
  if (!/^\+?[\d\s\-().]+$/.test(s)) return null;
  const digits = s.replace(/\D/g, '');
  if (digits.length < 7 || digits.length > 15) return null;
  return (s.startsWith('+') ? '+' : '') + digits;
}

// One normalization for participant names, used by Admin (when saving) AND the registration function (when matching).
// Ignores case (Latin), extra/odd spaces and invisible direction marks that appear when copy-pasting Hebrew.
export function normalizeName(s) {
  return String(s ?? '')
    .normalize('NFC')
    .replace(/[\u200B-\u200F\u202A-\u202E\u2066-\u2069\uFEFF]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

// First + last name for self-registration. Any language (we do NOT force Hebrew or English), both parts required.
const INVISIBLE = /[\u200B-\u200F\u202A-\u202E\u2066-\u2069\uFEFF]/g;
const PART_RE = /^[\p{L}\p{M}][\p{L}\p{M}'’׳\- ]*[\p{L}\p{M}]$/u; // letters at both ends; inside: letters, spaces, hyphen, apostrophe
const clean = (s) => String(s ?? '').normalize('NFC').replace(INVISIBLE, '').replace(/\s+/g, ' ').trim();
const goodPart = (p) => p.length >= 2 && p.length <= 30 && PART_RE.test(p) && (p.match(/\p{L}/gu) || []).length >= 2;

/** -> {firstName, lastName, displayName, normalized} or null when a part is missing / too short / has digits, symbols or emoji. */
export function parseFullName(first, last) {
  const f = clean(first);
  const l = clean(last);
  if (!goodPart(f) || !goodPart(l)) return null;
  const displayName = `${f} ${l}`;
  return { firstName: f, lastName: l, displayName, normalized: normalizeName(displayName) };
}

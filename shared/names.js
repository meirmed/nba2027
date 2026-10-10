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

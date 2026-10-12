// Backup / restore helpers (pure, unit-tested). The Firestore-specific parts live in functions/lib/backup.js.

/** Everything a backup contains. */
export const BACKUP_COLLECTIONS = ['users', 'participants', 'teams', 'games', 'predictions', 'picks', 'bonusPicks', 'points', 'pointsDetail', 'bonus', 'players', 'appSettings', 'h2hTournament', 'h2h', 'adjustments', 'auditLog'];
/** Collections a restore may touch by default. users/participants/auditLog are never restored: they are tied to login accounts / history. */
export const RESTORE_DEFAULT = ['games', 'predictions', 'picks', 'bonusPicks', 'bonus', 'players', 'appSettings', 'h2hTournament', 'h2h', 'adjustments', 'teams'];
export const RESTORE_ALLOWED = [...RESTORE_DEFAULT, 'points', 'pointsDetail'];

/** JSON with sorted keys, so equal documents always compare equal. */
export function stableStringify(v) {
  if (Array.isArray(v)) return `[${v.map(stableStringify).join(',')}]`;
  if (v && typeof v === 'object') return `{${Object.keys(v).sort().map((k) => `${JSON.stringify(k)}:${stableStringify(v[k])}`).join(',')}}`;
  return JSON.stringify(v ?? null);
}

/** current / backup: {docId: data}. -> ids to add (only in backup), remove (only now) and change (differ). */
export function diffCollection(current, backup) {
  const cur = current || {};
  const bak = backup || {};
  const added = Object.keys(bak).filter((id) => !(id in cur));
  const removed = Object.keys(cur).filter((id) => !(id in bak));
  const changed = Object.keys(bak).filter((id) => id in cur && stableStringify(bak[id]) !== stableStringify(cur[id]));
  return { added, removed, changed };
}

export const validBackupName = (n) => /^[A-Za-z0-9._-]{1,100}$/.test(n || '');

import { describe, it, expect } from 'vitest';
import { stableStringify, diffCollection, validBackupName, RESTORE_ALLOWED, BACKUP_COLLECTIONS } from './backup.js';

describe('stableStringify', () => {
  it('ignores key order, keeps arrays ordered', () => {
    expect(stableStringify({ b: 1, a: { d: 2, c: [3, 1] } })).toBe(stableStringify({ a: { c: [3, 1], d: 2 }, b: 1 }));
    expect(stableStringify([1, 2])).not.toBe(stableStringify([2, 1]));
  });
});
describe('diffCollection', () => {
  it('finds added, removed and changed documents', () => {
    const cur = { a: { x: 1 }, b: { x: 2 }, c: { x: 3 } };
    const bak = { b: { x: 2 }, c: { x: 9 }, d: { x: 4 } };
    expect(diffCollection(cur, bak)).toEqual({ added: ['d'], removed: ['a'], changed: ['c'] });
    expect(diffCollection({}, {})).toEqual({ added: [], removed: [], changed: [] });
    expect(diffCollection(undefined, { a: {} }).added).toEqual(['a']);
  });
});
describe('backup safety', () => {
  it('file names cannot escape the backups folder', () => {
    expect(validBackupName('auto-2026-10-12T03-30-00')).toBe(true);
    expect(validBackupName('../secrets')).toBe(false);
    expect(validBackupName('a/b')).toBe(false);
    expect(validBackupName('')).toBe(false);
  });
  it('restore never touches accounts or history', () => {
    ['users', 'participants', 'auditLog'].forEach((c) => expect(RESTORE_ALLOWED).not.toContain(c));
    RESTORE_ALLOWED.forEach((c) => expect(BACKUP_COLLECTIONS).toContain(c));
  });
});

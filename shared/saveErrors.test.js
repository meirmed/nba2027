import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { errorDetail, saveErrorInfo } from './saveErrors.js';

const E = (code, message = '') => ({ code: `functions/${code}`, message });
describe('why a save failed', () => {
  it('permission-denied tells the reason: not paid, blocked, admin, no profile', () => {
    expect(saveErrorInfo(E('permission-denied', 'not-paid')).key).toBe('pred.err.notPaid');
    expect(saveErrorInfo(E('permission-denied', 'blocked')).key).toBe('pred.err.blocked');
    expect(saveErrorInfo(E('permission-denied', 'admin-cannot-play')).key).toBe('pred.err.admin');
    expect(saveErrorInfo(E('permission-denied', 'no-profile')).key).toBe('pred.err.noProfile');
    expect(saveErrorInfo(E('permission-denied', 'something else')).key).toBe('pred.err.denied');
  });
  it('a lost connection or a signed-out user have their own messages', () => {
    expect(saveErrorInfo(E('unavailable')).key).toBe('pred.err.network');
    expect(saveErrorInfo(E('deadline-exceeded')).key).toBe('pred.err.network');
    expect(saveErrorInfo(E('unauthenticated', 'login')).key).toBe('pred.err.login');
  });
  it('an unknown error keeps the generic text and shows its code', () => {
    expect(saveErrorInfo(E('internal', 'boom'))).toEqual({ key: 'pred.saveFailed', detail: 'internal' });
    expect(saveErrorInfo(new Error('network down'))).toEqual({ key: 'pred.saveFailed', detail: 'network down' });
    expect(saveErrorInfo(undefined).key).toBe('pred.saveFailed');
  });
  it('every message it can return exists in Hebrew and in English', () => {
    const he = JSON.parse(readFileSync(new URL('../src/i18n/he.json', import.meta.url), 'utf8'));
    const en = JSON.parse(readFileSync(new URL('../src/i18n/en.json', import.meta.url), 'utf8'));
    ['pred.err.notPaid', 'pred.err.blocked', 'pred.err.admin', 'pred.err.noProfile', 'pred.err.denied', 'pred.err.login', 'pred.err.network', 'pred.saveFailed'].forEach((k) => {
      expect(he[k], `he ${k}`).toBeTruthy();
      expect(en[k], `en ${k}`).toBeTruthy();
    });
  });
});

describe('error detail for the admin screens', () => {
  it('code and short message, or just the code', () => {
    expect(errorDetail(E('internal', 'internal'))).toBe('internal');
    expect(errorDetail(E('permission-denied', 'not-paid'))).toBe('permission-denied: not-paid');
    expect(errorDetail(E('not-found', 'NOT_FOUND'))).toBe('not-found: NOT_FOUND');
    expect(errorDetail(new Error('Failed to fetch'))).toBe('Failed to fetch');
    expect(errorDetail(undefined)).toBe('unknown');
  });
});

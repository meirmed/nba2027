// Why a save of predictions / bonus answers failed: the Cloud Function answers with a code (permission-denied, unavailable ...) and a short message
// (not-paid, blocked ...). The screen used to say only "saving failed"; now it says WHY, so a player (or the admin) knows what to do.

/** The code (and short message) of any callable error, for the admin screens: "internal", "permission-denied: not-paid", "not-found" ... */
export function errorDetail(err) {
  const code = String(err?.code || '').replace('functions/', '');
  const msg = String(err?.message || '');
  return [code, msg && msg !== code ? msg.slice(0, 80) : ''].filter(Boolean).join(': ') || 'unknown';
}

/** -> { key, detail }: the i18n key to show; detail = the raw code, shown only when the reason is unknown. */
export function saveErrorInfo(err) {
  const code = String(err?.code || '').replace('functions/', '');
  const msg = String(err?.message || '');
  if (code === 'permission-denied') {
    if (msg.includes('not-paid')) return { key: 'pred.err.notPaid', detail: code };
    if (msg.includes('blocked')) return { key: 'pred.err.blocked', detail: code };
    if (msg.includes('admin-cannot-play')) return { key: 'pred.err.admin', detail: code };
    if (msg.includes('no-profile')) return { key: 'pred.err.noProfile', detail: code };
    return { key: 'pred.err.denied', detail: code };
  }
  if (code === 'unauthenticated') return { key: 'pred.err.login', detail: code };
  if (['unavailable', 'deadline-exceeded', 'cancelled'].includes(code)) return { key: 'pred.err.network', detail: code };
  return { key: 'pred.saveFailed', detail: code || msg.slice(0, 40) || 'unknown' };
}

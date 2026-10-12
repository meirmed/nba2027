import { addDoc, collection, serverTimestamp } from 'firebase/firestore';
import { auth, db } from '../firebase.js';

// Reports crashes from real players' devices to Firestore (clientErrors, admin-readable) so problems are not mis-diagnosed
// (WC lesson #1). Throttled: at most 5 reports per session, the same message only once. Never throws.
const seen = new Set();
let sent = 0;
const IGNORE = /ResizeObserver loop|^Script error\.?$|Loading chunk|Failed to fetch dynamically imported module/i;

export function reportError(error, context = '') {
  try {
    const user = auth.currentUser;
    if (!user) return;
    const message = String(error?.message || error || 'unknown').slice(0, 300);
    const key = `${context}|${message}`;
    if (IGNORE.test(message) || seen.has(key) || sent >= 5) return;
    seen.add(key);
    sent += 1;
    addDoc(collection(db, 'clientErrors'), {
      uid: user.uid, message, stack: String(error?.stack || '').slice(0, 1500), context: String(context).slice(0, 100),
      route: String(window.location.pathname).slice(0, 100), ua: String(navigator.userAgent).slice(0, 200), ts: serverTimestamp(),
    }).catch(() => {});
  } catch { /* the logger must never break the app */ }
}

export function installGlobalErrorLogging() {
  window.addEventListener('error', (e) => reportError(e.error || e.message, 'window.error'));
  window.addEventListener('unhandledrejection', (e) => reportError(e.reason, 'unhandledrejection'));
}

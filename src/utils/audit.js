import { collection, doc, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase.js';

const nul = (o) => (o === undefined ? null : o);
/** Adds an auditLog entry to an existing writeBatch so the change + its audit trail commit atomically. */
export function addAudit(batch, uid, { action, target, before = null, after = null }) {
  batch.set(doc(collection(db, 'auditLog')), { action, by: uid, ts: serverTimestamp(), target, before: nul(before), after: nul(after) });
}

import { useEffect, useState } from 'react';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import { db } from '../firebase.js';

/** Manual admin point adjustments of one player (admin: any player; player: only their own - enforced by the rules). Newest first. */
export function useAdjustments(uid) {
  const [rows, setRows] = useState([]);
  useEffect(() => (uid ? onSnapshot(query(collection(db, 'adjustments'), where('uid', '==', uid)),
    (s) => setRows(s.docs.map((d) => ({ id: d.id, ...d.data() })).sort((a, b) => (b.ts?.toMillis?.() ?? 0) - (a.ts?.toMillis?.() ?? 0))),
    () => setRows([])) : undefined), [uid]);
  return rows;
}

import { useEffect, useState } from 'react';
import { collection, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase.js';

/** The named player lists (admin only). Sorted by their order, then name. */
export function usePlayerLists(enabled = true) {
  const [lists, setLists] = useState([]);
  useEffect(() => {
    if (!enabled) return undefined;
    return onSnapshot(collection(db, 'playerLists'),
      (snap) => setLists(snap.docs.map((d) => ({ id: d.id, ...d.data() })).sort((a, b) => ((a.order ?? 99) - (b.order ?? 99)) || (a.en || '').localeCompare(b.en || ''))),
      () => setLists([]));
  }, [enabled]);
  return lists;
}

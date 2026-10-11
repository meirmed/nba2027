import { useEffect, useMemo, useState } from 'react';
import { collection, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase.js';

/** Admin-maintained player list. Subscribes only when `enabled` (screens that actually need player names). */
export function usePlayers(enabled = true) {
  const [players, setPlayers] = useState([]);
  useEffect(() => {
    if (!enabled) return undefined;
    return onSnapshot(collection(db, 'players'),
      (snap) => setPlayers(snap.docs.map((d) => ({ id: d.id, ...d.data() })).sort((a, b) => (a.name || '').localeCompare(b.name || ''))),
      () => setPlayers([]));
  }, [enabled]);
  const byId = useMemo(() => Object.fromEntries(players.map((p) => [p.id, p])), [players]);
  return { players, byId };
}

import { useEffect, useMemo, useState } from 'react';
import { collection, doc, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase.js';
import { useAuth } from '../contexts/AuthContext.jsx';
import { usePoints } from '../contexts/PointsContext.jsx';
import { windowStats } from '@shared/h2h.js';

/** h2hTournament/main. undefined = loading, null = not set up yet. */
export function useTournament() {
  const { user } = useAuth();
  const [data, setData] = useState(undefined);
  useEffect(() => {
    if (!user) return undefined;
    return onSnapshot(doc(db, 'h2hTournament', 'main'), (s) => setData(s.exists() ? s.data() : null), () => setData(null));
  }, [user]);
  return data;
}

/** "Pairs for fun" (h2h collection). */
export function useFunPairs() {
  const { user } = useAuth();
  const [pairs, setPairs] = useState(undefined);
  useEffect(() => {
    if (!user) return undefined;
    return onSnapshot(collection(db, 'h2h'),
      (s) => setPairs(s.docs.map((d) => ({ id: d.id, ...d.data() })).sort((a, b) => (a.createdAt?.toMillis?.() ?? 0) - (b.createdAt?.toMillis?.() ?? 0))),
      () => setPairs([]));
  }, [user]);
  return pairs;
}

/**
 * Names + windowed GAME-point stats for everyone, from points/{uid}.byDay: LIVE (the provisional points of the games being played are in it), without the
 * joker doubling, never with bonus points. statsOf also carries the overall main-table total (the last tiebreaker).
 */
export function usePlayerStats() {
  const { rows, allRows, dayRows } = usePoints();
  const byUid = useMemo(() => { // names of everybody (also admins, for the audit log) + the live per-day points of the players
    const m = {};
    allRows.forEach((r) => { m[r.uid] = r; });
    dayRows.forEach((r) => { m[r.uid] = r; });
    return m;
  }, [allRows, dayRows]);
  const nameOf = (uid) => byUid[uid]?.name || '…';
  const statsOf = (uid, from = null, to = null) => ({ ...windowStats(byUid[uid]?.byDay, from, to), total: byUid[uid]?.total ?? 0 });
  return { rows, byUid, nameOf, statsOf };
}

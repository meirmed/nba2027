import { useEffect, useState } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase.js';
import { useAuth } from '../contexts/AuthContext.jsx';

/** midTournament/main = { groups: {A: [uid..], B.., C.., D..}, overrides: {groupTop: {A: [first, second]}, pairWinner: {QF1: uid}}, updatedAt } or null. */
export function useMidTournament() {
  const { user } = useAuth();
  const [state, setState] = useState({ data: null, loading: true });
  useEffect(() => {
    if (!user) return undefined;
    return onSnapshot(doc(db, 'midTournament', 'main'),
      (s) => setState({ data: s.exists() ? s.data() : null, loading: false }),
      () => setState({ data: null, loading: false }));
  }, [user]);
  return state;
}

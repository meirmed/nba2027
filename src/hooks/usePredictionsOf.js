import { useEffect, useState } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase.js';
import { useAuth } from '../contexts/AuthContext.jsx';
import { useMyPredictions } from '../contexts/MyPredictionsContext.jsx';

/** Predictions of any user (admins may read all; players only their own). For yourself it reuses the shared listener. */
export function usePredictionsOf(uid) {
  const { user } = useAuth();
  const mine = useMyPredictions();
  const self = !!uid && uid === user?.uid;
  const [other, setOther] = useState({ games: {}, jokers: {}, bonus: {}, loading: true });
  useEffect(() => {
    if (self || !uid) return undefined;
    return onSnapshot(doc(db, 'predictions', uid), (snap) => {
      const d = snap.data() || {};
      setOther({ games: d.games || {}, jokers: d.jokers || {}, bonus: d.bonus || {}, loading: false });
    }, () => setOther({ games: {}, jokers: {}, bonus: {}, loading: false }));
  }, [uid, self]);
  return self ? mine : other;
}

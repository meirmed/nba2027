import { useEffect, useState } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase.js';
import { useAuth } from '../contexts/AuthContext.jsx';
import { useMyPredictions } from '../contexts/MyPredictionsContext.jsx';
import { usePublicPredictions } from './usePublicPredictions.js';

/**
 * Predictions of any user, same shape everywhere ({games, jokers, bonus, loading}):
 *  - me: the shared listener (everything, including upcoming picks)
 *  - admin looking at someone (Admin -> Users -> Details): the full predictions/{uid} document
 *  - everyone else (leaderboard click) or publicOnly: only what is public = finished + live games, closed bonus questions
 * `bonus: false` skips the bonus listener when only games are shown.
 */
export function usePredictionsOf(uid, { publicOnly = false, bonus = true } = {}) {
  const { user, isAdmin } = useAuth();
  const mine = useMyPredictions();
  const self = !!uid && uid === user?.uid;
  const full = !self && isAdmin && !publicOnly;
  const [other, setOther] = useState({ games: {}, jokers: {}, bonus: {}, loading: true });
  useEffect(() => {
    if (!full || !uid) return undefined;
    return onSnapshot(doc(db, 'predictions', uid), (snap) => {
      const d = snap.data() || {};
      setOther({ games: d.games || {}, jokers: d.jokers || {}, bonus: d.bonus || {}, loading: false });
    }, () => setOther({ games: {}, jokers: {}, bonus: {}, loading: false }));
  }, [uid, full]);
  const pub = usePublicPredictions(self || full ? null : uid, { bonus });
  return self ? mine : full ? other : pub;
}

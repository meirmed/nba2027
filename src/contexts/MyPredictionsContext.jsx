import { createContext, useContext, useEffect, useState } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase.js';
import { useAuth } from './AuthContext.jsx';

const EMPTY = { games: {}, jokers: {}, loading: true };
const Ctx = createContext(EMPTY);

/** My predictions/{uid} doc (owner-readable). Writes happen only via the savePredictions callable. */
export function MyPredictionsProvider({ children }) {
  const { user } = useAuth();
  const [state, setState] = useState(EMPTY);
  useEffect(() => {
    if (!user) return undefined;
    return onSnapshot(doc(db, 'predictions', user.uid), (snap) => {
      const d = snap.data() || {};
      setState({ games: d.games || {}, jokers: d.jokers || {}, loading: false });
    }, () => setState({ games: {}, jokers: {}, loading: false }));
  }, [user]);
  return <Ctx.Provider value={state}>{children}</Ctx.Provider>;
}
export const useMyPredictions = () => useContext(Ctx);

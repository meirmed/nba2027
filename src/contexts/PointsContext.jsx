import { createContext, useContext, useEffect, useState } from 'react';
import { collection, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase.js';
import { useAuth } from './AuthContext.jsx';

const Ctx = createContext({ rows: [], loading: true });

/** points/{uid} for everyone (small summary docs written by Cloud Functions). One listener for the whole app. */
export function PointsProvider({ children }) {
  const { user } = useAuth();
  const [state, setState] = useState({ rows: [], loading: true });
  useEffect(() => {
    if (!user) return undefined;
    return onSnapshot(collection(db, 'points'),
      (snap) => setState({ rows: snap.docs.map((d) => ({ id: d.id, uid: d.id, ...d.data() })), loading: false }),
      () => setState({ rows: [], loading: false }));
  }, [user]);
  return <Ctx.Provider value={state}>{children}</Ctx.Provider>;
}
export const usePoints = () => useContext(Ctx);

import { createContext, useContext, useEffect, useState } from 'react';
import { collection, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase.js';
import { useAuth } from './AuthContext.jsx';

const GamesContext = createContext(null);

/** ONE listener on games for the whole app (Results, Predictions, My Points and Admin all share it). */
export function GamesProvider({ children }) {
  const { user } = useAuth();
  const [state, setState] = useState({ games: [], loading: true, error: null });
  useEffect(() => {
    if (!user) return undefined;
    return onSnapshot(collection(db, 'games'), (snap) => {
      const games = snap.docs.map((d) => ({ id: d.id, ...d.data() }))
        .sort((a, b) => (a.tipoff?.toMillis?.() ?? 0) - (b.tipoff?.toMillis?.() ?? 0));
      setState({ games, loading: false, error: null });
    }, (error) => setState({ games: [], loading: false, error }));
  }, [user]);
  return <GamesContext.Provider value={state}>{children}</GamesContext.Provider>;
}
export function useGames() {
  const ctx = useContext(GamesContext);
  if (!ctx) throw new Error('useGames must be used inside GamesProvider');
  return ctx;
}

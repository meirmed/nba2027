import { useEffect, useState } from 'react';
import { collection, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase.js';

/** Admin-only listener (rules deny everyone else). */
export function useParticipants() {
  const [state, setState] = useState({ participants: [], loading: true, error: null });
  useEffect(() => onSnapshot(collection(db, 'participants'), (snap) => {
    const participants = snap.docs.map((d) => ({ id: d.id, ...d.data() }))
      .sort((a, b) => (a.displayName || '').localeCompare(b.displayName || '', 'he'));
    setState({ participants, loading: false, error: null });
  }, (error) => setState({ participants: [], loading: false, error })), []);
  return state;
}

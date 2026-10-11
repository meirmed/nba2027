import { useEffect, useState } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase.js';
import { useAuth } from '../contexts/AuthContext.jsx';

/** My private profile (users/{uid}). undefined = loading, null = none. */
export function useProfile() {
  const { user } = useAuth();
  const [profile, setProfile] = useState(undefined);
  useEffect(() => (user ? onSnapshot(doc(db, 'users', user.uid), (s) => setProfile(s.exists() ? s.data() : null), () => setProfile(null)) : undefined), [user]);
  return profile;
}

import { useEffect, useState } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase.js';

/** ⭐ The latest complete game night's top scorers (stats/starOfNight, written by the server after every finished game). null = none yet. */
export function useStarOfNight() {
  const [star, setStar] = useState(null);
  useEffect(() => onSnapshot(doc(db, 'stats', 'starOfNight'), (s) => setStar(s.exists() && s.data().night ? s.data() : null), () => setStar(null)), []);
  return star;
}

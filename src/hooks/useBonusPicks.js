import { useEffect, useState } from 'react';
import { collection, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase.js';

/** Everyone's answers of the CLOSED bonus questions: {questionId: {uid: {name, answer}}} (published by the server when a question closes). */
export function useBonusPicks() {
  const [picks, setPicks] = useState({});
  useEffect(() => onSnapshot(collection(db, 'bonusPicks'),
    (s) => setPicks(Object.fromEntries(s.docs.map((d) => [d.id, d.data().picks || {}]))), () => setPicks({})), []);
  return picks;
}

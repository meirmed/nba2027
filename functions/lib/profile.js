import { FieldValue } from 'firebase-admin/firestore';

export const normEmail = (e) => String(e || '').trim().toLowerCase();
export const adminEmails = (raw) => String(raw || '').split(',').map(normEmail).filter(Boolean);

/** users + points + predictions docs for a new participant. points.name is public (leaderboard needs names; users docs are private). */
export function addProfileDocs({ db, batch, uid, name, email, phone = '', participantId = null, isAdmin = false }) {
  const now = FieldValue.serverTimestamp();
  batch.set(db.doc(`users/${uid}`), {
    name, username: '', email: normEmail(email), phone, team: null, photoURL: null, lang: 'he',
    isAdmin, participantId, createdAt: now, updatedAt: now,
  });
  batch.set(db.doc(`points/${uid}`), {
    name, total: 0, gamePts: 0, bonus: 0, bonusByRound: {}, gamePtsByRound: {}, gameHits: 0, exactHits: 0,
    winnerCorrect: 0, uniqueHits: 0, bestStreak: 0, curStreak: 0, bestMiss: 0, curMiss: 0, gamesPlayed: 0, updatedAt: now,
  });
  batch.set(db.doc(`predictions/${uid}`), { games: {}, bonus: {}, jokers: {}, updatedAt: now });
}

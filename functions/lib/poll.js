import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { fetchGamesByDates, apiDatesFor } from './balldontlie.js';
import { parseApiGame, planGameUpdate } from '../shared/live.js';

/** What planGameUpdate needs to know about OUR game document. */
export const currentOf = (d) => ({
  status: d.status, s1: d.s1, s2: d.s2, ot: d.ot || 0, liveText: d.liveText ?? null, winner: d.winner ?? null,
  t1: d.t1, t2: d.t2, tipoffMs: d.tipoff?.toMillis?.() ?? 0, overridden: !!d.overridden, picksLocked: !!d.picksLockedAt,
});

/** Firestore field values for a patch from planGameUpdate (tipoff ISO -> Timestamp). */
export const toWrite = (patch) => ({ ...patch, ...(patch.tipoff ? { tipoff: Timestamp.fromDate(new Date(patch.tipoff)) } : {}), updatedAt: FieldValue.serverTimestamp() });

/**
 * One poll. Cheap exit when nothing is in play: reads only games that are scheduled/live, tipped off in the last 48 h
 * or within the next 15 min, have an apiGameId and are not manually overridden. Heartbeat -> system/poller.
 */
export async function runPoll(db, key, nowMs = Date.now()) {
  const hb = db.doc('system/poller');
  const snap = await db.collection('games')
    .where('status', 'in', ['scheduled', 'live'])
    .where('tipoff', '>', Timestamp.fromMillis(nowMs - 48 * 3600000))
    .where('tipoff', '<=', Timestamp.fromMillis(nowMs + 15 * 60000))
    .get();
  const candidates = snap.docs.filter((d) => d.data().apiGameId != null && !d.data().overridden);
  if (candidates.length === 0) {
    await hb.set({ lastRunAt: FieldValue.serverTimestamp(), inWindow: false, candidates: 0 }, { merge: true });
    return { fetched: false, updated: 0 };
  }

  try {
    const dates = apiDatesFor(candidates.map((d) => d.data().tipoff.toMillis()));
    const apiGames = await fetchGamesByDates(dates, key);
    const byApiId = new Map(candidates.map((d) => [d.data().apiGameId, d]));
    const batch = db.batch();
    let updated = 0;
    apiGames.forEach((g) => {
      const doc = byApiId.get(g.id);
      if (!doc) return;
      const patch = planGameUpdate(currentOf(doc.data()), parseApiGame(g), { nowMs });
      if (patch) { batch.update(doc.ref, toWrite(patch)); updated += 1; }
    });
    if (updated) await batch.commit();
    await hb.set({
      lastRunAt: FieldValue.serverTimestamp(), lastFetchAt: FieldValue.serverTimestamp(), lastSuccessAt: FieldValue.serverTimestamp(),
      inWindow: true, candidates: candidates.length, lastUpdated: updated, lastError: null,
    }, { merge: true });
    return { fetched: true, updated };
  } catch (e) {
    console.error('poll failed', e);
    await hb.set({ lastRunAt: FieldValue.serverTimestamp(), lastFetchAt: FieldValue.serverTimestamp(), inWindow: true, candidates: candidates.length, lastError: String(e.message || e).slice(0, 300) }, { merge: true });
    return { fetched: false, updated: 0, error: true };
  }
}

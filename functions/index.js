// Every Cloud Function lives in this repo (WC lesson #8). v2 API, Node 22.
import { setGlobalOptions } from 'firebase-functions/v2';
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { onDocumentWritten } from 'firebase-functions/v2/firestore';
import { beforeUserCreated, HttpsError as IdentityHttpsError } from 'firebase-functions/v2/identity';
import { defineString, defineSecret } from 'firebase-functions/params';
import { initializeApp } from 'firebase-admin/app';
import { getFirestore, Timestamp, FieldValue } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';
import { v2 as translateV2 } from '@google-cloud/translate';
import { addProfileDocs, adminEmails, normEmail } from './lib/profile.js';
import { mapScheduleGame, validateImportItem } from './shared/schedule.js';
import { planSave } from './shared/predictions.js';
import { normalizeName } from './shared/names.js';
import { recalcAllPoints, reconcileAll } from './lib/recalc.js';
import { fetchGamesRange, fetchGamesByDates, apiDatesFor } from './lib/balldontlie.js';
import { runPoll, currentOf, toWrite } from './lib/poll.js';
import { parseApiGame, planGameUpdate } from './shared/live.js';
import { cleanAnswer, bonusClosedReason } from './shared/bonus.js';
import { mergeScoring } from './shared/scoring.js';
import { DEFAULT_SETTINGS } from './shared/constants.js';

setGlobalOptions({ region: process.env.FUNCTIONS_REGION || 'me-west1', maxInstances: 10 });
initializeApp();
const db = getFirestore();
const ADMIN_EMAILS = defineString('ADMIN_EMAILS', { default: '' }); // comma-separated, set in functions/.env

const NBA_API_KEY = defineSecret('NBA_API_KEY'); // firebase functions:secrets:set NBA_API_KEY
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * GATE: nobody can create an account on their own. Allowed only if
 *  (a) email is in ADMIN_EMAILS AND verified (Google sign-in), or
 *  (b) registerParticipant has reserved this email on an unclaimed participant.
 */
export const beforeUserCreatedGate = beforeUserCreated(async (event) => {
  const user = event.data;
  const email = normEmail(user.email);
  if (!email) throw new IdentityHttpsError('invalid-argument', 'Email required');
  if (adminEmails(ADMIN_EMAILS.value()).includes(email) && user.emailVerified) return;
  const snap = await db.collection('participants').where('registeringEmail', '==', email).limit(1).get();
  if (!snap.empty && snap.docs[0].data().claimedBy == null) return;
  throw new IdentityHttpsError('permission-denied', 'Not an approved participant. Ask the admin to add your name.');
});

/** Public (unauthenticated): is registration open? (No names are ever sent to the browser.) */
export const registrationStatus = onCall(async () => {
  const settings = (await db.doc('appSettings/main').get()).data() || {};
  return { open: !!settings.registrationOpen };
});

/** Public: claim an approved name by TYPING it (must match the admin's list). Creates the Auth user (Admin SDK) + users/points/predictions docs. */
export const registerParticipant = onCall(async (request) => {
  const { password } = request.data || {};
  const rawName = typeof request.data?.name === 'string' ? request.data.name : '';
  const normName = normalizeName(rawName);
  const email = normEmail(request.data?.email);
  if (!normName || rawName.length > 80) throw new HttpsError('invalid-argument', 'name');
  if (!EMAIL_RE.test(email)) throw new HttpsError('invalid-argument', 'email');
  if (password != null && (typeof password !== 'string' || password.length < 6)) throw new HttpsError('invalid-argument', 'password');

  const settings = (await db.doc('appSettings/main').get()).data() || {};
  if (!settings.registrationOpen) throw new HttpsError('failed-precondition', 'registration-closed');

  let found = await db.collection('participants').where('normalizedName', '==', normName).limit(1).get();
  if (found.empty) found = await db.collection('participants').where('displayName', '==', rawName.trim()).limit(1).get();
  if (found.empty) throw new HttpsError('not-found', 'name-not-found');
  const ref = found.docs[0].ref;
  const participantId = ref.id;
  const participant = await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) throw new HttpsError('not-found', 'name-not-found');
    const d = snap.data();
    if (d.claimedBy) throw new HttpsError('permission-denied', 'already-claimed');
    const busy = d.registeringAt && Date.now() - d.registeringAt.toMillis() < 120000 && d.registeringEmail !== email;
    if (busy) throw new HttpsError('aborted', 'in-progress');
    tx.update(ref, { registeringEmail: email, registeringAt: Timestamp.now() });
    return d;
  });

  const clearReservation = () => ref.update({ registeringEmail: FieldValue.delete(), registeringAt: FieldValue.delete() }).catch(() => {});

  let record;
  try {
    record = await getAuth().createUser({ email, password: password || undefined, displayName: participant.displayName });
  } catch (e) {
    await clearReservation();
    if (e.code === 'auth/email-already-exists') throw new HttpsError('already-exists', 'email-exists');
    console.error('createUser failed', e);
    throw new HttpsError('internal', 'create-failed');
  }

  try {
    const batch = db.batch();
    batch.update(ref, {
      claimedBy: record.uid, claimedAt: FieldValue.serverTimestamp(), email,
      registeringEmail: FieldValue.delete(), registeringAt: FieldValue.delete(),
    });
    addProfileDocs({ db, batch, uid: record.uid, name: participant.displayName, email, participantId });
    await batch.commit();
  } catch (e) {
    console.error('profile write failed, rolling back user', e);
    await getAuth().deleteUser(record.uid).catch(() => {});
    await clearReservation();
    throw new HttpsError('internal', 'profile-failed');
  }
  return { ok: true };
});

/**
 * Admin bootstrap: a signed-in user whose email is in ADMIN_EMAILS (created via Firebase console "Add user" or Google sign-in)
 * gets the {admin:true} claim + profile docs. Client must refresh its ID token afterwards.
 */
export const ensureProfile = onCall(async (request) => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'login');
  const uid = request.auth.uid;
  const email = normEmail(request.auth.token.email);
  if (!adminEmails(ADMIN_EMAILS.value()).includes(email)) throw new HttpsError('permission-denied', 'not-admin-email');

  const auth = getAuth();
  const record = await auth.getUser(uid);
  if (record.customClaims?.admin !== true) await auth.setCustomUserClaims(uid, { ...(record.customClaims || {}), admin: true });

  const userRef = db.doc(`users/${uid}`);
  if (!(await userRef.get()).exists) {
    const batch = db.batch();
    addProfileDocs({ db, batch, uid, name: record.displayName || email.split('@')[0], email, isAdmin: true });
    await batch.commit();
  }
  return { ok: true, admin: true };
});

// ---------------------------------------------------------------- schedule import (admin only)
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const requireAdmin = (request) => {
  if (request.auth?.token?.admin !== true) throw new HttpsError('permission-denied', 'admin-only');
};

/** Admin: games from balldontlie for a date range (<=14 days), flagged if already in our DB. Key never leaves the server. */
export const listScheduleGames = onCall({ secrets: [NBA_API_KEY] }, async (request) => {
  requireAdmin(request);
  const { startDate, endDate } = request.data || {};
  if (!DATE_RE.test(startDate || '') || !DATE_RE.test(endDate || '')) throw new HttpsError('invalid-argument', 'dates');
  const days = (Date.parse(endDate) - Date.parse(startDate)) / 86400000;
  if (!(days >= 0 && days <= 14)) throw new HttpsError('invalid-argument', 'range');

  const rows = (await fetchGamesRange(startDate, endDate, NBA_API_KEY.value())).map(mapScheduleGame);
  const withId = rows.filter((r) => r.id);
  const snaps = withId.length ? await db.getAll(...withId.map((r) => db.doc(`games/${r.id}`))) : [];
  const existing = new Set(snaps.filter((s) => s.exists).map((s) => s.id));
  const games = rows
    .map((r) => ({ ...r, exists: !!r.id && existing.has(r.id) }))
    .sort((a, b) => String(a.tipoff).localeCompare(String(b.tipoff)));
  return { games };
});

/** Admin: create the selected games as regular-season games (skips ones that already exist). Audited. */
export const importScheduleGames = onCall(async (request) => {
  requireAdmin(request);
  const raw = request.data?.games;
  if (!Array.isArray(raw) || raw.length === 0 || raw.length > 200) throw new HttpsError('invalid-argument', 'games');
  const items = [...new Map(raw.map(validateImportItem).filter(Boolean).map((i) => [i.id, i])).values()];
  if (items.length === 0) throw new HttpsError('invalid-argument', 'no-valid-games');

  const refs = items.map((i) => db.doc(`games/${i.id}`));
  const snaps = await db.getAll(...refs);
  const batch = db.batch();
  const created = [];
  items.forEach((i, idx) => {
    if (snaps[idx].exists) return;
    batch.set(refs[idx], {
      round: 'RS', seriesKey: 'RS', seriesId: 'RS', gameNum: null,
      t1: i.t1, t2: i.t2, tipoff: Timestamp.fromDate(new Date(i.tipoff)), venue: '',
      status: 'scheduled', s1: null, s2: null, ot: 0, winner: null, overridden: false,
      apiGameId: i.apiGameId, createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp(),
    });
    created.push(i.id);
  });
  if (created.length) {
    batch.set(db.collection('auditLog').doc(), {
      action: 'games.import', by: request.auth.uid, ts: FieldValue.serverTimestamp(), target: 'games',
      before: null, after: { count: created.length, ids: created },
    });
    await batch.commit();
  }
  return { created: created.length, skipped: items.length - created.length };
});

// ---------------------------------------------------------------- predictions
/**
 * The ONLY way picks/jokers are written (rules deny direct client writes). Tip-off is checked against SERVER time,
 * inside a transaction. Writes are merge-sets on map keys (never whole-map rewrites), each entry has its own updatedAt.
 */
export const savePredictions = onCall(async (request) => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'login');
  const uid = request.auth.uid;
  const picks = request.data?.picks ?? {};
  const jokers = request.data?.jokers ?? {};
  const isObj = (o) => o && typeof o === 'object' && !Array.isArray(o);
  if (!isObj(picks) || !isObj(jokers)) throw new HttpsError('invalid-argument', 'shape');
  const ids = [...new Set([...Object.keys(picks), ...Object.keys(jokers)])];
  if (ids.length === 0 || ids.length > 100 || ids.some((id) => id.length > 80 || id.includes('/'))) throw new HttpsError('invalid-argument', 'ids');
  if (!(await db.doc(`users/${uid}`).get()).exists) throw new HttpsError('permission-denied', 'no-profile');

  const ref = db.doc(`predictions/${uid}`);
  return db.runTransaction(async (tx) => {
    const nowMs = Date.now();
    const [predSnap, settingsSnap, ...gameSnaps] = await tx.getAll(ref, db.doc('appSettings/main'), ...ids.map((id) => db.doc(`games/${id}`)));
    const settings = settingsSnap.data() || {};
    const games = {};
    gameSnaps.forEach((s) => {
      if (!s.exists) return;
      const g = s.data();
      games[s.id] = { round: g.round, status: g.status, t1: g.t1, t2: g.t2, tipoffMs: g.tipoff?.toMillis?.() ?? 0 };
    });
    const plan = planSave({
      existing: predSnap.data() || {}, games, picks, jokers, nowMs,
      maxJokers: mergeScoring(settings.scoring).jokersPerSeason,
      countedRounds: settings.countedRounds || DEFAULT_SETTINGS.countedRounds,
    });

    const patch = {};
    const gm = {};
    Object.entries(plan.picks).forEach(([id, p]) => {
      gm[id] = { s1: p.s1, s2: p.s2, updatedAt: FieldValue.serverTimestamp(), autoFilled: FieldValue.delete() };
    });
    const jm = {};
    plan.jokersOn.forEach((id) => { jm[id] = true; });
    plan.jokersOff.forEach((id) => { jm[id] = FieldValue.delete(); });
    if (Object.keys(gm).length) patch.games = gm;
    if (Object.keys(jm).length) patch.jokers = jm;
    if (Object.keys(patch).length) {
      patch.updatedAt = FieldValue.serverTimestamp();
      tx.set(ref, patch, { merge: true });
    }
    return { saved: Object.keys(plan.picks), jokersOn: plan.jokersOn, jokersOff: plan.jokersOff, rejected: plan.rejected };
  });
});

/**
 * Every minute: for games that tipped off in the last 30 min and aren't published yet, copy everyone's picks into
 * picks/{gameId} (readable by all signed-in users). Before tip-off nobody can see other people's picks.
 */
export const lockGamePicks = onSchedule({ schedule: 'every 1 minutes', timeZone: 'UTC' }, async () => {
  const now = Date.now();
  const snap = await db.collection('games')
    .where('tipoff', '>', Timestamp.fromMillis(now - 30 * 60000))
    .where('tipoff', '<=', Timestamp.fromMillis(now - 10000))
    .get();
  const todo = snap.docs.filter((d) => !d.data().picksLockedAt && d.data().status !== 'cancelled');
  if (todo.length === 0) return;

  const [preds, points] = await Promise.all([db.collection('predictions').get(), db.collection('points').get()]);
  const names = new Map(points.docs.map((d) => [d.id, d.data().name || '']));
  for (const g of todo) {
    const picks = {};
    preds.forEach((p) => {
      const d = p.data();
      const pick = d.games?.[g.id];
      if (!pick) return;
      picks[p.id] = { name: names.get(p.id) || '', s1: pick.s1, s2: pick.s2, joker: !!d.jokers?.[g.id], autoFilled: !!pick.autoFilled };
    });
    const batch = db.batch();
    batch.set(db.doc(`picks/${g.id}`), { gameId: g.id, lockedAt: FieldValue.serverTimestamp(), count: Object.keys(picks).length, picks });
    batch.update(g.ref, { picksLockedAt: FieldValue.serverTimestamp() });
    await batch.commit();
  }
});

// ---------------------------------------------------------------- scoring (Phase 3)
/**
 * When a game's result-relevant fields change (and it is/was finished), recompute everyone's points from raw data.
 * Ignores writes that only touch picksLockedAt / updatedAt etc. Recompute is idempotent, so retries are safe.
 */
export const onGameUpdated = onDocumentWritten({ document: 'games/{gameId}', timeoutSeconds: 120 }, async (event) => {
  const b = event.data?.before?.data();
  const a = event.data?.after?.data();
  const key = (g) => (g ? [g.status, g.s1, g.s2, g.round, g.t1, g.t2].join('|') : 'none');
  if (key(b) === key(a)) return;
  if (b?.status !== 'finished' && a?.status !== 'finished') return;
  await recalcAllPoints(db);
});

/** Admin: full recompute (after changing scoring values, or after any incident). Audited. */
export const recalcAll = onCall({ timeoutSeconds: 120 }, async (request) => {
  requireAdmin(request);
  const r = await recalcAllPoints(db);
  await db.collection('auditLog').add({ action: 'points.recalcAll', by: request.auth.uid, ts: FieldValue.serverTimestamp(), target: 'points', before: null, after: r });
  return r;
});

/** Admin: stored points vs recomputed from raw games + predictions. Expected: ok = true (0 mismatches). */
export const reconcilePoints = onCall({ timeoutSeconds: 120 }, async (request) => {
  requireAdmin(request);
  return reconcileAll(db);
});

// ---------------------------------------------------------------- live scores (Phase 4)
/** Every minute: update scheduled/live games from balldontlie (see lib/poll.js). Writes a heartbeat to system/poller. */
export const pollLiveScores = onSchedule({ schedule: 'every 1 minutes', timeZone: 'UTC', secrets: [NBA_API_KEY], timeoutSeconds: 55 }, async () => {
  await runPoll(db, NBA_API_KEY.value());
});

/** Admin: drop the manual lock on ONE game and pull its current state from the API now. Audited. */
export const resyncGame = onCall({ secrets: [NBA_API_KEY] }, async (request) => {
  requireAdmin(request);
  const gameId = request.data?.gameId;
  if (typeof gameId !== 'string' || !gameId || gameId.includes('/')) throw new HttpsError('invalid-argument', 'gameId');
  const ref = db.doc(`games/${gameId}`);
  const snap = await ref.get();
  if (!snap.exists) throw new HttpsError('not-found', 'game');
  const g = snap.data();
  if (g.apiGameId == null) throw new HttpsError('failed-precondition', 'no-api-id');

  const apiGames = await fetchGamesByDates(apiDatesFor([g.tipoff.toMillis()]), NBA_API_KEY.value());
  const api = apiGames.find((x) => x.id === g.apiGameId);
  if (!api) throw new HttpsError('not-found', 'not-in-api');
  const patch = planGameUpdate(currentOf(g), parseApiGame(api), { force: true });
  await ref.update({ ...(patch ? toWrite(patch) : { updatedAt: FieldValue.serverTimestamp() }), overridden: false });
  await db.collection('auditLog').add({ action: 'game.resync', by: request.auth.uid, ts: FieldValue.serverTimestamp(), target: `games/${gameId}`, before: { overridden: !!g.overridden, status: g.status, s1: g.s1 ?? null, s2: g.s2 ?? null }, after: patch || {} });
  return { applied: !!patch, patch: patch || {} };
});

// ---------------------------------------------------------------- bonus questions (Phase 5)
/**
 * The ONLY way bonus answers are written (rules deny direct client writes). Deadline checked against SERVER time;
 * a question whose correct answer is already set is closed. Writes are merge-sets on bonus.{id} (never a whole-map rewrite).
 */
export const saveBonusAnswers = onCall(async (request) => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'login');
  const uid = request.auth.uid;
  const answers = request.data?.answers;
  if (!answers || typeof answers !== 'object' || Array.isArray(answers)) throw new HttpsError('invalid-argument', 'shape');
  const ids = Object.keys(answers);
  if (ids.length === 0 || ids.length > 50 || ids.some((id) => id.length > 80 || id.includes('/'))) throw new HttpsError('invalid-argument', 'ids');
  if (!(await db.doc(`users/${uid}`).get()).exists) throw new HttpsError('permission-denied', 'no-profile');

  const snaps = await db.getAll(...ids.map((id) => db.doc(`bonus/${id}`)));
  const nowMs = Date.now();
  const saved = {};
  const rejected = [];
  for (let i = 0; i < ids.length; i += 1) {
    const id = ids[i];
    const q = snaps[i].exists ? { id, ...snaps[i].data(), deadlineMs: snaps[i].data().deadline?.toMillis?.() ?? 0 } : undefined;
    const closed = bonusClosedReason(q, nowMs);
    if (closed) { rejected.push({ id, reason: closed }); continue; }
    const c = cleanAnswer(q, answers[id]);
    if (c.error) { rejected.push({ id, reason: c.error }); continue; }
    if (q.type === 'player') {
      const ps = await db.getAll(...c.value.map((pid) => db.doc(`players/${pid}`)));
      if (ps.some((p) => !p.exists)) { rejected.push({ id, reason: 'invalid-answer' }); continue; }
    }
    saved[id] = c.value;
  }
  if (Object.keys(saved).length) {
    const bonus = Object.fromEntries(Object.entries(saved).map(([id, answer]) => [id, { answer, updatedAt: FieldValue.serverTimestamp() }]));
    await db.doc(`predictions/${uid}`).set({ bonus, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
  }
  return { saved: Object.keys(saved), rejected };
});

/** When a question's scoring-relevant fields change (correct answer, points, options, penalty...), rescore everyone. */
export const onBonusUpdated = onDocumentWritten({ document: 'bonus/{id}', timeoutSeconds: 120 }, async (event) => {
  const key = (q) => (q ? JSON.stringify([q.type, q.pts, q.penalty ?? null, !!q.multi, q.category, q.month ?? null, q.answer ?? [], (q.options || []).map((o) => [o.id, o.pts ?? null])]) : 'none');
  if (key(event.data?.before?.data()) === key(event.data?.after?.data())) return;
  await recalcAllPoints(db);
});

// ---------------------------------------------------------------- translation (admin tool for bonus questions)
/**
 * Admin: translate short texts between Hebrew and English with Google Cloud Translation (uses the project's own credentials,
 * no API key to manage; the "Cloud Translation API" must be enabled in the Google Cloud project).
 * items: [{text, to: 'he'|'en'}]  ->  {translations: [string]}
 */
export const translateTexts = onCall(async (request) => {
  requireAdmin(request);
  const items = request.data?.items;
  if (!Array.isArray(items) || items.length === 0 || items.length > 30) throw new HttpsError('invalid-argument', 'items');
  if (items.some((i) => typeof i?.text !== 'string' || !i.text.trim() || i.text.length > 400 || !['he', 'en'].includes(i.to))) throw new HttpsError('invalid-argument', 'item');
  const translator = new translateV2.Translate();
  try {
    const translations = [];
    for (const i of items) {
      const [out] = await translator.translate(i.text, { from: i.to === 'he' ? 'en' : 'he', to: i.to, format: 'text' });
      translations.push(String(out));
    }
    return { translations };
  } catch (e) {
    console.error('translate failed', e);
    throw new HttpsError('unavailable', 'translate-failed');
  }
});

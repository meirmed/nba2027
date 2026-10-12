// Every Cloud Function lives in this repo (WC lesson #8). v2 API, Node 22.
import { setGlobalOptions } from 'firebase-functions/v2';
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { onDocumentWritten } from 'firebase-functions/v2/firestore';
import { beforeUserCreated, HttpsError as IdentityHttpsError } from 'firebase-functions/v2/identity';
import { defineString, defineSecret, defineBoolean } from 'firebase-functions/params';
import { initializeApp } from 'firebase-admin/app';
import { getFirestore, Timestamp, FieldValue } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';
import { v2 as translateV2 } from '@google-cloud/translate';
import { addProfileDocs, adminEmails, normEmail } from './lib/profile.js';
import { mapScheduleGame, validateImportItem } from './shared/schedule.js';
import { planSave, pickIssue, countJokers } from './shared/predictions.js';
import { normalizeName } from './shared/names.js';
import { recalcAllPoints, reconcileAll } from './lib/recalc.js';
import { fetchGamesRange, fetchGamesByDates, apiDatesFor } from './lib/balldontlie.js';
import { runPoll, currentOf, toWrite } from './lib/poll.js';
import { parseApiGame, planGameUpdate } from './shared/live.js';
import { cleanAnswer, bonusClosedReason } from './shared/bonus.js';
import { makeAutoPick } from './shared/autofill.js';
import { normalizePhone } from './shared/phone.js';
import { RESTORE_ALLOWED, validBackupName } from './shared/backup.js';
import { saveBackup, pruneAutoBackups, loadBackup, removeBackup, restoreDiff, applyRestore, resetSeason, stamp, safeLabel, de } from './lib/backup.js';
import { mergeScoring } from './shared/scoring.js';
import { DEFAULT_SETTINGS } from './shared/constants.js';

setGlobalOptions({ region: process.env.FUNCTIONS_REGION || 'me-west1', maxInstances: 10 });
initializeApp();
const db = getFirestore();
const ADMIN_EMAILS = defineString('ADMIN_EMAILS', { default: '' }); // comma-separated, set in functions/.env

const NBA_API_KEY = defineSecret('NBA_API_KEY'); // firebase functions:secrets:set NBA_API_KEY
const SEASON_RESET_ENABLED = defineBoolean('SEASON_RESET_ENABLED', { default: false }); // functions/.env; the season reset is OFF unless true
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
  const phone = normalizePhone(request.data?.phone); // mandatory
  if (!phone) throw new HttpsError('invalid-argument', 'phone');
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
    addProfileDocs({ db, batch, uid: record.uid, name: participant.displayName, email, phone, participantId });
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
/** A registered, not-blocked player. */
async function assertCanPlay(uid) {
  const p = await db.doc(`users/${uid}`).get();
  if (!p.exists) throw new HttpsError('permission-denied', 'no-profile');
  if (p.data().blocked) throw new HttpsError('permission-denied', 'blocked');
}

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
  await assertCanPlay(uid);

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
 * Every minute, for games that tipped off in the last 30 min and aren't published yet:
 *  1) AUTO-FILL: every player without a pick gets a random pick (20-99, margin 1-30, flagged autoFilled -> 50% points, never unique)
 *     if features.autoFill is on, the round counts and both teams are set;
 *  2) publish everyone's picks to picks/{gameId} (readable by all signed-in users). Before tip-off nobody can see other people's picks.
 * Idempotent: a retry sees the already auto-filled picks as picks.
 */
export const lockGamePicks = onSchedule({ schedule: 'every 1 minutes', timeZone: 'UTC' }, async () => {
  const now = Date.now();
  const snap = await db.collection('games')
    .where('tipoff', '>', Timestamp.fromMillis(now - 30 * 60000))
    .where('tipoff', '<=', Timestamp.fromMillis(now - 10000))
    .get();
  const todo = snap.docs.filter((d) => !d.data().picksLockedAt && d.data().status !== 'cancelled');
  if (todo.length === 0) return;

  const [preds, points, settingsSnap] = await Promise.all([db.collection('predictions').get(), db.collection('points').get(), db.doc('appSettings/main').get()]);
  const settings = settingsSnap.data() || {};
  const autoFillOn = (settings.features?.autoFill ?? DEFAULT_SETTINGS.features.autoFill) !== false;
  const counted = settings.countedRounds || DEFAULT_SETTINGS.countedRounds;
  const names = new Map(points.docs.map((d) => [d.id, d.data().name || '']));
  const blocked = new Set(points.docs.filter((d) => d.data().blocked).map((d) => d.id));

  for (const g of todo) {
    const gd = g.data();
    const canFill = autoFillOn && counted.includes(gd.round) && !!gd.t1 && !!gd.t2;
    const picks = {};
    const fills = [];
    preds.forEach((p) => {
      const d = p.data();
      const pick = d.games?.[g.id];
      if (pick) {
        picks[p.id] = { name: names.get(p.id) || '', s1: pick.s1, s2: pick.s2, joker: !!d.jokers?.[g.id], autoFilled: !!pick.autoFilled };
      } else if (canFill && !blocked.has(p.id)) {
        const f = makeAutoPick();
        fills.push({ ref: p.ref, f });
        picks[p.id] = { name: names.get(p.id) || '', s1: f.s1, s2: f.s2, joker: false, autoFilled: true };
      }
    });
    for (let i = 0; i < fills.length; i += 400) {
      const fb = db.batch();
      fills.slice(i, i + 400).forEach(({ ref, f }) => fb.set(ref, { games: { [g.id]: { s1: f.s1, s2: f.s2, autoFilled: true, updatedAt: FieldValue.serverTimestamp() } }, updatedAt: FieldValue.serverTimestamp() }, { merge: true }));
      await fb.commit();
    }
    const batch = db.batch();
    batch.set(db.doc(`picks/${g.id}`), { gameId: g.id, lockedAt: FieldValue.serverTimestamp(), count: Object.keys(picks).length, picks });
    batch.update(g.ref, { picksLockedAt: FieldValue.serverTimestamp(), autoFilledCount: fills.length });
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
  await assertCanPlay(uid);

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

// ---------------------------------------------------------------- profile / names (Phase 7)
/** Keep the PUBLIC copy of name / avatar / favorite team (points/{uid}) in sync with the private users/{uid}. */
export const onUserUpdated = onDocumentWritten('users/{uid}', async (event) => {
  const a = event.data?.after?.data();
  if (!a) return;
  const b = event.data?.before?.data();
  if (b && b.name === a.name && (b.photoURL ?? null) === (a.photoURL ?? null) && (b.team ?? null) === (a.team ?? null) && !!b.blocked === !!a.blocked) return;
  await db.doc(`points/${event.params.uid}`).set({ name: a.name, photoURL: a.photoURL ?? null, team: a.team ?? null, blocked: !!a.blocked }, { merge: true });
});

/** Admin: rename an approved participant. If already registered, also renames the account everywhere (users, leaderboard, login profile). Audited. */
export const renameParticipant = onCall(async (request) => {
  requireAdmin(request);
  const { participantId } = request.data || {};
  const name = typeof request.data?.name === 'string' ? request.data.name.trim().replace(/\s+/g, ' ') : '';
  const norm = normalizeName(name);
  if (typeof participantId !== 'string' || !participantId || participantId.includes('/') || !norm || name.length > 80) throw new HttpsError('invalid-argument', 'input');
  const ref = db.doc(`participants/${participantId}`);
  const snap = await ref.get();
  if (!snap.exists) throw new HttpsError('not-found', 'participant');
  const clash = await db.collection('participants').where('normalizedName', '==', norm).limit(2).get();
  if (clash.docs.some((d) => d.id !== participantId)) throw new HttpsError('already-exists', 'name-exists');

  const p = snap.data();
  const batch = db.batch();
  batch.update(ref, { displayName: name, normalizedName: norm });
  if (p.claimedBy) batch.set(db.doc(`users/${p.claimedBy}`), { name, updatedAt: FieldValue.serverTimestamp() }, { merge: true }); // onUserUpdated copies it to points
  batch.set(db.collection('auditLog').doc(), { action: 'participant.rename', by: request.auth.uid, ts: FieldValue.serverTimestamp(), target: ref.path, before: { displayName: p.displayName }, after: { displayName: name } });
  await batch.commit();
  if (p.claimedBy) await getAuth().updateUser(p.claimedBy, { displayName: name }).catch((e) => console.error('auth rename failed', e));
  return { ok: true };
});

// ---------------------------------------------------------------- admin tools (Phase 7b)
const writeAudit = (by, action, target, before, after) => db.collection('auditLog').add({ action, by, ts: FieldValue.serverTimestamp(), target, before: before ?? null, after: after ?? null });
const okId = (v) => typeof v === 'string' && v.length > 0 && v.length <= 80 && !v.includes('/');

/** Admin: block / unblock a player (cannot sign in, cannot save picks, not auto-filled). Admins cannot be blocked. Audited. */
export const setUserBlocked = onCall(async (request) => {
  requireAdmin(request);
  const { uid, blocked } = request.data || {};
  if (!okId(uid) || typeof blocked !== 'boolean') throw new HttpsError('invalid-argument', 'input');
  const auth = getAuth();
  const record = await auth.getUser(uid).catch(() => null);
  if (!record) throw new HttpsError('not-found', 'user');
  if (record.customClaims?.admin === true) throw new HttpsError('failed-precondition', 'cannot-block-admin');
  await auth.updateUser(uid, { disabled: blocked });
  if (blocked) await auth.revokeRefreshTokens(uid);
  await db.doc(`users/${uid}`).set({ blocked, updatedAt: FieldValue.serverTimestamp() }, { merge: true }); // onUserUpdated copies it to points
  await writeAudit(request.auth.uid, blocked ? 'user.block' : 'user.unblock', `users/${uid}`, null, { email: record.email ?? null });
  return { ok: true };
});

/**
 * Admin: someone registered under a wrong name. Deletes that account (login, profile, predictions, points, adjustments) and frees the
 * approved name so the right person can register. Rescores everyone (their picks no longer count). Audited. Admins can't be reset.
 */
export const resetParticipantClaim = onCall({ timeoutSeconds: 120 }, async (request) => {
  requireAdmin(request);
  const { participantId } = request.data || {};
  if (!okId(participantId)) throw new HttpsError('invalid-argument', 'input');
  const ref = db.doc(`participants/${participantId}`);
  const snap = await ref.get();
  if (!snap.exists) throw new HttpsError('not-found', 'participant');
  const p = snap.data();
  if (!p.claimedBy) throw new HttpsError('failed-precondition', 'not-claimed');
  const uid = p.claimedBy;
  const record = await getAuth().getUser(uid).catch(() => null);
  if (record?.customClaims?.admin === true) throw new HttpsError('failed-precondition', 'cannot-reset-admin');

  const userData = (await db.doc(`users/${uid}`).get()).data() || {};
  const before = { uid, name: p.displayName, email: p.email ?? null, phone: userData.phone ?? null };
  const adj = await db.collection('adjustments').where('uid', '==', uid).get();
  const batch = db.batch();
  batch.update(ref, { claimedBy: null, claimedAt: null, email: null, registeringEmail: FieldValue.delete(), registeringAt: FieldValue.delete() });
  ['users', 'points', 'predictions', 'pointsDetail'].forEach((c) => batch.delete(db.doc(`${c}/${uid}`)));
  adj.forEach((d) => batch.delete(d.ref));
  await batch.commit();
  await getAuth().deleteUser(uid).catch((e) => { if (e.code !== 'auth/user-not-found') throw e; });
  await writeAudit(request.auth.uid, 'participant.resetClaim', ref.path, before, null);
  await recalcAllPoints(db);
  return { ok: true };
});

/**
 * Admin: set / change / remove any player's game picks, jokers and bonus answers - at any time (after tip-off, after a game
 * finished, after a deadline). An admin-set pick is a normal pick (auto-fill flag removed). Updates the published picks/{gameId}
 * if it exists, rescores everyone, and records old + new values in the audit log (nothing is shown to other players).
 */
export const adminEditPredictions = onCall({ timeoutSeconds: 120 }, async (request) => {
  requireAdmin(request);
  const { uid } = request.data || {};
  const picks = request.data?.picks ?? {};
  const jokers = request.data?.jokers ?? {};
  const bonus = request.data?.bonus ?? {};
  const isObj = (o) => o && typeof o === 'object' && !Array.isArray(o);
  if (!okId(uid) || !isObj(picks) || !isObj(jokers) || !isObj(bonus)) throw new HttpsError('invalid-argument', 'input');
  const gameIds = [...new Set([...Object.keys(picks), ...Object.keys(jokers)])];
  const qIds = Object.keys(bonus);
  if (gameIds.length + qIds.length === 0 || gameIds.length + qIds.length > 100 || [...gameIds, ...qIds].some((id) => !okId(id))) throw new HttpsError('invalid-argument', 'ids');
  const user = await db.doc(`users/${uid}`).get();
  if (!user.exists) throw new HttpsError('not-found', 'user');

  const [predSnap, settingsSnap, ...rest] = await Promise.all([
    db.doc(`predictions/${uid}`).get(), db.doc('appSettings/main').get(),
    ...gameIds.map((id) => db.doc(`games/${id}`).get()), ...qIds.map((id) => db.doc(`bonus/${id}`).get()),
  ]);
  const gameSnaps = rest.slice(0, gameIds.length);
  const qSnaps = rest.slice(gameIds.length);
  const existing = predSnap.data() || {};
  const maxJokers = mergeScoring(settingsSnap.data()?.scoring).jokersPerSeason;
  const rejected = [];
  const gm = {}; const jm = {}; const bm = {}; const touched = new Set();
  const finalPicks = { ...(existing.games || {}) };
  const finalJokers = { ...(existing.jokers || {}) };

  gameIds.forEach((id, i) => {
    if (!gameSnaps[i].exists) { rejected.push({ id, reason: 'not-found' }); return; }
    if (!(id in picks)) return;
    const p = picks[id];
    if (p === null) { gm[id] = FieldValue.delete(); jm[id] = FieldValue.delete(); delete finalPicks[id]; delete finalJokers[id]; touched.add(id); return; }
    const issue = pickIssue(p);
    if (issue) { rejected.push({ id, reason: issue }); return; }
    gm[id] = { s1: p.s1, s2: p.s2, updatedAt: FieldValue.serverTimestamp(), autoFilled: FieldValue.delete() };
    finalPicks[id] = { s1: p.s1, s2: p.s2 };
    touched.add(id);
  });
  gameIds.forEach((id, i) => {
    if (!(id in jokers) || !gameSnaps[i].exists || rejected.some((r) => r.id === id)) return;
    if (jokers[id] === true) {
      if (!finalPicks[id]) { rejected.push({ id, reason: 'joker-needs-pick' }); return; }
      finalJokers[id] = true; jm[id] = true;
    } else { delete finalJokers[id]; jm[id] = FieldValue.delete(); }
    touched.add(id);
  });
  if (countJokers(finalJokers) > maxJokers) throw new HttpsError('failed-precondition', 'joker-limit');

  for (let i = 0; i < qIds.length; i += 1) {
    const id = qIds[i];
    if (!qSnaps[i].exists) { rejected.push({ id, reason: 'not-found' }); continue; }
    if (bonus[id] === null) { bm[id] = FieldValue.delete(); continue; }
    const q = { id, ...qSnaps[i].data() };
    const c = cleanAnswer(q, bonus[id]);
    if (c.error) { rejected.push({ id, reason: c.error }); continue; }
    if (q.type === 'player') {
      const ps = await db.getAll(...c.value.map((pid) => db.doc(`players/${pid}`)));
      if (ps.some((x) => !x.exists)) { rejected.push({ id, reason: 'invalid-answer' }); continue; }
    }
    bm[id] = { answer: c.value, updatedAt: FieldValue.serverTimestamp() };
  }

  const patch = {};
  if (Object.keys(gm).length) patch.games = gm;
  if (Object.keys(jm).length) patch.jokers = jm;
  if (Object.keys(bm).length) patch.bonus = bm;
  if (Object.keys(patch).length === 0) return { saved: [], rejected };
  patch.updatedAt = FieldValue.serverTimestamp();
  await db.doc(`predictions/${uid}`).set(patch, { merge: true });

  const name = user.data().name || '';
  for (const id of touched) { // keep the already-published "everyone's picks" in line
    const pubRef = db.doc(`picks/${id}`);
    if (!(await pubRef.get()).exists) continue;
    const entry = finalPicks[id] ? { name, s1: finalPicks[id].s1, s2: finalPicks[id].s2, joker: !!finalJokers[id], autoFilled: false } : FieldValue.delete();
    await pubRef.set({ picks: { [uid]: entry } }, { merge: true });
  }
  const before = {
    picks: Object.fromEntries([...touched].map((id) => [id, existing.games?.[id] ? { s1: existing.games[id].s1, s2: existing.games[id].s2, autoFilled: !!existing.games[id].autoFilled, joker: !!existing.jokers?.[id] } : null])),
    bonus: Object.fromEntries(qIds.map((id) => [id, existing.bonus?.[id]?.answer ?? null])),
  };
  await writeAudit(request.auth.uid, 'predictions.adminEdit', `predictions/${uid}`, before, { picks, jokers, bonus, rejected });
  await recalcAllPoints(db);
  return { saved: [...touched, ...Object.keys(bm)], rejected };
});

/** Admin: add a manual points adjustment (+/-) with a reason. Part of the player's total. Audited. */
export const addAdjustment = onCall({ timeoutSeconds: 120 }, async (request) => {
  requireAdmin(request);
  const { uid } = request.data || {};
  const pts = Number(request.data?.pts);
  const reason = typeof request.data?.reason === 'string' ? request.data.reason.trim() : '';
  if (!okId(uid) || !Number.isFinite(pts) || pts === 0 || Math.abs(pts) > 1000 || !reason || reason.length > 200) throw new HttpsError('invalid-argument', 'input');
  if (!(await db.doc(`users/${uid}`).get()).exists) throw new HttpsError('not-found', 'user');
  const ref = await db.collection('adjustments').add({ uid, pts: Math.round(pts * 100) / 100, reason, by: request.auth.uid, ts: FieldValue.serverTimestamp() });
  await writeAudit(request.auth.uid, 'points.adjust', `adjustments/${ref.id}`, null, { uid, pts, reason });
  await recalcAllPoints(db);
  return { id: ref.id };
});

/** Admin: remove a manual adjustment. Audited. */
export const deleteAdjustment = onCall({ timeoutSeconds: 120 }, async (request) => {
  requireAdmin(request);
  const { id } = request.data || {};
  if (!okId(id)) throw new HttpsError('invalid-argument', 'input');
  const ref = db.doc(`adjustments/${id}`);
  const snap = await ref.get();
  if (!snap.exists) throw new HttpsError('not-found', 'adjustment');
  await ref.delete();
  await writeAudit(request.auth.uid, 'points.adjustDelete', ref.path, snap.data(), null);
  await recalcAllPoints(db);
  return { ok: true };
});

// ---- backups (JSON files in Storage: backups/{name}.json; only admins can read them, nobody can write from a browser)
/** Admin: create a named backup now. */
export const createBackup = onCall({ timeoutSeconds: 300, memory: '1GiB' }, async (request) => {
  requireAdmin(request);
  const label = safeLabel(request.data?.label) || 'manual';
  const r = await saveBackup(db, `${label}-${stamp()}`);
  await writeAudit(request.auth.uid, 'backup.create', `backups/${r.name}`, null, { bytes: r.bytes, docs: r.docs });
  return r;
});

/** Every night 03:30 (Israel): automatic backup, keeps the newest 14. */
export const dailyAutoBackup = onSchedule({ schedule: '30 3 * * *', timeZone: 'Asia/Jerusalem', timeoutSeconds: 300, memory: '1GiB' }, async () => {
  await saveBackup(db, `auto-${stamp()}`);
  await pruneAutoBackups(14);
});

/**
 * Admin: restore selected collections from a backup. dryRun=true only reports what would change. A real restore needs confirm='RESTORE',
 * first saves a "pre-restore" backup, never touches accounts / participants / audit log, then rescores everyone.
 */
export const restoreBackup = onCall({ timeoutSeconds: 540, memory: '1GiB' }, async (request) => {
  requireAdmin(request);
  const { name, dryRun, confirm } = request.data || {};
  const collections = Array.isArray(request.data?.collections) ? request.data.collections : [];
  if (!validBackupName(name) || collections.length === 0 || collections.some((c) => !RESTORE_ALLOWED.includes(c))) throw new HttpsError('invalid-argument', 'input');
  const backup = await loadBackup(name).catch(() => null);
  if (!backup?.collections) throw new HttpsError('not-found', 'backup');
  if (dryRun !== false) return { dryRun: true, diff: await restoreDiff(db, backup, collections) };
  if (confirm !== 'RESTORE') throw new HttpsError('failed-precondition', 'confirm');
  const safety = await saveBackup(db, `pre-restore-${stamp()}`);
  const applied = await applyRestore(db, backup, collections);
  await recalcAllPoints(db);
  await writeAudit(request.auth.uid, 'backup.restore', `backups/${name}`, { safetyBackup: safety.name }, { collections, applied });
  return { dryRun: false, applied, safetyBackup: safety.name };
});

/** Admin: start a new season. Needs confirm='RESET'; saves a "pre-reset" backup first. Keeps accounts, participants, teams, players, settings, audit log. */
export const seasonReset = onCall({ timeoutSeconds: 540, memory: '1GiB' }, async (request) => {
  requireAdmin(request);
  if (!SEASON_RESET_ENABLED.value()) throw new HttpsError('failed-precondition', 'disabled');
  if (request.data?.confirm !== 'RESET') throw new HttpsError('failed-precondition', 'confirm');
  const safety = await saveBackup(db, `pre-reset-${stamp()}`);
  await resetSeason(db, FieldValue);
  await writeAudit(request.auth.uid, 'season.reset', 'season', { safetyBackup: safety.name }, null);
  return { ok: true, safetyBackup: safety.name };
});

/** Admin: delete one backup file (e.g. when the list gets long). Audited. */
export const deleteBackup = onCall(async (request) => {
  requireAdmin(request);
  const { name } = request.data || {};
  if (!validBackupName(name)) throw new HttpsError('invalid-argument', 'input');
  await removeBackup(name).catch(() => { throw new HttpsError('not-found', 'backup'); });
  await writeAudit(request.auth.uid, 'backup.delete', `backups/${name}`, null, null);
  return { ok: true };
});

/**
 * Admin: bring back players that exist in a backup but are missing now (login account and/or profile). ADD-ONLY: never overwrites anything.
 *  - login missing -> re-created with the SAME uid + email (all data is keyed by uid). Passwords cannot be restored: the player uses "Forgot password" or Google.
 *  - profile missing -> users, predictions, points, pointsDetail restored from the backup, and the registration claim on the approved name.
 * dryRun (default) lists who is missing. Then rescoring + audit.
 */
export const recoverUsers = onCall({ timeoutSeconds: 300, memory: '1GiB' }, async (request) => {
  requireAdmin(request);
  const { name, dryRun } = request.data || {};
  const wanted = Array.isArray(request.data?.uids) ? request.data.uids.filter(okId) : null;
  if (!validBackupName(name)) throw new HttpsError('invalid-argument', 'input');
  const backup = await loadBackup(name).catch(() => null);
  if (!backup?.collections) throw new HttpsError('not-found', 'backup');

  const bUsers = backup.collections.users || {};
  const curUsers = new Set((await db.collection('users').get()).docs.map((d) => d.id));
  const auth = getAuth();
  const rows = [];
  for (const [uid, u] of Object.entries(bUsers)) {
    const authExists = await auth.getUser(uid).then(() => true, () => false);
    const docExists = curUsers.has(uid);
    if (!authExists || !docExists) rows.push({ uid, name: u.name || '', email: u.email || '', authExists, docExists });
  }
  if (dryRun !== false) return { dryRun: true, players: rows };

  const results = [];
  for (const r of wanted ? rows.filter((x) => wanted.includes(x.uid)) : rows) {
    const res = { uid: r.uid, name: r.name, ok: true, steps: [] };
    try {
      if (!r.authExists) { await auth.createUser({ uid: r.uid, email: r.email || undefined, displayName: r.name || undefined }); res.steps.push('login'); }
      if (!r.docExists) {
        const batch = db.batch();
        ['users', 'predictions', 'points', 'pointsDetail'].forEach((c) => { const d = backup.collections[c]?.[r.uid]; if (d) batch.set(db.doc(`${c}/${r.uid}`), de(d)); });
        await batch.commit();
        res.steps.push('profile');
      }
      const entry = Object.entries(backup.collections.participants || {}).find(([, p]) => p.claimedBy === r.uid);
      if (entry) {
        const [pid, p] = entry;
        const cur = await db.doc(`participants/${pid}`).get();
        if (!cur.exists) { await db.doc(`participants/${pid}`).set(de(p)); res.steps.push('name'); }
        else if (!cur.data().claimedBy) { await db.doc(`participants/${pid}`).update({ claimedBy: r.uid, claimedAt: p.claimedAt ? de(p.claimedAt) : null, email: p.email ?? null }); res.steps.push('name'); }
        else if (cur.data().claimedBy !== r.uid) res.steps.push('name-taken');
      }
    } catch (e) { res.ok = false; res.error = String(e.code || e.message).slice(0, 120); }
    results.push(res);
  }
  await recalcAllPoints(db);
  await writeAudit(request.auth.uid, 'users.recover', `backups/${name}`, null, { results });
  return { dryRun: false, results };
});

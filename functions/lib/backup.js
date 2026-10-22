import { Timestamp } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';
import { BACKUP_COLLECTIONS, diffCollection } from '../shared/backup.js';
import { emptyStats } from '../shared/standings.js';

export const stamp = () => new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
export const safeLabel = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 30);

// Timestamps <-> {__ts: millis} so a backup is plain JSON
export const ser = (v) => {
  if (v instanceof Timestamp) return { __ts: v.toMillis() };
  if (Array.isArray(v)) return v.map(ser);
  if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, ser(x)]));
  return v;
};
export const de = (v) => {
  if (Array.isArray(v)) return v.map(de);
  if (v && typeof v === 'object') {
    if (Object.keys(v).length === 1 && typeof v.__ts === 'number') return Timestamp.fromMillis(v.__ts);
    return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, de(x)]));
  }
  return v;
};

const bucket = () => getStorage().bucket();

export async function exportAll(db) {
  const out = { version: 1, createdAt: new Date().toISOString(), collections: {} };
  for (const c of BACKUP_COLLECTIONS) {
    const snap = await db.collection(c).get();
    out.collections[c] = Object.fromEntries(snap.docs.map((d) => [d.id, ser(d.data())]));
  }
  return out;
}

/** Writes backups/{name}.json to the default Storage bucket. */
export async function saveBackup(db, name) {
  const data = await exportAll(db);
  const json = JSON.stringify(data);
  await bucket().file(`backups/${name}.json`).save(json, { contentType: 'application/json', metadata: { contentDisposition: `attachment; filename="${name}.json"` } }); // downloads instead of opening in the browser
  return { name, bytes: Buffer.byteLength(json), docs: Object.values(data.collections).reduce((n, c) => n + Object.keys(c).length, 0) };
}

/** Keep the newest `keep` automatic backups. */
export async function pruneAutoBackups(keep = 14) {
  const [files] = await bucket().getFiles({ prefix: 'backups/auto-' });
  const names = files.map((f) => f.name).sort();
  const old = names.slice(0, Math.max(0, names.length - keep));
  await Promise.all(old.map((n) => bucket().file(n).delete().catch(() => {})));
  return old.length;
}

export async function removeBackup(name) {
  await bucket().file(`backups/${name}.json`).delete();
}

export async function loadBackup(name) {
  const [buf] = await bucket().file(`backups/${name}.json`).download();
  return JSON.parse(buf.toString('utf8'));
}

async function currentDocs(db, c) {
  const snap = await db.collection(c).get();
  return Object.fromEntries(snap.docs.map((d) => [d.id, ser(d.data())]));
}

/** Dry run: counts of what a restore of `collections` would add / remove / change. */
export async function restoreDiff(db, backup, collections) {
  const out = {};
  for (const c of collections) {
    const d = diffCollection(await currentDocs(db, c), backup.collections?.[c] || {});
    out[c] = { added: d.added.length, removed: d.removed.length, changed: d.changed.length };
  }
  return out;
}

async function commitInChunks(db, ops) {
  for (let i = 0; i < ops.length; i += 400) {
    const batch = db.batch();
    ops.slice(i, i + 400).forEach((fn) => fn(batch));
    await batch.commit();
  }
}

/** Makes each selected collection equal to the backup (delete extras, rewrite added + changed documents). */
export async function applyRestore(db, backup, collections) {
  const out = {};
  for (const c of collections) {
    const bak = backup.collections?.[c] || {};
    const d = diffCollection(await currentDocs(db, c), bak);
    const ops = [
      ...d.removed.map((id) => (b) => b.delete(db.doc(`${c}/${id}`))),
      ...[...d.added, ...d.changed].map((id) => (b) => b.set(db.doc(`${c}/${id}`), de(bak[id]))),
    ];
    await commitInChunks(db, ops);
    out[c] = { added: d.added.length, removed: d.removed.length, changed: d.changed.length };
  }
  return out;
}

async function deleteAll(db, name) {
  for (;;) {
    const snap = await db.collection(name).limit(400).get();
    if (snap.empty) break;
    const b = db.batch();
    snap.docs.forEach((d) => b.delete(d.ref));
    await b.commit();
  }
}

/**
 * New season: deletes games, picks, bonus questions, adjustments and Head to Head; empties every player's predictions;
 * zeroes every points doc (keeps name / photo / team / blocked). Keeps users, participants, teams, players list, settings and the audit log.
 */
export async function resetSeason(db, FieldValue, { keepBonus = false } = {}) {
  const wipe = ['games', 'picks', 'bonusPicks', ...(keepBonus ? [] : ['bonus']), 'pointsDetail', 'adjustments', 'h2h', 'h2hTournament', 'midTournament', 'stats'];
  for (const c of wipe) await deleteAll(db, c); // 'stats' = the star of the night (test data must not stay on the Home page)
  const preds = await db.collection('predictions').get();
  await commitInChunks(db, preds.docs.map((d) => (b) => b.set(d.ref, { games: {}, bonus: {}, jokers: {}, updatedAt: FieldValue.serverTimestamp() })));
  const pts = await db.collection('points').get();
  await commitInChunks(db, pts.docs.map((d) => (b) => {
    const x = d.data();
    b.set(d.ref, {
      name: x.name || '', photoURL: x.photoURL ?? null, team: x.team ?? null, blocked: !!x.blocked, ...(x.isAdmin ? { isAdmin: true } : {}), // keep the admin flag: admins stay out of the tables
      ...emptyStats(), total: 0, bonus: 0, adjust: 0, bonusByCategory: {}, byDay: {}, updatedAt: FieldValue.serverTimestamp(),
    });
  }));
  await db.doc('appSettings/main').set({ seasonStarted: false, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
  if (keepBonus) { // LAST: the questions stay (text, type, points, options, order, player list...), only the correct answers are cleared
    const qs = await db.collection('bonus').get();
    await commitInChunks(db, qs.docs.map((d) => (b) => b.update(d.ref, { answer: [], answersLockedAt: FieldValue.delete() })));
  }
}

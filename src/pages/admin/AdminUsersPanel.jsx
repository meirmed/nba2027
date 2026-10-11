import { useState } from 'react';
import { collection, doc, serverTimestamp, writeBatch } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { db, functions } from '../../firebase.js';
import PageShell from '../../components/PageShell.jsx';
import { useLang } from '../../contexts/LangContext.jsx';
import { useAuth } from '../../contexts/AuthContext.jsx';
import { useParticipants } from '../../hooks/useParticipants.js';
import { addAudit } from '../../utils/audit.js';
import { normalizeName as normName } from '@shared/names.js';


// Approved-participants whitelist (people can register only after being added here) + paid tracking.
export default function AdminUsersPanel() {
  const { t } = useLang();
  const { user } = useAuth();
  const { participants, loading, error } = useParticipants();
  const [text, setText] = useState('');
  const [msg, setMsg] = useState('');

  const run = async (fn) => { setMsg(''); try { await fn(); } catch (e) { console.error(e); setMsg(t('common.error')); } };

  const addNames = () => run(async () => {
    const existing = new Set(participants.map((p) => p.normalizedName));
    const names = text.split('\n').map((n) => n.trim().replace(/\s+/g, ' ')).filter(Boolean)
      .filter((n, i, a) => a.findIndex((x) => normName(x) === normName(n)) === i) // dedupe within input only
      .filter((n) => !existing.has(normName(n)));
    if (names.length === 0) return;
    const batch = writeBatch(db);
    names.forEach((displayName) => {
      const ref = doc(collection(db, 'participants'));
      batch.set(ref, { displayName, normalizedName: normName(displayName), claimedBy: null, claimedAt: null, email: null, paid: false, createdAt: serverTimestamp() });
      addAudit(batch, user.uid, { action: 'participant.add', target: ref.path, after: { displayName } });
    });
    await batch.commit();
    setText('');
  });

  const togglePaid = (p) => run(async () => {
    const batch = writeBatch(db);
    batch.update(doc(db, 'participants', p.id), { paid: !p.paid });
    addAudit(batch, user.uid, { action: 'participant.paid', target: `participants/${p.id}`, before: { paid: !!p.paid }, after: { paid: !p.paid } });
    await batch.commit();
  });

  const rename = (p) => run(async () => {
    const name = window.prompt(t('ap.promptName'), p.displayName);
    if (!name || !name.trim()) return;
    try { await httpsCallable(functions, 'renameParticipant')({ participantId: p.id, name }); } catch (e) {
      if (String(e.code).includes('already-exists')) setMsg(t('ap.errExists')); else throw e;
    }
  });

  const remove = (p) => run(async () => {
    if (p.claimedBy) { setMsg(t('ap.cantDeleteClaimed')); return; }
    if (!window.confirm(t('common.confirmDelete'))) return;
    const batch = writeBatch(db);
    batch.delete(doc(db, 'participants', p.id));
    addAudit(batch, user.uid, { action: 'participant.delete', target: `participants/${p.id}`, before: { displayName: p.displayName } });
    await batch.commit();
  });

  const paidCount = participants.filter((p) => p.paid).length;

  return (
    <PageShell titleKey="admin.users">
      <div className="card">
        <label className="field">{t('ap.addLabel')}
          <textarea className="input" rows={4} value={text} onChange={(e) => setText(e.target.value)} />
        </label>
        <div className="actions"><button className="btn" onClick={addNames} disabled={!text.trim()}>{t('common.add')}</button><span className="muted">{msg}</span></div>
      </div>
      {loading && <p className="muted">{t('common.loading')}</p>}
      {error && <p className="error">{t('common.error')}</p>}
      <p className="muted">{t('ap.count', { n: participants.length, paid: paidCount })}</p>
      {participants.map((p) => (
        <div key={p.id} className="row">
          <div className="grow">
            <strong>{p.displayName}</strong>
            <div className="muted small" dir="ltr">{p.claimedBy ? p.email : t('ap.unclaimed')}</div>
          </div>
          <label className="check"><input type="checkbox" checked={!!p.paid} onChange={() => togglePaid(p)} /> {t('ap.paid')}</label>
          <button className="btn ghost" onClick={() => rename(p)}>{t('ap.rename')}</button>
          <button className="btn ghost" onClick={() => remove(p)}>{t('common.delete')}</button>
        </div>
      ))}
    </PageShell>
  );
}

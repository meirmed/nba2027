import { useState } from 'react';
import { collection, doc, serverTimestamp, writeBatch } from 'firebase/firestore';
import { db } from '../../firebase.js';
import VsRow from '../../components/VsRow.jsx';
import { useLang } from '../../contexts/LangContext.jsx';
import { useAuth } from '../../contexts/AuthContext.jsx';
import { useFunPairs, usePlayerStats } from '../../hooks/useH2H.js';
import { addAudit } from '../../utils/audit.js';

// The ONLY editor of "Pairs for fun" (h2h collection): two players + an optional day window (empty = whole season).
export default function FunPairsManager() {
  const { t } = useLang();
  const { user } = useAuth();
  const pairs = useFunPairs();
  const { rows, nameOf, statsOf } = usePlayerStats();
  const players = [...rows].sort((a, b) => (a.name || '').localeCompare(b.name || '', 'he'));
  const [f, setF] = useState({ user1: '', user2: '', label: '', from: '', to: '' });
  const [msg, setMsg] = useState('');
  const set = (k, v) => setF((x) => ({ ...x, [k]: v }));

  const add = async () => {
    setMsg('');
    if (!f.user1 || !f.user2 || f.user1 === f.user2 || (f.from && f.to && f.from > f.to)) { setMsg(t('ah.err.invalid')); return; }
    try {
      const ref = doc(collection(db, 'h2h'));
      const data = { user1: f.user1, user2: f.user2, label: f.label.trim(), from: f.from || null, to: f.to || null, createdAt: serverTimestamp() };
      const batch = writeBatch(db);
      batch.set(ref, data);
      addAudit(batch, user.uid, { action: 'h2h.fun.add', target: ref.path, after: { ...data, createdAt: null } });
      await batch.commit();
      setF({ user1: '', user2: '', label: '', from: '', to: '' });
    } catch (e) { console.error(e); setMsg(t('common.error')); }
  };

  const remove = async (p) => {
    if (!window.confirm(t('common.confirmDelete'))) return;
    try {
      const batch = writeBatch(db);
      batch.delete(doc(db, 'h2h', p.id));
      addAudit(batch, user.uid, { action: 'h2h.fun.delete', target: `h2h/${p.id}`, before: { user1: p.user1, user2: p.user2, label: p.label ?? '' } });
      await batch.commit();
    } catch (e) { console.error(e); setMsg(t('common.error')); }
  };

  const pick = (k) => (
    <select className="input" dir="auto" value={f[k]} onChange={(e) => set(k, e.target.value)}>
      <option value="" />
      {players.map((p) => <option key={p.uid} value={p.uid}>{p.name}</option>)}
    </select>
  );

  return (
    <div>
      <div className="card">
        <div className="grid-form">
          <label className="field">{t('ah.fun.user1')}{pick('user1')}</label>
          <label className="field">{t('ah.fun.user2')}{pick('user2')}</label>
          <label className="field">{t('ah.fun.label')}<input className="input" dir="auto" value={f.label} onChange={(e) => set('label', e.target.value)} /></label>
          <label className="field">{t('ah.fun.from')}<input className="input" dir="ltr" type="date" value={f.from} onChange={(e) => set('from', e.target.value)} /></label>
          <label className="field">{t('ah.fun.to')}<input className="input" dir="ltr" type="date" value={f.to} onChange={(e) => set('to', e.target.value)} /></label>
        </div>
        <div className="actions"><button className="btn" onClick={add}>{t('common.add')}</button><span className="muted">{msg}</span></div>
      </div>
      {pairs === undefined && <p className="muted">{t('common.loading')}</p>}
      {pairs && pairs.length === 0 && <p className="muted">{t('h2h.noPairs')}</p>}
      {(pairs || []).map((p) => {
        const a = statsOf(p.user1, p.from || null, p.to || null).pts;
        const b = statsOf(p.user2, p.from || null, p.to || null).pts;
        return (
          <div key={p.id}>
            <VsRow nameA={nameOf(p.user1)} scoreA={a} nameB={nameOf(p.user2)} scoreB={b} winner={a === b ? null : a > b ? 'a' : 'b'}
              note={[p.label, p.from || p.to ? `${p.from || '…'} → ${p.to || '…'}` : ''].filter(Boolean).join(' · ')} />
            <button className="btn ghost" onClick={() => remove(p)}>{t('common.delete')}</button>
          </div>
        );
      })}
    </div>
  );
}

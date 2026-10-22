import { useMemo, useState } from 'react';
import { deleteField, doc, serverTimestamp, writeBatch } from 'firebase/firestore';
import { db } from '../../firebase.js';
import PageShell from '../../components/PageShell.jsx';
import { useLang } from '../../contexts/LangContext.jsx';
import { useAuth } from '../../contexts/AuthContext.jsx';
import { usePoints } from '../../contexts/PointsContext.jsx';
import { useMidBracket } from '../../hooks/useMidBracket.js';
import { addAudit } from '../../utils/audit.js';
import { cleanGroups, MID_GROUPS } from '@shared/midTournament.js';

const ref = doc(db, 'midTournament', 'main');
const byName = (a, b) => String(a.name || '').localeCompare(String(b.name || ''), 'he');

/**
 * Admin: (1) put the players into the 4 groups (the draw itself is done elsewhere): a drop-down per group lists only the players who are not in a group yet;
 * (2) decide REAL ties (equal on points, exact and unique hits): who is 1st / 2nd in a group, who wins a pair. Everything else is calculated.
 * One write per action (groups: one merge-write of the whole map; a decision: one dotted-path update), each with an audit entry.
 */
export default function AdminMidTournamentPanel() {
  const { t } = useLang();
  const { user } = useAuth();
  const { cfg, groups: saved, bracket, rowsByUid, loading } = useMidBracket();
  const { rows } = usePoints(); // the players (paid, not admins)
  const players = useMemo(() => [...rows].sort(byName), [rows]);
  const [draft, setDraft] = useState(null); // unsaved group edits
  const [picks, setPicks] = useState({});
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');

  const groups = draft ?? saved;
  const assigned = new Set(MID_GROUPS.flatMap((g) => groups[g]));
  const free = players.filter((p) => !assigned.has(p.uid));
  const nameOf = (uid) => rowsByUid[uid]?.name || uid;
  const total = assigned.size;

  const run = async (fn, okMsg) => {
    setBusy(true); setMsg('');
    try { await fn(); setMsg(okMsg); } catch (e) { console.error(e); setMsg(t('common.error')); }
    setBusy(false);
  };
  const add = (g, uid) => setDraft({ ...groups, [g]: [...groups[g], uid] });
  const remove = (g, uid) => setDraft({ ...groups, [g]: groups[g].filter((u) => u !== uid) });

  const saveGroups = () => run(async () => {
    const next = cleanGroups(groups);
    const batch = writeBatch(db);
    batch.set(ref, { groups: next, updatedAt: serverTimestamp() }, { merge: true }); // ONE write for all four groups
    addAudit(batch, user.uid, { action: 'mid.groups', target: 'midTournament/main', before: saved, after: next });
    await batch.commit();
    setDraft(null);
  }, t('am.saved'));

  const decide = (path, value, action, after) => run(async () => {
    const batch = writeBatch(db);
    batch.update(ref, { [path]: value, updatedAt: serverTimestamp() }); // dotted path on a map key: nothing else is touched
    addAudit(batch, user.uid, { action, target: `midTournament/main#${path}`, after });
    await batch.commit();
  }, t('am.saved'));
  const clearDecision = (path) => decide(path, deleteField(), 'mid.clearDecision', null);

  const sizes = MID_GROUPS.map((g) => groups[g].length).join(' + ');
  const decisions = bracket.groupDecisions.length + bracket.pairDecisions.length;
  const stored = cfg?.overrides || {};
  const hasStored = Object.keys(stored.groupTop || {}).length + Object.keys(stored.pairWinner || {}).length > 0;

  if (loading) return <PageShell titleKey="admin.mid"><p className="muted">{t('common.loading')}</p></PageShell>;

  const pairName = (k) => `${t(`mid.stage.${k.startsWith('QF') ? 'QF' : k.startsWith('SF') ? 'SF' : 'F'}`)}${k.replace(/\D/g, '') ? ` ${k.replace(/\D/g, '')}` : ''}`;

  return (
    <PageShell titleKey="admin.mid">
      <p className="muted small">{t('am.hint')}</p>

      <h3 className="bq-title">{t('am.groupsTitle')}</h3>
      <div className="mid-grid">
        {MID_GROUPS.map((g) => (
          <div key={g} className="card">
            <h4 className="bq-title">{t('mid.group', { g })} <span className="muted small">({groups[g].length})</span></h4>
            <ol className="small">
              {groups[g].map((uid) => (
                <li key={uid}><span dir="auto">{nameOf(uid)}</span> <button className="btn ghost" disabled={busy} onClick={() => remove(g, uid)} aria-label={t('am.remove')}>✕</button></li>
              ))}
            </ol>
            <select className="input" value="" disabled={busy || free.length === 0} onChange={(e) => { if (e.target.value) add(g, e.target.value); }} aria-label={t('am.addPlayer')}>
              <option value="">{t('am.addPlayer')}</option>
              {free.map((p) => <option key={p.uid} value={p.uid}>{p.name}</option>)}
            </select>
          </div>
        ))}
      </div>
      <p className="muted small">{t('am.summary', { total, sizes, free: free.length })}</p>
      <div className="actions">
        <button className="btn" disabled={busy || draft === null} onClick={saveGroups}>{t('am.saveGroups')}</button>
        {draft !== null && <button className="btn ghost" disabled={busy} onClick={() => setDraft(null)}>{t('am.discard')}</button>}
        <span className={msg === t('am.saved') ? 'save-ok' : 'muted'}>{msg}</span>
      </div>

      <h3 className="bq-title">{t('am.decisionsTitle')}</h3>
      {decisions === 0 && <p className="muted">{t('am.noDecisions')}</p>}
      {bracket.groupDecisions.map((g) => {
        const k = `G:${g}`;
        const p = picks[k] || {};
        const ok = p.first && p.second && p.first !== p.second;
        return (
          <div key={k} className="card">
            <strong>{t('am.groupDecision', { g })}</strong>
            <div className="actions">
              <select className="input" value={p.first || ''} onChange={(e) => setPicks({ ...picks, [k]: { ...p, first: e.target.value } })}>
                <option value="">{t('am.first')}</option>
                {groups[g].map((u) => <option key={u} value={u}>{nameOf(u)}</option>)}
              </select>
              <select className="input" value={p.second || ''} onChange={(e) => setPicks({ ...picks, [k]: { ...p, second: e.target.value } })}>
                <option value="">{t('am.second')}</option>
                {groups[g].map((u) => <option key={u} value={u}>{nameOf(u)}</option>)}
              </select>
              <button className="btn" disabled={busy || !ok} onClick={() => decide(`overrides.groupTop.${g}`, [p.first, p.second], 'mid.groupTop', { group: g, top: [p.first, p.second] })}>{t('am.apply')}</button>
            </div>
          </div>
        );
      })}
      {bracket.pairDecisions.map((key) => {
        const pair = bracket.pairs[key];
        const k = `P:${key}`;
        const p = picks[k] || '';
        return (
          <div key={k} className="card">
            <strong>{t('am.pairDecision', { pair: pairName(key) })}</strong>
            <div className="actions">
              <select className="input" value={p} onChange={(e) => setPicks({ ...picks, [k]: e.target.value })}>
                <option value="">{t('am.winner')}</option>
                <option value={pair.a.uid}>{pair.a.name}</option>
                <option value={pair.b.uid}>{pair.b.name}</option>
              </select>
              <button className="btn" disabled={busy || !p} onClick={() => decide(`overrides.pairWinner.${key}`, p, 'mid.pairWinner', { pair: key, winner: p })}>{t('am.apply')}</button>
            </div>
          </div>
        );
      })}

      {hasStored && (
        <>
          <h3 className="bq-title">{t('am.storedTitle')}</h3>
          <ul className="small">
            {Object.entries(stored.groupTop || {}).map(([g, top]) => (
              <li key={`g${g}`}>{t('mid.group', { g })}: {nameOf(top[0])}, {nameOf(top[1])} <button className="btn ghost" disabled={busy} onClick={() => clearDecision(`overrides.groupTop.${g}`)}>{t('am.clear')}</button></li>
            ))}
            {Object.entries(stored.pairWinner || {}).map(([key, uid]) => (
              <li key={`p${key}`}>{pairName(key)}: {nameOf(uid)} <button className="btn ghost" disabled={busy} onClick={() => clearDecision(`overrides.pairWinner.${key}`)}>{t('am.clear')}</button></li>
            ))}
          </ul>
        </>
      )}
    </PageShell>
  );
}

import { useMemo, useState } from 'react';
import { deleteField, doc, serverTimestamp, writeBatch } from 'firebase/firestore';
import { db } from '../../firebase.js';
import { useLang } from '../../contexts/LangContext.jsx';
import { useAuth } from '../../contexts/AuthContext.jsx';
import { usePoints } from '../../contexts/PointsContext.jsx';
import { useH2HCup } from '../../hooks/useH2HCup.js';
import { addAudit } from '../../utils/audit.js';
import { CUP_GROUPS_1, CUP_STAGES, CUP_ADVANCE_1, cleanGroups, windowsProblem } from '@shared/h2hCup.js';

const ref = doc(db, 'h2hTournament', 'cup');
const byName = (a, b) => String(a.name || '').localeCompare(String(b.name || ''), 'he');
const pairLabel = (t, k) => `${t(`cup.stage.${k.startsWith('QF') ? 'QF' : k.startsWith('SF') ? 'SF' : 'F'}`)}${k.replace(/\D/g, '') ? ` ${k.replace(/\D/g, '')}` : ''}`;

/**
 * Admin -> Head to Head -> the competition: (1) the DATES of the five stages (set later; a stage may stay empty = "to be announced"), (2) the players of the four
 * groups A-D (the draw is done by hand, outside the app), (3) decisions for REAL ties. Everything else (the tables, the new groups E-H, the knockout) is calculated.
 * One write per action (groups: one merge-write of the map; dates: one merge-write; a decision: one dotted-path update), each with an audit entry.
 */
export default function CupManager() {
  const { t } = useLang();
  const { user } = useAuth();
  const { cfg, groups: saved, bracket, rowsByUid, loading } = useH2HCup();
  const { rows } = usePoints(); // the players (paid, not admins)
  const players = useMemo(() => [...rows].sort(byName), [rows]);
  const [draft, setDraft] = useState(null); // unsaved group edits
  const [dates, setDates] = useState(null); // unsaved date edits
  const [picks, setPicks] = useState({});
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');

  const groups = draft ?? saved;
  const windows = dates ?? cfg?.windows ?? {};
  const problem = windowsProblem(windows);
  const assigned = new Set(CUP_GROUPS_1.flatMap((g) => groups[g]));
  const free = players.filter((p) => !assigned.has(p.uid));
  const nameOf = (uid) => rowsByUid[uid]?.name || uid;

  const run = async (fn, okMsg) => {
    setBusy(true); setMsg('');
    try { await fn(); setMsg(okMsg); } catch (e) { console.error(e); setMsg(t('common.error')); }
    setBusy(false);
  };
  const add = (g, uid) => setDraft({ ...groups, [g]: [...groups[g], uid] });
  const remove = (g, uid) => setDraft({ ...groups, [g]: groups[g].filter((u) => u !== uid) });
  const setDate = (stage, side, value) => setDates({ ...windows, [stage]: { ...(windows[stage] || {}), [side]: value } });

  const saveGroups = () => run(async () => {
    const next = cleanGroups(groups);
    const batch = writeBatch(db);
    batch.set(ref, { groups: next, updatedAt: serverTimestamp() }, { merge: true }); // ONE write for all four groups
    addAudit(batch, user.uid, { action: 'cup.groups', target: 'h2hTournament/cup', before: saved, after: next });
    await batch.commit();
    setDraft(null);
  }, t('am.saved'));

  const saveDates = () => run(async () => {
    if (windowsProblem(windows)) return;
    const out = {};
    CUP_STAGES.forEach((k) => { const w = windows[k]; out[k] = w && w.lo && w.hi ? { lo: w.lo, hi: w.hi } : deleteField(); }); // an empty stage = "to be announced"
    const batch = writeBatch(db);
    batch.set(ref, { windows: out, updatedAt: serverTimestamp() }, { merge: true });
    addAudit(batch, user.uid, { action: 'cup.windows', target: 'h2hTournament/cup', before: cfg?.windows || null, after: Object.fromEntries(CUP_STAGES.filter((k) => windows[k]?.lo && windows[k]?.hi).map((k) => [k, windows[k]])) });
    await batch.commit();
    setDates(null);
  }, t('am.saved'));

  const decide = (path, value, action, after) => run(async () => {
    const batch = writeBatch(db);
    batch.update(ref, { [path]: value, updatedAt: serverTimestamp() }); // dotted path on a map key: nothing else is touched
    addAudit(batch, user.uid, { action, target: `h2hTournament/cup#${path}`, after });
    await batch.commit();
  }, t('am.saved'));
  const clearDecision = (path) => decide(path, deleteField(), 'cup.clearDecision', null);

  if (loading) return <p className="muted">{t('common.loading')}</p>;

  const sizes = CUP_GROUPS_1.map((g) => groups[g].length).join(' + ');
  const stored = cfg?.overrides || {};
  const hasStored = Object.keys(stored.groupTop || {}).length + Object.keys(stored.rTop || {}).length + Object.keys(stored.pairWinner || {}).length > 0;
  const groupTopPicks = (g) => picks[`G:${g}`] || bracket.tablesG[g].table.slice(0, CUP_ADVANCE_1).map((r) => r.uid); // pre-filled with the current order

  return (
    <div>
      <p className="muted small">{t('acup.hint')}</p>

      <h3 className="bq-title">{t('acup.datesTitle')}</h3>
      <p className="muted small">{t('acup.datesHint')}</p>
      <div className="card">
        {CUP_STAGES.map((k) => (
          <div key={k} className="actions">
            <strong style={{ minWidth: '6rem' }}>{t(`cup.stage.${k}`)}</strong>
            <label className="small muted">{t('acup.from')} <input className="input" type="date" dir="ltr" value={windows[k]?.lo || ''} onChange={(e) => setDate(k, 'lo', e.target.value)} /></label>
            <label className="small muted">{t('acup.to')} <input className="input" type="date" dir="ltr" value={windows[k]?.hi || ''} onChange={(e) => setDate(k, 'hi', e.target.value)} /></label>
          </div>
        ))}
        {problem && <p className="error small">{t(`acup.err.${problem.code}`, { stage: t(`cup.stage.${problem.stage}`) })}</p>}
        <div className="actions">
          <button className="btn" disabled={busy || dates === null || !!problem} onClick={saveDates}>{t('acup.saveDates')}</button>
          {dates !== null && <button className="btn ghost" disabled={busy} onClick={() => setDates(null)}>{t('am.discard')}</button>}
        </div>
      </div>

      <h3 className="bq-title">{t('am.groupsTitle')}</h3>
      <div className="mid-grid">
        {CUP_GROUPS_1.map((g) => (
          <div key={g} className="card">
            <h4 className="bq-title">{t('cup.group', { g })} <span className="muted small">({groups[g].length})</span></h4>
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
      <p className="muted small">{t('am.summary', { total: assigned.size, sizes, free: free.length })}</p>
      <div className="actions">
        <button className="btn" disabled={busy || draft === null} onClick={saveGroups}>{t('am.saveGroups')}</button>
        {draft !== null && <button className="btn ghost" disabled={busy} onClick={() => setDraft(null)}>{t('am.discard')}</button>}
        <span className={msg === t('am.saved') ? 'save-ok' : 'muted'}>{msg}</span>
      </div>

      <h3 className="bq-title">{t('am.decisionsTitle')}</h3>
      {bracket.pending === 0 && <p className="muted">{t('am.noDecisions')}</p>}

      {bracket.decisions.G.map((g) => {
        const top = groupTopPicks(g);
        const ok = top.length === CUP_ADVANCE_1 && top.every(Boolean) && new Set(top).size === CUP_ADVANCE_1;
        return (
          <div key={`G${g}`} className="card">
            <strong>{t('acup.groupG', { g })}</strong>
            <div className="actions">
              {top.map((uid, i) => (
                <select key={i} className="input" value={uid || ''} onChange={(e) => setPicks({ ...picks, [`G:${g}`]: top.map((u, j) => (j === i ? e.target.value : u)) })}>
                  <option value="">{t('acup.place', { n: i + 1 })}</option>
                  {groups[g].map((u) => <option key={u} value={u}>{nameOf(u)}</option>)}
                </select>
              ))}
              <button className="btn" disabled={busy || !ok} onClick={() => decide(`overrides.groupTop.${g}`, top, 'cup.groupTop', { group: g, top })}>{t('am.apply')}</button>
            </div>
          </div>
        );
      })}

      {bracket.decisions.R.map((e) => {
        const k = `R:${e}`;
        const p = picks[k] || {};
        const members = bracket.groupsR[e];
        const ok = p.first && p.second && p.first !== p.second;
        return (
          <div key={k} className="card">
            <strong>{t('acup.groupR', { g: e })}</strong>
            <div className="actions">
              <select className="input" value={p.first || ''} onChange={(ev) => setPicks({ ...picks, [k]: { ...p, first: ev.target.value } })}>
                <option value="">{t('am.first')}</option>
                {members.map((u) => <option key={u} value={u}>{nameOf(u)}</option>)}
              </select>
              <select className="input" value={p.second || ''} onChange={(ev) => setPicks({ ...picks, [k]: { ...p, second: ev.target.value } })}>
                <option value="">{t('am.second')}</option>
                {members.map((u) => <option key={u} value={u}>{nameOf(u)}</option>)}
              </select>
              <button className="btn" disabled={busy || !ok} onClick={() => decide(`overrides.rTop.${e}`, [p.first, p.second], 'cup.rTop', { group: e, top: [p.first, p.second] })}>{t('am.apply')}</button>
            </div>
          </div>
        );
      })}

      {bracket.decisions.pairs.map((key) => {
        const pair = bracket.pairs[key];
        const k = `P:${key}`;
        const p = picks[k] || '';
        return (
          <div key={k} className="card">
            <strong>{t('acup.pair', { pair: pairLabel(t, key) })}</strong>
            <div className="actions">
              <select className="input" value={p} onChange={(ev) => setPicks({ ...picks, [k]: ev.target.value })}>
                <option value="">{t('am.winner')}</option>
                <option value={pair.a.uid}>{pair.a.name}</option>
                <option value={pair.b.uid}>{pair.b.name}</option>
              </select>
              <button className="btn" disabled={busy || !p} onClick={() => decide(`overrides.pairWinner.${key}`, p, 'cup.pairWinner', { pair: key, winner: p })}>{t('am.apply')}</button>
            </div>
          </div>
        );
      })}

      {hasStored && (
        <>
          <h3 className="bq-title">{t('am.storedTitle')}</h3>
          <ul className="small">
            {Object.entries(stored.groupTop || {}).map(([g, top]) => (
              <li key={`g${g}`}>{t('cup.group', { g })}: {top.map(nameOf).join(', ')} <button className="btn ghost" disabled={busy} onClick={() => clearDecision(`overrides.groupTop.${g}`)}>{t('am.clear')}</button></li>
            ))}
            {Object.entries(stored.rTop || {}).map(([g, top]) => (
              <li key={`r${g}`}>{t('cup.group', { g })}: {top.map(nameOf).join(', ')} <button className="btn ghost" disabled={busy} onClick={() => clearDecision(`overrides.rTop.${g}`)}>{t('am.clear')}</button></li>
            ))}
            {Object.entries(stored.pairWinner || {}).map(([key, uid]) => (
              <li key={`p${key}`}>{pairLabel(t, key)}: {nameOf(uid)} <button className="btn ghost" disabled={busy} onClick={() => clearDecision(`overrides.pairWinner.${key}`)}>{t('am.clear')}</button></li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

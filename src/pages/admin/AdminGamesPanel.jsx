import { useState } from 'react';
import { Timestamp, doc, getDoc, serverTimestamp, writeBatch } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { db, functions } from '../../firebase.js';
import PageShell from '../../components/PageShell.jsx';
import TeamBadge from '../../components/TeamBadge.jsx';
import Score from '../../components/Score.jsx';
import { useLang } from '../../contexts/LangContext.jsx';
import { useAuth } from '../../contexts/AuthContext.jsx';
import { useSettings } from '../../contexts/SettingsContext.jsx';
import { useTeams } from '../../contexts/TeamsContext.jsx';
import { useGames } from '../../hooks/useGames.js';
import { useNow } from '../../hooks/useNow.js';
import { MANAGER_STATUSES, managerCanChangeGame } from '@shared/gamesAccess.js';
import { addAudit } from '../../utils/audit.js';
import AdminScheduleImport from './AdminScheduleImport.jsx';
import PollerHealth from './PollerHealth.jsx';
import { formatDateTime, toLocalInput } from '../../utils/dates.js';
import { GAME_ROUNDS } from '@shared/constants.js';
import { TEAMS } from '@shared/teams.js';
import { GAME_STATUSES, buildGameId, buildRegularSeasonId, seriesIdOf, validateGame } from '@shared/games.js';

const EMPTY = { round: 'RS', seriesKey: 'E-1', gameNum: 1, t1: '', t2: '', tipoffLocal: '', status: 'scheduled', s1: '', s2: '', ot: 0, lockApi: false };
const num = (v) => (v === '' || v === null || v === undefined ? null : Number(v));

// The ONLY editor of games (create / edit / score-status-OT override / cancel / delete) and the teams seeder.
export default function AdminGamesPanel() {
  const { t, lang, dir } = useLang();
  const { user, isAdmin } = useAuth();
  const restricted = !isAdmin; // the games manager: no scores / results, only games that have not started
  const nowMs = useNow(15000);
  const { timezone } = useSettings();
  const { teams, seeded } = useTeams();
  const { games, loading } = useGames();
  const [form, setForm] = useState(null); // null = list view
  const [editing, setEditing] = useState(null); // existing game or null for new
  const [errs, setErrs] = useState([]);
  const [msg, setMsg] = useState('');
  const [view, setView] = useState('list'); // 'list' | 'import'

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const teamList = Object.values(teams).sort((a, b) => a.abbr.localeCompare(b.abbr));

  const seedTeams = async () => {
    setMsg('');
    try {
      const batch = writeBatch(db);
      TEAMS.forEach((tm) => batch.set(doc(db, 'teams', tm.abbr), { nameEn: tm.en, nameHe: tm.he, conf: tm.conf, color: tm.color, updatedAt: serverTimestamp() }));
      addAudit(batch, user.uid, { action: 'teams.seed', target: 'teams', after: { count: TEAMS.length } });
      await batch.commit();
      setMsg(t('ag.seeded'));
    } catch (e) { console.error(e); setMsg(t('common.error')); }
  };

  const openNew = () => { setEditing(null); setErrs([]); setForm({ ...EMPTY }); };
  const openEdit = (g) => {
    setEditing(g); setErrs([]);
    setForm({
      round: g.round, seriesKey: g.seriesKey, gameNum: g.gameNum, t1: g.t1 || '', t2: g.t2 || '',
      tipoffLocal: toLocalInput(g.tipoff), status: g.status, s1: g.s1 ?? '', s2: g.s2 ?? '', ot: g.ot || 0, lockApi: !!g.overridden,
    });
  };

  const save = async () => {
    setMsg('');
    const tipoff = form.tipoffLocal ? Timestamp.fromDate(new Date(form.tipoffLocal)) : null;
    const isRS = form.round === 'RS';
    const data = {
      round: form.round, seriesKey: isRS ? 'RS' : form.seriesKey.trim(), gameNum: isRS ? null : Number(form.gameNum),
      t1: form.t1 || null, t2: form.t2 || null, tipoff, status: form.status,
      s1: num(form.s1), s2: num(form.s2), ot: Number(form.ot) || 0,
    };
    const problems = validateGame(data);
    if (problems.length) { setErrs(problems); return; }
    const id = editing ? editing.id : isRS ? buildRegularSeasonId(tipoff.toDate(), data.t1, data.t2) : buildGameId(data.round, data.seriesKey, data.gameNum);
    const ref = doc(db, 'games', id);
    try {
      if (!editing && (await getDoc(ref)).exists()) { setErrs(['err.exists']); return; }
      const changedResult = !restricted && editing && (editing.status !== data.status || (editing.s1 ?? null) !== data.s1 || (editing.s2 ?? null) !== data.s2 || (editing.ot || 0) !== data.ot);
      const out = {
        ...data, seriesId: isRS ? 'RS' : seriesIdOf(data.round, data.seriesKey),
        winner: data.status === 'finished' ? (data.s1 > data.s2 ? data.t1 : data.t2) : null,
        overridden: restricted ? !!editing?.overridden : form.lockApi || !!changedResult, // manual result edits are never overwritten by the poller
        apiGameId: editing?.apiGameId ?? null, updatedAt: serverTimestamp(),
      };
      const batch = writeBatch(db);
      if (editing) batch.update(ref, out); else batch.set(ref, { ...out, createdAt: serverTimestamp() });
      addAudit(batch, user.uid, { action: editing ? 'game.update' : 'game.create', target: `games/${id}`, before: editing ? { ...editing } : null, after: { ...data, overridden: out.overridden } });
      await batch.commit();
      setForm(null); setEditing(null); setErrs([]);
    } catch (e) { console.error(e); setMsg(t('common.error')); }
  };

  const resync = async () => {
    setMsg('');
    try {
      const r = (await httpsCallable(functions, 'resyncGame')({ gameId: editing.id })).data;
      setMsg(r.applied ? t('ag.resyncDone') : t('ag.resyncNone'));
      setForm(null); setEditing(null); setErrs([]);
    } catch (e) { console.error(e); setErrs(['common.error']); }
  };

  const remove = async (g) => {
    if (restricted && !managerCanChangeGame({ ...g, tipoffMs: g.tipoff?.toMillis?.() ?? 0 }, nowMs)) return;
    if (!window.confirm(t('common.confirmDelete'))) return;
    try {
      const batch = writeBatch(db);
      batch.delete(doc(db, 'games', g.id));
      addAudit(batch, user.uid, { action: 'game.delete', target: `games/${g.id}`, before: { ...g } });
      await batch.commit();
    } catch (e) { console.error(e); setMsg(t('common.error')); }
  };

  if (view === 'import') return <AdminScheduleImport onBack={() => setView('list')} />;

  if (form) {
    return (
      <PageShell titleKey="admin.games">
        <div className="card">
          <h3>{editing ? t('ag.edit') : t('ag.new')}</h3>
          <div className="grid-form">
            <label className="field">{t('ag.round')}
              <select className="input" disabled={!!editing} value={form.round} onChange={(e) => set('round', e.target.value)}>
                {GAME_ROUNDS.map((r) => <option key={r} value={r}>{t(`round.${r}`)}</option>)}
              </select></label>
            {form.round !== 'RS' && (<>
            <label className="field">{t('ag.seriesKey')}
              <input className="input" dir="ltr" disabled={!!editing} value={form.seriesKey} onChange={(e) => set('seriesKey', e.target.value)} /></label>
            <label className="field">{t('ag.gameNum')}
              <input className="input" dir="ltr" type="number" min="1" max="7" disabled={!!editing} value={form.gameNum} onChange={(e) => set('gameNum', e.target.value)} /></label>
            </>)}
            <label className="field">{t('ag.home')}
              <select className="input" value={form.t1} onChange={(e) => set('t1', e.target.value)}>
                <option value="">{t('common.tbd')}</option>{teamList.map((x) => <option key={x.abbr} value={x.abbr}>{x[lang] || x.en}</option>)}
              </select></label>
            <label className="field">{t('ag.away')}
              <select className="input" value={form.t2} onChange={(e) => set('t2', e.target.value)}>
                <option value="">{t('common.tbd')}</option>{teamList.map((x) => <option key={x.abbr} value={x.abbr}>{x[lang] || x.en}</option>)}
              </select></label>
            <label className="field">{t('ag.tipoff')}
              <input className="input" dir="ltr" type="datetime-local" value={form.tipoffLocal} onChange={(e) => set('tipoffLocal', e.target.value)} /></label>
            <label className="field">{t('ag.status')}
              <select className="input" value={form.status} onChange={(e) => set('status', e.target.value)}>
                {(restricted ? MANAGER_STATUSES : GAME_STATUSES).map((s) => <option key={s} value={s}>{t(`status.${s}`)}</option>)}
              </select></label>
            {!restricted && <label className="field">{t('ag.score')}
              <span className="inline" dir={dir}>
                <input className="input num" dir="ltr" type="number" min="0" value={form.s1} onChange={(e) => set('s1', e.target.value)} />
                <span>–</span>
                <input className="input num" dir="ltr" type="number" min="0" value={form.s2} onChange={(e) => set('s2', e.target.value)} />
              </span></label>}
            {!restricted && <label className="field">{t('ag.ot')}
              <input className="input num" dir="ltr" type="number" min="0" max="6" value={form.ot} onChange={(e) => set('ot', e.target.value)} /></label>}
          </div>
          {!restricted && <label className="check"><input type="checkbox" checked={form.lockApi} onChange={(e) => set('lockApi', e.target.checked)} /> {t('ag.lockApi')}</label>}
          <p className="muted small">{restricted ? t('ag.managerFormNote') : t('ag.scoreNote')}</p>
          {errs.map((e) => <p key={e} className="error" role="alert">{t(e)}</p>)}
          <div className="actions">
            <button className="btn" onClick={save}>{t('common.save')}</button>
            <button className="btn ghost" onClick={() => { setForm(null); setEditing(null); setErrs([]); }}>{t('common.cancel')}</button>
            {!restricted && editing?.apiGameId != null && <button className="btn ghost" onClick={resync}>{t('ag.resync')}</button>}
          </div>
        </div>
      </PageShell>
    );
  }

  return (
    <PageShell titleKey="admin.games">
      {restricted ? <p className="muted small">{t('ag.managerNote')}</p> : <PollerHealth />}
      <div className="actions">
        <button className="btn" onClick={() => setView('import')}>{t('ai.title')}</button>
        <button className="btn ghost" onClick={openNew}>{t('ag.new')}</button>
        {!restricted && !seeded && <button className="btn ghost" onClick={seedTeams}>{t('ag.seedTeams')}</button>}
        <span className="muted">{msg}</span>
      </div>
      {loading && <p className="muted">{t('common.loading')}</p>}
      {games.map((g) => (
        <div key={g.id} className="row">
          <div className="grow">
            <div><TeamBadge abbr={g.t1} /> <span className="muted">–</span> <TeamBadge abbr={g.t2} />
              {(g.status === 'finished' || g.status === 'live') && <> · <Score a={g.s1} b={g.s2} />{g.ot > 0 ? ` (${t('results.ot')})` : ''}</>}
              {g.overridden && <span title={t('ag.lockApi')}> 🔒</span>}</div>
            {g.round !== 'RS' && <div className="muted small">{t(`round.${g.round}`)} · {g.seriesKey} · {t('ag.gameNum')} {g.gameNum}</div>}
            <div className="muted small">{formatDateTime(g.tipoff, lang, timezone)} · <span className={`badge ${g.status}`}>{t(`status.${g.status}`)}</span></div>
          </div>
          {(() => {
            const open = !restricted || managerCanChangeGame({ ...g, tipoffMs: g.tipoff?.toMillis?.() ?? 0 }, nowMs); // a started / live / finished game is read-only for the manager
            return (
              <>
                <button className="btn ghost" disabled={!open} title={open ? '' : t('ag.managerLocked')} onClick={() => openEdit(g)}>{t('common.edit')}</button>
                <button className="btn ghost" disabled={!open} title={open ? '' : t('ag.managerLocked')} onClick={() => remove(g)}>{t('common.delete')}</button>
              </>
            );
          })()}
        </div>
      ))}
    </PageShell>
  );
}

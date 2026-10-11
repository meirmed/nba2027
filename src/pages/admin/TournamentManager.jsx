import { useEffect, useMemo, useState } from 'react';
import { collection, deleteField, doc, runTransaction, serverTimestamp, writeBatch } from 'firebase/firestore';
import { db } from '../../firebase.js';
import { useLang } from '../../contexts/LangContext.jsx';
import { useAuth } from '../../contexts/AuthContext.jsx';
import { useSettings } from '../../contexts/SettingsContext.jsx';
import { useGames } from '../../hooks/useGames.js';
import { useTournament, usePlayerStats } from '../../hooks/useH2H.js';
import { addAudit, auditEntry } from '../../utils/audit.js';
import { dayKey } from '../../utils/dates.js';
import { addDaysToKey } from '@shared/daykeys.js';
import { DEFAULT_H2H_TIEBREAKERS, activeStageId, closeStagePatch, drawGroups, pairSeeds, prevDayKey, rankGroup, resolvePair, seedQualifiers } from '@shared/h2h.js';
import LeagueTab from '../h2h/LeagueTab.jsx';
import KnockoutTab from '../h2h/KnockoutTab.jsx';

const ref = doc(db, 'h2hTournament', 'main');

/** Number input that saves on blur (so typing doesn't write on every key). */
function NumField({ value, onCommit }) {
  return <input key={String(value)} className="input num" dir="ltr" inputMode="numeric" defaultValue={value ?? ''}
    onBlur={(e) => { const v = e.target.value.trim(); if (v !== String(value ?? '')) onCommit(v); }} />;
}

function useDays() {
  const { timezone } = useSettings();
  const { games } = useGames();
  const today = dayKey(new Date(), timezone);
  const first = games.find((g) => g.round === 'RS' && g.tipoff);
  return { today, tomorrow: addDaysToKey(today, 1), firstGameDay: first ? dayKey(first.tipoff, timezone) : today };
}

// ---------------------------------------------------------------- setup: draw groups, then start the league
function Setup({ players }) {
  const { t } = useLang();
  const { user } = useAuth();
  const { firstGameDay } = useDays();
  const [groupsCount, setGroupsCount] = useState('4');
  const [advance, setAdvance] = useState('2');
  const [startDay, setStartDay] = useState(firstGameDay);
  const [selected, setSelected] = useState(null);
  const [draft, setDraft] = useState(null);
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => { if (selected === null && players.length) setSelected(new Set(players.map((p) => p.uid))); }, [players, selected]);
  const sel = selected || new Set();
  const nameOf = (uid) => players.find((p) => p.uid === uid)?.name || '…';
  const toggle = (uid) => setSelected((s) => { const n = new Set(s); if (n.has(uid)) n.delete(uid); else n.add(uid); return n; });

  const draw = () => {
    const n = Number(groupsCount);
    if (!Number.isInteger(n) || n < 1 || n > 26 || sel.size < n) { setMsg(t('ah.err.invalid')); return; }
    setMsg(''); setDraft(drawGroups([...sel], n));
  };
  const move = (uid, g) => setDraft((d) => {
    const next = Object.fromEntries(Object.entries(d).map(([k, m]) => [k, m.filter((x) => x !== uid)]));
    next[g] = [...next[g], uid];
    return next;
  });

  const start = async () => {
    const adv = Number(advance);
    if (!draft || !Number.isInteger(adv) || adv < 1 || !startDay) { setMsg(draft ? t('ah.err.invalid') : t('ah.drawFirst')); return; }
    setBusy(true);
    try {
      const groups = Object.fromEntries(Object.entries(draft).map(([g, members]) => [g, { members }]));
      const batch = writeBatch(db);
      batch.set(ref, {
        status: 'league', groupsCount: Object.keys(draft).length, advancePerGroup: adv, tiebreakers: DEFAULT_H2H_TIEBREAKERS,
        league: { startDay, endDay: null, groups }, stages: {}, championUid: null, createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
      });
      addAudit(batch, user.uid, { action: 'h2h.create', target: 'h2hTournament/main', after: { groups: Object.keys(draft).length, advancePerGroup: adv, players: sel.size, startDay } });
      await batch.commit();
    } catch (e) { console.error(e); setMsg(t('common.error')); setBusy(false); }
  };

  return (
    <div className="card">
      <h3>{t('ah.setup')}</h3>
      <div className="grid-form">
        <label className="field">{t('ah.groupsCount')}<input className="input num" dir="ltr" inputMode="numeric" value={groupsCount} onChange={(e) => setGroupsCount(e.target.value)} /></label>
        <label className="field">{t('ah.advance')}<input className="input num" dir="ltr" inputMode="numeric" value={advance} onChange={(e) => setAdvance(e.target.value)} /></label>
        <label className="field">{t('ah.startDay')}<input className="input" dir="ltr" type="date" value={startDay} onChange={(e) => setStartDay(e.target.value)} /></label>
      </div>
      <h4>{t('ah.players', { n: sel.size })}</h4>
      <div className="actions">
        <button className="btn ghost" onClick={() => setSelected(new Set(players.map((p) => p.uid)))}>{t('ah.selectAll')}</button>
        <button className="btn ghost" onClick={() => setSelected(new Set())}>{t('ah.selectNone')}</button>
      </div>
      <div className="bq-options">
        {players.map((p) => <label key={p.uid} className="check"><input type="checkbox" checked={sel.has(p.uid)} onChange={() => toggle(p.uid)} /> <span dir="auto">{p.name}</span></label>)}
      </div>
      <div className="actions"><button className="btn" onClick={draw}>{t('ah.draw')}</button></div>

      {draft && Object.entries(draft).sort((a, b) => a[0].localeCompare(b[0])).map(([g, members]) => (
        <div key={g}>
          <h4>{t('h2h.group', { g })} ({members.length})</h4>
          {members.map((uid) => (
            <div key={uid} className="inline">
              <span className="grow" dir="auto">{nameOf(uid)}</span>
              <select className="input" value={g} onChange={(e) => move(uid, e.target.value)} aria-label={t('ah.moveTo')}>
                {Object.keys(draft).sort().map((k) => <option key={k} value={k}>{t('h2h.group', { g: k })}</option>)}
              </select>
            </div>
          ))}
        </div>
      ))}
      <div className="actions"><button className="btn" disabled={busy || !draft} onClick={start}>{t('ah.startLeague')}</button><span className="error">{msg}</span></div>
    </div>
  );
}

// ---------------------------------------------------------------- running tournament
function Running({ tournament, players }) {
  const { t } = useLang();
  const { user } = useAuth();
  const { nameOf, statsOf } = usePlayerStats();
  const { tomorrow } = useDays();
  const tb = tournament.tiebreakers || DEFAULT_H2H_TIEBREAKERS;
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const [koStart, setKoStart] = useState(tomorrow);
  const [nextStart, setNextStart] = useState(tomorrow);
  const [extra, setExtra] = useState({}); // uid -> include? (overrides the computed qualifiers)

  const run = async (fn) => { setBusy(true); setMsg(''); try { await fn(); } catch (e) { console.error(e); setMsg(e.message === 'state' ? t('ah.err.state') : t('common.error')); } setBusy(false); };
  const write = (data, action, after) => {
    const batch = writeBatch(db);
    batch.update(ref, { ...data, updatedAt: serverTimestamp() });
    addAudit(batch, user.uid, { action, target: 'h2hTournament/main', after: after ?? null });
    return batch.commit();
  };

  // ---- league
  const { league } = tournament;
  const groups = league.groups || {};
  const tables = Object.fromEntries(Object.entries(groups).map(([g, grp]) => [g, rankGroup(grp.members || [], (uid) => statsOf(uid, league.startDay, league.endDay), nameOf)]));
  const seeded = seedQualifiers(tables, tournament.advancePerGroup);
  const included = (uid) => (uid in extra ? extra[uid] : seeded.some((s) => s.uid === uid));
  const allMembers = Object.values(groups).flatMap((g) => g.members || []);
  const ordered = [...seeded.map((s) => s.uid).filter(included), ...allMembers.filter((u) => included(u) && !seeded.some((s) => s.uid === u))];

  const moveMember = (uid, to) => run(() => {
    const next = Object.fromEntries(Object.entries(groups).map(([g, grp]) => [g, { members: (grp.members || []).filter((x) => x !== uid) }]));
    next[to].members = [...next[to].members, uid];
    return write({ 'league.groups': next }, 'h2h.moveMember', { uid, to });
  });
  const closeLeague = () => run(async () => {
    if (ordered.length < 2 || !koStart) throw new Error('invalid');
    if (!window.confirm(t('ah.confirmCloseLeague', { n: ordered.length }))) return;
    await runTransaction(db, async (tx) => {
      const cur = (await tx.get(ref)).data();
      if (cur.status !== 'league') throw new Error('state');
      tx.update(ref, {
        status: 'knockout', 'league.endDay': prevDayKey(koStart), updatedAt: serverTimestamp(),
        'stages.K1': { stageNum: 1, startDay: koStart, endDay: null, pairs: pairSeeds(ordered.map((uid, i) => ({ uid, seed: i + 1 }))) },
      });
      tx.set(doc(collection(db, 'auditLog')), auditEntry(user.uid, { action: 'h2h.closeLeague', target: 'h2hTournament/main', after: { qualifiers: ordered, koStart } }));
    });
  });

  // ---- knockout
  const stageId = activeStageId(tournament.stages);
  const stage = stageId ? tournament.stages[stageId] : null;
  const pairPath = (pid, k) => `stages.${stageId}.pairs.${pid}.${k}`;
  const updatePair = (pid, fields) => run(() => write(Object.fromEntries(Object.entries(fields).map(([k, v]) => [pairPath(pid, k), v])), 'h2h.updatePair', { stageId, pid, ...fields }));
  const addPair = () => run(() => write({ [`stages.${stageId}.pairs.p${Date.now().toString(36)}`]: { a: '', b: '', seedA: null, seedB: null, advA: 0, advB: 0, winnerOverride: null, winner: null } }, 'h2h.addPair', { stageId }));
  const removePair = (pid) => run(() => (window.confirm(t('common.confirmDelete')) ? write({ [`stages.${stageId}.pairs.${pid}`]: deleteField() }, 'h2h.removePair', { stageId, pid }) : null));
  const results = stage ? Object.fromEntries(Object.entries(stage.pairs || {}).map(([pid, p]) => [pid, resolvePair(p, (uid) => statsOf(uid, stage.startDay, stage.endDay), tb)])) : {};
  const closeStage = () => run(async () => {
    if (Object.values(results).some((r) => !r.winnerUid)) throw new Error('unresolved');
    if (!window.confirm(t('ah.confirmCloseStage'))) return;
    await runTransaction(db, async (tx) => {
      const cur = (await tx.get(ref)).data();
      const r = closeStagePatch(cur, results, nextStart);
      if (r.error) throw new Error('state');
      tx.update(ref, { ...r.patch, updatedAt: serverTimestamp() });
      tx.set(doc(collection(db, 'auditLog')), auditEntry(user.uid, { action: 'h2h.closeStage', target: 'h2hTournament/main', after: { stageId, nextStart, finished: !!r.finished } }));
    });
  });

  const moveTb = (i, d) => { const next = [...tb]; const j = i + d; if (j < 0 || j >= next.length) return; [next[i], next[j]] = [next[j], next[i]]; run(() => write({ tiebreakers: next }, 'h2h.tiebreakers', { tiebreakers: next })); };
  const playerOptions = <>{players.map((p) => <option key={p.uid} value={p.uid}>{p.name}</option>)}</>;

  return (
    <div>
      <div className="card">
        <strong>{t(`ah.status.${tournament.status}`)}</strong>
        <h4>{t('ah.tiebreakers')}</h4>
        {tb.map((k, i) => (
          <div key={k} className="inline">
            <span>{i + 1}. {t(`ah.tb.${k}`)}</span>
            <button className="btn ghost" disabled={i === 0 || busy} onClick={() => moveTb(i, -1)}>↑</button>
            <button className="btn ghost" disabled={i === tb.length - 1 || busy} onClick={() => moveTb(i, 1)}>↓</button>
          </div>
        ))}
        <p className="muted">{msg}</p>
      </div>

      {tournament.status === 'league' && (
        <div className="card">
          <h4>{t('ah.groupsEditor')}</h4>
          {Object.entries(groups).sort((a, b) => a[0].localeCompare(b[0])).map(([g, grp]) => (
            <div key={g}>
              <strong>{t('h2h.group', { g })}</strong>
              {(grp.members || []).map((uid) => (
                <div key={uid} className="inline">
                  <span className="grow" dir="auto">{nameOf(uid)}</span>
                  <select className="input" value={g} disabled={busy} onChange={(e) => moveMember(uid, e.target.value)}>
                    {Object.keys(groups).sort().map((k) => <option key={k} value={k}>{t('h2h.group', { g: k })}</option>)}
                  </select>
                </div>
              ))}
            </div>
          ))}
          <label className="field">{t('ah.advance')}
            <NumField value={tournament.advancePerGroup} onCommit={(v) => Number.isInteger(Number(v)) && Number(v) >= 1 && run(() => write({ advancePerGroup: Number(v) }, 'h2h.advancePerGroup', { v: Number(v) }))} />
          </label>

          <h4>{t('ah.closeLeague')}</h4>
          <label className="field">{t('ah.koStart')}<input className="input" dir="ltr" type="date" value={koStart} onChange={(e) => setKoStart(e.target.value)} /></label>
          <p className="muted small">{t('ah.qualifiers', { n: ordered.length })}</p>
          <div className="bq-options">
            {allMembers.map((uid) => <label key={uid} className="check"><input type="checkbox" checked={included(uid)} onChange={(e) => setExtra((x) => ({ ...x, [uid]: e.target.checked }))} /> <span dir="auto">{nameOf(uid)}</span></label>)}
          </div>
          <div className="actions"><button className="btn" disabled={busy} onClick={closeLeague}>{t('ah.createKnockout')}</button></div>
        </div>
      )}

      {stage && (
        <div className="card">
          <h4>{t('h2h.stage', { n: stage.stageNum })} · {stage.startDay}</h4>
          {Object.entries(stage.pairs || {}).map(([pid, p]) => {
            const r = results[pid];
            return (
              <div key={pid} className="pair-edit">
                <div className="grid-form">
                  <label className="field">A<select className="input" dir="auto" value={p.a || ''} onChange={(e) => updatePair(pid, { a: e.target.value })}><option value="" />{playerOptions}</select></label>
                  <label className="field">{t('ah.seed')}<NumField value={p.seedA} onCommit={(v) => updatePair(pid, { seedA: v === '' ? null : Number(v) })} /></label>
                  <label className="field">{t('ah.headStart')}<NumField value={p.advA || 0} onCommit={(v) => updatePair(pid, { advA: Number(v) || 0 })} /></label>
                  <label className="field">B<select className="input" dir="auto" value={p.b || ''} onChange={(e) => updatePair(pid, { b: e.target.value || null })}><option value="">{t('h2h.bye')}</option>{playerOptions}</select></label>
                  <label className="field">{t('ah.seed')}<NumField value={p.seedB} onCommit={(v) => updatePair(pid, { seedB: v === '' ? null : Number(v) })} /></label>
                  <label className="field">{t('ah.headStart')}<NumField value={p.advB || 0} onCommit={(v) => updatePair(pid, { advB: Number(v) || 0 })} /></label>
                  <label className="field">{t('ah.override')}
                    <select className="input" value={p.winnerOverride || ''} onChange={(e) => updatePair(pid, { winnerOverride: e.target.value || null })}>
                      <option value="">{t('ah.auto')}</option><option value="a">A</option><option value="b">B</option>
                    </select></label>
                </div>
                <p className={r.winnerUid ? 'muted small' : 'error small'}>
                  <span dir="auto">{p.a ? nameOf(p.a) : '?'}</span> {r.scoreA} – {p.b ? r.scoreB : '–'} <span dir="auto">{p.b ? nameOf(p.b) : t('h2h.bye')}</span> → {r.winnerUid ? <strong dir="auto">{nameOf(r.winnerUid)}</strong> : t('h2h.tieOpen')}
                </p>
                <button className="btn ghost" disabled={busy} onClick={() => removePair(pid)}>{t('common.delete')}</button>
              </div>
            );
          })}
          <div className="actions"><button className="btn ghost" disabled={busy} onClick={addPair}>{t('ah.addPair')}</button></div>
          <label className="field">{t('ah.nextStart')}<input className="input" dir="ltr" type="date" value={nextStart} onChange={(e) => setNextStart(e.target.value)} /></label>
          <div className="actions"><button className="btn" disabled={busy} onClick={closeStage}>{t('ah.closeStage')}</button></div>
        </div>
      )}
      {tournament.status === 'finished' && <div className="card champion">🏆 {t('ah.finished')}: <strong dir="auto">{nameOf(tournament.championUid)}</strong></div>}

      <h3 className="bq-title">{t('h2h.tab.league')}</h3>
      <LeagueTab />
      <h3 className="bq-title">{t('h2h.tab.knockout')}</h3>
      <KnockoutTab />
    </div>
  );
}

// The ONLY editor of the tournament (groups, league -> knockout, stages, pairs, head starts, winner overrides, tie-break order).
export default function TournamentManager() {
  const { t } = useLang();
  const tournament = useTournament();
  const { rows } = usePlayerStats();
  const players = useMemo(() => [...rows].sort((a, b) => (a.name || '').localeCompare(b.name || '', 'he')), [rows]);
  if (tournament === undefined) return <p className="muted">{t('common.loading')}</p>;
  return tournament === null ? <Setup players={players} /> : <Running tournament={tournament} players={players} />;
}

import { useMemo, useState } from 'react';
import { collection, doc, serverTimestamp, writeBatch } from 'firebase/firestore';
import { db } from '../../firebase.js';
import { useLang } from '../../contexts/LangContext.jsx';
import { useAuth } from '../../contexts/AuthContext.jsx';
import { usePlayers } from '../../hooks/usePlayers.js';
import { addAudit } from '../../utils/audit.js';
import { normalizeName } from '@shared/names.js';
import { TEAMS_BY_ABBR } from '@shared/teams.js';

/** "Name" or "Name, TEAM" per line. Team must be a valid code (BOS, LAL...), otherwise the whole line is the name. */
function parseLine(line) {
  const i = line.lastIndexOf(',');
  if (i > 0) {
    const team = line.slice(i + 1).trim().toUpperCase();
    if (TEAMS_BY_ABBR[team]) return { name: line.slice(0, i).trim(), team };
  }
  return { name: line.trim(), team: null };
}

// The ONLY editor of the player list (used by "player" bonus questions: MVP, Finals MVP, rookie of the year...).
export default function PlayersManager() {
  const { t } = useLang();
  const { user } = useAuth();
  const { players } = usePlayers(true);
  const [text, setText] = useState('');
  const [filter, setFilter] = useState('');
  const [msg, setMsg] = useState('');

  const shown = useMemo(() => {
    const s = filter.trim().toLowerCase();
    return players.filter((p) => !s || (p.name || '').toLowerCase().includes(s)).slice(0, 100);
  }, [players, filter]);

  const add = async () => {
    setMsg('');
    try {
      const have = new Set(players.map((p) => `${p.normalizedName}|${p.team || ''}`));
      const fresh = text.split('\n').map(parseLine).filter((p) => p.name)
        .filter((p, i, a) => a.findIndex((x) => normalizeName(x.name) === normalizeName(p.name) && x.team === p.team) === i)
        .filter((p) => !have.has(`${normalizeName(p.name)}|${p.team || ''}`));
      for (let i = 0; i < fresh.length; i += 400) {
        const batch = writeBatch(db);
        fresh.slice(i, i + 400).forEach((p) => batch.set(doc(collection(db, 'players')), { name: p.name, team: p.team, normalizedName: normalizeName(p.name), createdAt: serverTimestamp() }));
        addAudit(batch, user.uid, { action: 'players.add', target: 'players', after: { count: Math.min(400, fresh.length - i) } });
        await batch.commit();
      }
      setText('');
      setMsg(t('bq.playersAdded', { n: fresh.length }));
    } catch (e) { console.error(e); setMsg(t('common.error')); }
  };

  const remove = async (p) => {
    if (!window.confirm(t('common.confirmDelete'))) return;
    try {
      const batch = writeBatch(db);
      batch.delete(doc(db, 'players', p.id));
      addAudit(batch, user.uid, { action: 'players.delete', target: `players/${p.id}`, before: { name: p.name, team: p.team ?? null } });
      await batch.commit();
    } catch (e) { console.error(e); setMsg(t('common.error')); }
  };

  return (
    <div>
      <div className="card">
        <label className="field">{t('bq.addPlayers')}
          <textarea className="input" dir="auto" rows={4} value={text} onChange={(e) => setText(e.target.value)} />
        </label>
        <div className="actions"><button className="btn" onClick={add} disabled={!text.trim()}>{t('common.add')}</button><span className="muted">{msg}</span></div>
      </div>
      <p className="muted small">{t('bq.playerCount', { n: players.length })}</p>
      <input className="input" dir="auto" value={filter} placeholder={t('bq.searchPlayer')} onChange={(e) => setFilter(e.target.value)} />
      {shown.map((p) => (
        <div key={p.id} className="row">
          <div className="grow" dir="auto">{p.name}{p.team ? <span className="muted"> · {p.team}</span> : null}</div>
          <button className="btn ghost" onClick={() => remove(p)}>{t('common.delete')}</button>
        </div>
      ))}
    </div>
  );
}

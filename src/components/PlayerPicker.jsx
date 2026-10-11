import { useMemo, useState } from 'react';
import { useLang } from '../contexts/LangContext.jsx';

/** Search the admin-maintained player list and pick one or several (chips). value = array of player ids. */
export default function PlayerPicker({ players, value, onChange, max = 1, disabled = false }) {
  const { t } = useLang();
  const [q, setQ] = useState('');
  const byId = useMemo(() => Object.fromEntries(players.map((p) => [p.id, p])), [players]);
  const matches = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return [];
    return players.filter((p) => !value.includes(p.id) && (p.name || '').toLowerCase().includes(s)).slice(0, 8);
  }, [players, q, value]);

  const add = (id) => { onChange(max === 1 ? [id] : [...value, id].slice(0, max)); setQ(''); };
  const full = max !== 1 && value.length >= max;

  return (
    <div className="player-picker">
      <div className="chips-row">
        {value.map((id) => (
          <span key={id} className="chip chip-pick">
            {byId[id]?.name || '…'}{byId[id]?.team ? ` · ${byId[id].team}` : ''}
            {!disabled && <button type="button" className="chip-x" aria-label={t('common.delete')} onClick={() => onChange(value.filter((x) => x !== id))}>×</button>}
          </span>
        ))}
      </div>
      {!disabled && !full && (
        <>
          <input className="input" dir="auto" value={q} placeholder={t('bq.searchPlayer')} onChange={(e) => setQ(e.target.value)} />
          {matches.map((p) => (
            <button key={p.id} type="button" className="pick-row" onClick={() => add(p.id)}>{p.name}{p.team ? <span className="muted"> · {p.team}</span> : null}</button>
          ))}
        </>
      )}
    </div>
  );
}

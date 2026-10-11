import { useMemo, useState } from 'react';
import { useLang } from '../contexts/LangContext.jsx';

const LONG_LIST = 40; // above this many players a search box appears above the drop-down

/**
 * Pick one or several players from the admin-maintained list with a DROP-DOWN.
 * max = 1: the drop-down shows the chosen player. max > 1: each choice becomes a removable chip (up to max).
 * value = array of player ids.
 */
export default function PlayerPicker({ players, value, onChange, max = 1, disabled = false }) {
  const { t } = useLang();
  const [q, setQ] = useState('');
  const single = max === 1;
  const long = players.length > LONG_LIST;
  const byId = useMemo(() => Object.fromEntries(players.map((p) => [p.id, p])), [players]);

  const options = useMemo(() => {
    const s = q.trim().toLowerCase();
    return players.filter((p) => (single ? p.id === value[0] : !value.includes(p.id)) || ((!long || !s || (p.name || '').toLowerCase().includes(s)) && (single || !value.includes(p.id))));
  }, [players, q, value, single, long]);

  const pick = (id) => {
    if (!id) return;
    onChange(single ? [id] : [...value, id].slice(0, max));
    setQ('');
  };
  const full = !single && value.length >= max;

  return (
    <div className="player-picker">
      {!single && (
        <div className="chips-row">
          {value.map((id) => (
            <span key={id} className="chip chip-pick">
              {byId[id]?.name || '…'}{byId[id]?.team ? ` · ${byId[id].team}` : ''}
              {!disabled && <button type="button" className="chip-x" aria-label={t('common.delete')} onClick={() => onChange(value.filter((x) => x !== id))}>×</button>}
            </span>
          ))}
        </div>
      )}
      {!disabled && !full && (
        <>
          {long && <input className="input" dir="auto" value={q} placeholder={t('bq.searchPlayer')} onChange={(e) => setQ(e.target.value)} />}
          <select className="input" dir="auto" value={single ? (value[0] || '') : ''} onChange={(e) => pick(e.target.value)}>
            <option value="">{t('bq.choosePlayer')}</option>
            {options.map((p) => <option key={p.id} value={p.id}>{p.name}{p.team ? ` · ${p.team}` : ''}</option>)}
          </select>
        </>
      )}
      {disabled && single && <strong dir="auto">{byId[value[0]]?.name || '…'}</strong>}
    </div>
  );
}

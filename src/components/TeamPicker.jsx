import { useMemo } from 'react';
import { useLang } from '../contexts/LangContext.jsx';
import { useTeams } from '../contexts/TeamsContext.jsx';

/**
 * Pick one or several teams with a DROP-DOWN. max = 1: the drop-down shows the chosen team.
 * max > 1: each choice becomes a removable chip (up to max). value = array of team codes.
 */
export default function TeamPicker({ value, onChange, max = 1, disabled = false }) {
  const { t, lang } = useLang();
  const { teams } = useTeams();
  const single = max === 1;
  const nameOf = (id) => (teams[id] ? teams[id][lang] || teams[id].en : id);
  const list = useMemo(() => Object.values(teams).sort((a, b) => (a[lang] || a.en).localeCompare(b[lang] || b.en, lang)), [teams, lang]);
  const options = single ? list : list.filter((tm) => !value.includes(tm.abbr));
  const pick = (id) => { if (id) onChange(single ? [id] : [...value, id].slice(0, max)); };
  const full = !single && value.length >= max;

  return (
    <div className="player-picker">
      {!single && (
        <div className="chips-row">
          {value.map((id) => (
            <span key={id} className="chip chip-pick">
              {nameOf(id)}
              {!disabled && <button type="button" className="chip-x" aria-label={t('common.delete')} onClick={() => onChange(value.filter((x) => x !== id))}>×</button>}
            </span>
          ))}
        </div>
      )}
      {!disabled && !full && (
        <select className="input" dir="auto" value={single ? (value[0] || '') : ''} onChange={(e) => pick(e.target.value)}>
          <option value="">{t('bq.chooseTeam')}</option>
          {options.map((tm) => <option key={tm.abbr} value={tm.abbr}>{tm[lang] || tm.en}</option>)}
        </select>
      )}
    </div>
  );
}

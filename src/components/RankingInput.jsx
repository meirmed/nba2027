import { useMemo, useRef } from 'react';
import { useLang } from '../contexts/LangContext.jsx';
import { useTeams } from '../contexts/TeamsContext.jsx';
import { EAST_TEAMS, WEST_TEAMS } from '@shared/bonus.js';

/**
 * Rank the 15 East teams and the 15 West teams. value = 30 team codes (East 1..15, then West 1..15) or [] while nothing is saved.
 * Reorder with the up/down buttons (works on phones) or by dragging a row (mouse). Every change emits the full 30-team answer.
 */
export default function RankingInput({ value, onChange, disabled = false }) {
  const { t, lang } = useLang();
  const { teams } = useTeams();
  const drag = useRef(null);
  const nameOf = (a) => teams[a]?.[lang] || teams[a]?.en || a;
  const started = value.length === 30;
  const initial = useMemo(() => {
    const byName = (arr) => [...arr].sort((a, b) => (teams[a]?.[lang] || a).localeCompare(teams[b]?.[lang] || b, lang));
    return { east: byName(EAST_TEAMS), west: byName(WEST_TEAMS) };
  }, [teams, lang]);
  const east = started ? value.slice(0, 15) : initial.east;
  const west = started ? value.slice(15) : initial.west;

  const move = (conf, from, to) => {
    if (disabled || to < 0 || to > 14 || from === to) return;
    const arr = [...(conf === 'east' ? east : west)];
    const [x] = arr.splice(from, 1);
    arr.splice(to, 0, x);
    onChange(conf === 'east' ? [...arr, ...west] : [...east, ...arr]);
  };

  const List = ({ conf, list, title }) => (
    <div className="rank-conf">
      <h4>{title}</h4>
      <ol className="rank-list">
        {list.map((a, i) => (
          <li key={a} draggable={!disabled} onDragStart={() => { drag.current = { conf, i }; }} onDragOver={(e) => e.preventDefault()}
            onDrop={() => { if (drag.current?.conf === conf) move(conf, drag.current.i, i); drag.current = null; }}>
            <span className="rank-place" dir="ltr">{i + 1}</span>
            <span className="rank-name" dir="auto">{nameOf(a)}</span>
            {!disabled && (
              <>
                <button type="button" className="rank-btn" disabled={i === 0} onClick={() => move(conf, i, i - 1)} aria-label="up">▲</button>
                <button type="button" className="rank-btn" disabled={i === 14} onClick={() => move(conf, i, i + 1)} aria-label="down">▼</button>
              </>
            )}
          </li>
        ))}
      </ol>
    </div>
  );

  return (
    <div>
      {!started && <p className="muted small">{t('rk.hint')}</p>}
      <div className="rank-tables">
        <List conf="east" list={east} title={t('rk.east')} />
        <List conf="west" list={west} title={t('rk.west')} />
      </div>
    </div>
  );
}

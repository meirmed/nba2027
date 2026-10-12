import { useLang } from '../contexts/LangContext.jsx';
import { useTeams } from '../contexts/TeamsContext.jsx';

/** A ranking (30 team codes) as two tables. With `actual` (the final order) it adds the final place and the places missed per team. */
export default function RankingTable({ order, actual = null }) {
  const { t, lang } = useLang();
  const { teams } = useTeams();
  if (!order || order.length !== 30) return null;
  const nameOf = (a) => teams[a]?.[lang] || teams[a]?.en || a;
  return (
    <div className="rank-tables">
      {[['east', 0, t('rk.east')], ['west', 15, t('rk.west')]].map(([k, off, title]) => {
        const mine = order.slice(off, off + 15);
        const pos = actual && actual.length === 30 ? new Map(actual.slice(off, off + 15).map((a, i) => [a, i])) : null;
        return (
          <div key={k}>
            <h4>{title}</h4>
            <table className="table">
              <thead><tr className="muted small"><th>#</th><th className="lb-name">{t('rk.team')}</th>{pos && <><th>{t('rk.actual')}</th><th>{t('rk.miss')}</th></>}</tr></thead>
              <tbody>
                {mine.map((a, i) => {
                  const f = pos?.get(a);
                  const miss = pos ? Math.abs(i - f) : null;
                  return (
                    <tr key={a}>
                      <td dir="ltr">{i + 1}</td>
                      <td className="lb-name" dir="auto">{nameOf(a)}</td>
                      {pos && <><td dir="ltr">{f + 1}</td><td dir="ltr" className={miss === 0 ? 'save-ok' : 'error'}>{miss}</td></>}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        );
      })}
    </div>
  );
}

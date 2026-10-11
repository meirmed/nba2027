import { useLang } from '../../contexts/LangContext.jsx';
import { useAuth } from '../../contexts/AuthContext.jsx';
import { useTournament, usePlayerStats } from '../../hooks/useH2H.js';
import { rankGroup } from '@shared/h2h.js';

/** Group league: each group's table from game points in [league.startDay, league.endDay]. The top N of every group advance. */
export default function LeagueTab() {
  const { t, dir } = useLang();
  const { user } = useAuth();
  const tournament = useTournament();
  const { nameOf, statsOf } = usePlayerStats();
  if (tournament === undefined) return <p className="muted">{t('common.loading')}</p>;
  if (!tournament) return <p className="muted">{t('h2h.none')}</p>;

  const { league, advancePerGroup } = tournament;
  const groups = Object.entries(league.groups || {}).sort((a, b) => a[0].localeCompare(b[0]));
  return (
    <div>
      <p className="muted small">{t('h2h.advancesNote', { n: advancePerGroup })}</p>
      {groups.map(([g, grp]) => {
        const table = rankGroup(grp.members || [], (uid) => statsOf(uid, league.startDay, league.endDay), nameOf);
        return (
          <section key={g}>
            <h3 className="bq-title">{t('h2h.group', { g })}</h3>
            <div className="table-wrap">
              <table className="table lb" dir={dir}>
                <thead><tr className="muted small"><th>#</th><th className="lb-name">{t('lb.name')}</th><th>{t('h2h.exact')}</th><th>{t('h2h.unique')}</th><th>{t('h2h.pts')}</th></tr></thead>
                <tbody>
                  {table.map((r) => (
                    <tr key={r.uid} className={`${r.uid === user?.uid ? 'me' : ''} ${r.pos <= advancePerGroup ? 'adv' : ''}`}>
                      <td>{r.rank}</td>
                      <td className="lb-name" dir="auto">{nameOf(r.uid)}{r.uid === user?.uid ? ` ${t('lb.you')}` : ''}</td>
                      <td>{r.exactHits}</td><td>{r.uniqueHits}</td><td><strong className="pts-total">{r.pts}</strong></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        );
      })}
    </div>
  );
}

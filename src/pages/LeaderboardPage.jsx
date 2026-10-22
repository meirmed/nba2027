import { useMemo, useState } from 'react';
import { useGames } from '../hooks/useGames.js';
import { useNow } from '../hooks/useNow.js';
import { dayKey } from '../utils/dates.js';
import { countsForStandings } from '@shared/games.js';
import { monthArrived, monthChampions, monthFinished, monthlyRows, seasonMonths } from '@shared/monthly.js';
import PageShell from '../components/PageShell.jsx';
import ErrorBoundary from '../components/ErrorBoundary.jsx';
import { useLang } from '../contexts/LangContext.jsx';
import { useAuth } from '../contexts/AuthContext.jsx';
import { useScoring, useSettings } from '../contexts/SettingsContext.jsx';
import { usePoints } from '../contexts/PointsContext.jsx';
import { rankRows } from '@shared/standings.js';
import { Link } from 'react-router-dom';
import Avatar from '../components/Avatar.jsx';

const TABS = ['total', 'games', 'bonus', 'jokers']; // row 1; row 2 = Champion of the month, then Statistics
// [header key, field, css class] per tab. Total tab = Total (green) / Games (blue) / Bonus (orange), like the World Cup app.
const COLS = {
  total: [['lb.totalCol', 'total', 'pts-total'], ['lb.games', 'gamePts', 'pts-games'], ['lb.bonus', 'bonus', 'pts-bonus']],
  // Games tab (like the World Cup): game points / correct winner / exact / unique / no score
  games: [['lb.gamePtsCol', 'gamePts', 'pts-games'], ['lb.winnerDir', 'winnerCorrect', 'pts-hit'], ['lb.exactHits', 'exactHits', 'pts-exact'], ['lb.uniqueHits', 'uniqueHits', 'pts-unique'], ['lb.noScore', 'noScore', 'pts-miss']],
  bonus: [['lb.bonus', 'bonus', 'pts-bonus']],
  jokers: [['lb.jokers', 'jokersLeft', 'pts-joker']], // jokers LEFT = jokers per season - jokers already spent (games that started)
};
// Current streak (like the World Cup app): 🔥 = 3+ correct winners in a row, ❄️ = 3+ misses in a row, otherwise a dash.
function Streak({ r }) {
  const { t } = useLang();
  if ((r.curStreak ?? 0) >= 3) return <span className="streak hot" title={t('lb.hotTip', { n: r.curStreak })}>🔥 {r.curStreak}</span>;
  if ((r.curMiss ?? 0) >= 3) return <span className="streak cold" title={t('lb.coldTip', { n: r.curMiss })}>❄️ {r.curMiss}</span>;
  return <span className="muted">–</span>;
}
const pct = (a, b) => (b > 0 ? `${Math.round((100 * a) / b)}%` : '–');

// "January", "ינואר": the month name from a 'YYYY-MM' key
const monthLabel = (key, lang) => new Intl.DateTimeFormat(lang === 'he' ? 'he-IL' : 'en-GB', { month: 'long', timeZone: 'UTC' }).format(new Date(`${key}-15T12:00:00Z`));

/** Champion of the month: game points of ONE calendar month (no bonus), live like the rest of the table; it starts from zero every month. */
function MonthBoard({ monthKey }) {
  const { t, lang, dir } = useLang();
  const { user } = useAuth();
  const settings = useSettings();
  const { dayRows, loading } = usePoints();
  const { games } = useGames();
  const nowMs = useNow(60000);
  const tz = settings.timezone;
  const month = monthLabel(monthKey, lang);

  const rows = useMemo(() => monthlyRows(dayRows, monthKey), [dayRows, monthKey]);
  const ranked = useMemo(() => rankRows(rows, ['mPts', 'mExact', 'mUnique']), [rows]); // every player gets his own number 1..N
  const champs = useMemo(() => monthChampions(rows), [rows]); // a real tie on all three shares the title
  const over = useMemo(() => monthFinished({
    monthKey, todayKey: dayKey(new Date(nowMs), tz),
    games: games.filter((g) => countsForStandings(g, settings.countedRounds)).map((g) => ({ dayKey: dayKey(g.tipoff, tz), status: g.status })),
  }), [monthKey, nowMs, tz, games, settings.countedRounds]);

  if (loading) return <p className="muted">{t('common.loading')}</p>;
  if (ranked.length === 0) return <p className="muted">{t('lb.empty')}</p>;
  const champIds = new Set(champs.map((r) => r.uid));
  const names = champs.map((r) => r.name).join(' · ');

  return (
    <div className="table-wrap">
      {champs.length > 0 && <p className="month-banner">{t(over ? 'lb.monthChampion' : 'lb.monthLeading', { month, names })}</p>}
      <table className="table lb" dir={dir}>
        <thead>
          <tr className="muted small"><th>#</th><th className="lb-name">{t('lb.name')}</th><th>{t('lb.gamePtsCol')}</th><th>{t('lb.exactHits')}</th><th>{t('lb.uniqueHits')}</th></tr>
        </thead>
        <tbody>
          {ranked.map((r) => (
            <tr key={r.id} className={r.uid === user?.uid ? 'me' : ''}>
              <td>{r.rank}</td>
              <td className="lb-name"><Link className="lb-link" to={r.uid === user?.uid ? '/my-points' : `/player/${r.uid}`}><Avatar name={r.name} url={r.photoURL} size={24} /><span dir="auto">{r.name}{r.uid === user?.uid ? ` ${t('lb.you')}` : ''}{over && champIds.has(r.uid) ? ' 🏆' : ''}</span></Link></td>
              <td><strong className="pts-games">{r.mPts}</strong></td><td><strong className="pts-exact">{r.mExact}</strong></td><td><strong className="pts-unique">{r.mUnique}</strong></td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="muted small">{t('lb.monthNote')}</p>
    </div>
  );
}

function Board({ tab }) {
  const { t, dir } = useLang();
  const { user } = useAuth();
  const scoring = useScoring();
  const { rows: liveRows, baseRows, loading } = usePoints();
  const rows = tab === 'stats' ? baseRows : liveRows; // Total, Games, Bonus and Jokers move live; Statistics only changes when a game ends

  // 'games' tab ranks by game points only; the others use the configured tiebreakers (total first).
  const ranked = useMemo(
    () => rankRows(
      tab === 'jokers' ? rows.map((r) => ({ ...r, jokersLeft: Math.max(0, scoring.jokersPerSeason - (r.jokersUsed ?? 0)) })) : rows,
      tab === 'games' ? ['gamePts', 'exactHits', 'uniqueHits'] : tab === 'bonus' ? ['bonus', 'total'] : tab === 'jokers' ? ['jokersLeft', 'total'] : scoring.tiebreakers,
    ),
    [rows, tab, scoring.tiebreakers, scoring.jokersPerSeason],
  );

  if (loading) return <p className="muted">{t('common.loading')}</p>;
  if (ranked.length === 0) return <p className="muted">{t('lb.empty')}</p>;
  const stats = tab === 'stats';

  return (
    <div className="table-wrap">
      <table className="table lb" dir={dir}>
        <thead>
          <tr className="muted small">
            <th>#</th><th className="lb-name">{t('lb.name')}</th>
            {stats ? (
              <>
                <th>{t('lb.exact')}</th><th>{t('lb.winners')}</th><th>{t('lb.unique')}</th><th>{t('lb.risk')}</th>
                <th>{t('lb.played')}</th><th>{t('lb.accuracy')}</th><th>{t('lb.bestStreak')}</th><th>{t('lb.points')}</th>
              </>
            ) : COLS[tab].map(([h]) => <th key={h}>{t(h)}</th>)}
            {tab === 'total' && <th>{t('lb.streak')}</th>}
          </tr>
        </thead>
        <tbody>
          {ranked.map((r) => (
            <tr key={r.id} className={r.uid === user?.uid ? 'me' : ''}>
              <td>{r.rank}</td>
              <td className="lb-name"><Link className="lb-link" to={r.uid === user?.uid ? '/my-points' : `/player/${r.uid}`}><Avatar name={r.name} url={r.photoURL} size={24} /><span dir="auto">{r.name}{r.uid === user?.uid ? ` ${t('lb.you')}` : ''}</span></Link></td>
              {stats ? (
                <>
                  <td>{r.exactHits ?? 0}</td><td>{r.winnerCorrect ?? 0}</td><td>{r.uniqueHits ?? 0}</td><td>{r.riskHits ?? 0}</td>
                  <td>{r.gamesPlayed ?? 0}</td><td>{pct(r.winnerCorrect ?? 0, r.gamesPlayed ?? 0)}</td><td>{r.bestStreak ?? 0}</td>
                  <td><strong>{r.total ?? 0}</strong></td>
                </>
              ) : COLS[tab].map(([h, f, cls]) => <td key={h}><strong className={cls}>{r[f] ?? 0}</strong></td>)}
              {tab === 'total' && <td><Streak r={r} /></td>}
            </tr>
          ))}
        </tbody>
      </table>
      {tab === 'total' && <p className="muted small">{t('lb.streakLegend')}</p>}
      {tab === 'jokers' && <p className="muted small">{t('lb.jokersNote', { n: scoring.jokersPerSeason })}</p>}
    </div>
  );
}

/** What opens after a click on "Champion of the month": a chip for EVERY month of the season (the ones that have not arrived yet are grey and disabled) and the table of the chosen month. */
function MonthTab() {
  const { t, lang } = useLang();
  const { timezone } = useSettings();
  const nowMs = useNow(60000);
  const todayKey = dayKey(new Date(nowMs), timezone);
  const months = seasonMonths();
  const arrived = months.filter((m) => monthArrived(m, todayKey));
  const [sel, setSel] = useState(null);
  const active = sel && arrived.includes(sel) ? sel : arrived[arrived.length - 1] ?? null; // the current month unless another one was picked
  return (
    <div>
      <div className="tabs scroll sub-tabs" role="tablist">
        <span className="sub-label muted small">{t('lb.monthsLabel')}</span>
        {months.map((m) => {
          const open = arrived.includes(m);
          return (
            <button key={m} role="tab" disabled={!open} aria-selected={active === m} className={`tab ${active === m ? 'active' : ''} ${open ? '' : 'disabled'}`} onClick={() => setSel(m)}>{monthLabel(m, lang)}</button>
          );
        })}
      </div>
      {active
        ? <ErrorBoundary key={active} name={`leaderboard-month-${active}`}><MonthBoard monthKey={active} /></ErrorBoundary>
        : <p className="muted">{t('lb.monthSoon', { month: monthLabel(months[0], lang) })}</p>}
    </div>
  );
}

export default function LeaderboardPage() {
  const { t } = useLang();
  const [tab, setTab] = useState('total'); // 'total' | 'games' | 'bonus' | 'jokers' | 'stats' | 'month' (= "Champion of the month": its months appear only after the click)
  return (
    <PageShell titleKey="nav.leaderboard">
      <div className="tabs scroll" role="tablist">
        {TABS.map((k) => (
          <button key={k} role="tab" aria-selected={tab === k} className={`tab ${tab === k ? 'active' : ''}`} onClick={() => setTab(k)}>{t(`lb.tab.${k}`)}</button>
        ))}
      </div>
      <div className="tabs scroll sub-tabs" role="tablist">
        <button role="tab" aria-selected={tab === 'month'} className={`tab ${tab === 'month' ? 'active' : ''}`} onClick={() => setTab('month')}>{t('lb.tab.month')}</button>
        <button role="tab" aria-selected={tab === 'stats'} className={`tab ${tab === 'stats' ? 'active' : ''}`} onClick={() => setTab('stats')}>{t('lb.tab.stats')}</button>
      </div>
      <ErrorBoundary key={tab} name={`leaderboard-${tab}`}>{tab === 'month' ? <MonthTab /> : <Board tab={tab} />}</ErrorBoundary>
    </PageShell>
  );
}

import { useEffect, useMemo, useState } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase.js';
import { useAuth } from '../contexts/AuthContext.jsx';
import { usePoints } from '../contexts/PointsContext.jsx';
import { rankRows } from '@shared/standings.js';
import PageShell from '../components/PageShell.jsx';
import TeamBadge from '../components/TeamBadge.jsx';
import Score from '../components/Score.jsx';
import { useLang } from '../contexts/LangContext.jsx';
import { useSettings, useScoring } from '../contexts/SettingsContext.jsx';
import { useMyPredictions } from '../contexts/MyPredictionsContext.jsx';
import { useGames } from '../hooks/useGames.js';
import { dayKey, formatDateTime, formatDay } from '../utils/dates.js';
import { addDaysToKey } from '@shared/daykeys.js';
import { scoreBonus } from '@shared/bonus.js';
import { useBonus } from '../contexts/BonusContext.jsx';
import { useTeams } from '../contexts/TeamsContext.jsx';
import { usePlayers } from '../hooks/usePlayers.js';
import { answerLabel } from './predictions/BonusCard.jsx';

const PRESETS = ['7', '30', 'all', 'upcoming', 'custom'];
const PRESET_LABEL = { 7: 'mp.range7', 30: 'mp.range30', all: 'mp.rangeAll', upcoming: 'mp.rangeUpcoming', custom: 'mp.rangeCustom' };

// Skeleton (Phase 2): grouped by day (newest first). Default = last 7 days; other periods on demand.
// One line per game = teams | my pick | actual result. Points columns arrive with scoring (Phase 3).
export default function MyPointsPage() {
  const { t, lang } = useLang();
  const { timezone } = useSettings();
  const { jokerMultiplier, tiebreakers } = useScoring();
  const { user } = useAuth();
  const pointsAll = usePoints();
  const [detail, setDetail] = useState({}); // pointsDetail/{uid}.byGame: {gameId:{pts,...}}
  const { games } = useGames();
  const mine = useMyPredictions();

  const today = dayKey(new Date(), timezone);
  const [preset, setPreset] = useState('7');
  const [from, setFrom] = useState(() => addDaysToKey(dayKey(new Date(), timezone), -6));
  const [to, setTo] = useState(() => dayKey(new Date(), timezone));

  useEffect(() => {
    if (!user) return undefined;
    return onSnapshot(doc(db, 'pointsDetail', user.uid), (snap) => setDetail(snap.data()?.byGame || {}), () => setDetail({}));
  }, [user]);
  const myRank = useMemo(() => rankRows(pointsAll.rows, tiebreakers).find((r) => r.uid === user?.uid), [pointsAll.rows, tiebreakers, user]);

  const { questions } = useBonus();
  const { teams } = useTeams();
  const myBonus = useMemo(() => questions.filter((q) => mine.bonus[q.id]?.answer?.length), [questions, mine.bonus]);
  const { byId: playersById } = usePlayers(myBonus.some((q) => q.type === 'player'));

  const mineAll = useMemo(() => games.filter((g) => mine.games[g.id]), [games, mine.games]);

  const groups = useMemo(() => {
    const t0 = dayKey(new Date(), timezone);
    let lo = null;
    let hi = null;
    if (preset === '7') { lo = addDaysToKey(t0, -6); hi = t0; }
    else if (preset === '30') { lo = addDaysToKey(t0, -29); hi = t0; }
    else if (preset === 'upcoming') { lo = addDaysToKey(t0, 1); }
    else if (preset === 'custom') { lo = from || null; hi = to || null; }
    const m = new Map();
    mineAll.forEach((g) => {
      const k = dayKey(g.tipoff, timezone);
      if ((lo && k < lo) || (hi && k > hi)) return;
      if (!m.has(k)) m.set(k, []);
      m.get(k).push(g); // games arrive sorted by tip-off, so each day is in time order
    });
    return [...m.entries()].sort((a, b) => b[0].localeCompare(a[0])); // newest day first
  }, [mineAll, preset, from, to, timezone]);

  return (
    <PageShell titleKey="nav.myPoints">
      {mineAll.length === 0 && myBonus.length === 0 && <p className="muted">{t('mp.empty')}</p>}
      {mineAll.length > 0 && (
        <>
          <div className="tabs scroll" role="tablist">
            {PRESETS.map((p) => (
              <button key={p} role="tab" aria-selected={preset === p} className={`tab ${preset === p ? 'active' : ''}`} onClick={() => setPreset(p)}>
                {t(PRESET_LABEL[p])}
              </button>
            ))}
          </div>
          {preset === 'custom' && (
            <div className="grid-form">
              <label className="field">{t('mp.from')}<input className="input" dir="ltr" type="date" max={today} value={from} onChange={(e) => setFrom(e.target.value)} /></label>
              <label className="field">{t('mp.to')}<input className="input" dir="ltr" type="date" value={to} onChange={(e) => setTo(e.target.value)} /></label>
            </div>
          )}
          {myRank && (
            <div className="card mp-summary">
              <strong>{t('mp.total')}: {myRank.total ?? 0}</strong>
              <span className="muted">{t('mp.rank', { r: myRank.rank, n: pointsAll.rows.length })}</span>
            </div>
          )}
          <p className="muted small">{t('mp.jokerLegend', { n: jokerMultiplier })}</p>
          {groups.length === 0 && <p className="muted">{t('mp.noneInRange')}</p>}
          {groups.length > 0 && (
            <div className="mp-line mp-head muted small">
              <span className="mp-star" />
              <span className="mp-teams" />
              <span className="mp-col">{t('mp.myPick')}</span>
              <span className="mp-col">{t('mp.result')}</span>
              <span className="mp-pts">{t('mp.points')}</span>
            </div>
          )}
        </>
      )}

      {myBonus.length > 0 && (
        <div className="day">
          <h3>{t('mp.bonusTitle')}</h3>
          {myBonus.map((q) => {
            const answered = (q.answer || []).length > 0;
            const my = mine.bonus[q.id].answer;
            return (
              <div key={q.id} className="mp-row">
                <div className="mp-line">
                  <span className="grow" dir="auto">{q.question?.[lang] || q.question?.en}</span>
                  <strong className="mp-pts">{answered ? scoreBonus(q, my).pts : '–'}</strong>
                </div>
                <div className="muted small" dir="auto">{t('bq.yourAnswer')}: {answerLabel(q, my, { lang, teams, playersById })}{answered ? ` · ${t('bq.correctAnswer')}: ${answerLabel(q, q.answer, { lang, teams, playersById })}` : ''}</div>
              </div>
            );
          })}
        </div>
      )}

      {groups.map(([k, list]) => (
        <div key={k} className="day">
          <h3>{formatDay(list[0].tipoff, lang, timezone)}</h3>
          {list.map((g) => {
            const p = mine.games[g.id];
            const hasResult = g.status === 'finished' || g.status === 'live';
            return (
              <div key={g.id} className="mp-row">
                <div className="mp-line">
                  <span className="mp-star" title={mine.jokers[g.id] ? t('pred.joker', { n: jokerMultiplier }) : ''}>{mine.jokers[g.id] ? '⭐' : ''}</span>
                  <span className="mp-teams"><TeamBadge abbr={g.t1} /><span className="muted">–</span><TeamBadge abbr={g.t2} /></span>
                  <strong className="mp-col"><Score a={p.s1} b={p.s2} /></strong>
                  <span className="mp-col">{hasResult ? <Score a={g.s1 ?? 0} b={g.s2 ?? 0} /> : <span className="muted">–</span>}</span>
                  <strong className="mp-pts">{g.status === 'finished' ? (detail[g.id]?.pts ?? 0) : '–'}</strong>
                </div>
                <div className="muted small">
                  {formatDateTime(g.tipoff, lang, timezone)}
                  {g.status === 'live' && ` · ${t('status.live')}`}
                  {g.status === 'scheduled' && ` · ${t('mp.pending')}`}
                  {g.ot > 0 && ` · ${t('results.ot')}`}
                </div>
              </div>
            );
          })}
        </div>
      ))}
    </PageShell>
  );
}

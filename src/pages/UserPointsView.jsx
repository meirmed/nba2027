import { useEffect, useMemo, useState } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase.js';
import TeamBadge from '../components/TeamBadge.jsx';
import Score from '../components/Score.jsx';
import PeriodFilter from '../components/PeriodFilter.jsx';
import { useLang } from '../contexts/LangContext.jsx';
import { useSettings, useScoring } from '../contexts/SettingsContext.jsx';
import { usePredictionsOf } from '../hooks/usePredictionsOf.js';
import { usePoints } from '../contexts/PointsContext.jsx';
import { useGames } from '../hooks/useGames.js';
import { usePeriod } from '../hooks/usePeriod.js';
import { dayKey, formatDateTime, formatDay } from '../utils/dates.js';
import { inRange } from '@shared/period.js';
import { rankRows } from '@shared/standings.js';

// GAMES part: one line per game = teams | pick | actual result | points, grouped by day (newest first). Default = last 7 days.
// Used by My Points (uid = me) and by Admin -> Users -> Details (uid = any player).
export default function UserPointsView({ uid, self = false, showAdjustments = true, publicOnly = false }) {
  const { t, lang } = useLang();
  const { timezone } = useSettings();
  const { jokerMultiplier, tiebreakers } = useScoring();
  const pointsAll = usePoints();
  const { games } = useGames();
  const mine = usePredictionsOf(uid, { publicOnly, bonus: false });
  const period = usePeriod(timezone);
  const [detail, setDetail] = useState({}); // pointsDetail/{uid}.byGame

  useEffect(() => {
    if (!uid) return undefined;
    return onSnapshot(doc(db, 'pointsDetail', uid), (snap) => setDetail(snap.data()?.byGame || {}), () => setDetail({}));
  }, [uid]);
  const adjustTotal = pointsAll.rows.find((r) => r.uid === uid)?.adjust || 0; // only the TOTAL is public; reasons are admin-only
  const myRank = useMemo(() => rankRows(pointsAll.rows, tiebreakers).find((r) => r.uid === uid), [pointsAll.rows, tiebreakers, uid]);

  const mineAll = useMemo(() => games.filter((g) => mine.games[g.id]), [games, mine.games]);

  const groups = useMemo(() => {
    const m = new Map();
    mineAll.forEach((g) => {
      const k = dayKey(g.tipoff, timezone);
      if (!inRange(k, period.range)) return;
      if (!m.has(k)) m.set(k, []);
      m.get(k).push(g);
    });
    const asc = period.preset === 'upcoming';
    return [...m.entries()].sort((a, b) => (asc ? a[0].localeCompare(b[0]) : b[0].localeCompare(a[0])));
  }, [mineAll, period.range, period.preset, timezone]);

  return (
    <>
      {mineAll.length === 0 && !mine.loading && <p className="muted">{t(self ? 'mp.empty' : publicOnly ? 'pl.noGames' : 'au.noPicks')}</p>}
      {mineAll.length > 0 && (
        <>
          <PeriodFilter period={period} />
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

      {showAdjustments && adjustTotal !== 0 && (
        <div className="day">
          <div className="mp-row">
            <div className="mp-line"><span className="grow">{t('ad.mine')}</span><strong className="mp-pts" dir="ltr">{adjustTotal > 0 ? '+' : ''}{adjustTotal}</strong></div>
          </div>
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
                  <strong className="mp-col"><Score a={p.s1} b={p.s2} />{p.autoFilled ? <span title={t('bd.auto')}> 🎲</span> : null}</strong>
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
    </>
  );
}

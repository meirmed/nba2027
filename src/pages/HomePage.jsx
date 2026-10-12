import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import PageShell from '../components/PageShell.jsx';
import TeamBadge from '../components/TeamBadge.jsx';
import Score from '../components/Score.jsx';
import Avatar from '../components/Avatar.jsx';
import { useLang } from '../contexts/LangContext.jsx';
import { useAuth } from '../contexts/AuthContext.jsx';
import { useSettings, useScoring } from '../contexts/SettingsContext.jsx';
import { useMyPredictions } from '../contexts/MyPredictionsContext.jsx';
import { usePoints } from '../contexts/PointsContext.jsx';
import { useBonus } from '../contexts/BonusContext.jsx';
import { useGames } from '../hooks/useGames.js';
import { useNow } from '../hooks/useNow.js';
import { useProfile } from '../hooks/useProfile.js';
import { dayKey, formatCountdown, formatDay, formatTime } from '../utils/dates.js';
import { countsForStandings } from '@shared/games.js';
import { rankRows } from '@shared/standings.js';
import { bonusClosedReason } from '@shared/bonus.js';

const DAY = 86400000;

export default function HomePage() {
  const { t, lang } = useLang();
  const { user } = useAuth();
  const settings = useSettings();
  const { tiebreakers } = useScoring();
  const { games } = useGames();
  const mine = useMyPredictions();
  const { rows } = usePoints();
  const { questions } = useBonus();
  const nowMs = useNow(1000);
  const profile = useProfile();
  const tz = settings.timezone;

  const counted = useMemo(() => games.filter((g) => countsForStandings(g, settings.countedRounds)), [games, settings.countedRounds]);
  const tip = (g) => g.tipoff?.toMillis?.() ?? 0;
  const open = counted.filter((g) => g.status === 'scheduled' && g.t1 && g.t2 && tip(g) > nowMs);
  const next = open[0];
  const missing = open.filter((g) => tip(g) - nowMs < DAY && !mine.games[g.id]).length;

  const todayKey = dayKey(new Date(nowMs), tz);
  const firstShown = counted.find((g) => dayKey(g.tipoff, tz) >= todayKey);
  const shownKey = firstShown ? dayKey(firstShown.tipoff, tz) : null;
  const shown = shownKey ? counted.filter((g) => dayKey(g.tipoff, tz) === shownKey) : [];

  const ranked = useMemo(() => rankRows(rows, tiebreakers), [rows, tiebreakers]);
  const me = ranked.find((r) => r.uid === user?.uid);
  const bonusPending = questions.filter((q) => !bonusClosedReason(q, nowMs) && !mine.bonus[q.id]?.answer?.length).length;
  const announcement = (settings.announcement?.[lang] || '').trim();

  return (
    <PageShell titleKey="nav.home">
      {announcement && <div className="card announce" dir="auto">📣 {announcement}</div>}
      {profile && !profile.phone && (
        <div className="card announce">
          <span>📞 {t('home.needPhone')}</span>
          <div className="actions"><Link className="btn" to="/profile">{t('home.goProfile')}</Link></div>
        </div>
      )}

      <div className="card">
        {next ? (
          <>
            <div className="muted small">{t('home.nextLock', { time: formatCountdown(tip(next) - nowMs) })}</div>
            <div className="vs-names"><TeamBadge abbr={next.t1} /> <span className="muted">–</span> <TeamBadge abbr={next.t2} /> <span className="muted small" dir="ltr">{formatTime(next.tipoff, lang, tz)}</span></div>
          </>
        ) : <span className="muted">{t('home.noNext')}</span>}
        {missing > 0 && <p className="error small">{t('home.missing', { n: missing })}</p>}
        {bonusPending > 0 && <p className="muted small">{t('home.bonusPending', { n: bonusPending })}</p>}
        <div className="actions"><Link className="btn" to="/predictions">{t('home.goPredict')}</Link></div>
      </div>

      {me && (
        <div className="card mp-summary">
          <span><strong>{t('home.myRank')}</strong> <span className="muted">{t('home.rankOf', { r: me.rank, n: ranked.length })}</span></span>
          <strong className="pts-total">{t('home.points', { n: me.total ?? 0 })}</strong>
        </div>
      )}

      <h3 className="bq-title">{shownKey === todayKey ? t('home.today') : t('home.nextGames')}{shown[0] ? <span className="muted small"> · {formatDay(shown[0].tipoff, lang, tz)}</span> : null}</h3>
      {shown.length === 0 && <p className="muted">{t('home.noGames')}</p>}
      {shown.map((g) => {
        const p = mine.games[g.id];
        const result = g.status === 'finished' || g.status === 'live';
        return (
          <div key={g.id} className="game-row">
            <span className="muted time" dir="ltr">{formatTime(g.tipoff, lang, tz)}</span>
            <span className="teams"><TeamBadge abbr={g.t1} /> <span className="muted">–</span> <TeamBadge abbr={g.t2} /></span>
            <span className="res-score">{p ? <Score a={p.s1} b={p.s2} /> : <small className={g.status === 'scheduled' ? 'error' : 'muted'}>{t('home.noPick')}</small>}</span>
            {result && <span className="res-score"><Score a={g.s1 ?? 0} b={g.s2 ?? 0} /></span>}
            <span className={`badge ${g.status}`}>{t(`status.${g.status}`)}</span>
          </div>
        );
      })}

      {ranked.length > 0 && (
        <>
          <h3 className="bq-title">{t('home.top')}</h3>
          {ranked.slice(0, 5).map((r) => (
            <div key={r.uid} className={`row ${r.uid === user?.uid ? 'me' : ''}`}>
              <strong>{r.rank}</strong>
              <Avatar name={r.name} url={r.photoURL} />
              <span className="grow" dir="auto">{r.name}</span>
              <strong className="pts-total">{r.total ?? 0}</strong>
            </div>
          ))}
        </>
      )}
    </PageShell>
  );
}

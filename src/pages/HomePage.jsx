import { useMemo } from 'react';
import { Link } from 'react-router-dom';
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
import { useStarOfNight } from '../hooks/useStarOfNight.js';
import { dayKey, formatCountdown, formatDay, formatTime } from '../utils/dates.js';
import { countsForStandings } from '@shared/games.js';
import { rankRows } from '@shared/standings.js';
import { bonusClosedReason } from '@shared/bonus.js';

const DAY = 86400000;
const WINDOW_DAYS = 3; // "missing predictions" looks this many days ahead
const MEDALS = ['🥇', '🥈', '🥉'];

export default function HomePage() {
  const { t, lang } = useLang();
  const { user, isAdmin } = useAuth();
  const settings = useSettings();
  const { tiebreakers } = useScoring();
  const { games } = useGames();
  const mine = useMyPredictions();
  const { rows } = usePoints();
  const { questions } = useBonus();
  const profile = useProfile();
  const star = useStarOfNight();
  const nowMs = useNow(1000);
  const tz = settings.timezone;
  const locale = lang === 'he' ? 'he-IL' : 'en-US';
  const plural = (n, one, many) => (n === 1 ? t(one) : t(many, { n }));

  const counted = useMemo(() => games.filter((g) => countsForStandings(g, settings.countedRounds)), [games, settings.countedRounds]);
  const tip = (g) => g.tipoff?.toMillis?.() ?? 0;
  const open = counted.filter((g) => g.status === 'scheduled' && g.t1 && g.t2 && tip(g) > nowMs);
  const next = open[0];
  const liveCount = counted.filter((g) => g.status === 'live').length;

  const todayKey = dayKey(new Date(nowMs), tz);
  const firstShown = counted.find((g) => dayKey(g.tipoff, tz) >= todayKey);
  const shownKey = firstShown ? dayKey(firstShown.tipoff, tz) : null;
  const shown = shownKey ? counted.filter((g) => dayKey(g.tipoff, tz) === shownKey) : [];

  // what is still missing in the next 3 days (admins don't play)
  const unpaid = !isAdmin && profile?.paid === false; // registered, waiting for the admin to tick "paid"
  const missingGames = isAdmin || unpaid ? [] : open.filter((g) => tip(g) - nowMs < WINDOW_DAYS * DAY && !mine.games[g.id]);
  const bonusPending = isAdmin || unpaid ? 0 : questions.filter((q) => !bonusClosedReason(q, nowMs) && !mine.bonus[q.id]?.answer?.length).length;

  const ranked = useMemo(() => rankRows(rows, tiebreakers), [rows, tiebreakers]);
  const me = ranked.find((r) => r.uid === user?.uid);
  const leader = ranked[0]?.total || 0;
  const announcement = (settings.announcement?.[lang] || '').trim();

  const hour = Number(new Intl.DateTimeFormat('en-GB', { hour: '2-digit', hourCycle: 'h23', timeZone: tz }).format(nowMs));
  const hiKey = hour >= 5 && hour < 12 ? 'morning' : hour >= 12 && hour < 18 ? 'afternoon' : hour >= 18 && hour < 22 ? 'evening' : 'night';
  const firstName = String(profile?.name || me?.name || '').split(' ')[0];
  const streak = me?.curStreak >= 3 ? `🔥 ${me.curStreak}` : me?.curMiss >= 3 ? `❄️ ${me.curMiss}` : '–';
  const nightLabel = star?.night ? new Intl.DateTimeFormat(locale, { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' }).format(new Date(`${star.night}T12:00:00Z`)) : '';
  const rowLink = (r) => (r.uid === user?.uid ? '/my-points' : `/player/${r.uid}`);

  return (
    <section className="home">
      <div className="hero">
        <div className="hero-top">
          <Avatar name={profile?.name || firstName} url={profile?.photoURL} size={48} />
          <div className="grow">
            <div className="hero-greet" dir="auto">{t(`home.hi.${hiKey}`, { name: firstName })}</div>
            <div className="muted small">{new Intl.DateTimeFormat(locale, { weekday: 'long', day: 'numeric', month: 'long', timeZone: tz }).format(nowMs)}</div>
          </div>
          {liveCount > 0 && <Link className="live-chip" to="/results">{plural(liveCount, 'home.liveOne', 'home.liveMany')}</Link>}
        </div>
        {me && (
          <div className="tiles">
            <div className="tile"><span className="muted small">{t('home.tile.rank')}</span><strong dir="ltr">#{me.rank}<small className="muted"> / {ranked.length}</small></strong></div>
            <div className="tile"><span className="muted small">{t('home.tile.points')}</span><strong dir="ltr">{me.total ?? 0}</strong></div>
            <div className="tile"><span className="muted small">{t('home.tile.streak')}</span><strong dir="ltr">{streak}</strong></div>
          </div>
        )}
      </div>

      {announcement && <div className="card announce" dir="auto">📣 {announcement}</div>}
      {!isAdmin && profile && !profile.phone && (
        <div className="card announce"><span>📞 {t('home.needPhone')}</span> <Link className="chip-link" to="/profile">{t('home.goProfile')} ▸</Link></div>
      )}

      {unpaid && <div className="card announce">⏳ {t('pay.waiting')}</div>}
      {!isAdmin && !unpaid && (
        <div className={`card todo ${missingGames.length + bonusPending > 0 ? 'warn' : 'ok'}`}>
          {missingGames.length + bonusPending === 0 ? (
            <div className="todo-title">✅ {t('home.allSet')}</div>
          ) : (
            <>
              <div className="todo-title">⚠️ {t('home.todoTitle')}</div>
              {missingGames.length > 0 && (
                <div className="todo-row">
                  <strong>🏀 {plural(missingGames.length, 'home.gamesOne', 'home.gamesMany')}</strong>
                  <Link className="chip-link" to="/predictions?tab=week">{t('home.fill')} ▸</Link>
                </div>
              )}
              {bonusPending > 0 && (
                <div className="todo-row">
                  <strong>🎁 {plural(bonusPending, 'home.bonusOne', 'home.bonusMany')}</strong>
                  <Link className="chip-link" to="/predictions?tab=bonus">{t('home.fill')} ▸</Link>
                </div>
              )}
            </>
          )}
        </div>
      )}

      <div className="card next-card">
        {next ? (
          <>
            <div className="next-line"><span className="muted small">{t('home.nextLockLabel')}</span><span className="countdown" dir="ltr">{formatCountdown(tip(next) - nowMs)}</span></div>
            <div className="vs-names"><TeamBadge abbr={next.t1} /> <span className="muted">–</span> <TeamBadge abbr={next.t2} /> <span className="muted small" dir="ltr">{formatTime(next.tipoff, lang, tz)}</span></div>
          </>
        ) : <span className="muted">{t('home.noNext')}</span>}
      </div>

      {star && star.top?.length > 0 && (
        <div className="card star-card">
          <div className="star-head"><strong>⭐ {t('home.star')}</strong><span className="muted small">{nightLabel} · {t('home.starGames', { n: star.games })}</span></div>
          <div className="star-main">
            <Avatar name={star.top[0].name} url={star.top[0].photoURL} size={56} />
            <div className="grow">
              <div className="star-name" dir="auto">{star.top[0].name}</div>
              <div className="star-pts" dir="ltr">+{star.top[0].pts} {t('home.pts')}{star.top[0].exact > 0 ? ` · 🎯 ${t('home.exact', { n: star.top[0].exact })}` : ''}</div>
            </div>
          </div>
          {star.top[0].uid === user?.uid && <div className="star-you">🎉 {t('home.youStar')}</div>}
          {star.top.slice(1).map((r, i) => (
            <div key={r.uid} className="star-runner"><span>{MEDALS[i + 1]}</span><span className="grow" dir="auto">{r.name}</span><strong dir="ltr">+{r.pts}</strong></div>
          ))}
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
            {!isAdmin && <span className="res-score">{p ? <Score a={p.s1} b={p.s2} /> : <small className={g.status === 'scheduled' ? 'error' : 'muted'}>{t('home.noPick')}</small>}</span>}
            {result && <span className="res-score"><Score a={g.s1 ?? 0} b={g.s2 ?? 0} /></span>}
            <span className={`badge ${g.status}`}>{t(`status.${g.status}`)}</span>
          </div>
        );
      })}

      {ranked.length > 0 && (
        <>
          <div className="section-head"><h3 className="bq-title">{t('home.top')}</h3><Link className="chip-link" to="/leaderboard">{t('home.seeAll')} ▸</Link></div>
          <div className="lb-mini">
            {ranked.slice(0, 5).map((r) => (
              <Link key={r.uid} to={rowLink(r)} className={`lb-mini-row ${r.uid === user?.uid ? 'me' : ''}`}>
                <span className="lb-medal">{MEDALS[r.rank - 1] || r.rank}</span>
                <Avatar name={r.name} url={r.photoURL} size={28} />
                <span className="lb-mini-main"><span dir="auto">{r.name}</span><span className="lb-bar"><span style={{ width: `${leader > 0 ? Math.max(4, Math.round((100 * (r.total ?? 0)) / leader)) : 0}%` }} /></span></span>
                <strong dir="ltr">{r.total ?? 0}</strong>
              </Link>
            ))}
            {me && me.rank > 5 && (
              <>
                <div className="lb-gap">⋯</div>
                <Link to="/my-points" className="lb-mini-row me">
                  <span className="lb-medal">{me.rank}</span>
                  <Avatar name={me.name} url={me.photoURL} size={28} />
                  <span className="lb-mini-main"><span dir="auto">{me.name}</span><span className="lb-bar"><span style={{ width: `${leader > 0 ? Math.max(4, Math.round((100 * (me.total ?? 0)) / leader)) : 0}%` }} /></span></span>
                  <strong dir="ltr">{me.total ?? 0}</strong>
                </Link>
              </>
            )}
          </div>
        </>
      )}
    </section>
  );
}

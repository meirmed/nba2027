import { useEffect, useMemo, useState } from 'react';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../firebase.js';
import { useLang } from '../contexts/LangContext.jsx';
import { useAuth } from '../contexts/AuthContext.jsx';
import { useMyPredictions } from '../contexts/MyPredictionsContext.jsx';
import { useSettings, useScoring } from '../contexts/SettingsContext.jsx';
import { scoreGamePicks } from '@shared/standings.js';
import { countsForStandings } from '@shared/games.js';
import Score from './Score.jsx';
import PickStats from './PickStats.jsx';
import { pickStats } from '@shared/pickStats.js';
import { myPickState } from '@shared/myPick.js';

const picksCache = new Map(); // the published picks of a game never change after tip-off: one read per game per session, shared by the card's label and its list

/** Reads picks/{gameId} (written by lockGamePicks at tip-off). Doesn't exist before lock, so nothing leaks early. */
export default function EveryonesPicks({ gameId, result, showMine = false }) {
  const { t, dir } = useLang();
  const { user, isAdmin } = useAuth();
  const mine = useMyPredictions();
  const my = mine.games?.[gameId]; // my own pick of this game (shown on the Results page, next to the two buttons)
  const hasMy = my && Number.isInteger(my.s1) && Number.isInteger(my.s2);
  const settings = useSettings();
  const scoring = useScoring();
  const [open, setOpen] = useState(false); // the list of everyone's picks
  const [statsOpen, setStatsOpen] = useState(false); // the statistics (collapsed until the button is pressed)
  const [data, setData] = useState(undefined); // undefined=not loaded, null=not published yet

  const load = async () => {
    if (data) return;
    if (picksCache.has(gameId)) { setData(picksCache.get(gameId)); return; }
    try {
      const s = await getDoc(doc(db, 'picks', gameId));
      const d = s.exists() ? s.data() : null;
      if (d) picksCache.set(gameId, d);
      setData(d);
    } catch { setData(null); }
  };
  // the "my pick" label shows my points and the kind of score, so the published picks are loaded for the card right away (not only on a click)
  useEffect(() => { if (showMine && !isAdmin) load(); }, [showMine, isAdmin, gameId]); // eslint-disable-line react-hooks/exhaustive-deps
  // the list and the statistics are two separate views: opening one closes the other (the list never shows the statistics block)
  const toggle = () => { const next = !open; setOpen(next); if (next) { setStatsOpen(false); load(); } };
  const toggleStats = () => { const next = !statsOpen; setStatsOpen(next); if (next) { setOpen(false); load(); } };

  const rows = useMemo(
    () => (data ? Object.entries(data.picks || {}).map(([uid, p]) => ({ uid, ...p })).sort((a, b) => (a.name || '').localeCompare(b.name || '', 'he')) : []),
    [data],
  );

  // Same shared module as the server: labels and points can never disagree with the saved points. While the game is LIVE the points are
  // PROVISIONAL (computed with the current score, they change until the final buzzer). A tie right now has no winner: nothing is scored yet.
  const stats = useMemo(() => pickStats(rows), [rows]);
  const live = result?.status === 'live';
  const scored = useMemo(() => {
    const started = (result?.status === 'finished' || live) && countsForStandings(result, settings.countedRounds) && Number.isInteger(result.s1) && Number.isInteger(result.s2);
    if (!started || rows.length === 0 || (live && result.s1 === result.s2)) return {};
    return scoreGamePicks({ game: { ...result, status: 'finished' }, picks: rows.map((r) => ({ uid: r.uid, p: r, joker: r.joker })), scoring });
  }, [rows, result, live, settings.countedRounds, scoring]);
  const tiedNow = live && result.s1 === result.s2;
  const noScoreYet = live && Object.keys(scored).length === 0; // tied right now, or no live score yet: show a dash and the reason, not empty cells

  // What kind of score the pick is getting, in one or two words (the most valuable thing first): [css class, text]
  const kind = (r) => {
    const sc = scored[r.uid];
    if (!sc) return null;
    const err = Math.abs((r.s1 - r.s2) - (result.s1 - result.s2));
    if (sc.exact && sc.uniquePts > 0) return ['unique', t('ev.exactUnique')];
    if (sc.exact) return ['exact', t('ev.exact')];
    if (sc.uniquePts > 0) return ['unique', t('ev.marginUnique')];
    if (sc.winnerCorrect && err === 0) return ['margin0', t('ev.margin0')];
    if (sc.winnerCorrect && sc.diffPts > 0) return ['diff', t('ev.marginOff', { n: err })];
    if (sc.winnerCorrect) return ['winner', t('ev.winner')];
    return ['miss', t('ev.miss')];
  };
  // "my pick": my points and the kind of score (the same as in the list), green with points, orange without, grey while it cannot be scored
  const myScored = user ? scored[user.uid] : undefined;
  const myKind = hasMy && myScored ? kind({ uid: user.uid, s1: my.s1, s2: my.s2 }) : null;
  const myState = myPickState({ hasPick: !!hasMy, scoredPts: myScored?.pts, canScore: Object.keys(scored).length > 0 });
  // while the game is on / after it: the best score first (then by name)
  const shown = useMemo(() => (Object.keys(scored).length ? [...rows].sort((a, b) => ((scored[b.uid]?.pts ?? 0) - (scored[a.uid]?.pts ?? 0)) || (a.name || '').localeCompare(b.name || '', 'he')) : rows), [rows, scored]);

  return (
    <div className="everyone">
      <div className="everyone-actions">
        <button className="btn ghost" onClick={toggle}>{open ? t('pred.hide') : t('pred.everyone')}</button>
        <button className="btn ghost" onClick={toggleStats}>📊 {statsOpen ? t('ps.hide') : t('ps.button')}</button>
        {showMine && !isAdmin && !mine.loading && (
          <span className={`my-pick ${myState.state}${hasMy ? '' : ' none'}`}>
            <span className="my-pick-label">{hasMy ? t('pred.myPick') : t('pred.noMyPick')}</span>
            {hasMy && <span><Score a={my.s1} b={my.s2} />{mine.jokers?.[gameId] ? ' ⭐' : ''}{my.autoFilled ? <span title={t('bd.auto')}> 🎲</span> : ''}</span>}
            {myKind ? <span className="my-pick-kind">{myKind[1]}{myScored?.riskPts > 0 ? ' 💪' : ''}</span> : (hasMy && tiedNow ? <span className="my-pick-kind">{t('ev.tiedKind')}</span> : null)}
            {myState.pts !== null && <strong className="my-pick-pts">{myState.pts} {t(live ? 'ev.colPtsLive' : 'ev.colPts')}</strong>}
          </span>
        )}
      </div>
      {(open || statsOpen) && data === undefined && <p className="muted">{t('common.loading')}</p>}
      {(open || statsOpen) && data === null && <p className="muted">{t('pred.picksSoon')}</p>}
      {statsOpen && data && (stats ? <PickStats stats={stats} game={result} /> : <p className="muted">{t('ps.none')}</p>)}
      {open && data && rows.length === 0 && <p className="muted">{t('pred.noPicks')}</p>}
      {open && live && <p className="muted small">{tiedNow ? t('ev.tiedNote') : noScoreYet ? t('ev.waitingNote') : t('ev.liveNote')}</p>}
      {open && rows.length > 0 && (
        <div className="table-wrap">
          <table className="table" dir={dir}>
            <thead>
              <tr className="muted small"><th>{t('ev.colPlayer')}</th><th>{t('ev.colPick')}</th><th>{live ? t('ev.colPtsLive') : t('ev.colPts')}</th><th>{t('ev.colType')}</th></tr>
            </thead>
            <tbody>
              {shown.map((r) => {
                const k = kind(r);
                const sc = scored[r.uid];
                return (
                  <tr key={r.uid} className={r.uid === user?.uid ? 'me' : ''}>
                    <td dir="auto">{r.name}{r.uid === user?.uid ? ` ${t('pred.you')}` : ''}</td>
                    <td><Score a={r.s1} b={r.s2} />{r.joker ? ' ⭐' : ''}{r.autoFilled ? <span title={t('bd.auto')}> 🎲</span> : ''}</td>
                    <td dir="ltr">{sc ? <strong className={live ? 'pts-live' : ''}>{sc.pts}</strong> : noScoreYet ? <span className="muted">–</span> : ''}</td>
                    <td>{noScoreYet ? <span className="chip chip-winner">{tiedNow ? t('ev.tiedKind') : t('ev.waitingKind')}</span> : k ? <span className={`chip chip-${k[0]}`}>{k[1]}{sc?.riskPts > 0 ? <span title={t('bd.risk')}> 💪</span> : null}</span> : null}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

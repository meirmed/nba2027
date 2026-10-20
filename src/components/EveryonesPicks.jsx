import { useMemo, useState } from 'react';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../firebase.js';
import { useLang } from '../contexts/LangContext.jsx';
import { useAuth } from '../contexts/AuthContext.jsx';
import { useSettings, useScoring } from '../contexts/SettingsContext.jsx';
import { scoreGamePicks } from '@shared/standings.js';
import { countsForStandings } from '@shared/games.js';
import Score from './Score.jsx';

/** Reads picks/{gameId} (written by lockGamePicks at tip-off). Doesn't exist before lock, so nothing leaks early. */
export default function EveryonesPicks({ gameId, result }) {
  const { t, dir } = useLang();
  const { user } = useAuth();
  const settings = useSettings();
  const scoring = useScoring();
  const [open, setOpen] = useState(false);
  const [data, setData] = useState(undefined); // undefined=not loaded, null=not published yet

  const toggle = async () => {
    const next = !open;
    setOpen(next);
    if (next && !data) {
      try { const s = await getDoc(doc(db, 'picks', gameId)); setData(s.exists() ? s.data() : null); } catch { setData(null); }
    }
  };

  const rows = useMemo(
    () => (data ? Object.entries(data.picks || {}).map(([uid, p]) => ({ uid, ...p })).sort((a, b) => (a.name || '').localeCompare(b.name || '', 'he')) : []),
    [data],
  );

  // Same shared module as the server: labels and points can never disagree with the saved points. While the game is LIVE the points are
  // PROVISIONAL (computed with the current score, they change until the final buzzer). A tie right now has no winner: nothing is scored yet.
  const live = result?.status === 'live';
  const scored = useMemo(() => {
    const started = (result?.status === 'finished' || live) && countsForStandings(result, settings.countedRounds) && Number.isInteger(result.s1) && Number.isInteger(result.s2);
    if (!started || rows.length === 0 || (live && result.s1 === result.s2)) return {};
    return scoreGamePicks({ game: { ...result, status: 'finished' }, picks: rows.map((r) => ({ uid: r.uid, p: r, joker: r.joker })), scoring });
  }, [rows, result, live, settings.countedRounds, scoring]);
  const tiedNow = live && result.s1 === result.s2;

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
  // while the game is on / after it: the best score first (then by name)
  const shown = useMemo(() => (Object.keys(scored).length ? [...rows].sort((a, b) => ((scored[b.uid]?.pts ?? 0) - (scored[a.uid]?.pts ?? 0)) || (a.name || '').localeCompare(b.name || '', 'he')) : rows), [rows, scored]);

  return (
    <div className="everyone">
      <button className="btn ghost" onClick={toggle}>{open ? t('pred.hide') : t('pred.everyone')}</button>
      {open && data === undefined && <p className="muted">{t('common.loading')}</p>}
      {open && data === null && <p className="muted">{t('pred.picksSoon')}</p>}
      {open && data && rows.length === 0 && <p className="muted">{t('pred.noPicks')}</p>}
      {open && live && <p className="muted small">{tiedNow ? t('ev.tiedNote') : t('ev.liveNote')}</p>}
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
                    <td dir="ltr">{sc ? <strong className={live ? 'pts-live' : ''}>{sc.pts}</strong> : ''}</td>
                    <td>{k ? <span className={`chip chip-${k[0]}`}>{k[1]}{sc?.riskPts > 0 ? <span title={t('bd.risk')}> 💪</span> : null}</span> : null}</td>
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

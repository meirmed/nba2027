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

  // Same shared module as the server: badges can never disagree with the saved points.
  const scored = useMemo(() => {
    const done = result?.status === 'finished' && countsForStandings(result, settings.countedRounds) && Number.isInteger(result.s1) && Number.isInteger(result.s2);
    if (!done || rows.length === 0) return {};
    return scoreGamePicks({ game: result, picks: rows.map((r) => ({ uid: r.uid, p: r, joker: r.joker })), scoring });
  }, [rows, result, settings.countedRounds, scoring]);

  // ONE reason per player, most significant first: unique > exact > risk > diff > winner. (auto-filled is a marker, not a reason)
  const reason = (r) => {
    const sc = scored[r.uid];
    if (!sc) return null;
    if (sc.uniquePts > 0) return ['unique', t('bd.unique')];
    if (sc.exact) return ['exact', t('bd.exact')];
    if (sc.riskPts > 0) return ['risk', t('bd.risk')];
    if (sc.diffPts > 0) return ['diff', t('bd.diff', { n: sc.diffPts })];
    if (sc.winnerCorrect) return ['winner', t('bd.winner')];
    return null;
  };

  return (
    <div className="everyone">
      <button className="btn ghost" onClick={toggle}>{open ? t('pred.hide') : t('pred.everyone')}</button>
      {open && data === undefined && <p className="muted">{t('common.loading')}</p>}
      {open && data === null && <p className="muted">{t('pred.picksSoon')}</p>}
      {open && data && rows.length === 0 && <p className="muted">{t('pred.noPicks')}</p>}
      {open && rows.length > 0 && (
        <div className="table-wrap">
          <table className="table" dir="ltr">
            <tbody>
              {rows.map((r) => (
                <tr key={r.uid} className={r.uid === user?.uid ? 'me' : ''}>
                  <td dir="auto">{r.name}{r.uid === user?.uid ? ` ${t('pred.you')}` : ''}</td>
                  <td><Score a={r.s1} b={r.s2} />{r.joker ? ' ⭐' : ''}{r.autoFilled ? <span title={t('bd.auto')}> 🎲</span> : ''}</td>
                  <td dir={dir}>{(() => { const x = reason(r); return x ? <span className={`chip chip-${x[0]}`}>{x[1]}</span> : null; })()}</td>
                  <td>{scored[r.uid] ? <strong>{scored[r.uid].pts}</strong> : ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

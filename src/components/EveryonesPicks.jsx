import { useState } from 'react';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../firebase.js';
import { useLang } from '../contexts/LangContext.jsx';
import { useAuth } from '../contexts/AuthContext.jsx';
import Score from './Score.jsx';

/** Reads picks/{gameId} (written by lockGamePicks at tip-off). Doesn't exist before lock, so nothing leaks early. */
export default function EveryonesPicks({ gameId, result }) {
  const { t } = useLang();
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [data, setData] = useState(undefined); // undefined=not loaded, null=not published yet

  const toggle = async () => {
    const next = !open;
    setOpen(next);
    if (next && !data) {
      try { const s = await getDoc(doc(db, 'picks', gameId)); setData(s.exists() ? s.data() : null); } catch { setData(null); }
    }
  };

  const rows = data ? Object.entries(data.picks || {}).map(([uid, p]) => ({ uid, ...p })).sort((a, b) => (a.name || '').localeCompare(b.name || '', 'he')) : [];
  const finished = result?.status === 'finished';

  return (
    <div className="everyone">
      <button className="btn ghost" onClick={toggle}>{open ? t('pred.hide') : t('pred.everyone')}</button>
      {open && data === undefined && <p className="muted">{t('common.loading')}</p>}
      {open && data === null && <p className="muted">{t('pred.picksSoon')}</p>}
      {open && data && rows.length === 0 && <p className="muted">{t('pred.noPicks')}</p>}
      {open && rows.length > 0 && (
        <table className="table" dir="ltr">
          <tbody>
            {rows.map((r) => (
              <tr key={r.uid} className={r.uid === user?.uid ? 'me' : ''}>
                <td dir="auto">{r.name}{r.uid === user?.uid ? ` ${t('pred.you')}` : ''}</td>
                <td><Score a={r.s1} b={r.s2} />{r.joker ? ' ⭐' : ''}{finished && r.s1 === result.s1 && r.s2 === result.s2 ? ' ✅' : ''}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

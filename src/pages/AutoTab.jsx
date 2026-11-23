import { useEffect, useMemo, useState } from 'react';
import { collection, getDocs } from 'firebase/firestore';
import { Link } from 'react-router-dom';
import { db } from '../firebase.js';
import { useLang } from '../contexts/LangContext.jsx';
import { useAuth } from '../contexts/AuthContext.jsx';
import { usePoints } from '../contexts/PointsContext.jsx';
import Avatar from '../components/Avatar.jsx';
import { autoRows } from '@shared/autoStats.js';

const pct = (x) => `${Math.round(100 * x)}%`;

/** "🎲": for every player, in how many games he got a RANDOM (auto-filled) result, the points those results earned him and the % of them with the right winner. */
export default function AutoTab() {
  const { t, dir } = useLang();
  const { user } = useAuth();
  const { baseRows } = usePoints();
  const [detail, setDetail] = useState(null); // pointsDetail of everybody (official, finished games); null = loading
  useEffect(() => { // one read per player when the tab opens (these numbers change only when a game ends)
    let alive = true;
    getDocs(collection(db, 'pointsDetail')).then((s) => { if (alive) setDetail(Object.fromEntries(s.docs.map((d) => [d.id, d.data()]))); }).catch(() => { if (alive) setDetail({}); });
    return () => { alive = false; };
  }, []);
  const rows = useMemo(() => (detail ? autoRows(baseRows, detail) : []), [baseRows, detail]);

  if (detail === null) return <p className="muted">{t('common.loading')}</p>;
  return (
    <div className="table-wrap">
      <table className="table lb lb-stats" dir={dir}>
        <thead>
          <tr className="muted small">
            <th>#</th><th className="lb-name">{t('lb.name')}</th>
            <th title={t('lb.auto.title')}>{t('lb.auto.games')}</th><th>{t('lb.auto.pts')}</th><th title={t('lb.auto.winTip')}>{t('lb.auto.win')}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={r.uid} className={r.uid === user?.uid ? 'me' : ''}>
              <td>{i + 1}</td>
              <td className="lb-name"><Link className="lb-link" to={r.uid === user?.uid ? '/my-points' : `/player/${r.uid}`}><Avatar name={r.name} url={r.photoURL} size={24} /><span dir="auto">{r.name}{r.uid === user?.uid ? ` ${t('lb.you')}` : ''}</span></Link></td>
              <td><strong>{r.games}</strong></td><td>{r.pts}</td><td>{r.games > 0 ? pct(r.pct) : '–'}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="muted small">{t('lb.auto.note')}</p>
    </div>
  );
}

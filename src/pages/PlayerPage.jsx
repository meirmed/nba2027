import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import ErrorBoundary from '../components/ErrorBoundary.jsx';
import Avatar from '../components/Avatar.jsx';
import { useLang } from '../contexts/LangContext.jsx';
import { useAuth } from '../contexts/AuthContext.jsx';
import { usePoints } from '../contexts/PointsContext.jsx';
import { usePlayerStats } from '../hooks/useH2H.js';
import UserPointsView from './UserPointsView.jsx';
import UserBonusView from './UserBonusView.jsx';

/** Another player's page (opened from the leaderboard): the "My predictions" view for THEM, public data only (finished + live games, closed bonus questions). */
export default function PlayerPage() {
  const { uid } = useParams();
  const navigate = useNavigate();
  const { t } = useLang();
  const { user } = useAuth();
  const { loading } = usePoints();
  const { byUid } = usePlayerStats();
  const [tab, setTab] = useState('games');
  const p = byUid[uid];

  useEffect(() => { if (uid && uid === user?.uid) navigate('/my-points', { replace: true }); }, [uid, user, navigate]);

  if (!p) return <section><button className="btn ghost" onClick={() => navigate(-1)}>{t('pl.back')}</button><p className="muted">{loading ? t('common.loading') : t('pl.notFound')}</p></section>;
  const stats = [['lb.totalCol', p.total], ['lb.games', p.gamePts], ['lb.bonus', p.bonus], ['lb.exact', p.exactHits], ['lb.unique', p.uniqueHits],
    ['lb.winners', p.winnerCorrect], ['lb.played', p.gamesPlayed], ['lb.bestStreak', p.bestStreak]];

  return (
    <section>
      <button className="btn ghost" onClick={() => navigate(-1)}>{t('pl.back')}</button>
      <div className="card">
        <div className="inline"><Avatar name={p.name} url={p.photoURL} size={56} /><strong dir="auto">{p.name}</strong></div>
        <div className="stat-grid">{stats.map(([k, v]) => <div key={k}><span className="muted small">{t(k)}</span><div><strong>{v ?? 0}</strong></div></div>)}</div>
        <p className="muted small">{t('pl.note')}</p>
      </div>
      <div className="utabs" role="tablist">
        {['games', 'bonus'].map((k) => (
          <button key={k} role="tab" aria-selected={tab === k} className={`utab ${tab === k ? 'active' : ''}`} onClick={() => setTab(k)}>{k === 'bonus' && '🎁 '}{t(`mp.tab.${k}`)}</button>
        ))}
      </div>
      <ErrorBoundary key={tab} name={`player-${tab}`}>
        {tab === 'games' ? <UserPointsView uid={uid} publicOnly showAdjustments={false} /> : <UserBonusView uid={uid} publicOnly />}
      </ErrorBoundary>
    </section>
  );
}

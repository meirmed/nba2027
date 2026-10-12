import { useEffect, useState } from 'react';
import { httpsCallable } from 'firebase/functions';
import { doc, onSnapshot } from 'firebase/firestore';
import { db, functions } from '../../firebase.js';
import Avatar from '../../components/Avatar.jsx';
import ErrorBoundary from '../../components/ErrorBoundary.jsx';
import { useLang } from '../../contexts/LangContext.jsx';
import { useSettings } from '../../contexts/SettingsContext.jsx';
import { useTeams } from '../../contexts/TeamsContext.jsx';
import { usePlayerStats } from '../../hooks/useH2H.js';
import { formatDateTime } from '../../utils/dates.js';
import UserPointsView from '../UserPointsView.jsx';
import UserBonusView from '../UserBonusView.jsx';
import AdminPredictionEditor from './AdminPredictionEditor.jsx';
import AdjustmentsSection from './AdjustmentsSection.jsx';

/** Admin: everything about one registered player - profile, points summary, every pick (auto-filled / joker marked), bonus answers. */
export default function AdminUserDetail({ participant, onBack }) {
  const { t, lang } = useLang();
  const { timezone } = useSettings();
  const { teams } = useTeams();
  const { byUid } = usePlayerStats();
  const uid = participant.claimedBy;
  const [u, setU] = useState(undefined);
  useEffect(() => onSnapshot(doc(db, 'users', uid), (s) => setU(s.exists() ? s.data() : null), () => setU(null)), [uid]);
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const p = byUid[uid] || {};
  const blocked = !!u?.blocked;
  const toggleBlock = async () => {
    if (!window.confirm(t(blocked ? 'au.confirmUnblock' : 'au.confirmBlock', { name: participant.displayName }))) return;
    setBusy(true); setMsg('');
    try { await httpsCallable(functions, 'setUserBlocked')({ uid, blocked: !blocked }); } catch (e) { console.error(e); setMsg(String(e.code).includes('failed-precondition') ? t('au.cannotBlockAdmin') : t('common.error')); }
    setBusy(false);
  };
  const team = u?.team && teams[u.team] ? teams[u.team][lang] || teams[u.team].en : '–';
  const stats = [
    ['lb.totalCol', p.total], ['lb.games', p.gamePts], ['lb.bonus', p.bonus], ['lb.exact', p.exactHits], ['lb.unique', p.uniqueHits],
    ['lb.winners', p.winnerCorrect], ['lb.played', p.gamesPlayed], ['lb.bestStreak', p.bestStreak], ['au.curStreak', p.curStreak],
  ];

  return (
    <div>
      <button className="btn ghost" onClick={onBack}>{t('au.back')}</button>
      <div className="card">
        <div className="inline">
          <Avatar name={participant.displayName} url={u?.photoURL} size={56} />
          <div>
            <strong dir="auto">{participant.displayName}</strong>{blocked && <span className="badge"> 🚫 {t('au.blocked')}</span>}
            <div className="muted small" dir="ltr">{participant.email || u?.email}</div>
          </div>
        </div>
        <div className="stat-grid">
          <div><span className="muted small">{t('au.registered')}</span><div>{participant.claimedAt ? formatDateTime(participant.claimedAt, lang, timezone) : '–'}</div></div>
          <div><span className="muted small">{t('ap.paid')}</span><div>{participant.paid ? '✓' : '✗'}</div></div>
          <div><span className="muted small">{t('pf.team')}</span><div dir="auto">{team}</div></div>
          <div><span className="muted small">{t('pf.phone')}</span><div dir="ltr">{u?.phone || '–'}</div></div>
          <div><span className="muted small">{t('pf.language')}</span><div>{u?.lang === 'en' ? 'English' : u?.lang === 'he' ? 'עברית' : '–'}</div></div>
        </div>
        <div className="actions"><button className="btn ghost" disabled={busy} onClick={toggleBlock}>{t(blocked ? 'au.unblock' : 'au.block')}</button><span className="error small">{msg}</span></div>
        <div className="stat-grid">
          {stats.map(([k, v]) => <div key={k}><span className="muted small">{t(k)}</span><div><strong>{v ?? 0}</strong></div></div>)}
        </div>
      </div>
      <ErrorBoundary name="admin-user-editor"><AdminPredictionEditor uid={uid} /></ErrorBoundary>
      <ErrorBoundary name="admin-user-adjust"><AdjustmentsSection uid={uid} /></ErrorBoundary>
      <ErrorBoundary name="admin-user-points"><UserPointsView uid={uid} showAdjustments={false} /></ErrorBoundary>
      <h3 className="bq-title">{t('mp.tab.bonus')}</h3>
      <ErrorBoundary name="admin-user-bonus"><UserBonusView uid={uid} /></ErrorBoundary>
    </div>
  );
}

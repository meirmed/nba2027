import { useEffect, useMemo, useState } from 'react';
import { collection, onSnapshot } from 'firebase/firestore';
import { db } from '../../firebase.js';
import { useLang } from '../../contexts/LangContext.jsx';
import { useAuth } from '../../contexts/AuthContext.jsx';
import { useBonus } from '../../contexts/BonusContext.jsx';
import { usePlayerStats } from '../../hooks/useH2H.js';
import { useNow } from '../../hooks/useNow.js';
import { scoreBonus } from '@shared/bonus.js';

/** Players x closed bonus questions: the points each player got on each question (a dot = answered, correct answer not set yet). */
export default function BonusTrackingTab() {
  const { t, dir, lang } = useLang();
  const { user } = useAuth();
  const { questions } = useBonus();
  const { rows } = usePlayerStats();
  const nowMs = useNow(5000);
  const [picks, setPicks] = useState({}); // questionId -> {uid: {answer}}

  useEffect(() => onSnapshot(collection(db, 'bonusPicks'),
    (s) => setPicks(Object.fromEntries(s.docs.map((d) => [d.id, d.data().picks || {}]))), () => setPicks({})), []);

  const qs = useMemo(() => questions.filter((q) => q.type !== 'ranking' && ((q.answer || []).length > 0 || nowMs >= q.deadlineMs)), [questions, nowMs]); // asc by deadline
  const players = useMemo(() => [...rows].sort((a, b) => ((b.bonus ?? 0) - (a.bonus ?? 0)) || (a.name || '').localeCompare(b.name || '', 'he')), [rows]);

  if (qs.length === 0) return <p className="muted">{t('rb.trackNone')}</p>;

  const cell = (uid, q) => {
    const a = picks[q.id]?.[uid]?.answer;
    if (!a?.length) return <span className="muted">–</span>;
    if (!(q.answer || []).length) return <span className="muted">•</span>;
    const pts = scoreBonus(q, a).pts;
    return pts > 0 ? <strong className="pts-bonus">{pts}</strong> : <span className="muted">0</span>;
  };

  return (
    <div>
      <div className="table-wrap">
        <table className="table lb track" dir={dir}>
          <thead>
            <tr className="muted small">
              <th className="lb-name">{t('lb.name')}</th>
              <th>{t('lb.bonus')}</th>
              {qs.map((q, i) => <th key={q.id} title={q.question?.[lang] || q.question?.en}>{i + 1}</th>)}
            </tr>
          </thead>
          <tbody>
            {players.map((r) => (
              <tr key={r.uid} className={r.uid === user?.uid ? 'me' : ''}>
                <td className="lb-name" dir="auto">{r.name}</td>
                <td><strong className="pts-bonus">{r.bonus ?? 0}</strong></td>
                {qs.map((q) => <td key={q.id}>{cell(r.uid, q)}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <h4 className="bq-title">{t('rb.legend')}</h4>
      <ol className="muted small legend">{qs.map((q) => <li key={q.id} dir="auto">{q.question?.[lang] || q.question?.en}</li>)}</ol>
    </div>
  );
}

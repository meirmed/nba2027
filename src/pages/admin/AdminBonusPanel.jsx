import { useState } from 'react';
import { doc, writeBatch } from 'firebase/firestore';
import { db } from '../../firebase.js';
import PageShell from '../../components/PageShell.jsx';
import { useLang } from '../../contexts/LangContext.jsx';
import { useAuth } from '../../contexts/AuthContext.jsx';
import { useBonus } from '../../contexts/BonusContext.jsx';
import { useNow } from '../../hooks/useNow.js';
import { addAudit } from '../../utils/audit.js';
import { formatDateTime } from '../../utils/dates.js';
import { useSettings } from '../../contexts/SettingsContext.jsx';
import BonusForm from './BonusForm.jsx';
import PlayersManager from './PlayersManager.jsx';

// Shell: Questions (list + form) | Players list. Editors live in BonusForm / PlayersManager (one setting = one editor).
export default function AdminBonusPanel() {
  const { t, lang } = useLang();
  const { user } = useAuth();
  const { timezone } = useSettings();
  const { questions, loading } = useBonus();
  const nowMs = useNow(30000);
  const [tab, setTab] = useState('questions');
  const [editing, setEditing] = useState(undefined); // undefined = list, null = new question, object = edit
  const [msg, setMsg] = useState('');

  const remove = async (q) => {
    if (!window.confirm(t('common.confirmDelete'))) return;
    try {
      const batch = writeBatch(db);
      batch.delete(doc(db, 'bonus', q.id));
      addAudit(batch, user.uid, { action: 'bonus.delete', target: `bonus/${q.id}`, before: { ...q } });
      await batch.commit();
    } catch (e) { console.error(e); setMsg(t('common.error')); }
  };

  const state = (q) => ((q.answer || []).length > 0 ? ['finished', t('bq.answerSet')] : q.deadlineMs > nowMs ? ['scheduled', t('status.scheduled')] : ['live', t('pred.locked')]);
  const catLabel = (q) => (q.category === 'month' ? q.month : t(`bq.cat.${q.category}`));

  return (
    <PageShell titleKey="admin.bonus">
      <div className="tabs" role="tablist">
        {['questions', 'players'].map((k) => (
          <button key={k} role="tab" aria-selected={tab === k} className={`tab ${tab === k ? 'active' : ''}`} onClick={() => { setTab(k); setEditing(undefined); }}>{t(`bq.tab.${k}`)}</button>
        ))}
      </div>

      {tab === 'players' && <PlayersManager />}

      {tab === 'questions' && editing !== undefined && <BonusForm question={editing} onDone={() => setEditing(undefined)} />}

      {tab === 'questions' && editing === undefined && (
        <>
          <div className="actions"><button className="btn" onClick={() => setEditing(null)}>{t('bq.new')}</button><span className="muted">{msg}</span></div>
          {loading && <p className="muted">{t('common.loading')}</p>}
          {!loading && questions.length === 0 && <p className="muted">{t('bq.empty')}</p>}
          {questions.map((q) => {
            const [cls, label] = state(q);
            return (
              <div key={q.id} className="row">
                <div className="grow">
                  <strong dir="auto">{q.question?.[lang] || q.question?.en}</strong>
                  <div className="muted small">{t(`bq.type.${q.type}`)} · {catLabel(q)} · {formatDateTime(q.deadline, lang, timezone)} · <span className={`badge ${cls}`}>{label}</span></div>
                </div>
                <button className="btn ghost" onClick={() => setEditing(q)}>{t('common.edit')}</button>
                <button className="btn ghost" onClick={() => remove(q)}>{t('common.delete')}</button>
              </div>
            );
          })}
        </>
      )}
    </PageShell>
  );
}

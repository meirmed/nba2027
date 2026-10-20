import { useState } from 'react';
import { deleteField, doc, writeBatch } from 'firebase/firestore';
import { db } from '../../firebase.js';
import PageShell from '../../components/PageShell.jsx';
import { useLang } from '../../contexts/LangContext.jsx';
import { useAuth } from '../../contexts/AuthContext.jsx';
import { useBonus } from '../../contexts/BonusContext.jsx';
import { useNow } from '../../hooks/useNow.js';
import { addAudit } from '../../utils/audit.js';
import { formatDateTime } from '../../utils/dates.js';
import { useSettings } from '../../contexts/SettingsContext.jsx';
import { groupBonusQuestions, hasCustomOrder, reorderQuestions } from '@shared/bonus.js';
import { bonusSectionTitle } from '../../utils/bonusSections.js';
import BonusForm from './BonusForm.jsx';
import PlayersManager from './PlayersManager.jsx';
import MissingBonusReport from './MissingBonusReport.jsx';

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

  // ORDER: ▲▼ moves a question inside its section and saves an explicit order for ALL questions (it then wins over the automatic order by type)
  const move = async (q, delta) => {
    const orders = reorderQuestions(questions, q.id, delta);
    if (!orders) return;
    try {
      const batch = writeBatch(db);
      questions.forEach((x) => { if (x.order !== orders[x.id]) batch.update(doc(db, 'bonus', x.id), { order: orders[x.id] }); });
      addAudit(batch, user.uid, { action: 'bonus.reorder', target: 'bonus', before: { moved: q.id, delta }, after: { orders } });
      await batch.commit();
    } catch (e) { console.error(e); setMsg(t('common.error')); }
  };
  const resetOrder = async () => {
    if (!window.confirm(t('bq.order.confirmReset'))) return;
    try {
      const batch = writeBatch(db);
      questions.filter((x) => Number.isFinite(x.order)).forEach((x) => batch.update(doc(db, 'bonus', x.id), { order: deleteField() }));
      addAudit(batch, user.uid, { action: 'bonus.reorderReset', target: 'bonus', before: null, after: null });
      await batch.commit();
    } catch (e) { console.error(e); setMsg(t('common.error')); }
  };
  const custom = hasCustomOrder(questions);
  const sections = groupBonusQuestions(questions);

  const state = (q) => ((q.answer || []).length > 0 ? ['finished', t('bq.answerSet')] : q.deadlineMs > nowMs ? ['scheduled', t('status.scheduled')] : ['', t('pred.locked')]);
  const catLabel = (q) => (q.category === 'month' ? q.month : t(`bq.cat.${q.category}`));

  return (
    <PageShell titleKey="admin.bonus">
      <div className="tabs" role="tablist">
        {['questions', 'players', 'missing'].map((k) => (
          <button key={k} role="tab" aria-selected={tab === k} className={`tab ${tab === k ? 'active' : ''}`} onClick={() => { setTab(k); setEditing(undefined); }}>{t(`bq.tab.${k}`)}</button>
        ))}
      </div>

      {tab === 'players' && <PlayersManager />}
      {tab === 'missing' && <MissingBonusReport />}

      {tab === 'questions' && editing !== undefined && <BonusForm question={editing} onDone={(m) => { setEditing(undefined); setMsg(m || ''); }} />}

      {tab === 'questions' && editing === undefined && (
        <>
          <div className="actions"><button className="btn" onClick={() => setEditing(null)}>{t('bq.new')}</button><span className="muted">{msg}</span></div>
          {loading && <p className="muted">{t('common.loading')}</p>}
          {!loading && questions.length === 0 && <p className="muted">{t('bq.empty')}</p>}
          {questions.length > 1 && (
            <p className="muted small">
              {custom ? `✎ ${t('bq.order.custom')}` : t('bq.order.auto')} {t('bq.order.how')}
              {custom && <> <button className="btn ghost" onClick={resetOrder}>{t('bq.order.reset')}</button></>}
            </p>
          )}
          {sections.map(([k, list]) => (
            <section key={k}>
              <h3 className="bq-title">{bonusSectionTitle(k, t, lang)}</h3>
              {list.map((q, i) => {
                const [cls, label] = state(q);
                const movable = k !== 'ranking'; // the automatic "ranking" section holds one question: move any question once and the ranking joins its own section
                return (
                  <div key={q.id} className="row">
                    <div className="grow">
                      <strong dir="auto">{q.question?.[lang] || q.question?.en}</strong>
                      <div className="muted small">{t(`bq.type.${q.type}`)} · {catLabel(q)} · {formatDateTime(q.deadline, lang, timezone)} · <span className={`badge ${cls}`}>{label}</span></div>
                    </div>
                    {questions.length > 1 && (
                      <>
                        <button className="rank-btn" disabled={!movable || i === 0} onClick={() => move(q, -1)} aria-label={t('bq.order.up')}>▲</button>
                        <button className="rank-btn" disabled={!movable || i === list.length - 1} onClick={() => move(q, 1)} aria-label={t('bq.order.down')}>▼</button>
                      </>
                    )}
                    <button className="btn ghost" onClick={() => setEditing(q)}>{t('common.edit')}</button>
                    <button className="btn ghost" onClick={() => remove(q)}>{t('common.delete')}</button>
                  </div>
                );
              })}
            </section>
          ))}
        </>
      )}
    </PageShell>
  );
}

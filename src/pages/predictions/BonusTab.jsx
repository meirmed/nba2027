import { useEffect, useMemo, useRef, useState } from 'react';
import { httpsCallable } from 'firebase/functions';
import { functions } from '../../firebase.js';
import { useLang } from '../../contexts/LangContext.jsx';
import { useBonus } from '../../contexts/BonusContext.jsx';
import { useMyPredictions } from '../../contexts/MyPredictionsContext.jsx';
import { usePlayers } from '../../hooks/usePlayers.js';
import { useNow } from '../../hooks/useNow.js';
import { saveErrorInfo } from '@shared/saveErrors.js';
import { bonusClosedReason, cleanAnswer, groupBonusQuestions } from '@shared/bonus.js';
import { bonusSectionTitle } from '../../utils/bonusSections.js';
import BonusCard from './BonusCard.jsx';

const AUTOSAVE_MS = 800;
const omit = (obj, ids) => Object.fromEntries(Object.entries(obj).filter(([k]) => !ids.includes(k)));
const same = (a, b) => JSON.stringify(a || []) === JSON.stringify(b || []);

/**
 * Bonus questions grouped General / Season / months. Answers save automatically (debounced, ONE call, server checks the
 * deadline). The Save button stays: it saves anything pending and shows how many questions are saved.
 */
export default function BonusTab() {
  const { t, lang } = useLang();
  const { questions, loading } = useBonus();
  const mine = useMyPredictions();
  const nowMs = useNow(1000);
  const { players, byId } = usePlayers(questions.some((q) => q.type === 'player'));

  const [draft, setDraft] = useState({}); // id -> [strings]
  const [opt, setOpt] = useState({}); // id -> just-saved answer (until the snapshot catches up)
  const [reasons, setReasons] = useState({});
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const savingRef = useRef(false);
  const saveRef = useRef(null);

  const visible = questions;
  const qById = useMemo(() => Object.fromEntries(visible.map((q) => [q.id, q])), [visible]);
  const savedOf = (id) => opt[id] ?? mine.bonus[id]?.answer;
  const valueOf = (id) => draft[id] ?? savedOf(id) ?? [];
  const savedCount = visible.filter((q) => savedOf(q.id)?.length).length;

  const changed = Object.keys(draft).map((id) => [id, cleanAnswer(qById[id], draft[id])])
    .filter(([id, c]) => qById[id] && !c.error && !same(c.value, savedOf(id))).map(([id, c]) => [id, c.value]);
  const pendingKey = JSON.stringify(changed);

  useEffect(() => {
    setOpt((o) => {
      const keep = Object.fromEntries(Object.entries(o).filter(([id, v]) => !same(mine.bonus[id]?.answer, v)));
      return Object.keys(keep).length === Object.keys(o).length ? o : keep;
    });
  }, [mine]);

  const save = async (manual) => {
    if (savingRef.current) return;
    if (changed.length === 0) {
      if (manual) {
        const stuck = Object.keys(draft).some((id) => qById[id] && cleanAnswer(qById[id], draft[id]).error) || Object.keys(reasons).length > 0;
        setMsg(stuck ? t('pred.fixIssues') : t('pred.allSaved'));
      }
      return;
    }
    const answers = Object.fromEntries(changed);
    savingRef.current = true; setBusy(true); setMsg('');
    try {
      const r = (await httpsCallable(functions, 'saveBonusAnswers')({ answers })).data;
      setOpt((o) => ({ ...o, ...Object.fromEntries(r.saved.map((id) => [id, answers[id]])) }));
      setDraft((d) => omit(d, r.saved));
      setReasons(Object.fromEntries(r.rejected.map((x) => [x.id, x.reason])));
      setMsg(r.rejected.length ? t('pred.partial', { ok: r.saved.length, bad: r.rejected.length }) : `✓ ${t('pred.saved')}`);
    } catch (e) { console.error(e); const info = saveErrorInfo(e); setMsg(info.key === 'pred.saveFailed' ? `${t(info.key)} (${info.detail})` : t(info.key)); } // say WHY it failed
    savingRef.current = false; setBusy(false);
  };
  saveRef.current = save;

  useEffect(() => {
    if (pendingKey === '[]') return undefined;
    const timer = setTimeout(() => saveRef.current?.(false), AUTOSAVE_MS);
    return () => clearTimeout(timer);
  }, [pendingKey]);

  const edit = (id, v) => { setReasons((r) => omit(r, [id])); setDraft((d) => ({ ...d, [id]: v })); };
  const pendingIds = new Set(changed.map(([id]) => id));

  // automatic order by type, or the order the admin set (it wins): see groupBonusQuestions
  const groups = useMemo(() => groupBonusQuestions(visible), [visible]);
  const title = (k) => bonusSectionTitle(k, t, lang);

  if (loading) return <p className="muted">{t('common.loading')}</p>;
  if (groups.length === 0) return <p className="muted">{t('bq.empty')}</p>;

  return (
    <div>
      {groups.map(([k, list]) => (
        <section key={k}>
          <h3 className="bq-title">{title(k)}</h3>
          {list.map((q) => {
            const reason = bonusClosedReason(q, nowMs);
            const status = pendingIds.has(q.id) ? 'saving' : savedOf(q.id) ? 'saved' : null;
            return (
              <BonusCard key={q.id} q={q} nowMs={nowMs} closedReason={reason} value={valueOf(q.id)} onChange={(v) => edit(q.id, v)}
                status={reasons[q.id] ? null : status} reason={reasons[q.id]} players={players} playersById={byId} savedAnswer={savedOf(q.id)} />
            );
          })}
        </section>
      ))}

      {/* the save box only exists while at least one question can still be answered (every question closed = nothing to save) */}
      {visible.some((q) => !bonusClosedReason(q, nowMs)) && (
        <div className="save-bar">
          <button className="btn" onClick={() => save(true)} disabled={busy}>{t('bq.saveAll', { n: savedCount, total: visible.length })}</button>
          <span className={msg.startsWith('✓') ? 'save-ok' : 'muted'}>{busy ? t('pred.saving') : msg}</span>
        </div>
      )}
    </div>
  );
}

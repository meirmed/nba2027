import { useEffect, useMemo, useRef, useState } from 'react';
import { httpsCallable } from 'firebase/functions';
import { functions } from '../../firebase.js';
import { useLang } from '../../contexts/LangContext.jsx';
import { useBonus } from '../../contexts/BonusContext.jsx';
import { useMyPredictions } from '../../contexts/MyPredictionsContext.jsx';
import { usePlayers } from '../../hooks/usePlayers.js';
import { useNow } from '../../hooks/useNow.js';
import { bonusClosedReason, cleanAnswer } from '@shared/bonus.js';
import BonusCard from './BonusCard.jsx';

const AUTOSAVE_MS = 800;
const omit = (obj, ids) => Object.fromEntries(Object.entries(obj).filter(([k]) => !ids.includes(k)));
const same = (a, b) => JSON.stringify(a || []) === JSON.stringify(b || []);

/** Bonus questions grouped General / Season / months. Same autosave pattern as game predictions (server checks the deadline). */
export default function BonusTab() {
  const { t, lang } = useLang();
  const { questions, loading } = useBonus();
  const mine = useMyPredictions();
  const nowMs = useNow(1000);
  const { players, byId } = usePlayers(questions.some((q) => q.type === 'player'));

  const [draft, setDraft] = useState({}); // id -> [strings]
  const [opt, setOpt] = useState({}); // id -> just-saved answer (until the snapshot catches up)
  const [reasons, setReasons] = useState({});
  const [msg, setMsg] = useState('');
  const savingRef = useRef(false);
  const saveRef = useRef(null);

  const qById = useMemo(() => Object.fromEntries(questions.map((q) => [q.id, q])), [questions]);
  const savedOf = (id) => opt[id] ?? mine.bonus[id]?.answer;
  const valueOf = (id) => draft[id] ?? savedOf(id) ?? [];

  const changed = Object.keys(draft).map((id) => [id, cleanAnswer(qById[id], draft[id])])
    .filter(([id, c]) => qById[id] && !c.error && !same(c.value, savedOf(id))).map(([id, c]) => [id, c.value]);
  const pendingKey = JSON.stringify(changed);

  useEffect(() => {
    setOpt((o) => {
      const keep = Object.fromEntries(Object.entries(o).filter(([id, v]) => !same(mine.bonus[id]?.answer, v)));
      return Object.keys(keep).length === Object.keys(o).length ? o : keep;
    });
  }, [mine]);

  const save = async () => {
    if (savingRef.current || changed.length === 0) return;
    const answers = Object.fromEntries(changed);
    savingRef.current = true; setMsg('');
    try {
      const r = (await httpsCallable(functions, 'saveBonusAnswers')({ answers })).data;
      setOpt((o) => ({ ...o, ...Object.fromEntries(r.saved.map((id) => [id, answers[id]])) }));
      setDraft((d) => omit(d, r.saved));
      setReasons(Object.fromEntries(r.rejected.map((x) => [x.id, x.reason])));
    } catch (e) { console.error(e); setMsg(t('pred.saveFailed')); }
    savingRef.current = false;
  };
  saveRef.current = save;

  useEffect(() => {
    if (pendingKey === '[]') return undefined;
    const timer = setTimeout(() => saveRef.current?.(), AUTOSAVE_MS);
    return () => clearTimeout(timer);
  }, [pendingKey]);

  const edit = (id, v) => { setReasons((r) => omit(r, [id])); setDraft((d) => ({ ...d, [id]: v })); };
  const pendingIds = new Set(changed.map(([id]) => id));

  const groups = useMemo(() => {
    const m = new Map();
    questions.filter((q) => q.type !== 'ranking').forEach((q) => {
      const k = q.category === 'month' ? q.month : q.category;
      if (!m.has(k)) m.set(k, []);
      m.get(k).push(q);
    });
    const order = (k) => (k === 'general' ? '0' : k === 'season' ? '1' : `2-${k}`);
    return [...m.entries()].sort((a, b) => order(a[0]).localeCompare(order(b[0])));
  }, [questions]);

  const title = (k) => {
    if (k === 'general' || k === 'season') return t(`bq.cat.${k}`);
    return new Intl.DateTimeFormat(lang === 'he' ? 'he-IL' : 'en-GB', { month: 'long', year: 'numeric' }).format(new Date(`${k}-01T12:00:00Z`));
  };

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
      {msg && <p className="error small">{msg}</p>}
    </div>
  );
}

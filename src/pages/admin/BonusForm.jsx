import { useState } from 'react';
import { Timestamp, collection, doc, getDocs, serverTimestamp, writeBatch } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { db, functions } from '../../firebase.js';
import PlayerPicker from '../../components/PlayerPicker.jsx';
import TeamPicker from '../../components/TeamPicker.jsx';
import RankingInput from '../../components/RankingInput.jsx';
import { useLang } from '../../contexts/LangContext.jsx';
import { useAuth } from '../../contexts/AuthContext.jsx';
import { usePlayers } from '../../hooks/usePlayers.js';
import { usePlayerLists } from '../../hooks/usePlayerLists.js';
import { playersOfList } from '@shared/lists.js';
import { addAudit } from '../../utils/audit.js';
import { toLocalInput } from '../../utils/dates.js';
import { BONUS_TYPES } from '@shared/constants.js';
import { SCOPE_TYPES, isMultiType, isOptionType, scopeTeams, validateQuestion } from '@shared/bonus.js';
import { DIVISIONS } from '@shared/teams.js';
import { normalizeName } from '@shared/names.js';

const str = (v) => (v === null || v === undefined ? '' : String(v));
const n = (v) => (String(v).trim() === '' ? NaN : Number(v));
const newOpt = (i) => ({ id: `o${Date.now().toString(36)}${i}`, he: '', en: '', pts: '' });

const init = (q) => (q ? {
  qHe: q.question?.he || '', qEn: q.question?.en || '', type: q.type, category: q.category || 'season', month: q.month || '',
  deadlineLocal: toLocalInput(q.deadline), pts: str(q.pts), penalty: str(q.penalty ?? 1), multi: !!q.multi, maxPicks: str(q.maxPicks), scope: q.scope || '', playerList: q.playerList || '',
  options: (q.options || []).map((o) => ({ id: o.id, he: o.he, en: o.en, pts: str(o.pts) })), answer: q.answer || [],
} : {
  qHe: '', qEn: '', type: 'numeric', category: 'season', month: '', deadlineLocal: '', pts: '', penalty: '1', multi: false, maxPicks: '', scope: '', playerList: '',
  options: [newOpt(1), newOpt(2)], answer: [],
});

/** Free-text answers people gave -> admin ticks which ones are correct. (Admin may read all predictions.) */
function TextAnswers({ qid, value, onChange }) {
  const { t } = useLang();
  const [rows, setRows] = useState(null);
  const load = async () => {
    const snap = await getDocs(collection(db, 'predictions'));
    const m = new Map();
    snap.forEach((d) => {
      const a = d.data().bonus?.[qid]?.answer?.[0];
      if (!a) return;
      const k = normalizeName(a);
      m.set(k, { text: m.get(k)?.text || a, count: (m.get(k)?.count || 0) + 1 });
    });
    setRows([...m.entries()].map(([k, v]) => ({ k, ...v })).sort((a, b) => b.count - a.count));
  };
  const accepted = value.map(normalizeName);
  const toggle = (r) => onChange(accepted.includes(r.k) ? value.filter((x) => normalizeName(x) !== r.k) : [...value, r.text]);
  return (
    <div>
      <button type="button" className="btn ghost" onClick={load}>{t('bq.loadAnswers')}</button>
      {rows && rows.length === 0 && <p className="muted">{t('bq.noText')}</p>}
      {rows && rows.map((r) => (
        <label key={r.k} className="check"><input type="checkbox" checked={accepted.includes(r.k)} onChange={() => toggle(r)} /> <span dir="auto">{r.text}</span> <span className="muted">×{r.count}</span></label>
      ))}
      {value.length > 0 && <p className="muted small" dir="auto">{t('bq.accepted')}: {value.join(' | ')}</p>}
    </div>
  );
}

// The ONLY editor of bonus questions and their correct answers. Saving a correct answer closes the question and rescores everyone (onBonusUpdated).
export default function BonusForm({ question, onDone }) {
  const { t, lang } = useLang();
  const { user } = useAuth();
  const { players } = usePlayers(true);
  const playerLists = usePlayerLists(true);
  const [f, setF] = useState(() => init(question));
  const [errs, setErrs] = useState([]);
  const [busy, setBusy] = useState(false);
  const set = (k, v) => setF((x) => ({ ...x, [k]: v }));
  const setOpt = (i, k, v) => setF((x) => ({ ...x, options: x.options.map((o, j) => (j === i ? { ...o, [k]: v } : o)) }));
  const toggleAnswer = (id) => setF((x) => ({ ...x, answer: x.answer.includes(id) ? x.answer.filter((a) => a !== id) : [...x.answer, id] }));

  const build = (v) => ({
    question: { he: v.qHe.trim(), en: v.qEn.trim() }, type: v.type, category: v.category, month: v.category === 'month' ? v.month : null,
    deadlineMs: v.deadlineLocal ? new Date(v.deadlineLocal).getTime() : NaN, pts: v.type === 'dynamic_score' ? 0 : n(v.pts), penalty: n(v.penalty),
    multi: isMultiType(v.type) && v.multi, maxPicks: isMultiType(v.type) && v.multi && v.maxPicks !== '' ? Number(v.maxPicks) : null,
    options: isOptionType(v.type) ? v.options.map((o) => ({ id: o.id, he: o.he.trim(), en: o.en.trim(), ...(v.type === 'dynamic_score' ? { pts: n(o.pts) } : {}) })) : [],
    answer: v.answer,
    scope: SCOPE_TYPES.includes(v.type) ? v.scope : null,
    playerList: v.type === 'player' && v.playerList ? v.playerList : null,
  });

  /** One language is enough: fill the missing Hebrew/English (question and options) with Google Translate. */
  const fillMissing = async (v) => {
    const next = { ...v, options: v.options.map((o) => ({ ...o })) };
    const jobs = [];
    const need = (he, en, setHe, setEn) => {
      if (he.trim() && !en.trim()) jobs.push({ text: he.trim(), to: 'en', set: setEn });
      if (en.trim() && !he.trim()) jobs.push({ text: en.trim(), to: 'he', set: setHe });
    };
    need(v.qHe, v.qEn, (x) => { next.qHe = x; }, (x) => { next.qEn = x; });
    if (isOptionType(v.type)) next.options.forEach((o) => need(o.he, o.en, (x) => { o.he = x; }, (x) => { o.en = x; }));
    if (jobs.length === 0) return { next, translated: false };
    const r = await httpsCallable(functions, 'translateTexts')({ items: jobs.map((j) => ({ text: j.text, to: j.to })) });
    r.data.translations.forEach((tr, i) => jobs[i].set(tr));
    return { next, translated: true };
  };

  const save = async () => {
    setErrs([]);
    if (!f.qHe.trim() && !f.qEn.trim()) { setErrs(['err.bqEmpty']); return; }
    setBusy(true);
    let filled;
    try { filled = await fillMissing(f); } catch (e) { console.error(e); setErrs(['err.bqTranslate']); setBusy(false); return; }
    setF(filled.next);
    const q = build(filled.next);
    const problems = validateQuestion(q);
    if (problems.length) { setErrs(problems); setBusy(false); return; }
    try {
      const ref = question ? doc(db, 'bonus', question.id) : doc(collection(db, 'bonus'));
      const data = {
        question: q.question, type: q.type, category: q.category, month: q.month, deadline: Timestamp.fromDate(new Date(q.deadlineMs)),
        pts: q.pts, penalty: q.type === 'closest' || q.type === 'ranking' ? q.penalty : null, multi: q.multi, maxPicks: q.maxPicks, options: q.options, answer: q.answer, scope: q.scope ?? null, playerList: q.playerList ?? null,
        updatedAt: serverTimestamp(),
      };
      const batch = writeBatch(db);
      if (question) batch.update(ref, data); else batch.set(ref, { ...data, createdAt: serverTimestamp() });
      addAudit(batch, user.uid, { action: question ? 'bonus.update' : 'bonus.create', target: ref.path, before: question ? { ...question } : null, after: { ...data, updatedAt: null, deadline: q.deadlineMs, autoTranslated: filled.translated } });
      await batch.commit();
      onDone(filled.translated ? t('bq.translatedNote') : '');
    } catch (e) { console.error(e); setErrs(['common.error']); setBusy(false); }
  };

  const optionTypes = isOptionType(f.type);
  const answerEditor = (() => {
    if (f.type === 'numeric' || f.type === 'closest') return <input className="input num wide" dir="ltr" type="number" inputMode="decimal" value={f.answer[0] ?? ''} onChange={(e) => set('answer', e.target.value === '' ? [] : [e.target.value])} />;
    if (optionTypes) return <div className="bq-options">{f.options.map((o) => <label key={o.id} className="check"><input type="checkbox" checked={f.answer.includes(o.id)} onChange={() => toggleAnswer(o.id)} /> {o[lang] || o.en || o.he || '…'}</label>)}</div>;
    if (f.type === 'team') return <TeamPicker value={f.answer} onChange={(v) => set('answer', v)} max={Infinity} />;
    if (SCOPE_TYPES.includes(f.type)) return <TeamPicker value={f.answer} onChange={(v) => set('answer', v)} max={Infinity} only={scopeTeams(f)} />;
    if (f.type === 'player') return <PlayerPicker players={playersOfList(players, f.playerList)} value={f.answer} onChange={(v) => set('answer', v)} max={Infinity} />;
    if (f.type === 'ranking') return <><p className="muted small">{t('bq.rankHint')}</p><RankingInput value={f.answer} onChange={(v) => set('answer', v)} /></>;
    if (f.type === 'text') return question ? <TextAnswers qid={question.id} value={f.answer} onChange={(v) => set('answer', v)} /> : <p className="muted small">{t('bq.textAfterSave')}</p>;
    return null;
  })();

  return (
    <div className="card">
      <h3>{question ? t('bq.edit') : t('bq.new')}</h3>
      <p className="muted small">{t('bq.langHint')}</p>
      <div className="grid-form">
        <label className="field">{t('bq.questionHe')}<input className="input" dir="rtl" value={f.qHe} onChange={(e) => set('qHe', e.target.value)} /></label>
        <label className="field">{t('bq.questionEn')}<input className="input" dir="ltr" value={f.qEn} onChange={(e) => set('qEn', e.target.value)} /></label>
        <label className="field">{t('bq.type')}
          <select className="input" value={f.type} onChange={(e) => { const v = e.target.value; setF((x) => ({ ...x, type: v, answer: SCOPE_TYPES.includes(v) ? [] : x.answer, scope: v === 'division_team' ? (DIVISIONS[x.scope] ? x.scope : 'atlantic') : v === 'conference_team' ? (['E', 'W'].includes(x.scope) ? x.scope : 'E') : x.scope, ...(v === 'ranking' ? { pts: x.pts === '' ? '50' : x.pts, penalty: x.penalty === '1' ? '0.5' : x.penalty } : {}) })); }}>
            {BONUS_TYPES.map((x) => <option key={x} value={x}>{t(`bq.type.${x}`)}</option>)}
          </select></label>
        <label className="field">{t('bq.category')}
          <select className="input" value={f.category} onChange={(e) => set('category', e.target.value)}>
            {['general', 'season', 'month'].map((x) => <option key={x} value={x}>{t(`bq.cat.${x}`)}</option>)}
          </select></label>
        {f.category === 'month' && <label className="field">{t('bq.month')}<input className="input" dir="ltr" type="month" value={f.month} onChange={(e) => set('month', e.target.value)} /></label>}
        <label className="field">{t('bq.deadline')}<input className="input" dir="ltr" type="datetime-local" value={f.deadlineLocal} onChange={(e) => set('deadlineLocal', e.target.value)} /></label>
        {f.type !== 'dynamic_score' && <label className="field">{f.type === 'ranking' ? t('bq.poolPts') : f.type === 'closest' ? t('bq.maxPts') : isMultiType(f.type) && f.multi ? t('bq.ptsPerPick') : t('bq.pts')}
          <input className="input num wide" dir="ltr" inputMode="decimal" value={f.pts} onChange={(e) => set('pts', e.target.value)} /></label>}
        {(f.type === 'closest' || f.type === 'ranking') && <label className="field">{f.type === 'ranking' ? t('bq.penaltyRank') : t('bq.penalty')}<input className="input num wide" dir="ltr" inputMode="decimal" value={f.penalty} onChange={(e) => set('penalty', e.target.value)} /></label>}
      </div>

      {f.type === 'player' && (
        <label className="field">{t('bq.playerList')}
          <select className="input" dir="auto" value={f.playerList} onChange={(e) => setF((x) => ({ ...x, playerList: e.target.value, answer: [] }))}>
            <option value="">{t('bq.allPlayers')}</option>
            {playerLists.map((l) => <option key={l.id} value={l.id}>{l[lang] || l.en}</option>)}
          </select></label>
      )}
      {f.type === 'division_team' && (
        <label className="field">{t('bq.scopeDivision')}
          <select className="input" dir="auto" value={f.scope} onChange={(e) => setF((x) => ({ ...x, scope: e.target.value, answer: [] }))}>
            {Object.entries(DIVISIONS).map(([k, d]) => <option key={k} value={k}>{d[lang] || d.en} ({t(d.conf === 'E' ? 'rk.east' : 'rk.west')})</option>)}
          </select></label>
      )}
      {f.type === 'conference_team' && (
        <label className="field">{t('bq.scopeConference')}
          <select className="input" dir="auto" value={f.scope} onChange={(e) => setF((x) => ({ ...x, scope: e.target.value, answer: [] }))}>
            <option value="E">{t('rk.east')}</option><option value="W">{t('rk.west')}</option>
          </select></label>
      )}
      {isMultiType(f.type) && (
        <div className="actions">
          <label className="check"><input type="checkbox" checked={f.multi} onChange={(e) => set('multi', e.target.checked)} /> {t('bq.multi')}</label>
          {f.multi && <label className="field">{t('bq.maxPicks')}<input className="input num" dir="ltr" inputMode="numeric" value={f.maxPicks} onChange={(e) => set('maxPicks', e.target.value)} /></label>}
        </div>
      )}

      {optionTypes && (
        <>
          <h4>{t('bq.options')}</h4>
          {f.options.map((o, i) => (
            <div key={o.id} className="grid-form">
              <label className="field">{t('bq.optHe')}<input className="input" dir="rtl" value={o.he} onChange={(e) => setOpt(i, 'he', e.target.value)} /></label>
              <label className="field">{t('bq.optEn')}<input className="input" dir="ltr" value={o.en} onChange={(e) => setOpt(i, 'en', e.target.value)} /></label>
              {f.type === 'dynamic_score' && <label className="field">{t('bq.optPts')}<input className="input num" dir="ltr" inputMode="decimal" value={o.pts} onChange={(e) => setOpt(i, 'pts', e.target.value)} /></label>}
              <button type="button" className="btn ghost" onClick={() => setF((x) => ({ ...x, options: x.options.filter((_, j) => j !== i), answer: x.answer.filter((a) => a !== o.id) }))}>{t('common.delete')}</button>
            </div>
          ))}
          <div className="actions"><button type="button" className="btn ghost" onClick={() => setF((x) => ({ ...x, options: [...x.options, newOpt(x.options.length + 1)] }))}>{t('bq.addOption')}</button></div>
        </>
      )}

      {(
        <>
          <h4>{t('bq.correct')}</h4>
          <p className="muted small">{t('bq.correctHint')}</p>
          {answerEditor}
          {f.answer.length > 0 && <div className="actions"><button type="button" className="btn ghost" onClick={() => set('answer', [])}>{t('bq.clearAnswer')}</button></div>}
        </>
      )}

      {errs.map((e) => <p key={e} className="error" role="alert">{t(e)}</p>)}
      <div className="actions">
        <button className="btn" disabled={busy} onClick={save}>{t('common.save')}</button>
        <button className="btn ghost" onClick={onDone}>{t('common.cancel')}</button>
      </div>
    </div>
  );
}

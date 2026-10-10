import { useEffect, useState } from 'react';
import { doc, serverTimestamp, writeBatch } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { db, functions } from '../../firebase.js';
import PageShell from '../../components/PageShell.jsx';
import { useLang } from '../../contexts/LangContext.jsx';
import { useAuth } from '../../contexts/AuthContext.jsx';
import { useSettings } from '../../contexts/SettingsContext.jsx';
import { addAudit } from '../../utils/audit.js';
import { GAME_ROUNDS } from '@shared/constants.js';

const TB = ['total', 'exactHits', 'uniqueHits', 'bonus'];
const str = (n) => String(n ?? '');
const toForm = (sc) => ({
  winner: str(sc.winner), exact: str(sc.exact), unique: str(sc.unique), riskPct: str(sc.risk.maxPickPct), riskPts: str(sc.risk.pts),
  jokers: str(sc.jokersPerSeason), jokerMult: str(sc.jokerMultiplier), autofill: str(sc.autoFillFactor),
  tiers: sc.diffBonus.map((d) => ({ maxErr: str(d.maxErr), pts: str(d.pts) })),
  rm: Object.fromEntries(GAME_ROUNDS.map((r) => [r, str(sc.roundMultipliers[r] ?? 1)])),
  tb: [...sc.tiebreakers],
});
const n = (v) => (String(v).trim() === '' ? NaN : Number(v));

// The ONLY editor of appSettings/main.scoring. Rules page, leaderboard, scoring functions all read this same config.
export default function AdminScoringPanel() {
  const { t } = useLang();
  const { user } = useAuth();
  const s = useSettings();
  const [f, setF] = useState(null);
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const [recon, setRecon] = useState(null);

  useEffect(() => { if (s.ready && f === null) setF(toForm(s.scoring)); }, [s, f]);
  if (!f) return <PageShell titleKey="admin.scoring"><p className="muted">{t('common.loading')}</p></PageShell>;

  const set = (k, v) => setF((x) => ({ ...x, [k]: v }));
  const setTier = (i, k, v) => setF((x) => ({ ...x, tiers: x.tiers.map((tr, j) => (j === i ? { ...tr, [k]: v } : tr)) }));
  const move = (i, d) => setF((x) => { const tb = [...x.tb]; const j = i + d; if (j < 0 || j >= tb.length) return x; [tb[i], tb[j]] = [tb[j], tb[i]]; return { ...x, tb }; });

  const build = () => {
    const sc = {
      winner: n(f.winner), exact: n(f.exact), unique: n(f.unique), risk: { maxPickPct: n(f.riskPct), pts: n(f.riskPts) },
      jokersPerSeason: n(f.jokers), jokerMultiplier: n(f.jokerMult), autoFillFactor: n(f.autofill),
      diffBonus: f.tiers.map((x) => ({ maxErr: n(x.maxErr), pts: n(x.pts) })).sort((a, b) => a.maxErr - b.maxErr),
      roundMultipliers: Object.fromEntries(GAME_ROUNDS.map((r) => [r, n(f.rm[r])])), tiebreakers: f.tb,
    };
    const nums = [sc.winner, sc.exact, sc.unique, sc.risk.maxPickPct, sc.risk.pts, sc.jokersPerSeason, sc.jokerMultiplier, sc.autoFillFactor,
      ...sc.diffBonus.flatMap((d) => [d.maxErr, d.pts]), ...Object.values(sc.roundMultipliers)];
    const ok = nums.every((x) => Number.isFinite(x) && x >= 0) && sc.risk.maxPickPct <= 100 && sc.autoFillFactor <= 1
      && Number.isInteger(sc.jokersPerSeason) && sc.jokerMultiplier >= 1;
    return ok ? sc : null;
  };

  const save = async () => {
    setMsg('');
    const sc = build();
    if (!sc) { setMsg(t('sc.invalid')); return; }
    setBusy(true);
    try {
      const batch = writeBatch(db);
      batch.set(doc(db, 'appSettings', 'main'), { scoring: sc, updatedAt: serverTimestamp() }, { merge: true });
      addAudit(batch, user.uid, { action: 'scoring.update', target: 'appSettings/main.scoring', before: s.scoring, after: sc });
      await batch.commit();
      setMsg(`${t('common.saved')} ${t('sc.recalcHint')}`);
    } catch (e) { console.error(e); setMsg(t('common.error')); }
    setBusy(false);
  };

  const call = async (name, ok) => {
    setBusy(true); setMsg(''); setRecon(null);
    try { const r = (await httpsCallable(functions, name)()).data; ok(r); } catch (e) { console.error(e); setMsg(t('common.error')); }
    setBusy(false);
  };
  const Num = ({ k, label, disabled }) => (
    <label className="field">{label}<input className="input" dir="ltr" inputMode="decimal" disabled={disabled} value={f[k]} onChange={(e) => set(k, e.target.value)} /></label>
  );

  return (
    <PageShell titleKey="admin.scoring">
      <div className="card">
        <div className="grid-form">
          <Num k="winner" label={t('sc.winner')} />
          <Num k="exact" label={t('sc.exact')} />
          <Num k="unique" label={t('sc.unique')} />
          <Num k="riskPct" label={t('sc.riskPct')} />
          <Num k="riskPts" label={t('sc.riskPts')} />
          <Num k="jokers" label={t('sc.jokers')} disabled={!!s.seasonStarted} />
          <Num k="jokerMult" label={t('sc.jokerMult')} />
          <Num k="autofill" label={t('sc.autofill')} />
        </div>
        {s.seasonStarted && <p className="muted small">{t('sc.jokersLocked')}</p>}

        <h3>{t('sc.diffTitle')}</h3>
        {f.tiers.map((tr, i) => (
          <div key={i} className="inline" dir="ltr">
            <label className="field">{t('sc.diffErr')}<input className="input num" inputMode="numeric" value={tr.maxErr} onChange={(e) => setTier(i, 'maxErr', e.target.value)} /></label>
            <label className="field">{t('sc.diffPts')}<input className="input num" inputMode="numeric" value={tr.pts} onChange={(e) => setTier(i, 'pts', e.target.value)} /></label>
            <button className="btn ghost" onClick={() => setF((x) => ({ ...x, tiers: x.tiers.filter((_, j) => j !== i) }))}>{t('common.delete')}</button>
          </div>
        ))}
        <div className="actions"><button className="btn ghost" onClick={() => setF((x) => ({ ...x, tiers: [...x.tiers, { maxErr: '', pts: '' }] }))}>{t('sc.addTier')}</button></div>

        <h3>{t('sc.roundMult')}</h3>
        <div className="grid-form">
          {GAME_ROUNDS.map((r) => (
            <label key={r} className="field">{t(`round.${r}`)}
              <input className="input" dir="ltr" inputMode="decimal" value={f.rm[r]} onChange={(e) => setF((x) => ({ ...x, rm: { ...x.rm, [r]: e.target.value } }))} /></label>
          ))}
        </div>

        <h3>{t('sc.tiebreakers')}</h3>
        {f.tb.map((k, i) => (
          <div key={k} className="inline">
            <span>{i + 1}. {t(`tb.${k}`)}</span>
            <button className="btn ghost" disabled={i === 0} onClick={() => move(i, -1)}>↑</button>
            <button className="btn ghost" disabled={i === f.tb.length - 1} onClick={() => move(i, 1)}>↓</button>
          </div>
        ))}

        <div className="actions">
          <button className="btn" disabled={busy} onClick={save}>{t('sc.save')}</button>
          <button className="btn ghost" disabled={busy} onClick={() => call('recalcAll', (r) => setMsg(t('sc.recalcDone', { n: r.users })))}>{t('sc.recalc')}</button>
          <button className="btn ghost" disabled={busy} onClick={() => call('reconcilePoints', (r) => { setRecon(r); setMsg(r.ok ? t('sc.reconOk', { n: r.users }) : t('sc.reconBad', { n: r.mismatchCount })); })}>{t('sc.reconcile')}</button>
        </div>
        <p className="muted">{msg}</p>
        {recon && !recon.ok && (
          <div className="table-wrap">
            <table className="table" dir="ltr"><tbody>
              {recon.mismatches.map((m, i) => <tr key={i}><td dir="auto">{m.name}</td><td>{m.field}</td><td>{String(m.stored)} → {String(m.expected)}</td></tr>)}
            </tbody></table>
          </div>
        )}
      </div>
    </PageShell>
  );
}

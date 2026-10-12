import { useCallback, useEffect, useState } from 'react';
import { getDownloadURL, getMetadata, listAll, ref as storageRef, updateMetadata } from 'firebase/storage';
import { httpsCallable } from 'firebase/functions';
import { functions, storage } from '../../firebase.js';
import PageShell from '../../components/PageShell.jsx';
import { useLang } from '../../contexts/LangContext.jsx';
import { useSettings } from '../../contexts/SettingsContext.jsx';
import { formatDateTime } from '../../utils/dates.js';
import { RESTORE_ALLOWED, RESTORE_DEFAULT } from '@shared/backup.js';

// Season reset is switched OFF for now (too powerful). Flip to true AND set SEASON_RESET_ENABLED=true in functions/.env (then redeploy) to enable.
const SEASON_RESET_ENABLED = false;
const fmtSize = (n) => (n > 1e6 ? `${(n / 1e6).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1e3))} KB`);
const call = (name, data) => httpsCallable(functions, name, { timeout: 540000 })(data).then((r) => r.data);

// The ONLY place for backups, restore and the season reset. Files live in Storage under backups/ (admins only).
export default function AdminBackupPanel() {
  const { t, lang } = useLang();
  const { timezone } = useSettings();
  const [files, setFiles] = useState(null);
  const [label, setLabel] = useState('');
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const [restoreFile, setRestoreFile] = useState(null);
  const [cols, setCols] = useState(new Set(RESTORE_DEFAULT));
  const [diff, setDiff] = useState(null);
  const [confirm, setConfirm] = useState('');
  const [resetConfirm, setResetConfirm] = useState('');

  const load = useCallback(async () => {
    try {
      const res = await listAll(storageRef(storage, 'backups'));
      const items = await Promise.all(res.items.map(async (it) => { const m = await getMetadata(it); return { name: it.name, size: m.size, updated: m.updated, ref: it }; }));
      setFiles(items.sort((a, b) => b.name.localeCompare(a.name)));
    } catch (e) { console.error(e); setFiles([]); setMsg(t('bk.errStorage')); }
  }, [t]);
  useEffect(() => { load(); }, [load]);

  const run = async (fn) => { setBusy(true); setMsg(''); try { await fn(); } catch (e) { console.error(e); setMsg(t('common.error')); } setBusy(false); };

  const create = () => run(async () => { const r = await call('createBackup', { label }); setLabel(''); setMsg(t('bk.created', { name: r.name })); await load(); });
  // Saves the file to the computer's Downloads folder: the file is marked "attachment", so the browser downloads it instead of opening it.
  const download = (f) => run(async () => {
    await updateMetadata(f.ref, { contentType: 'application/json', contentDisposition: `attachment; filename="${f.name}"` });
    const a = document.createElement('a');
    a.href = await getDownloadURL(f.ref);
    a.download = f.name;
    document.body.appendChild(a);
    a.click();
    a.remove();
  });
  const toggle = (c) => { setDiff(null); setCols((s) => { const n = new Set(s); if (n.has(c)) n.delete(c); else n.add(c); return n; }); };
  const preview = () => run(async () => { setDiff((await call('restoreBackup', { name: restoreFile.replace(/\.json$/, ''), collections: [...cols], dryRun: true })).diff); });
  const restore = () => run(async () => {
    const r = await call('restoreBackup', { name: restoreFile.replace(/\.json$/, ''), collections: [...cols], dryRun: false, confirm });
    setMsg(t('bk.restored', { name: r.safetyBackup })); setRestoreFile(null); setDiff(null); setConfirm(''); await load();
  });
  const reset = () => run(async () => { const r = await call('seasonReset', { confirm: resetConfirm }); setResetConfirm(''); setMsg(t('bk.resetDone', { name: r.safetyBackup })); await load(); });

  return (
    <PageShell titleKey="admin.backup">
      <div className="card">
        <p className="muted small">{t('bk.auto')}</p>
        <div className="actions">
          <input className="input" dir="auto" placeholder={t('bk.label')} value={label} onChange={(e) => setLabel(e.target.value)} />
          <button className="btn" disabled={busy} onClick={create}>{t('bk.create')}</button>
        </div>
        <p className={msg ? 'muted' : ''}>{busy ? t('common.loading') : msg}</p>
      </div>

      <h3 className="bq-title">{t('bk.list')}</h3>
      {files === null && <p className="muted">{t('common.loading')}</p>}
      {files && files.length === 0 && <p className="muted">{t('bk.none')}</p>}
      {(files || []).map((f) => (
        <div key={f.name} className="row">
          <div className="grow"><strong dir="ltr">{f.name}</strong><div className="muted small">{fmtSize(f.size)} · {formatDateTime(f.updated, lang, timezone)}</div></div>
          <button className="btn ghost" disabled={busy} onClick={() => download(f)}>{t('bk.download')}</button>
          <button className="btn ghost" disabled={busy} onClick={() => { setRestoreFile(f.name); setDiff(null); setConfirm(''); }}>{t('bk.restore')}</button>
        </div>
      ))}

      {restoreFile && (
        <div className="card">
          <h3>{t('bk.restore')} · <span dir="ltr">{restoreFile}</span></h3>
          <p className="muted small">{t('bk.restoreNote')}</p>
          <div className="bq-options">
            {RESTORE_ALLOWED.map((c) => <label key={c} className="check"><input type="checkbox" checked={cols.has(c)} onChange={() => toggle(c)} /> <span dir="ltr">{c}</span></label>)}
          </div>
          <div className="actions"><button className="btn ghost" disabled={busy || cols.size === 0} onClick={preview}>{t('bk.preview')}</button><button className="btn ghost" onClick={() => setRestoreFile(null)}>{t('common.cancel')}</button></div>
          {diff && (
            <>
              <table className="table" dir="ltr"><tbody>
                {Object.entries(diff).map(([c, d]) => <tr key={c}><td>{c}</td><td>+{d.added}</td><td>−{d.removed}</td><td>~{d.changed}</td></tr>)}
              </tbody></table>
              <p className="muted small">{t('bk.diffLegend')}</p>
              <input className="input" dir="ltr" placeholder={t('bk.typeRestore')} value={confirm} onChange={(e) => setConfirm(e.target.value)} />
              <div className="actions"><button className="btn" disabled={busy || confirm !== 'RESTORE'} onClick={restore}>{t('bk.restoreNow')}</button></div>
            </>
          )}
        </div>
      )}

      <h3 className="bq-title">{t('bk.resetTitle')}</h3>
      <div className="card error-card">
        <p className="small">{t('bk.resetWarn')}</p>
        {!SEASON_RESET_ENABLED && <p className="error small"><strong>{t('bk.resetDisabled')}</strong></p>}
        <input className="input" dir="ltr" disabled={!SEASON_RESET_ENABLED} placeholder={t('bk.typeReset')} value={resetConfirm} onChange={(e) => setResetConfirm(e.target.value)} />
        <div className="actions"><button className="btn" disabled={!SEASON_RESET_ENABLED || busy || resetConfirm !== 'RESET'} onClick={reset}>{t('bk.resetNow')}</button></div>
      </div>
    </PageShell>
  );
}

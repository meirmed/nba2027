import { useEffect, useMemo, useState } from 'react';
import { collection, limit, onSnapshot, orderBy, query } from 'firebase/firestore';
import { db } from '../../firebase.js';
import PageShell from '../../components/PageShell.jsx';
import { useLang } from '../../contexts/LangContext.jsx';
import { useSettings } from '../../contexts/SettingsContext.jsx';
import { usePlayerStats } from '../../hooks/useH2H.js';
import { formatDateTime } from '../../utils/dates.js';

// Firestore Timestamps -> ISO strings so before/after print readably
const plain = (v) => {
  if (v && typeof v.toDate === 'function') return v.toDate().toISOString();
  if (Array.isArray(v)) return v.map(plain);
  if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, plain(x)]));
  return v;
};

/** Every admin action (who, when, what, old -> new values). Read-only. Newest first, 100 at a time. */
export default function AdminAuditPanel() {
  const { t, lang } = useLang();
  const { timezone } = useSettings();
  const { nameOf } = usePlayerStats();
  const [count, setCount] = useState(100);
  const [rows, setRows] = useState([]);
  const [filter, setFilter] = useState('');
  const [search, setSearch] = useState('');
  const [open, setOpen] = useState(null);

  useEffect(() => onSnapshot(query(collection(db, 'auditLog'), orderBy('ts', 'desc'), limit(count)),
    (s) => setRows(s.docs.map((d) => ({ id: d.id, ...d.data() }))), () => setRows([])), [count]);

  const groups = useMemo(() => [...new Set(rows.map((r) => String(r.action || '').split('.')[0]))].sort(), [rows]);
  const shown = rows.filter((r) => {
    if (filter && String(r.action || '').split('.')[0] !== filter) return false;
    const s = search.trim().toLowerCase();
    return !s || `${r.action} ${r.target} ${nameOf(r.by)}`.toLowerCase().includes(s);
  });

  return (
    <PageShell titleKey="admin.audit">
      <div className="grid-form">
        <label className="field">{t('al.filter')}
          <select className="input" value={filter} onChange={(e) => setFilter(e.target.value)}>
            <option value="">{t('al.all')}</option>
            {groups.map((g) => <option key={g} value={g}>{g}</option>)}
          </select></label>
        <label className="field">{t('al.search')}<input className="input" dir="auto" value={search} onChange={(e) => setSearch(e.target.value)} /></label>
      </div>
      {shown.length === 0 && <p className="muted">{t('al.empty')}</p>}
      {shown.map((r) => (
        <div key={r.id} className="row audit-row">
          <div className="grow">
            <strong dir="ltr">{r.action}</strong>
            <div className="muted small"><span dir="auto">{nameOf(r.by)}</span> · {r.ts ? formatDateTime(r.ts, lang, timezone) : '…'} · <span dir="ltr">{r.target}</span></div>
            {open === r.id && <pre className="json" dir="ltr">{JSON.stringify({ before: plain(r.before), after: plain(r.after) }, null, 2)}</pre>}
          </div>
          <button className="btn ghost" onClick={() => setOpen(open === r.id ? null : r.id)}>{t('al.details')}</button>
        </div>
      ))}
      {rows.length >= count && <div className="actions"><button className="btn ghost" onClick={() => setCount((c) => c + 100)}>{t('al.more')}</button></div>}
    </PageShell>
  );
}

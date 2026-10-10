import { useMemo, useState } from 'react';
import { httpsCallable } from 'firebase/functions';
import { functions } from '../../firebase.js';
import PageShell from '../../components/PageShell.jsx';
import TeamBadge from '../../components/TeamBadge.jsx';
import { useLang } from '../../contexts/LangContext.jsx';
import { useSettings } from '../../contexts/SettingsContext.jsx';
import { dayKey, formatDay, formatTime } from '../../utils/dates.js';

const iso = (d) => {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};
const selectable = (g) => !g.exists && !g.postseason && g.known && !!g.id && !!g.tipoff;

// Admin picks a date range, sees that schedule from balldontlie (server-side call), ticks games, adds them in one click.
export default function AdminScheduleImport({ onBack }) {
  const { t, lang } = useLang();
  const { timezone } = useSettings();
  const [from, setFrom] = useState(() => iso(new Date()));
  const [to, setTo] = useState(() => iso(new Date(Date.now() + 6 * 86400000)));
  const [games, setGames] = useState(null);
  const [sel, setSel] = useState(() => new Set());
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');

  const errText = (e) => {
    const c = e?.code || '';
    if (c.includes('failed-precondition')) return t('ai.errKey');
    if (c.includes('resource-exhausted')) return t('ai.errRate');
    if (c.includes('invalid-argument')) return t('ai.errRange');
    return t('common.error');
  };

  const fetchList = async () => {
    const r = await httpsCallable(functions, 'listScheduleGames')({ startDate: from, endDate: to });
    setGames(r.data.games);
    setSel(new Set());
  };
  const load = async () => {
    setBusy(true); setMsg('');
    try { await fetchList(); } catch (e) { console.error(e); setMsg(errText(e)); }
    setBusy(false);
  };

  const groups = useMemo(() => {
    const m = new Map();
    (games || []).forEach((g) => {
      const k = g.tipoff ? dayKey(g.tipoff, timezone) : 'unknown';
      if (!m.has(k)) m.set(k, []);
      m.get(k).push(g);
    });
    return [...m.entries()];
  }, [games, timezone]);

  const toggle = (id) => setSel((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const toggleMany = (list) => setSel((s) => {
    const ids = list.filter(selectable).map((g) => g.id);
    const n = new Set(s);
    if (ids.every((id) => n.has(id))) ids.forEach((id) => n.delete(id)); else ids.forEach((id) => n.add(id));
    return n;
  });

  const add = async () => {
    setBusy(true); setMsg('');
    try {
      const payload = (games || []).filter((g) => sel.has(g.id)).map((g) => ({ apiGameId: g.apiGameId, t1: g.t1, t2: g.t2, tipoff: g.tipoff }));
      const r = await httpsCallable(functions, 'importScheduleGames')({ games: payload });
      await fetchList();
      setMsg(t('ai.result', { created: r.data.created, skipped: r.data.skipped }));
    } catch (e) { console.error(e); setMsg(errText(e)); }
    setBusy(false);
  };

  return (
    <PageShell titleKey="ai.title">
      <div className="card">
        <div className="grid-form">
          <label className="field">{t('ai.from')}<input className="input" dir="ltr" type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></label>
          <label className="field">{t('ai.to')}<input className="input" dir="ltr" type="date" value={to} onChange={(e) => setTo(e.target.value)} /></label>
        </div>
        <p className="muted small">{t('ai.note', { tz: timezone })}</p>
        <div className="actions">
          <button className="btn" onClick={load} disabled={busy}>{t('ai.load')}</button>
          <button className="btn ghost" onClick={onBack}>{t('ai.back')}</button>
          <span className="muted">{msg}</span>
        </div>
      </div>

      {games && games.length === 0 && <p className="muted">{t('ai.none')}</p>}
      {games && games.length > 0 && (
        <div className="actions">
          <button className="btn" onClick={add} disabled={busy || sel.size === 0}>{t('ai.addSelected', { n: sel.size })}</button>
          <button className="btn ghost" onClick={() => toggleMany(games)} disabled={busy}>{t('ai.selectAllNew')}</button>
        </div>
      )}
      {groups.map(([k, list]) => (
        <div key={k} className="day">
          <h3>
            {list[0].tipoff ? formatDay(list[0].tipoff, lang, timezone) : '—'}{' '}
            <button className="btn ghost" onClick={() => toggleMany(list)} disabled={!list.some(selectable)}>{t('ai.selectDay')}</button>
          </h3>
          {list.map((g) => (
            <label key={g.apiGameId} className="game-row">
              <input type="checkbox" disabled={!selectable(g)} checked={g.id ? sel.has(g.id) : false} onChange={() => toggle(g.id)} />
              <span className="muted time" dir="ltr">{g.tipoff ? formatTime(g.tipoff, lang, timezone) : '—'}</span>
              <span className="teams"><TeamBadge abbr={g.t1} /> <span className="muted">–</span> <TeamBadge abbr={g.t2} /></span>
              {g.exists && <span className="badge finished">{t('ai.added')}</span>}
              {g.cup && <span className="badge">{t('ai.cup')}</span>}
              {g.postseason && <span className="badge">{t('ai.playoffs')}</span>}
              {!g.tipoff && <span className="badge">{t('ai.noTime')}</span>}
              {!g.known && <span className="badge">{t('ai.unknownTeam')}</span>}
            </label>
          ))}
        </div>
      ))}
    </PageShell>
  );
}

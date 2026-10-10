import { useEffect, useState } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '../../firebase.js';
import { useLang } from '../../contexts/LangContext.jsx';
import { useNow } from '../../hooks/useNow.js';
import { formatCountdown } from '../../utils/dates.js';

const STALE_MS = 150000; // the updater runs every minute; 2.5 min without a heartbeat = it is down (WC lesson #7)

/** System health: heartbeat written by pollLiveScores to system/poller (admin-only doc). */
export default function PollerHealth() {
  const { t } = useLang();
  const now = useNow(15000);
  const [hb, setHb] = useState(undefined); // undefined = loading, null = no doc yet

  useEffect(() => onSnapshot(doc(db, 'system', 'poller'), (s) => setHb(s.exists() ? s.data() : null), () => setHb(null)), []);
  if (hb === undefined) return null;
  if (hb === null) return <div className="card"><span className="muted">{t('hl.none')}</span></div>;

  const ago = (ts) => formatCountdown(now - (ts?.toMillis?.() ?? 0));
  const stale = now - (hb.lastRunAt?.toMillis?.() ?? 0) > STALE_MS;

  return (
    <div className={`card ${stale ? 'error-card' : ''}`}>
      {stale
        ? <strong className="error">⚠ {t('hl.stale')} ({t('hl.lastRun', { t: ago(hb.lastRunAt) })})</strong>
        : <span><strong className="save-ok">✓ {t('hl.ok')}</strong> <span className="muted">· {hb.inWindow ? t('hl.lastFetch', { t: ago(hb.lastFetchAt) }) : t('hl.noGames')}</span></span>}
      {hb.lastError && <span className="error small">{t('hl.error')}: {hb.lastError}</span>}
    </div>
  );
}

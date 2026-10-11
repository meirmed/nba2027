import { useLang } from '../../contexts/LangContext.jsx';
import VsRow from '../../components/VsRow.jsx';
import { useFunPairs, usePlayerStats } from '../../hooks/useH2H.js';

/** "Pairs for fun": the admin picks two players (optionally a day window); the page shows their game points. */
export default function FunTab() {
  const { t } = useLang();
  const pairs = useFunPairs();
  const { nameOf, statsOf } = usePlayerStats();
  if (pairs === undefined) return <p className="muted">{t('common.loading')}</p>;
  if (pairs.length === 0) return <p className="muted">{t('h2h.noPairs')}</p>;
  return (
    <div>
      <h3 className="bq-title">{t('h2h.funTitle')}</h3>
      {pairs.map((p) => {
        const a = statsOf(p.user1, p.from || null, p.to || null).pts;
        const b = statsOf(p.user2, p.from || null, p.to || null).pts;
        const win = a === b ? null : a > b ? 'a' : 'b';
        const note = [p.label, p.from || p.to ? `${p.from || '…'} → ${p.to || '…'}` : ''].filter(Boolean).join(' · ');
        return <VsRow key={p.id} nameA={nameOf(p.user1)} scoreA={a} nameB={nameOf(p.user2)} scoreB={b} winner={win} note={note} />;
      })}
    </div>
  );
}

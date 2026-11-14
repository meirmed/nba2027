import { useLang } from '../../contexts/LangContext.jsx';
import VsRow from '../../components/VsRow.jsx';
import { useFunPairs, usePlayerStats } from '../../hooks/useH2H.js';

/** "Pairs for fun": the admin picks two players (optionally a day window); the page shows their game points, with the joker's doubling. */
export default function FunTab() {
  const { t } = useLang();
  const pairs = useFunPairs();
  const { nameOf, funResult } = usePlayerStats();
  if (pairs === undefined) return <p className="muted">{t('common.loading')}</p>;
  if (pairs.length === 0) return <p className="muted">{t('h2h.noPairs')}</p>;
  return (
    <div>
      <h3 className="bq-title">{t('h2h.funTitle')}</h3>
      {pairs.map((p) => {
        const { a, b, winner: win } = funResult(p); // game points WITH the joker's doubling (the other H2H competitions do not count the joker)
        const note = [p.label, p.from || p.to ? `${p.from || '…'} → ${p.to || '…'}` : ''].filter(Boolean).join(' · ');
        return <VsRow key={p.id} nameA={nameOf(p.user1)} scoreA={a} nameB={nameOf(p.user2)} scoreB={b} winner={win} note={note} />;
      })}
    </div>
  );
}

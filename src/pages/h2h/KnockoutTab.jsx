import { useLang } from '../../contexts/LangContext.jsx';
import VsRow from '../../components/VsRow.jsx';
import { useTournament, usePlayerStats } from '../../hooks/useH2H.js';
import { DEFAULT_H2H_TIEBREAKERS, resolvePair } from '@shared/h2h.js';

const pairOrder = ([ia, a], [ib, b]) => ((a.seedA ?? 999) - (b.seedA ?? 999)) || ia.localeCompare(ib);

/** Knockout stages (newest first). Points = game points inside the stage's day window; head start added; tie-breaks per tournament settings. */
export default function KnockoutTab() {
  const { t } = useLang();
  const tournament = useTournament();
  const { nameOf, statsOf } = usePlayerStats();
  if (tournament === undefined) return <p className="muted">{t('common.loading')}</p>;
  if (!tournament) return <p className="muted">{t('h2h.none')}</p>;

  const stages = Object.entries(tournament.stages || {}).sort((a, b) => b[1].stageNum - a[1].stageNum);
  if (stages.length === 0) return <p className="muted">{t('h2h.noKnockout')}</p>;
  const tiebreakers = tournament.tiebreakers || DEFAULT_H2H_TIEBREAKERS;

  return (
    <div>
      {tournament.status === 'finished' && tournament.championUid && <div className="card champion">🏆 {t('h2h.champion')}: <strong dir="auto">{nameOf(tournament.championUid)}</strong></div>}
      {stages.map(([id, stage]) => (
        <section key={id}>
          <h3 className="bq-title">
            {t('h2h.stage', { n: stage.stageNum })} · <span className={`badge ${stage.endDay ? 'finished' : 'scheduled'}`}>{stage.endDay ? t('h2h.stageClosed') : t('h2h.stageOpen')}</span>
            <span className="muted small"> · {stage.startDay}{stage.endDay ? ` → ${stage.endDay}` : ''}</span>
          </h3>
          {Object.entries(stage.pairs || {}).sort(pairOrder).map(([pid, p]) => {
            const r = resolvePair(p, (uid) => statsOf(uid, stage.startDay, stage.endDay), tiebreakers);
            const winnerUid = p.winner || r.winnerUid;
            const side = winnerUid ? (winnerUid === p.a ? 'a' : winnerUid === p.b ? 'b' : null) : null;
            const notes = [];
            if (p.advA || p.advB) notes.push(t('h2h.head', { n: p.advA || p.advB }));
            if (!p.b) notes.push(t('h2h.bye'));
            else if (!winnerUid) notes.push(t('h2h.tieOpen'));
            else if (!['points', 'override', 'bye'].includes(r.reason)) notes.push(t('h2h.decidedBy', { r: t(`ah.tb.${r.reason}`) }));
            return (
              <VsRow key={pid} nameA={nameOf(p.a)} scoreA={r.scoreA} nameB={p.b ? nameOf(p.b) : t('h2h.bye')} scoreB={p.b ? r.scoreB : ''} winner={side} note={notes.join(' · ')} />
            );
          })}
        </section>
      ))}
    </div>
  );
}

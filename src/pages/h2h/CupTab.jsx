import { useLang } from '../../contexts/LangContext.jsx';
import { useAuth } from '../../contexts/AuthContext.jsx';
import { useH2HCup } from '../../hooks/useH2HCup.js';
import { formatKeyDay } from '../../utils/dates.js';
import { CUP_GROUPS_1, CUP_GROUPS_2, CUP_STAGES, R_SLOTS } from '@shared/h2hCup.js';
import { PAIR_KEYS } from '@shared/midTournament.js';

const rangeLabel = (w, lang) => `${formatKeyDay(w.lo, lang)} – ${formatKeyDay(w.hi, lang)}`;
const stageOfPair = (k) => (k.startsWith('QF') ? 'QF' : k.startsWith('SF') ? 'SF' : 'F');

/** One group's table: the places that advance are marked with a check and a tint. */
function GroupTable({ rows, user, t, dir }) {
  return (
    <table className="table lb mid-table" dir={dir}>
      <colgroup><col className="c-rank" /><col /><col className="c-num" /><col className="c-num" /><col className="c-num" /><col className="c-num" /></colgroup>
      <thead><tr className="muted small"><th>#</th><th className="lb-name">{t('lb.name')}</th><th title={t('lb.gamePtsCol')}>{t('mid.col.pts')}</th><th title={t('lb.winnerDir')}>{t('mid.col.winners')}</th><th title={t('lb.exactHits')}>{t('mid.col.exact')}</th><th title={t('lb.uniqueHits')}>{t('mid.col.unique')}</th></tr></thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.uid} className={`${r.qualified ? 'mid-qual' : ''} ${r.uid === user?.uid ? 'me' : ''}`}>
            <td>{r.rank}</td>
            <td className="lb-name"><span dir="auto">{r.name}{r.qualified ? ' ✓' : ''}</span></td>
            <td><strong className="pts-games">{r.pts}</strong></td><td>{r.winners}</td><td>{r.exact}</td><td>{r.unique}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/** Head to Head: group stage (A-D, 4 advance) -> "שמינית הגמר" (new groups E-H, 2 advance) -> quarter finals -> semi finals -> final. Game points only, no joker; live. */
export default function CupTab() {
  const { t, lang, dir } = useLang();
  const { user } = useAuth();
  const { groups, hasGroups, bracket, rowsByUid, loading } = useH2HCup();
  const pairTitle = (key) => `${t(`cup.stage.${stageOfPair(key)}`)}${key.replace(/\D/g, '') ? ` ${key.replace(/\D/g, '')}` : ''}`;
  const slotLabel = (slot) => (/^[E-H][12]$/.test(slot) ? t('cup.r.slot', { pos: slot[1], g: slot[0] }) : t('cup.slotWinner', { name: pairTitle(slot) }));

  if (loading) return <p className="muted">{t('common.loading')}</p>;
  if (!hasGroups) return <p className="muted">{t('cup.empty')}</p>;

  const championName = bracket.champion ? rowsByUid[bracket.champion]?.name || '' : '';
  const Side = ({ pair, i }) => {
    const s = i === 0 ? pair.a : pair.b;
    const letter = i === 0 ? 'a' : 'b';
    const won = pair.winner && s && pair.winner === s.uid;
    const cls = won ? 'win' : !pair.winner && pair.leader === letter ? 'lead' : '';
    return (
      <div className={`mid-side ${cls} ${s && s.uid === user?.uid ? 'me' : ''}`}>
        <span dir="auto">{s ? s.name : <em className="muted">{slotLabel(pair.slots[i])}</em>}{won ? (pair.stage === 'F' ? ' 🏆' : ' ✓') : ''}</span>
        <strong dir="ltr">{s ? s.pts : ''}</strong>
      </div>
    );
  };
  const stageDates = (k) => (bracket.windows[k] ? rangeLabel(bracket.windows[k], lang) : t('cup.datesTbd'));

  return (
    <div>
      {championName && <p className="month-banner">{t('cup.champion', { name: championName })}</p>}

      <div className="card">
        <h4 className="bq-title">{t('cup.schedule')}</h4>
        <div className="mid-sched">
          {CUP_STAGES.map((k) => (
            <div key={k} className="mid-sched-row">
              <strong>{t(`cup.stage.${k}`)}</strong>
              <span className="muted">{stageDates(k)}</span>
              <span className={`chip ${bracket.status[k] === 'live' ? 'chip-exact' : bracket.status[k] === 'over' ? 'chip-winner' : 'chip-diff'}`}>{t(`cup.status.${bracket.status[k]}`)}</span>
            </div>
          ))}
        </div>
      </div>

      <h3 className="bq-title">{t('cup.stage.G')}</h3>
      <p className="muted small">{t('cup.g.note')}</p>
      <div className="mid-grid">
        {CUP_GROUPS_1.map((g) => {
          const info = bracket.tablesG[g];
          return (
            <div key={g} className="card mid-group">
              <h4 className="bq-title">{t('cup.group', { g })}</h4>
              {groups[g].length === 0 ? <p className="muted">–</p> : <GroupTable rows={info.table} user={user} t={t} dir={dir} />}
              {bracket.over.G && info.needsDecision && <p className="muted small">{t('cup.tied')}</p>}
            </div>
          );
        })}
      </div>
      {bracket.out.length > 0 && <p className="muted small">{t('cup.out', { n: bracket.out.length, names: bracket.out.map((r) => r.name).join(', ') })}</p>}

      <h3 className="bq-title">{t('cup.stage.R')} <span className="muted small">· {stageDates('R')}</span></h3>
      <p className="muted small">{t('cup.r.note')}</p>
      <div className="mid-grid">
        {CUP_GROUPS_2.map((e) => {
          const members = bracket.groupsR[e];
          return (
            <div key={e} className="card mid-group">
              <h4 className="bq-title">{t('cup.group', { g: e })}</h4>
              {members.length === 0 ? (
                <>
                  <p className="muted small">{t('cup.r.pending')}</p>
                  <ul className="small muted">{R_SLOTS[e].map((slot) => <li key={slot}>{t('cup.r.slot', { pos: slot[1], g: slot[0] })}</li>)}</ul>
                </>
              ) : <GroupTable rows={bracket.tablesR[e].table} user={user} t={t} dir={dir} />}
              {bracket.over.R && bracket.tablesR[e].needsDecision && <p className="muted small">{t('cup.tied')}</p>}
            </div>
          );
        })}
      </div>

      {['QF', 'SF', 'F'].map((stage) => (
        <section key={stage}>
          <h3 className="bq-title">{t(`cup.stage.${stage}`)} <span className="muted small">· {stageDates(stage)}</span></h3>
          <div className="mid-grid">
            {PAIR_KEYS.filter((k) => stageOfPair(k) === stage).map((k) => {
              const pair = bracket.pairs[k];
              return (
                <div key={k} className="card mid-pair">
                  {stage !== 'F' && <div className="muted small">{pairTitle(k)}</div>}
                  <Side pair={pair} i={0} />
                  <Side pair={pair} i={1} />
                  {pair.needsDecision && <p className="muted small">{t('cup.tied')}</p>}
                </div>
              );
            })}
          </div>
        </section>
      ))}
      <p className="muted small">{t('cup.note')}</p>
    </div>
  );
}

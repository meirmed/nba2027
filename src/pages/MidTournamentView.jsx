import { useLang } from '../contexts/LangContext.jsx';
import { useAuth } from '../contexts/AuthContext.jsx';
import { useMidBracket } from '../hooks/useMidBracket.js';
import { MID_GROUPS, MID_STAGES, MID_WINDOWS, PAIR_KEYS } from '@shared/midTournament.js';

const dayLabel = (key, lang) => new Intl.DateTimeFormat(lang === 'he' ? 'he-IL' : 'en-GB', { day: 'numeric', month: 'long', timeZone: 'UTC' }).format(new Date(`${key}T12:00:00Z`));
const rangeLabel = (w, lang) => `${dayLabel(w.lo, lang)} – ${dayLabel(w.hi, lang)}`;
const stageOfPair = (k) => (k.startsWith('QF') ? 'QF' : k.startsWith('SF') ? 'SF' : 'F');

/** "Mid-season tournament": groups -> quarter finals -> semi finals -> final. Game points only (no bonus), inside the window of every stage; live. */
export default function MidTournamentView() {
  const { t, lang, dir } = useLang();
  const { user } = useAuth();
  const { groups, hasGroups, bracket, rowsByUid, loading } = useMidBracket();
  const pairTitle = (key) => `${t(`mid.stage.${stageOfPair(key)}`)}${key.replace(/\D/g, '') ? ` ${key.replace(/\D/g, '')}` : ''}`;
  const slotLabel = (slot) => (/^[A-D][12]$/.test(slot) ? t('mid.slotSeed', { pos: slot[1], g: slot[0] }) : t('mid.slotWinner', { name: pairTitle(slot) }));

  if (loading) return <p className="muted">{t('common.loading')}</p>;
  if (!hasGroups) return <p className="muted">{t('mid.empty')}</p>;

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

  return (
    <div>
      {championName && <p className="month-banner">{t('mid.champion', { name: championName })}</p>}

      <div className="card">
        <h4 className="bq-title">{t('mid.schedule')}</h4>
        <table className="table" dir={dir}>
          <tbody>
            {MID_STAGES.map((k) => (
              <tr key={k}>
                <td><strong>{t(`mid.stage.${k}`)}</strong></td>
                <td className="muted">{rangeLabel(MID_WINDOWS[k], lang)}</td>
                <td><span className={`chip ${bracket.status[k] === 'live' ? 'chip-exact' : bracket.status[k] === 'over' ? 'chip-winner' : 'chip-diff'}`}>{t(`mid.status.${bracket.status[k]}`)}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h3 className="bq-title">{t('mid.stage.G')}</h3>
      <div className="mid-grid">
        {MID_GROUPS.map((g) => {
          const info = bracket.tables[g];
          return (
            <div key={g} className="card mid-group">
              <h4 className="bq-title">{t('mid.group', { g })}</h4>
              {groups[g].length === 0 ? <p className="muted">–</p> : (
                <table className="table lb" dir={dir}>
                  <thead><tr className="muted small"><th>#</th><th className="lb-name">{t('lb.name')}</th><th>{t('lb.gamePtsCol')}</th><th>{t('lb.winnerDir')}</th><th>{t('lb.exactHits')}</th><th>{t('lb.uniqueHits')}</th></tr></thead>
                  <tbody>
                    {info.table.map((r) => (
                      <tr key={r.uid} className={`${r.qualified ? 'mid-qual' : ''} ${r.uid === user?.uid ? 'me' : ''}`}>
                        <td>{r.rank}</td>
                        <td className="lb-name"><span dir="auto">{r.name}{r.qualified ? ' ✓' : ''}</span></td>
                        <td><strong className="pts-games">{r.pts}</strong></td><td>{r.winners}</td><td>{r.exact}</td><td>{r.unique}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
              {bracket.over.G && info.needsDecision && <p className="muted small">{t('mid.tiedDecision')}</p>}
            </div>
          );
        })}
      </div>

      {['QF', 'SF', 'F'].map((stage) => (
        <section key={stage}>
          <h3 className="bq-title">{t(`mid.stage.${stage}`)} <span className="muted small">· {rangeLabel(MID_WINDOWS[stage], lang)}</span></h3>
          <div className="mid-grid">
            {PAIR_KEYS.filter((k) => stageOfPair(k) === stage).map((k) => {
              const pair = bracket.pairs[k];
              return (
                <div key={k} className="card mid-pair">
                  {stage !== 'F' && <div className="muted small">{pairTitle(k)}</div>}
                  <Side pair={pair} i={0} />
                  <Side pair={pair} i={1} />
                  {pair.needsDecision && <p className="muted small">{t('mid.tiedDecision')}</p>}
                </div>
              );
            })}
          </div>
        </section>
      ))}
      <p className="muted small">{t('mid.note')}</p>
    </div>
  );
}

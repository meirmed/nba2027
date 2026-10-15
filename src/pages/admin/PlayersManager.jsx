import { useMemo, useState } from 'react';
import { arrayRemove, arrayUnion, collection, doc, serverTimestamp, writeBatch } from 'firebase/firestore';
import { db } from '../../firebase.js';
import { useLang } from '../../contexts/LangContext.jsx';
import { useAuth } from '../../contexts/AuthContext.jsx';
import { useBonus } from '../../contexts/BonusContext.jsx';
import { usePlayers } from '../../hooks/usePlayers.js';
import { usePlayerLists } from '../../hooks/usePlayerLists.js';
import { addAudit } from '../../utils/audit.js';
import { normalizeName } from '@shared/names.js';
import { TEAMS_BY_ABBR } from '@shared/teams.js';
import { DEFAULT_PLAYER_LISTS, planListAdd, playersOfList } from '@shared/lists.js';

/** "Name" or "Name, TEAM" per line. Team must be a valid code (BOS, LAL...), otherwise the whole line is the name. */
function parseLine(line) {
  const i = line.lastIndexOf(',');
  if (i > 0) {
    const team = line.slice(i + 1).trim().toUpperCase();
    if (TEAMS_BY_ABBR[team]) return { name: line.slice(0, i).trim(), team };
  }
  return { name: line.trim(), team: null };
}

// The ONLY editor of the players / coaches and of their lists (scoring leader, MVP, head coaches...). A person can be in several lists;
// each "player" bonus question picks ONE list. "" = the whole pool (also what older questions without a list use).
export default function PlayersManager() {
  const { t, lang } = useLang();
  const { user } = useAuth();
  const { players } = usePlayers(true);
  const lists = usePlayerLists(true);
  const { questions } = useBonus();
  const [listId, setListId] = useState(''); // '' = all players
  const [text, setText] = useState('');
  const [filter, setFilter] = useState('');
  const [msg, setMsg] = useState('');
  const nameOf = (l) => l[lang] || l.en || l.he || l.id;
  const current = lists.find((l) => l.id === listId);

  const inList = useMemo(() => playersOfList(players, listId), [players, listId]);
  const shown = useMemo(() => {
    const s = filter.trim().toLowerCase();
    return inList.filter((p) => !s || (p.name || '').toLowerCase().includes(s)).slice(0, 150);
  }, [inList, filter]);

  const run = async (fn) => { setMsg(''); try { await fn(); } catch (e) { console.error(e); setMsg(t('common.error')); } };

  const createDefaults = () => run(async () => {
    const batch = writeBatch(db);
    DEFAULT_PLAYER_LISTS.forEach((l, i) => batch.set(doc(db, 'playerLists', l.id), { he: l.he, en: l.en, order: i + 1, createdAt: serverTimestamp() }, { merge: true }));
    addAudit(batch, user.uid, { action: 'playerLists.createDefaults', target: 'playerLists', after: { count: DEFAULT_PLAYER_LISTS.length } });
    await batch.commit();
  });
  const addList = () => run(async () => {
    const he = window.prompt(t('pls.promptHe'));
    if (!he?.trim()) return;
    const en = window.prompt(t('pls.promptEn'), he.trim());
    if (!en?.trim()) return;
    const ref = doc(collection(db, 'playerLists'));
    const batch = writeBatch(db);
    batch.set(ref, { he: he.trim(), en: en.trim(), order: lists.length + 1, createdAt: serverTimestamp() });
    addAudit(batch, user.uid, { action: 'playerLists.add', target: ref.path, after: { he: he.trim(), en: en.trim() } });
    await batch.commit();
    setListId(ref.id);
  });
  const renameList = () => run(async () => {
    const he = window.prompt(t('pls.promptHe'), current.he);
    if (!he?.trim()) return;
    const en = window.prompt(t('pls.promptEn'), current.en);
    if (!en?.trim()) return;
    const batch = writeBatch(db);
    batch.update(doc(db, 'playerLists', current.id), { he: he.trim(), en: en.trim() });
    addAudit(batch, user.uid, { action: 'playerLists.rename', target: `playerLists/${current.id}`, before: { he: current.he, en: current.en }, after: { he: he.trim(), en: en.trim() } });
    await batch.commit();
  });
  const deleteList = () => run(async () => {
    const used = questions.filter((q) => q.playerList === current.id).length;
    if (used > 0) { setMsg(t('pls.inUse', { n: used })); return; }
    if (!window.confirm(t('pls.confirmDeleteList', { name: nameOf(current) }))) return;
    const batch = writeBatch(db);
    inList.forEach((p) => batch.update(doc(db, 'players', p.id), { listIds: arrayRemove(current.id) })); // the people stay in "all players"
    batch.delete(doc(db, 'playerLists', current.id));
    addAudit(batch, user.uid, { action: 'playerLists.delete', target: `playerLists/${current.id}`, before: { he: current.he, en: current.en, players: inList.length } });
    await batch.commit();
    setListId('');
  });

  const add = () => run(async () => {
    const parsed = text.split('\n').map(parseLine).filter((p) => p.name);
    const plan = planListAdd(players, listId, parsed);
    const ops = [
      ...plan.creates.map((p) => (b) => b.set(doc(collection(db, 'players')), { name: p.name, team: p.team, normalizedName: normalizeName(p.name), listIds: p.listIds, createdAt: serverTimestamp() })),
      ...plan.updates.map((u) => (b) => b.update(doc(db, 'players', u.id), { listIds: arrayUnion(listId) })),
    ];
    for (let i = 0; i < ops.length; i += 400) {
      const batch = writeBatch(db);
      ops.slice(i, i + 400).forEach((fn) => fn(batch));
      addAudit(batch, user.uid, { action: 'players.add', target: 'players', after: { list: listId || null, created: plan.creates.length, addedToList: plan.updates.length } });
      await batch.commit();
    }
    setText('');
    setMsg(t('pls.added', { n: plan.creates.length, m: plan.updates.length }));
  });

  const removeFromList = (p) => run(async () => {
    const batch = writeBatch(db);
    batch.update(doc(db, 'players', p.id), { listIds: arrayRemove(listId) });
    addAudit(batch, user.uid, { action: 'players.removeFromList', target: `players/${p.id}`, before: { name: p.name, list: listId } });
    await batch.commit();
  });
  const remove = (p) => run(async () => {
    if (!window.confirm(t('common.confirmDelete'))) return;
    const batch = writeBatch(db);
    batch.delete(doc(db, 'players', p.id));
    addAudit(batch, user.uid, { action: 'players.delete', target: `players/${p.id}`, before: { name: p.name, team: p.team ?? null } });
    await batch.commit();
  });

  return (
    <div>
      {lists.length === 0 && (
        <div className="card">
          <p>{t('pls.none')}</p>
          <div className="actions"><button className="btn" onClick={createDefaults}>{t('pls.createDefaults')}</button></div>
        </div>
      )}

      <div className="chips-row">
        <button className={`chip ${listId === '' ? 'chip-on' : ''}`} onClick={() => setListId('')}>{t('pls.all')} ({players.length})</button>
        {lists.map((l) => (
          <button key={l.id} className={`chip ${listId === l.id ? 'chip-on' : ''}`} onClick={() => setListId(l.id)} dir="auto">{nameOf(l)} ({playersOfList(players, l.id).length})</button>
        ))}
        <button className="chip" onClick={addList}>＋ {t('pls.new')}</button>
      </div>

      {current && (
        <div className="actions">
          <strong dir="auto">{nameOf(current)}</strong>
          <button className="btn ghost" onClick={renameList}>{t('pls.rename')}</button>
          <button className="btn ghost" onClick={deleteList}>{t('pls.deleteList')}</button>
        </div>
      )}

      <div className="card">
        <label className="field">{current ? t('pls.addTo', { name: nameOf(current) }) : t('bq.addPlayers')}
          <textarea className="input" dir="auto" rows={4} value={text} onChange={(e) => setText(e.target.value)} />
        </label>
        <p className="muted small">{t('pls.addHint')}</p>
        <div className="actions"><button className="btn" onClick={add} disabled={!text.trim()}>{t('common.add')}</button><span className="muted">{msg}</span></div>
      </div>

      <p className="muted small">{t('bq.playerCount', { n: inList.length })}</p>
      <input className="input" dir="auto" value={filter} placeholder={t('bq.searchPlayer')} onChange={(e) => setFilter(e.target.value)} />
      {shown.map((p) => (
        <div key={p.id} className="row">
          <div className="grow" dir="auto">
            {p.name}{p.team ? <span className="muted"> · {p.team}</span> : null}
            {!listId && (p.listIds || []).length > 0 && <div className="muted small">{(p.listIds || []).map((id) => lists.find((l) => l.id === id)).filter(Boolean).map(nameOf).join(' · ')}</div>}
          </div>
          {current
            ? <button className="btn ghost" onClick={() => removeFromList(p)}>{t('pls.removeFromList')}</button>
            : <button className="btn ghost" onClick={() => remove(p)}>{t('common.delete')}</button>}
        </div>
      ))}
    </div>
  );
}

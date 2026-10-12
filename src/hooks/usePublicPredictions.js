import { useEffect, useMemo, useState } from 'react';
import { doc, getDoc, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase.js';
import { useGames } from './useGames.js';
import { useBonusPicks } from './useBonusPicks.js';

/**
 * What ANY signed-in player may see of another player (same shape as predictions/{uid}):
 *  - FINISHED games: pointsDetail/{uid}.byGame (pick + points, written by the server)
 *  - LIVE games: picks/{gameId} (published at tip-off)
 *  - bonus answers of CLOSED questions: bonusPicks/{id}
 * Upcoming picks are never exposed (they only live in predictions/{uid}, owner/admin only).
 */
export function usePublicPredictions(uid, { bonus = true } = {}) {
  const { games } = useGames();
  const [base, setBase] = useState({ games: {}, jokers: {}, loading: true });
  const [live, setLive] = useState({ games: {}, jokers: {} });
  const bonusPicks = useBonusPicks(!!uid && bonus);

  useEffect(() => {
    if (!uid) return undefined;
    return onSnapshot(doc(db, 'pointsDetail', uid), (snap) => {
      const by = snap.data()?.byGame || {};
      const entries = Object.entries(by).filter(([, v]) => Number.isInteger(v.s1));
      setBase({
        games: Object.fromEntries(entries.map(([id, v]) => [id, { s1: v.s1, s2: v.s2, autoFilled: !!v.a }])),
        jokers: Object.fromEntries(entries.filter(([, v]) => v.j).map(([id]) => [id, true])),
        loading: false,
      });
    }, () => setBase({ games: {}, jokers: {}, loading: false }));
  }, [uid]);

  const liveIds = useMemo(() => games.filter((g) => g.status === 'live').map((g) => g.id).sort().join(','), [games]);
  useEffect(() => {
    if (!uid || !liveIds) { setLive({ games: {}, jokers: {} }); return undefined; }
    let cancelled = false;
    Promise.all(liveIds.split(',').map((id) => getDoc(doc(db, 'picks', id)).then((s) => [id, s.data()?.picks?.[uid]]).catch(() => [id, null])))
      .then((rows) => {
        if (cancelled) return;
        const g = {}; const j = {};
        rows.forEach(([id, p]) => { if (p) { g[id] = { s1: p.s1, s2: p.s2, autoFilled: !!p.autoFilled }; if (p.joker) j[id] = true; } });
        setLive({ games: g, jokers: j });
      });
    return () => { cancelled = true; };
  }, [uid, liveIds]);

  const bonusAnswers = useMemo(() => {
    const out = {};
    Object.entries(bonusPicks).forEach(([qid, picks]) => { const a = picks?.[uid]?.answer; if (a?.length) out[qid] = { answer: a }; });
    return out;
  }, [bonusPicks, uid]);

  return { games: { ...base.games, ...live.games }, jokers: { ...base.jokers, ...live.jokers }, bonus: bonusAnswers, loading: base.loading };
}

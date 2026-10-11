// Head to Head (Phase 6): pure rules. Used by the app to show standings/results LIVE from points/{uid}.byDay (game points only,
// bonus points never count) and by the admin tools. Day keys are "YYYY-MM-DD" (Israel date by default), windows are inclusive.

/** Tie-break order for a tied head-to-head (after points incl. any head start). 'seed' = the better (lower) seed wins. Editable by admin. */
export const DEFAULT_H2H_TIEBREAKERS = ['exactHits', 'uniqueHits', 'seed'];

/** A player's stats inside [from, to] from points.byDay = {day: [points, exact, unique]}. null = open end. */
export function windowStats(byDay, from = null, to = null) {
  let pts = 0; let exactHits = 0; let uniqueHits = 0;
  Object.entries(byDay || {}).forEach(([day, v]) => {
    if ((from && day < from) || (to && day > to)) return;
    const [p = 0, x = 0, u = 0] = Array.isArray(v) ? v : [];
    pts += p; exactHits += x; uniqueHits += u;
  });
  return { pts, exactHits, uniqueHits };
}

/**
 * One match. a / b: {stats:{pts,exactHits,uniqueHits}, seed:number|null, adv:number (head start)}. b may be null = bye.
 * -> {winner:'a'|'b'|null, scoreA, scoreB, reason}   (winner null = still tied after every tie-break: admin must decide)
 */
export function decideMatch({ a, b, tiebreakers = DEFAULT_H2H_TIEBREAKERS }) {
  if (!b) return { winner: 'a', scoreA: a.stats.pts + (a.adv || 0), scoreB: 0, reason: 'bye' };
  const scoreA = a.stats.pts + (a.adv || 0);
  const scoreB = b.stats.pts + (b.adv || 0);
  if (scoreA !== scoreB) return { winner: scoreA > scoreB ? 'a' : 'b', scoreA, scoreB, reason: 'points' };
  for (const k of tiebreakers) {
    if (k === 'seed') {
      if (a.seed == null || b.seed == null || a.seed === b.seed) continue;
      return { winner: a.seed < b.seed ? 'a' : 'b', scoreA, scoreB, reason: 'seed' };
    }
    const va = a.stats[k] ?? 0;
    const vb = b.stats[k] ?? 0;
    if (va !== vb) return { winner: va > vb ? 'a' : 'b', scoreA, scoreB, reason: k };
  }
  return { winner: null, scoreA, scoreB, reason: 'tie' };
}

/** Pair of a stage -> {winnerUid|null, scoreA, scoreB, reason, auto}. pair.winnerOverride ('a'|'b') or pair.winner (recorded at close) win over the computation. */
export function resolvePair(pair, statsOf, tiebreakers) {
  const side = (uid, seed, adv) => ({ stats: statsOf(uid), seed, adv });
  const a = side(pair.a, pair.seedA ?? null, pair.advA || 0);
  const b = pair.b ? side(pair.b, pair.seedB ?? null, pair.advB || 0) : null;
  const d = decideMatch({ a, b, tiebreakers });
  const forced = pair.winnerOverride === 'a' ? pair.a : pair.winnerOverride === 'b' ? pair.b : null;
  const winnerUid = forced || (d.winner === 'a' ? pair.a : d.winner === 'b' ? pair.b : null);
  return { winnerUid, scoreA: d.scoreA, scoreB: d.scoreB, reason: forced ? 'override' : d.reason, auto: !forced };
}

/** Group league table: members ordered by points, then exact hits, then unique hits, then name (stable). pos = strict order, rank = ties share. */
export function rankGroup(members, statsOf, nameOf = (u) => u) {
  const rows = members.map((uid) => ({ uid, ...statsOf(uid) }));
  const cmp = (x, y) => (y.pts - x.pts) || (y.exactHits - x.exactHits) || (y.uniqueHits - x.uniqueHits);
  rows.sort((x, y) => cmp(x, y) || String(nameOf(x.uid)).localeCompare(String(nameOf(y.uid)), 'he'));
  let rank = 0;
  return rows.map((r, i) => {
    const tiedWithPrev = i > 0 && cmp(rows[i - 1], r) === 0;
    if (!tiedWithPrev) rank = i + 1;
    return { ...r, pos: i + 1, rank, tied: tiedWithPrev || (i + 1 < rows.length && cmp(r, rows[i + 1]) === 0) };
  });
}

const groupIdOf = (i) => (i < 26 ? String.fromCharCode(65 + i) : `G${i + 1}`);

/** Random, balanced draw (sizes differ by at most 1). rng injectable for tests. -> {A:[uid..], B:[..]} */
export function drawGroups(uids, groupCount, rng = Math.random) {
  const a = [...uids];
  for (let i = a.length - 1; i > 0; i -= 1) { const j = Math.floor(rng() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  const out = {};
  for (let g = 0; g < groupCount; g += 1) out[groupIdOf(g)] = [];
  a.forEach((uid, i) => out[groupIdOf(i % groupCount)].push(uid));
  return out;
}

/** Seeds for the knockout: top `advancePerGroup` of each group table, ordered by position in group, then points, exact, unique. -> [{uid, seed}] */
export function seedQualifiers(tables, advancePerGroup) {
  const rows = [];
  Object.entries(tables).forEach(([g, table]) => table.slice(0, advancePerGroup).forEach((r) => rows.push({ ...r, g })));
  rows.sort((x, y) => (x.pos - y.pos) || (y.pts - x.pts) || (y.exactHits - x.exactHits) || (y.uniqueHits - x.uniqueHits) || x.g.localeCompare(y.g));
  return rows.map((r, i) => ({ uid: r.uid, seed: i + 1 }));
}

/** Standard bracket from seeds [{uid, seed}] (best vs worst). Odd count: the middle seed gets a bye. -> pairs keyed p1..pn */
export function pairSeeds(seeded) {
  const s = [...seeded].sort((x, y) => x.seed - y.seed);
  const pairs = {};
  const n = s.length;
  for (let i = 0; i < Math.floor(n / 2); i += 1) {
    pairs[`p${i + 1}`] = { a: s[i].uid, b: s[n - 1 - i].uid, seedA: s[i].seed, seedB: s[n - 1 - i].seed, advA: 0, advB: 0, winnerOverride: null, winner: null };
  }
  if (n % 2 === 1) {
    const mid = s[Math.floor(n / 2)];
    pairs[`p${Math.floor(n / 2) + 1}`] = { a: mid.uid, b: null, seedA: mid.seed, seedB: null, advA: 0, advB: 0, winnerOverride: null, winner: null };
  }
  return pairs;
}

/** Day before a day key. */
export const prevDayKey = (key) => { const d = new Date(`${key}T00:00:00Z`); d.setUTCDate(d.getUTCDate() - 1); return d.toISOString().slice(0, 10); };

/** The stage still open: highest stageNum with no endDay. stages is a MAP keyed by stage id (never an array + find). */
export function activeStageId(stages) {
  const open = Object.entries(stages || {}).filter(([, s]) => !s.endDay);
  if (open.length === 0) return null;
  return open.sort((x, y) => y[1].stageNum - x[1].stageNum)[0][0];
}

/**
 * Close the open stage and build the next one. results come from resolvePair (winnerUid must be set for every pair).
 * -> {error} | {finished:true, championUid, patch} | {patch, nextId}   patch = dotted-path update for h2hTournament/main (ONE atomic write).
 */
export function closeStagePatch(tournament, results, startDay) {
  const id = activeStageId(tournament.stages);
  if (!id) return { error: 'no-open-stage' };
  const stage = tournament.stages[id];
  const entries = Object.entries(stage.pairs || {});
  if (entries.length === 0) return { error: 'no-pairs' };
  if (entries.some(([pid]) => !results[pid]?.winnerUid)) return { error: 'unresolved' };

  const patch = { [`stages.${id}.endDay`]: prevDayKey(startDay) };
  entries.forEach(([pid]) => { patch[`stages.${id}.pairs.${pid}.winner`] = results[pid].winnerUid; });

  const seedOf = (pid, uid) => { const p = stage.pairs[pid]; return uid === p.a ? p.seedA : p.seedB; };
  const winners = entries.map(([pid]) => ({ uid: results[pid].winnerUid, seed: seedOf(pid, results[pid].winnerUid) ?? 999 }));
  if (entries.length === 1) { patch.status = 'finished'; patch.championUid = winners[0].uid; return { finished: true, championUid: winners[0].uid, patch }; }

  const nextId = `K${stage.stageNum + 1}`;
  patch[`stages.${nextId}`] = { stageNum: stage.stageNum + 1, startDay, endDay: null, pairs: pairSeeds(winners.map((w, i) => ({ uid: w.uid, seed: w.seed ?? i + 1 }))) };
  return { patch, nextId };
}

// Pure rules for turning a balldontlie game object into a Firestore game update (Phase 4). Unit-tested.
const isInt = (n) => Number.isInteger(n) && n >= 0;

/**
 * balldontlie game -> {apiGameId, status, s1, s2, ot, liveText, tipoff}.  home = s1/t1, visitor = s2/t2.
 * status: 'scheduled' | 'live' | 'finished' | 'cancelled' | null (null = postponed/delayed/suspended/unknown -> never touch our game).
 * s1/s2 are the FINAL score including OT (policy decided by owner).
 */
export function parseApiGame(g) {
  if (!g || !Number.isSafeInteger(g.id)) return null;
  let state = g.status_state;
  if (!state || state === 'unknown') {
    state = /final/i.test(String(g.status || '')) ? 'final' : (g.period > 0 ? 'in_progress' : 'scheduled');
  }
  const status = { final: 'finished', in_progress: 'live', scheduled: 'scheduled', canceled: 'cancelled' }[state] ?? null;

  const otSlots = [1, 2, 3].filter((i) => g[`home_ot${i}`] != null || g[`visitor_ot${i}`] != null).length;
  const ot = Math.max(otSlots, Math.max(0, (g.period || 0) - 4));

  let liveText = null;
  if (status === 'live') {
    const clock = String(g.time || '').trim();
    if (/half/i.test(String(g.status || ''))) liveText = 'Half';
    else if (g.period > 0) liveText = `${g.period <= 4 ? `Q${g.period}` : `OT${g.period - 4}`}${clock ? ` ${clock}` : ''}`;
  }
  const ms = g.datetime ? Date.parse(g.datetime) : NaN;
  return {
    apiGameId: g.id, status, ot,
    s1: isInt(g.home_team_score) ? g.home_team_score : null,
    s2: isInt(g.visitor_team_score) ? g.visitor_team_score : null,
    liveText, tipoff: Number.isNaN(ms) ? null : new Date(ms).toISOString(),
  };
}

/**
 * Decide what (if anything) to write to OUR game. Returns a patch of changed fields, or null.
 * cur: {status, s1, s2, ot, liveText, winner, t1, t2, tipoffMs, overridden, picksLocked}
 * Never touches manually overridden games (unless force), never moves a finished game back to live,
 * never finishes a game on a tie / missing score.
 */
export function planGameUpdate(cur, parsed, { nowMs = Date.now(), force = false } = {}) {
  if (!parsed || !parsed.status) return null;
  if (cur.overridden && !force) return null;
  const patch = {};
  const set = (k, v) => { if ((cur[k] ?? null) !== (v ?? null)) patch[k] = v; };

  switch (parsed.status) {
    case 'cancelled':
      if (cur.status === 'finished') return null;
      set('status', 'cancelled');
      break;
    case 'scheduled': {
      // schedule changes: only for a still-open game whose picks were not published yet, and only to a FUTURE time
      const ms = parsed.tipoff ? Date.parse(parsed.tipoff) : NaN;
      if (cur.status === 'scheduled' && !cur.picksLocked && !Number.isNaN(ms) && ms > nowMs && Math.abs(ms - cur.tipoffMs) > 60000) patch.tipoff = parsed.tipoff;
      break;
    }
    case 'live':
      if (cur.status === 'finished' || cur.status === 'cancelled') return null;
      if (!isInt(parsed.s1) || !isInt(parsed.s2)) return null;
      set('status', 'live'); set('s1', parsed.s1); set('s2', parsed.s2); set('ot', parsed.ot); set('liveText', parsed.liveText);
      break;
    case 'finished': {
      if (!isInt(parsed.s1) || !isInt(parsed.s2) || parsed.s1 === parsed.s2) return null;
      set('status', 'finished'); set('s1', parsed.s1); set('s2', parsed.s2); set('ot', parsed.ot); set('liveText', null);
      set('winner', parsed.s1 > parsed.s2 ? cur.t1 : cur.t2);
      break;
    }
    default:
      return null;
  }
  return Object.keys(patch).length ? patch : null;
}

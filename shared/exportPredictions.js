// EXTERNAL tool (not part of the app): export every player's pick for every game, for the admin. scripts/export-predictions.mjs reads Firestore with the
// Admin SDK and uses these pure functions to build the CSV files and the HTML page. The `db` is injected, so everything here is unit-tested.
import { TEAMS_BY_ABBR } from './teams.js';

const TZ = 'Asia/Jerusalem';
const ms = (v) => (v?.toMillis ? v.toMillis() : typeof v === 'number' ? v : null);
const byName = (a, b) => String(a.name || '').localeCompare(String(b.name || ''), 'he') || String(a.uid).localeCompare(String(b.uid));

/** Israel date ('2026-11-03') and time ('19:42') of an instant. */
export function israelDateTime(tipoffMs) {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-GB', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date(tipoffMs)).map((x) => [x.type, x.value]));
  return { date: `${p.year}-${p.month}-${p.day}`, time: `${p.hour}:${p.minute}` };
}

/** Reads the collections once. db = anything with collection(name).get() -> {docs: [{id, data()}]} (the Admin SDK Firestore, or a fake in tests). */
export async function loadExportData(db) {
  const [g, p, u, parts, pts] = await Promise.all(['games', 'predictions', 'users', 'participants', 'points'].map((c) => db.collection(c).get()));
  const games = g.docs.map((d) => { const x = d.data(); return { id: d.id, round: x.round, status: x.status, t1: x.t1, t2: x.t2, tipoffMs: ms(x.tipoff), s1: x.s1 ?? null, s2: x.s2 ?? null }; });
  const paid = new Set(parts.docs.map((d) => d.data()).filter((x) => x.claimedBy && x.paid === true).map((x) => x.claimedBy));
  const adminFlag = new Set(pts.docs.filter((d) => d.data().isAdmin === true).map((d) => d.id));
  const preds = new Map(p.docs.map((d) => [d.id, d.data()]));
  const players = u.docs.map((d) => {
    const x = d.data();
    const pr = preds.get(d.id) || {};
    return {
      uid: d.id, name: x.name || '', blocked: x.blocked === true, isAdmin: x.isAdmin === true || adminFlag.has(d.id), paid: paid.has(d.id),
      picks: Object.fromEntries(Object.entries(pr.games || {}).map(([gid, v]) => [gid, { s1: v.s1, s2: v.s2, auto: v.autoFilled === true, savedMs: ms(v.updatedAt) }])),
      jokers: pr.jokers || {},
    };
  });
  return { games, players };
}

const L = {
  he: {
    date: 'תאריך', time: 'שעה', home: 'בית', away: 'חוץ', status: 'סטטוס', result: 'תוצאה', player: 'שחקן', pickHome: 'ניחוש בית', pickAway: 'ניחוש חוץ', joker: 'ג׳וקר', auto: 'אוטומטי', saved: 'נשמר ב',
    st: { scheduled: 'מתוכנן', live: 'חי', finished: 'הסתיים' }, yes: 'כן', legend: 'J = ג׳וקר · A = ניחוש אוטומטי', title: 'ניחושי השחקנים', teamKey: 'shortHe', searchGame: 'חיפוש משחק או תאריך…', searchUser: 'חיפוש שחקן…',
  },
  en: {
    date: 'Date', time: 'Time', home: 'Home', away: 'Away', status: 'Status', result: 'Result', player: 'Player', pickHome: 'Home pick', pickAway: 'Away pick', joker: 'Joker', auto: 'Auto-filled', saved: 'Saved at',
    st: { scheduled: 'Scheduled', live: 'Live', finished: 'Finished' }, yes: 'Yes', legend: 'J = joker · A = auto-filled pick', title: 'Players\' predictions', teamKey: 'shortEn', searchGame: 'Search a game or date…', searchUser: 'Search a player…',
  },
};

/**
 * Chooses what to export. Default: games that have ALREADY started (not cancelled), and the players (not admins) who are paid or have a pick in them.
 * opts: from / to = 'YYYY-MM-DD' (Israel date of the game), future = include games that have not started (the admin can see those picks; do not share them),
 * allUsers = every registered player, lang = 'he' | 'en', nowMs.
 */
export function selectData(data, { from = null, to = null, future = false, allUsers = false, lang = 'he', nowMs = Date.now() } = {}) {
  const T = L[lang] || L.he;
  const team = (abbr) => TEAMS_BY_ABBR[abbr]?.[T.teamKey] || abbr || '';
  const games = data.games
    .filter((g) => g.status !== 'cancelled' && g.tipoffMs && (future || g.tipoffMs <= nowMs))
    .map((g) => ({ ...g, ...israelDateTime(g.tipoffMs) }))
    .filter((g) => (!from || g.date >= from) && (!to || g.date <= to))
    .sort((a, b) => a.tipoffMs - b.tipoffMs)
    .map((g) => ({ ...g, homeName: team(g.t1), awayName: team(g.t2), statusText: T.st[g.status] || g.status, resultText: Number.isInteger(g.s1) && Number.isInteger(g.s2) && g.status !== 'scheduled' ? `${g.s1}-${g.s2}` : '' }));
  const ids = new Set(games.map((g) => g.id));
  const players = data.players.filter((p) => !p.isAdmin && (allUsers || p.paid || Object.keys(p.picks).some((id) => ids.has(id)))).sort(byName);
  return { games, players, lang: L[lang] ? lang : 'he' };
}

/** One cell: "110-102", "110-102 J" (joker), "110-102 A" (auto-filled), '' = no pick. */
export function pickCell(player, game) {
  const k = player.picks[game.id];
  if (!k || !Number.isInteger(k.s1) || !Number.isInteger(k.s2)) return '';
  return `${k.s1}-${k.s2}${player.jokers[game.id] ? ' J' : ''}${k.auto ? ' A' : ''}`;
}

/** Matrix: a row per game, a column per player. */
export function buildMatrix(sel) {
  const T = L[sel.lang];
  const head = [T.date, T.time, T.home, T.away, T.status, T.result, ...sel.players.map((p) => p.name)];
  return [head, ...sel.games.map((g) => [g.date, g.time, g.homeName, g.awayName, g.statusText, g.resultText, ...sel.players.map((p) => pickCell(p, g))])];
}

/** Long format: a row per (game, player) that HAS a pick. */
export function buildLong(sel) {
  const T = L[sel.lang];
  const rows = [[T.date, T.time, T.home, T.away, T.status, T.result, T.player, T.pickHome, T.pickAway, T.joker, T.auto, T.saved]];
  sel.games.forEach((g) => sel.players.forEach((p) => {
    const k = p.picks[g.id];
    if (!k || !Number.isInteger(k.s1) || !Number.isInteger(k.s2)) return;
    rows.push([g.date, g.time, g.homeName, g.awayName, g.statusText, g.resultText, p.name, k.s1, k.s2, p.jokers[g.id] ? T.yes : '', k.auto ? T.yes : '', k.savedMs ? new Date(k.savedMs).toISOString() : '']);
  }));
  return rows;
}

/** CSV for Excel: UTF-8 with a BOM (Hebrew), CRLF, quotes escaped, and a leading = + @ is neutralised (a spreadsheet would run it as a formula). */
export function toCsv(rows) {
  const cell = (v) => {
    let s = v === null || v === undefined ? '' : String(v);
    if (/^[=+@]/.test(s)) s = `'${s}`;
    return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return `\uFEFF${rows.map((r) => r.map(cell).join(',')).join('\r\n')}\r\n`;
}

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/** One self-contained HTML page (no internet needed): the matrix with a search for games and for players. */
export function renderHtml(sel, { generatedAt = new Date() } = {}) {
  const T = L[sel.lang];
  const rows = buildMatrix(sel);
  const dir = sel.lang === 'he' ? 'rtl' : 'ltr';
  const th = rows[0].map((h, i) => `<th${i >= 6 ? ' class="u"' : ''}>${esc(h)}</th>`).join('');
  const body = rows.slice(1).map((r) => `<tr>${r.map((c, i) => (i < 6 ? `<td>${esc(c)}</td>` : `<td class="u pk${/ J/.test(c) ? ' j' : ''}${/ A$/.test(c) ? ' a' : ''}" dir="ltr">${esc(c)}</td>`)).join('')}</tr>`).join('');
  return `<!doctype html>
<html lang="${sel.lang}" dir="${dir}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${esc(T.title)}</title>
<style>
body{font-family:system-ui,Arial,sans-serif;margin:1rem;color:#1b2333;background:#f6f7fb}h1{font-size:1.2rem;margin:.2rem 0}.meta{color:#667;font-size:.85rem;margin-bottom:.6rem}
.tools{display:flex;gap:.6rem;flex-wrap:wrap;margin-bottom:.6rem}input{padding:.45rem .6rem;border:1px solid #bcc3d4;border-radius:8px;font:inherit}
.wrap{overflow:auto;max-height:80vh;background:#fff;border:1px solid #dde1ec;border-radius:10px}table{border-collapse:collapse;font-size:.85rem}th,td{padding:.35rem .55rem;border-bottom:1px solid #eceff6;white-space:nowrap;text-align:start}
thead th{position:sticky;top:0;background:#eef1f8;z-index:2}.u{text-align:center}.pk{font-variant-numeric:tabular-nums}.pk.j{background:#fff3cf;font-weight:700}.pk.a{color:#99a;font-style:italic}tr:hover td{background:#f3f6ff}
</style></head><body>
<h1>${esc(T.title)}</h1><div class="meta">${esc(T.legend)} · ${sel.games.length} / ${sel.players.length} · ${esc(generatedAt.toISOString().slice(0, 16).replace('T', ' '))} UTC</div>
<div class="tools"><input id="g" placeholder="${esc(T.searchGame)}"><input id="p" placeholder="${esc(T.searchUser)}"></div>
<div class="wrap"><table id="t"><thead><tr>${th}</tr></thead><tbody>${body}</tbody></table></div>
<script>
const t=document.getElementById('t');const f=()=>{const g=document.getElementById('g').value.trim().toLowerCase();const p=document.getElementById('p').value.trim().toLowerCase();
[...t.tBodies[0].rows].forEach(r=>{r.style.display=!g||[...r.cells].slice(0,6).some(c=>c.textContent.toLowerCase().includes(g))?'':'none'});
const heads=[...t.tHead.rows[0].cells];heads.forEach((h,i)=>{if(i<6)return;const show=!p||h.textContent.toLowerCase().includes(p);h.style.display=show?'':'none';[...t.tBodies[0].rows].forEach(r=>{r.cells[i].style.display=show?'':'none'})})};
document.getElementById('g').oninput=f;document.getElementById('p').oninput=f;
</script></body></html>`;
}

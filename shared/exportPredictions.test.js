import { describe, it, expect } from 'vitest';
import { buildLong, buildMatrix, israelDateTime, loadExportData, pickCell, renderHtml, selectData, toCsv } from './exportPredictions.js';

const ts = (iso) => ({ toMillis: () => Date.parse(iso) });
const NOW = Date.parse('2026-11-04T12:00:00Z');
const fakeDb = (store) => ({ collection: (n) => ({ get: async () => ({ docs: Object.entries(store[n] || {}).map(([id, d]) => ({ id, data: () => d })) }) }) });

const store = {
  games: {
    g1: { round: 'RS', status: 'finished', t1: 'BOS', t2: 'NYK', s1: 110, s2: 102, tipoff: ts('2026-11-03T17:42:00Z') }, // 19:42 Israel (winter time)
    g2: { round: 'RS', status: 'live', t1: 'LAL', t2: 'GSW', s1: 50, s2: 48, tipoff: ts('2026-11-04T11:30:00Z') },
    g3: { round: 'RS', status: 'scheduled', t1: 'MIA', t2: 'DEN', tipoff: ts('2026-11-06T01:00:00Z') }, // has not started
    g4: { round: 'RS', status: 'cancelled', t1: 'MIA', t2: 'DEN', tipoff: ts('2026-11-02T01:00:00Z') },
  },
  users: {
    u1: { name: 'דן כהן' }, u2: { name: 'Arik Safran' }, u3: { name: '=cmd' }, u4: { name: 'Admin Person', isAdmin: true }, u5: { name: 'Lonely unpaid' }, u6: { name: '<b>Evil</b>' },
  },
  participants: { p1: { claimedBy: 'u1', paid: true }, p2: { claimedBy: 'u2', paid: true }, p3: { claimedBy: 'u3', paid: true }, p5: { claimedBy: 'u5', paid: false } },
  points: { u4: { isAdmin: true } },
  predictions: {
    u1: { games: { g1: { s1: 108, s2: 100, updatedAt: ts('2026-11-03T10:00:00Z') }, g2: { s1: 99, s2: 97 }, g3: { s1: 120, s2: 110 } }, jokers: { g1: true } },
    u2: { games: { g1: { s1: 101, s2: 99, autoFilled: true } } },
    u4: { games: { g1: { s1: 1, s2: 2 } } },
    u6: { games: { g1: { s1: 90, s2: 91 } } }, // unpaid, but has a pick
  },
};

describe('export of the predictions (external tool)', () => {
  it('Israel date and time (winter time is UTC+2)', () => {
    expect(israelDateTime(Date.parse('2026-11-03T17:42:00Z'))).toEqual({ date: '2026-11-03', time: '19:42' });
    expect(israelDateTime(Date.parse('2026-11-03T23:30:00Z'))).toEqual({ date: '2026-11-04', time: '01:30' }); // after midnight = the next day
  });

  it('loads the picks, jokers, paid and admin flags', async () => {
    const d = await loadExportData(fakeDb(store));
    expect(d.games).toHaveLength(4);
    const u1 = d.players.find((p) => p.uid === 'u1');
    expect(u1).toMatchObject({ name: 'דן כהן', paid: true, isAdmin: false, jokers: { g1: true } });
    expect(u1.picks.g1).toMatchObject({ s1: 108, s2: 100, auto: false });
    expect(d.players.find((p) => p.uid === 'u2').picks.g1.auto).toBe(true);
    expect(d.players.find((p) => p.uid === 'u4').isAdmin).toBe(true);
  });

  it('default: only games that have started, no cancelled game, no admin; paid players and anyone with a pick', async () => {
    const sel = selectData(await loadExportData(fakeDb(store)), { nowMs: NOW });
    expect(sel.games.map((g) => g.id)).toEqual(['g1', 'g2']); // g3 has not started, g4 is cancelled
    expect(sel.players.map((p) => p.uid).sort()).toEqual(['u1', 'u2', 'u3', 'u6']); // admin u4 and the unpaid player without a pick u5 are out; u6 stays: he has a pick
    expect(selectData(await loadExportData(fakeDb(store)), { nowMs: NOW, allUsers: true }).players.map((p) => p.uid)).toContain('u5');
  });

  it('--future also gives the games that have not started; --from / --to filter by the Israel date', async () => {
    const data = await loadExportData(fakeDb(store));
    expect(selectData(data, { nowMs: NOW, future: true }).games.map((g) => g.id)).toEqual(['g1', 'g2', 'g3']);
    expect(selectData(data, { nowMs: NOW, from: '2026-11-04' }).games.map((g) => g.id)).toEqual(['g2']);
    expect(selectData(data, { nowMs: NOW, to: '2026-11-03' }).games.map((g) => g.id)).toEqual(['g1']);
  });

  it('a cell: the pick, J for a joker, A for an auto-filled pick, empty without a pick', async () => {
    const data = await loadExportData(fakeDb(store));
    const [u1, u2] = ['u1', 'u2'].map((id) => data.players.find((p) => p.uid === id));
    expect(pickCell(u1, { id: 'g1' })).toBe('108-100 J');
    expect(pickCell(u2, { id: 'g1' })).toBe('101-99 A');
    expect(pickCell(u2, { id: 'g2' })).toBe('');
  });

  it('matrix: a row per game, a column per player (Hebrew team names, result of finished and live games)', async () => {
    const sel = selectData(await loadExportData(fakeDb(store)), { nowMs: NOW });
    const m = buildMatrix(sel);
    expect(m[0].slice(0, 6)).toEqual(['תאריך', 'שעה', 'בית', 'חוץ', 'סטטוס', 'תוצאה']);
    expect(m[0].slice(6)).toEqual(sel.players.map((p) => p.name));
    expect(m[1].slice(0, 6)).toEqual(['2026-11-03', '19:42', 'בוסטון', 'ניו יורק', 'הסתיים', '110-102']);
    expect(m[2][5]).toBe('50-48'); // a live game shows the current score
    const col = m[0].indexOf('דן כהן');
    expect(m[1][col]).toBe('108-100 J');
    expect(m[2][col]).toBe('99-97');
  });

  it('long format: only the picks that exist', async () => {
    const sel = selectData(await loadExportData(fakeDb(store)), { nowMs: NOW });
    const rows = buildLong(sel);
    expect(rows.length - 1).toBe(4); // u1: g1 + g2, u2: g1, u6: g1 (u3 has none; g3 is not exported)
    const dan = rows.find((r) => r[6] === 'דן כהן' && r[2] === 'בוסטון');
    expect(dan.slice(7, 11)).toEqual([108, 100, 'כן', '']);
    expect(dan[11]).toBe('2026-11-03T10:00:00.000Z');
  });

  it('English labels', async () => {
    const m = buildMatrix(selectData(await loadExportData(fakeDb(store)), { nowMs: NOW, lang: 'en' }));
    expect(m[0].slice(0, 6)).toEqual(['Date', 'Time', 'Home', 'Away', 'Status', 'Result']);
    expect(m[1][2]).toBe('Boston');
  });

  it('CSV: BOM, CRLF, quotes escaped, a leading = is neutralised', () => {
    const csv = toCsv([['a', 'b,c', 'he said "hi"'], ['=cmd', 'line\nbreak', 5]]);
    expect(csv.startsWith('\uFEFF')).toBe(true);
    expect(csv).toContain('a,"b,c","he said ""hi"""\r\n');
    expect(csv).toContain("'=cmd");
    expect(csv).toContain('"line\nbreak"');
  });

  it('HTML: names are escaped (no injected markup), jokers and auto-filled picks are marked', async () => {
    const html = renderHtml(selectData(await loadExportData(fakeDb(store)), { nowMs: NOW }), { generatedAt: new Date('2026-11-04T12:00:00Z') });
    expect(html).not.toContain('<b>Evil</b>');
    expect(html).toContain('&lt;b&gt;Evil&lt;/b&gt;');
    expect(html).toContain('class="u pk j"');
    expect(html).toContain('class="u pk a"');
    expect(html).toContain('<html lang="he" dir="rtl">');
  });
});

// The prepared candidate lists for the 2026-27 bonus questions (owner's lists). Loaded with ONE click in Admin -> Bonus -> Players.
// Names are one language (English) for every user. Players have no team (trades!); coaches carry the team they coach.
import { normalizeName } from './names.js';

const P = (name, team = null) => ({ name, team });
const OTHER = P('Other');

export const CANDIDATE_LISTS = [
  { listId: 'mvp', entries: [P('Shai Gilgeous-Alexander'), P('Nikola Jokic'), P('Luka Doncic'), P('Victor Wembanyama'), P('Giannis Antetokounmpo'), P('Anthony Edwards'), P('Cade Cunningham'), P('Kawhi Leonard'), P('Jalen Brunson'), OTHER] },
  { listId: 'coaches', entries: [P('Darko Rajaković', 'TOR'), P('Joe Mazzulla', 'BOS'), P('Mike Brown', 'NYK'), P('Nick Nurse', 'PHI'), P('J.B. Bickerstaff', 'DET'), P('Kenny Atkinson', 'CLE'), P('Erik Spoelstra', 'MIA'), P('David Adelman', 'DEN'), P('Chris Finch', 'MIN'), P('Mark Daigneault', 'OKC'), P('JJ Redick', 'LAL'), P('Mitch Johnson', 'SAS'),
    // the other 18 head coaches (2026-27; Wikipedia list updated to June 23, 2026 + NBA.com "new coaches" article): all 30 teams are covered
    P('Quin Snyder', 'ATL'), P('Jordi Fernández', 'BKN'), P('Charles Lee', 'CHA'), P('Tiago Splitter', 'CHI'), P('Rick Carlisle', 'IND'), P('Taylor Jenkins', 'MIL'), P('Sean Sweeney', 'ORL'), P('Brian Keefe', 'WAS'),
    P('Dusty May', 'DAL'), P('Steve Kerr', 'GSW'), P('Ime Udoka', 'HOU'), P('Tyronn Lue', 'LAC'), P('Tuomas Iisalo', 'MEM'), P('Jamahl Mosley', 'NOP'), P('Jordan Ott', 'PHX'), P('Micah Nori', 'POR'), P('Doug Christie', 'SAC'), P('Will Hardy', 'UTA'),
    OTHER] },
  { listId: 'roy', entries: [P('Cameron Boozer'), P('Caleb Wilson'), P('Darryn Peterson'), P('AJ Dybantsa'), P('Darius Acuff'), P('Mikel Brown'), P('Keaton Wagler'), P('Kingston Flemings'), P('Morez Johnson'), P('Yaxel Lendeborg'), OTHER] },
  { listId: 'defense', entries: [P('Victor Wembanyama'), P('Giannis Antetokounmpo'), P('Anthony Edwards'), P('Amen Thompson'), P('Kawhi Leonard'), P('Ausar Thompson'), P('Chet Holmgren'), P('Evan Mobley'), P('Rudy Gobert'), OTHER] },
  { listId: 'scoring', entries: [P('Shai Gilgeous-Alexander'), P('Nikola Jokic'), P('Luka Doncic'), P('Victor Wembanyama'), P('Giannis Antetokounmpo'), P('Anthony Edwards'), P('Cade Cunningham'), P('Jayson Tatum'), P('Jalen Brunson'), OTHER] },
  { listId: 'rebounds', entries: [P('Nikola Jokic'), P('Luka Doncic'), P('Victor Wembanyama'), P('Giannis Antetokounmpo'), P('Karl-Anthony Towns'), P('Domantas Sabonis'), P('Rudy Gobert'), P('Anthony Davis'), OTHER] },
  { listId: 'assists', entries: [P('Nikola Jokic'), P('Luka Doncic'), P('Trae Young'), P('Tyrese Haliburton'), P('Shai Gilgeous-Alexander'), P('Giannis Antetokounmpo'), P('LaMelo Ball'), P('Cade Cunningham'), P('Jalen Brunson'), OTHER] },
  { listId: 'steals', entries: [P('Cason Wallace'), P('Ausar Thompson'), P('Amen Thompson'), P('Dyson Daniels'), P('Shai Gilgeous-Alexander'), P('Giannis Antetokounmpo'), P('Victor Wembanyama'), P('Tyrese Maxey'), P('Kawhi Leonard'), P('Anthony Edwards'), P('Chet Holmgren'), P('Evan Mobley'), OTHER] },
  { listId: 'blocks', entries: [P('Giannis Antetokounmpo'), P('Victor Wembanyama'), P('Chet Holmgren'), P('Evan Mobley'), P('Walker Kessler'), P('Donovan Clingan'), P('Anthony Davis'), P('Jaren Jackson Jr.'), OTHER] },
];

/**
 * What to write so the people of `lists` ([{listId, entries:[{name, team}]}]) exist and sit in their lists. existing = the current players.
 * A person is the same when name (ignoring case/spaces) + team match: he is created ONCE however many lists he is in, and an existing person
 * only gets the missing lists. Running it again changes nothing. -> {creates: [{name, team, listIds}], updates: [{id, add: [listIds]}]}
 */
export function planBulkImport(existing, lists) {
  const key = (name, team) => `${normalizeName(name)}|${team || ''}`;
  const pool = new Map();
  existing.forEach((p) => {
    const k = key(p.name, p.team);
    if (!pool.has(k)) pool.set(k, { id: p.id, name: p.name, team: p.team ?? null, base: new Set(p.listIds || []), listIds: new Set(p.listIds || []) });
  });
  lists.forEach(({ listId, entries }) => entries.forEach(({ name, team }) => {
    const k = key(name, team);
    if (!pool.has(k)) pool.set(k, { id: null, name, team: team || null, base: new Set(), listIds: new Set() });
    pool.get(k).listIds.add(listId);
  }));
  const creates = [];
  const updates = [];
  pool.forEach((p) => {
    if (p.id === null) creates.push({ name: p.name, team: p.team, listIds: [...p.listIds] });
    else { const add = [...p.listIds].filter((l) => !p.base.has(l)); if (add.length) updates.push({ id: p.id, add }); }
  });
  return { creates, updates };
}

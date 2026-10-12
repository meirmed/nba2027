// Rough Firestore usage / cost model for the league. Change the assumptions below and run:  node scripts/estimate-cost.mjs
// Prices (Firestore Standard, us-central1, checked 2026-10): reads $0.03 / 100k, writes $0.09 / 100k, free per day: 50k reads, 20k writes.
// Other regions (e.g. Tel Aviv) cost somewhat more per unit: the output shows the US price and a x2 upper bound.
const A = {
  players: 60,
  games: 1235,                 // games in the app at the END of the season (the number grows during the season)
  sessionsPerPlayerPerDay: 4,  // times a player opens the app from a cold start
  teams: 30, bonusQuestions: 25, otherDocsPerSession: 8, // settings, my predictions, my profile, tournament...
  gameNightsGames: 7,          // games per day
  liveMinutesPerGame: 150,     // the poller updates a live game about once a minute
  playersOnlineDuringGames: 25,
  priceReadsPer100k: 0.03, priceWritesPer100k: 0.09, freeReads: 50000, freeWrites: 20000,
};

const perSession = A.games + A.players + A.teams + A.bonusQuestions + A.otherDocsPerSession;
const sessionReads = A.players * A.sessionsPerPlayerPerDay * perSession;
const liveGameUpdates = A.gameNightsGames * A.liveMinutesPerGame;                  // game doc writes by the poller
const liveReads = liveGameUpdates * A.playersOnlineDuringGames;                    // each connected client receives each change as a read
const pointsPushReads = A.gameNightsGames * (A.players * 2) * A.playersOnlineDuringGames / 2; // points docs rewritten at each finished game, pushed to listeners
const serverReads = A.gameNightsGames * (A.games + A.players * 2 + A.bonusQuestions) + A.gameNightsGames * 130 /* lock + auto-fill */ + A.gameNightsGames * 15 * A.liveMinutesPerGame / 4 /* poller candidate reads */;
const reads = sessionReads + liveReads + pointsPushReads + serverReads;
const writes = liveGameUpdates + A.gameNightsGames * A.players * 2 + A.players * A.gameNightsGames /* saved picks */ + 200 /* misc */;

const money = (r, w, k = 1) => (Math.max(0, r - A.freeReads) / 1e5 * A.priceReadsPer100k + Math.max(0, w - A.freeWrites) / 1e5 * A.priceWritesPer100k) * k;
const line = (n, v) => console.log(`${n.padEnd(46)}${Math.round(v).toLocaleString('en-US').padStart(10)}`);
console.log('--- Firestore document operations per day at the END of the season (peak) ---');
line('reads: apps starting (listeners attach)', sessionReads);
line('reads: live score updates pushed to players', liveReads);
line('reads: points updates pushed to players', pointsPushReads);
line('reads: server (scoring, lock, poller)', serverReads);
line('READS total', reads);
line('WRITES total', writes);
console.log(`free allowance per day: ${A.freeReads.toLocaleString('en-US')} reads, ${A.freeWrites.toLocaleString('en-US')} writes`);
console.log(`estimated cost per day / month at US price : $${money(reads, writes).toFixed(2)} / $${(money(reads, writes) * 30).toFixed(2)}`);
console.log(`upper bound (x2 price, e.g. other regions)  : $${money(reads, writes, 2).toFixed(2)} / $${(money(reads, writes, 2) * 30).toFixed(2)}`);
const early = (g) => A.players * A.sessionsPerPlayerPerDay * (g + A.players + A.teams + A.bonusQuestions + A.otherDocsPerSession);
console.log(`reads/day from app starts with 100 games in the app: ${Math.round(early(100)).toLocaleString('en-US')}  (free allowance covers it)`);
console.log(`biggest lever: the app reads ALL games at start = ${Math.round(100 * A.games / perSession)}% of session reads`);

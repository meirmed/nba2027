# HANDOFF_SUMMARY_4 — Phase 3 (Scoring, leaderboard, reconciliation)

## Scoring rules (owner-approved; all editable in Admin -> Scoring, stored in `appSettings/main.scoring`)
- Correct winner **5**. Exact score **+7** (added to winner points => 12) and an exact score gets **NO** margin bonus.
- Margin closeness (winner correct, not exact), error = |pred margin - real margin|: <=1 **+4**, <=2 **+3**, <=3 **+2**, <=4 **+1**.
- Unique bonus **5**: exactly one NON-auto-filled exact pick on the game. Auto-filled picks never earn it (and don't block a manual unique).
- Risk bonus: winner correct and <=10% of ALL picks on that game chose that winner (inclusive). **Points = 2 is a PLACEHOLDER (owner hasn't given it).**
- Joker x2 multiplies the whole game total; round multipliers (RS=1); auto-fill x0.5 floored (Phase 7 creates auto-filled picks). Final score incl. OT counts; ties impossible.
- Only games whose round is in `appSettings.countedRounds` (default `['RS']`) and status `finished` count.
- Tiebreakers: total -> exactHits -> uniqueHits -> bonus (editable order).

## Built
- `shared/standings.js` `computeAllPoints` (+ `rankRows`) — the ONE source of truth for every total; `shared/scoring.js` `scoreGame` per pick. 52 tests.
- Functions: `onGameUpdated` (Firestore trigger; recompute all when a finished game's status/score/round/teams change; ignores picksLockedAt-only writes), `recalcAll` (admin callable, audited), `reconcilePoints` (admin callable: stored vs recomputed; expect 0 mismatches). Recompute is full + idempotent (`functions/lib/recalc.js`), `mergeFields` replaces fields whole.
- Client: Leaderboard (Total / Game points / Statistics, ranks with ties, highlights me), My Points (points per game, my total + rank), Admin -> Scoring (every value, margin tiers, round multipliers, tiebreaker order, Save / Recalculate all / Run reconciliation; jokers-per-season locks once `seasonStarted`), Rules page shows the new rule notes.

## DB
- `points/{uid}`: + `riskHits`; `gameHits === winnerCorrect`; `total = gamePts + bonus` (bonus owned by Phase 5).
- NEW `pointsDetail/{uid}`: `{byGame:{gameId:{pts,w,x,u,r,d}}, updatedAt}` — owner/admin read only (rules updated).

## Known issues / notes
- Two games finishing within seconds can race (each trigger recomputes from raw data; last write wins). Next event or "Recalculate all" fixes it; "Run reconciliation" detects it.
- No provisional (live) points yet. No per-period (weekly/monthly) leaderboard tab yet — needs the period design with H2H (Phase 6).
- After changing scoring values in Admin: press "Recalculate all points".
- Deploy needs functions + firestore rules.

## Update: "Everyone's picks" shows why each user got points
- `shared/standings.js` now exports `scoreGamePicks` (the per-game rule application); `computeAllPoints` uses it too. The Everyone's-picks table runs the SAME function on `picks/{gameId}` to show chips (unique, exact, winner, diff +N, risk, auto) and the game total per user, only for finished, counted games. No extra reads and no new fields.
- Behaviour of the saved totals is unchanged (52 -> 54 tests); redeploying functions is optional but keeps `functions/shared` byte-identical with the client.

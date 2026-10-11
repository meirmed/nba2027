# HANDOFF_SUMMARY_7 — Phase 6 (Head to Head)

## Owner decisions
- H2H runs from day 1 of the regular season. Three parts: **Group league** (players split into groups, top X advance), **Knockout**, **Pairs for fun**.
- No pre-defined stage lengths: the admin closes a stage when he wants and picks the start day of the next one.
- Bonus points never count in H2H (only game points). Tie rule: "same as the World Cup" — NOT known to the assistant; implemented as a configurable order (default exact hits -> unique hits -> better seed -> admin decides). **Owner to confirm / adjust in Admin -> H2H.**
- Exact numbers (players, groups, advancing) are decided after registration closes: the admin sets them in the setup form.
- Reminder (owner asked): the **ranking** bonus question type is still reserved/unspecified.

## Interpretations to confirm
1. "First X advance" = top X **of each group** (editable any time while the league runs; the close-league screen lets the admin tick/untick qualifiers).
2. League table = each player's game points (then exact, unique hits) from the league start day until the league is closed. (No round-robin mini-matches inside a group.)
3. Knockout seeding: group winners first, then runners-up...; bracket = best vs worst seed; odd count -> middle seed gets a bye. Winners are re-paired by original seed each stage.
4. Head start (`advA/advB`) is 0 unless the admin sets it per pair.

## Data
- `points/{uid}.byDay`: `{ 'YYYY-MM-DD': [gamePoints, exactHits, uniqueHits] }` (Israel date by default = `appSettings.timezone`). Written by `recalcAllPoints`; reconciled. After deploying, press Admin -> Scoring -> **Recalculate all points** once. If the timezone setting changes, recalculate again.
- `h2hTournament/main`: `{status: league|knockout|finished, groupsCount, advancePerGroup, tiebreakers[], league:{startDay,endDay,groups:{A:{members:[uid]}}}, stages:{K1:{stageNum,startDay,endDay,pairs:{p1:{a,b,seedA,seedB,advA,advB,winnerOverride,winner}}}}, championUid}` — stages and pairs are MAPS keyed by id (no array find). Closing a stage is ONE transaction (`closeStagePatch`).
- `h2h/{id}`: pairs for fun `{user1,user2,label,from,to,createdAt}`.

## Built
- `shared/h2h.js` (+15 tests): `windowStats`, `decideMatch`, `resolvePair`, `rankGroup`, `drawGroups`, `seedQualifiers`, `pairSeeds`, `closeStagePatch`, `activeStageId`.
- Pages: H2H (3 tabs, RTL like the World Cup screenshot), Admin -> H2H (TournamentManager, FunPairsManager). Every admin write is audited.
- Functions: `recalcAllPoints` now also writes `byDay`; `reconcileAll` compares it. **Redeploy functions.**

## Deploy
`firebase deploy --only functions`, push the app, then Admin -> Scoring -> Recalculate all points.

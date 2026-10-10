# HANDOFF_SUMMARY_3 — Phase 2 (Predictions)

## Built
- **Games predictions tab** (`src/pages/predictions/GamesTab.jsx`, `GameCard.jsx`): day-by-day browsing (prev/next day that has games, "Today"), edits staged locally and sent in ONE `savePredictions` call, per-game rejection reasons, countdown to lock, jokers (3 per season, limit from `useScoring().jokersPerSeason`), locked games show my pick + result + **Everyone's picks** (`components/EveryonesPicks.jsx`).
- **Cloud Functions**: `savePredictions` (callable; the only way to write picks; server-time lock inside a transaction; merge-set on map keys, per-entry `updatedAt`; clears `autoFilled`), `lockGamePicks` (every minute; for games tipped off in the last 30 min writes `picks/{gameId}` and sets `games/{id}.picksLockedAt`).
- **Shared rules** `shared/predictions.js` (`planSave`, `gameOpenReason`) + 10 tests. Rules: scores integers 0-200, ties rejected, game must be `scheduled`, in `countedRounds`, both teams set, tip-off in the future; joker needs a pick, max `jokersPerSeason`, can't add/remove after tip-off, swaps allowed in one request.
- One shared listener each for games (`GamesContext`) and my predictions (`MyPredictionsContext`).
- **My Points** page skeleton (my pick vs result; points arrive in Phase 3).

## DB
- `predictions/{uid}`: `games.{gameId}: {s1,s2,updatedAt,autoFilled?}`, `jokers.{gameId}: true`, `updatedAt`. Client reads own doc; client writes denied by rules.
- `picks/{gameId}`: `{gameId, lockedAt, count, picks:{uid:{name,s1,s2,joker,autoFilled}}}` (written only by `lockGamePicks`).
- `games.picksLockedAt` (set by `lockGamePicks`; Phase 3 `onGameUpdated` must ignore changes that only touch this field).

## Known issues / notes
- Lock granularity: `lockGamePicks` runs each minute, so "Everyone's picks" appears up to ~1 min after tip-off (UI says "visible in a moment"). The pick lock itself is exact (server time).
- If a game is postponed to a later time after its picks were published, picks stay published (admin tool = later).
- Auto-fill (50%) is Phase 7. Points per game: Phase 3.
- Cloud Scheduler must support the function region (`me-west1`); if deploy complains, set the scheduled function's region to `europe-west1`.

## Reconciliation
No points persisted yet.

## Update: registration by typed name (owner decision)
- No name dropdown. The user TYPES their name; `registerParticipant({name,email,password?})` matches it server-side against `participants.normalizedName` (shared `normalizeName`: NFC, strips invisible direction marks, collapses spaces, ignores Latin case), with a fallback on exact `displayName`. Names are never sent to the browser.
- `listOpenParticipants` REMOVED; replaced by `registrationStatus` ({open}). On deploy the CLI will ask to delete `listOpenParticipants` -> answer **y** (intentional).
- Errors: not-found -> "not on the list"; permission-denied -> already registered; aborted -> in progress; failed-precondition -> closed.

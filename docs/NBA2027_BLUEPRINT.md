# NBA 2027 Playoffs Prediction App — Blueprint
Derived from the FIFA World Cup 2026 app (HANDOFF_SUMMARY 4 & 5, wrap-up guide, DB backup) and the older NBA Playoffs 2026 single-HTML site. Items marked **(CONFIRM)** are assumptions to verify with the owner.

---

## 1. Principles carried over from the World Cup app
- Same UX: Hebrew/English, RTL, mobile-first, bottom nav + "More" drawer, same page set.
- Same data flow: Cloud Function polls API → writes game → `onGameUpdated` trigger computes points → `points/{uid}`.
- Same admin power: override anything, with an audit trail.
- **Improvements** (all from real WC incidents) are in §10 and are mandatory.

## 2. Folder structure
```
src/
  pages/ home, leaderboard, results, predictions (games+bonus tabs), mypoints, h2h, rules, profile, admin
  pages/admin/  AdminPage (tab shell only), AdminGamesPanel, AdminScoringPanel,
                AdminBonusPanel, AdminUsersPanel, AdminH2HPanel, AdminSettingsPanel, AdminBackupPanel, AdminAuditPanel
  components/   layout/BottomNav, ErrorBoundary, TeamBadge, ScoreInput, CountdownLock, ...
  contexts/     AuthContext, LangContext, SettingsContext (appSettings/main live, merged over defaults)
  hooks/        useGames, useMyPredictions, useLeaderboard, useBonus, useH2H
  i18n/         he.json, en.json
  utils/        formatting, dates, teams (30 NBA teams, he/en names, colors, conference)
shared/         scoring.js (+ scoring.test.js), constants.js (ROUNDS, PREV_ROUND, DEFAULT_SCORING)
functions/      index.js (v2), pollLiveScores, onGameUpdated, onBonusUpdated,
                autoFillPredictions, createUserDoc, dailyAutoBackup, lockGamePicks
scripts/        reconcile-points.mjs, seed-playoffs.mjs
firestore.rules, firestore.indexes.json, firebase.json, vercel.json, .env.example, README.md
```
`shared/` is imported by both the client and functions (symlink, copy-on-build script, or npm workspace) — **one source of truth for scoring**.

## 3. Firestore schema (proposed — review before coding)

| Collection / doc | Key | Notes |
|---|---|---|
| `users/{uid}` | uid | Profile only: name, username, email, phone, team (favorite), photoURL (**URL to Storage, not base64**), paid, blocked, isAdmin (display only), createdAt, updatedAt |
| `teams/{abbr}` | "BOS" | nameEn, nameHe, conf, color, logo — admin-editable |
| `games/{gameId}` | `R1-E-1_G1` string | gameNum, t1, t2, s1, s2, status, tipoff (UTC), ot (0,1,2…), winner, apiGameId, overridden (bool), updatedAt |
| `predictions/{uid}` | uid | **Maps, not arrays**: `games: {gameId: {s1,s2,updatedAt,autoFilled?}}`, `bonus: {bonusId: {answer,updatedAt}}`, `jokers: {games: gameId}`, updatedAt |
| `picks/{gameId}` | gameId | **Public snapshot of everyone's picks, written by function at lock time** → powers "Everyone's picks" without exposing picks early |
| `points/{uid}` | uid | total, gamePts, bonus, bonusByRound, gameHits, exactHits, winnerCorrect, uniqueHits, bestStreak, curStreak, bestMiss, curMiss, gamesPlayed, updatedAt (+ admin `overrides`) |
| `bonus/{bonusId}` | auto | question{he,en}, type (`numeric/choice/team/player/dynamic_score/text`), options[], dynamicOptions[{label,pts}], pts, deadline, category (`general/round1/round2/cf/finals`), **answer as array of strings** (multi-correct supported everywhere), customPlayers[], updatedAt |
| `appSettings/main` | — | registrationOpen, seasonStarted, scoring{…}, tiebreakers[], features{jokers,autoFill}, deadlines, season "2026-27" |
| `appSettings/tournamentStats` | — | otGames, sweeps, game7s, … (feeds numeric bonus answers; admin-editable, auto-incremented by functions) |
| `h2hTournament/main` | — | `stages: { R1:{stageNum,pairs[]}, R2:{…}, CF:{…}, F:{…} }` **map keyed by round**, `activeStage` derived (see §10) |
| `h2h/{id}` | auto | friendly pairs: label, user1, user2 |
| `auditLog/{id}` | auto | action, by(uid), ts, target, before, after |
| `backups/{id}` or Storage | — | JSON backups (use Storage; keep avatars out of backups) |

**Design notes (flag to owner):**
1. WC keyed `predictions` and `points` by **email**; use **uid** here (emails change/case-differ). Keep `email` as a field.
2. WC stored predictions as arrays → whole-array rewrites risk lost updates. Use maps + dotted-path updates.
3. WC stored avatars as base64 inside `users` → every backup/read was huge. Use Firebase Storage.
4. Reading everyone's picks: private `predictions/{uid}` (owner + admin only) + function-published `picks/*` at lock time.

## 5. Scoring (config-driven; values TBD — owner to fill)
All values live in `appSettings/main.scoring` and are editable in Admin → Scoring. Defaults in `shared/constants.js`. Rules page renders from the same config.

**Game prediction (score s1–s2):**
- Correct winner: `winner` pts
- Exact score: `exact` pts
- Goal-diff style bonus by margin closeness: `diffBonus: [tier1,tier2,tier3,tier4]` (old NBA site) **(CONFIRM tiers)**
- "Risk"/rare-score bonus (old NBA site's `bombah`): bonus when the user's pick was made by ≤ N% of users and turned out right, **or** a bonus for correct big-upset picks **(CONFIRM definition)**
- Unique bonus: only user with exact score (`unique`)
- Joker: ×2 on a chosen game per round **(CONFIRM whether jokers exist for NBA)**
- Auto-filled picks: ×0.5 floor-reduced **(CONFIRM whether autofill exists)**

**Bonus:** per-question `pts`; `dynamic_score` = points depend on the option picked (odds-based, great for "Champion", "MVP"); multi-answer supported (answer array).
**Tiebreakers (define up front!):** e.g. total → exact hits → unique hits → bonus. Stored in `appSettings.tiebreakers`, used by Leaderboard and H2H.

## 6. Pages (parity with WC)
- **Home:** countdown to next lock, today's games, my rank, top 3, announcements banner (admin-editable).
- **Leaderboard tabs:** Total · Game points · Statistics (hits, exact, streaks, winnerCorrect, unique) · Bonus · per-round. Joker-unused dot if jokers exist.
- **Results:** games by day, live scores, tournament stats tab (OT games, sweeps…).
- **Predictions (3 tabs):** Games ·Bonus. Countdown lock per item, instant "saved ✓" feedback, bulk "Save All" staged locally then one write. Everyone's picks visible after lock.
- **My Points & Predictions:** per game/bonus: my pick vs result vs points, mobile cards + desktop table.
- **H2H:** admin-created friendly pairs + knockout-style H2H tournament by round (R1/R2/CF/F) with seed advantage, tiebreakers, admin override winner.
- **Rules:** generated from live scoring config.
- **Profile:** name, username, favorite team, phone, language, avatar upload (Storage), logout.
- **Admin:** see §8.

## 7. Cloud Functions (all in repo, v2)
| Function | Trigger | Purpose |
|---|---|---|
| `pollLiveScores` | Scheduler 1/min | Exit immediately unless a game is within [tipoff−15min, tipoff+4h]. Fetch **today and yesterday (UTC)** when a game is live (NBA games cross midnight UTC — WC midnight bug). Map API id→game, write s1/s2/status/ot; skip games with `overridden:true`. |
| `onGameUpdated` | Firestore update `games/*` | When status → finished: compute points for all users (shared scoring), unique bonus, streaks |
| `onBonusUpdated` | `bonus/*` | Recompute bonus points when answer set/changed (multi-answer, dynamic_score, numeric) |
| `lockGamePicks` | Scheduler 1/min (or inside poll) | At tip-off copy all users' picks to `picks/{gameId}` |
| `autoFillPredictions` | Scheduler/trigger **(if enabled)** | Fill missing picks at game start (`autoFilled:true`), in-repo this time |
| `createUserDoc` | Auth onCreate | Create `users/{uid}` + `points/{uid}` + `predictions/{uid}` |
| `dailyAutoBackup` | Scheduler daily | Export key collections to Storage (no base64 avatars) |
| `recalcAll` (callable, admin) | HTTPS callable | Full recompute of everyone's points from raw data (also used by reconciliation) |

Runtime: Node 22+ (Node 20 was deprecated 2026-04-30 and is decommissioned 2026-10-30). Use current `firebase-functions`. Secrets via Secret Manager.

## 8. Admin parity checklist (everything WC admin could do)
- **Settings:** registrationOpen, seasonStarted, feature toggles, announcement banner, deadlines.
- **Games:** create/edit/delete games; edit teams, tip-off, venue; **override score / status / OT**; mark `overridden` so polling won't overwrite; cancel unneeded games; "re-sync from API".
- **Scoring:** edit every point value (single editor!), tiebreakers, round multipliers; "recalculate all" button.
- **Bonus:** create/edit/delete questions (all types incl. dynamic_score, player with team→player multi-select, team multi-checkbox, choice multi-checkbox); set correct answers (**multi**); deadlines; per-round categories.
- **Users:** list/search, edit profile, toggle `paid`, `blocked`, admin role (via callable that sets custom claim), reset/send password email, delete user, view a user's predictions, **edit a user's prediction** (audited), manually adjust points (`override` with reason).
- **Predictions:** view all picks per game, fill-in for a user, run autofill manually.
- **H2H:** friendly pairs CRUD; knockout H2H: auto-generate pairs from standings/seeding, advance stage (single atomic write), override winner, edit seed advantage.
- **Tournament stats:** edit counters (OT games, sweeps, Game 7s, …) that feed numeric bonus questions.
- **Backup/Restore:** manual backup (named, e.g. `FINAL_…`), download, restore from file (dry-run diff first).
- **Audit log viewer**, **Reconciliation report** (stored vs recomputed points, mismatches highlighted).
- **Data reset for new season** (guarded by typed confirmation).

## 9. Reconciliation (build in Phase 3, not at the end)
`scripts/reconcile-points.mjs` recomputes every user's `points/{uid}` from raw `games + predictions + bonus` using `shared/scoring.js` and diffs against stored values (all fields). Expected result: **0 mismatches**. Run after any scoring change, any incident, and before declaring final standings. (WC ended with a verified 0 mismatches across 40 users.)

## 10. Lessons learned from the WC build (mandatory rules)
| # | WC incident | Rule for NBA app |
|---|---|---|
| 1 | `ReferenceError` (`myAns` undefined) in `BonusPage` crashed the **entire Predictions page for every user** the moment admin set a `dynamic_score` answer; BonusTab was always mounted inside Predictions with no error boundary. Mis-diagnosed first as cache/localStorage/mobile. | ErrorBoundary around every tab/page; lint (`no-undef`) in CI; test dynamic_score scoring with data; treat "all users broke suddenly" as data-triggered. |
| 2 | Leaderboard bracket tab used hardcoded `DEFAULT_*_SCORING` instead of admin config → wrong points. | Always `{...DEFAULTS, ...appSettings.scoring}`; central `useScoring()` hook. |
| 3 | `ROUNDS` array order made Final's picker source from 3rd-place picks (`ROUNDS[i-1]`). | Explicit `PREV_ROUND` map. |
| 4 | Duplicate bracket-scoring editor built in a second admin panel. | Search repo for existing editor first; one setting = one editor; admin tab shell only composes panels. |
| 5 | H2H advance did two sequential `setDoc` overwrites using stale closure state → 3rd-place stage erased; orphan stage entry (`stageNum:6` without key) shadowed real data via `.find()`. | One atomic write; stages as a **map keyed by round**; never rely on array order/`find` for config. |
| 6 | `currentStage` for H2H was manually edited in Firestore. | Derive active stage from data (first stage with unresolved pairs) or set via the same atomic "advance" action. |
| 7 | Project auto-downgraded Blaze→Spark after billing lapse → **all Cloud Functions died** (scores, scoring, backups). | Budget alerts + billing contact; admin "System health" widget showing last successful `pollLiveScores` run timestamp; alert if stale during game window. |
| 8 | `autoFillPredictions` & `createUserDoc` existed only in Cloud Console; every CLI deploy asked to delete them. | Everything in repo. Never answer "N" tricks. |
| 9 | Node 20 runtime deprecation, old `firebase-functions`. | Start on current runtime/SDK. |
| 10 | Midnight-UTC games missed by date-based API fetch. | Fetch yesterday + today during live games (NBA playoff games routinely end after 00:00 UTC). |
| 11 | WC knockout scoring used 90-min score (cumulative ET/pens confusion) and API `fullTime` vs `regularTime` bug. | Decide OT policy up front (NBA: include OT), document on Rules page, store `ot`. |
| 12 | H2H scoring in later rounds used cumulative points (included earlier rounds). | Store **per-round points** (`gamePtsByRound`) from day one so H2H stages score only their round. |
| 13 | Bonus on-page display (`isCorrect` string-match) didn't handle multi-answer. | Answer is an **array** end-to-end; one shared `isAnswerCorrect()` helper used by UI and functions. |
| 14 | Avatars as base64 in user docs bloated backups. | Storage + URL. |
| 15 | "Works in private mode" misled debugging (tested as admin with no predictions). | When reproducing, use a real user account with real data. |
| 16 | Orphaned/legacy fields and users docs with mixed shapes (`username`, `team` inconsistently set). | Validate shape in `createUserDoc`; migration script; Firestore rules validating required fields. |
| 17 | Late-added knockout bonus & H2H features required many hotfixes. | Include per-round bonus categories (`round1/round2/cf/finals`) and per-round H2H in the original schema. |

## 11. Build phases (verify each before moving on)
- **Phase 0 — Scaffold:** Vite/React, Firebase init via env, Auth (email+Google), LangContext he/en + RTL, layout + bottom nav, ErrorBoundary, empty pages, rules skeleton, shared scoring skeleton + tests, CI lint.
- **Phase 1 — Data core:** teams seed (30), games CRUD in Admin, Results page, SettingsContext, createUserDoc function.
- **Phase 2 — Predictions:** Games prediction UI , server-side lock rules, `lockGamePicks`, Everyone's picks, My Points skeleton.
- **Phase 3 — Scoring:** `shared/scoring.js` full + tests, `onGameUpdated`, `points` doc, Leaderboard, **reconcile script**, Admin Scoring panel + Rules page from config.
- **Phase 4 — Live scores:** API integration, `pollLiveScores`, admin override + `overridden` flag, system-health widget.
- **Phase 5 — Bonus:** all question types, multi-answer, dynamic_score, admin panel, `onBonusUpdated`, per-round categories, tournament stats.
- **Phase 6 — H2H:** friendly pairs + per-round knockout H2H.
- **Phase 7 — Admin completeness & ops:** users panel, edit-user-pick, audit log, backup/restore, recalcAll, season reset, autofill/jokers if enabled.
- **Phase 8 — Hardening:** emulator-based end-to-end dry run with fake season (seed script plays a whole fake playoffs), load/cost check, mobile QA (iOS Safari, Android Chrome), Hebrew QA, error logging.
- **Go-live checklist:** budget alerts set, Blaze confirmed, secrets set, rules deployed, indexes deployed, backup tested by restore.

## 12. Open questions for the owner (answer before the phase that needs them)
1. **Live-score API** (Phase 4): balldontlie vs API-Basketball (api-sports) vs other; free-tier rate limits & playoff coverage; cost. WC used API-Football. My answers: Need more info to decide
2. **Scoring values & definitions:** diffBonus tiers, "bombah"/risk bonus rule, "hiroshima" meaning exact and unique score from all other users, unique bonus, round multipliers.
3. Include **Play-In** predictions? My answers: No
4. **Jokers** and **auto-fill** for NBA? (default: 3 for all season; autofill off or 50% rule as WC) 50% as WC
5. **OT counts** in score? (default: No) My answers: No
7. Same Firebase project as WC (history preserved) or **new project** (recommended: new project, same Vercel account, domain e.g. `nba2027.myworldcup2026.club` or new domain)? Reuse WC users (re-register vs import)?  My answers: New Project, same Vercal account, new domain, new users which requires new registration
8. Paid-entry tracking (`paid` Y/N) and prize display needed? My answers: Paid-entry tracking is required for admin panel. Np prize display
9. Tiebreaker order.
10. Roster source for "player" bonus questions (MVP, Finals MVP, ROY, scoring leader): API or admin-maintained list? My answers: Admin maintained list

## 13. Things you may have missed (suggestions)
**Must-have**
- Server-side prediction lock (Firestore rules + `request.time < tipoff`), custom-claim admin, field-level validation in rules (scores 0–200, integer).
- Public picks published after lock (privacy before tip-off).
- Reconciliation script + `recalcAll`.
- Per-round points stored for H2H & per-round leaderboards.
- Admin **audit log** + system-health indicator for the poller.
- Firebase budget alerts and Blaze billing owner.

**Strongly recommended**
- Push/email/WhatsApp-style reminders: "Game starts in 1h and you haven't predicted" (FCM web push or a simple scheduled email via Firebase Extensions). Big engagement win for friends' leagues.
- "What-if / provisional ranking" during live games.
- Stats page: best predictor per round, most exact hits, boldest correct pick, streaks, "who picked this" per game.
- Shareable image/summary of daily standings for the WhatsApp group (generated client-side, he/en).
- Light/dark theme and team-color accents.
- PWA install (Add to Home Screen) — **only with a correct service-worker/cache strategy** (WC avoided SW to dodge stale-bundle bugs; use `vercel.json` headers: immutable for `/assets/*`, no-cache for HTML).
- Emulator-based fake-season seed script for QA.

## 14. Commands (to be created in README)
```bash
npm run dev                         # frontend
npm run test                        # vitest (shared/scoring)
firebase emulators:start            # local Firestore/Auth/Functions
cd functions && firebase deploy --only functions
firebase deploy --only firestore:rules,firestore:indexes
git push origin main                # Vercel auto-deploy
node scripts/reconcile-points.mjs   # expect 0 mismatches
```

# HANDOFF_SUMMARY_2 — Phase 1 (Data core + registration)

## Built
- `shared/teams.js` (30 teams he/en, conf, color), `shared/games.js` (`buildGameId`, `validateGame`) + tests (17 total, passing).
- Cloud Functions (v2, Node 22, region `me-west1`, firebase-admin 14 / functions 7, 0 audit findings):
  `beforeUserCreatedGate` (blocking; Identity Platform), `listOpenParticipants` (public, only if registrationOpen), `registerParticipant` (public; claims an approved name, creates Auth user via Admin SDK + users/points/predictions docs), `ensureProfile` (admin bootstrap: email in `ADMIN_EMAILS` -> claim `admin:true` + profile).
- Client: TeamsContext, `useGames`, `useParticipants`, TeamBadge, **Results page** (games by day, local tz), **Register form** (pick approved name; email+password or Google), Admin panels: **Games** (CRUD, score/status/OT override, `overridden` lock, cancel via status, delete, seed 30 teams), **Users & Participants** (whitelist add/rename/delete, paid), **Settings** (registrationOpen, seasonStarted, announcement). Every admin write is batched with an `auditLog` entry.

## DB changes (vs HANDOFF_1)
- `participants/{id}`: displayName, normalizedName, claimedBy (uid|null), claimedAt, email, paid, registeringEmail/registeringAt (transient reservation), createdAt. Admin-only in rules. **`paid` lives here (not in users).**
- `points/{uid}` now has public `name` (users docs are private; leaderboard needs names).
- `games`: seriesId, seriesKey, round, gameNum, t1=HOME, t2=AWAY, s1/s2 = FINAL score incl. OT, ot, winner, overridden.
- `teams/{abbr}`: nameEn, nameHe, conf, color (seeded from admin button).

## Design notes
- Nobody can self-create an account: blocking fn allows only (a) `ADMIN_EMAILS` + verified email (Google) or (b) an email reserved by `registerParticipant`. Admin console-created users bypass blocking functions.
- Google registration: user is created server-side with the entered email; they then press the Google button with that same email (Firebase links to the existing uid).
- Impersonation risk: anyone can pick any unclaimed name. Admin can see claimed email in Users panel (reset-claim tool = Phase 7).
- Blocked users, user-pick editing, points overrides: Phase 7.

## Known issues / to verify on first deploy
- Confirm Admin-SDK `createUser` does not get rejected by the gate (it is allowed either way because the email is reserved first).
- Not yet exercised against live Firebase (needs deploy).
- Scoring values still placeholders.

## Commands
See README. Deploy: `firebase deploy --only firestore:rules,firestore:indexes,functions`.

## Update: competition scope (owner decision)
- Competition = **regular season** (`round: 'RS'`). Playoff games exist in the data model but do NOT count for now; playoffs will be a separate, new competition later.
- `appSettings/main.countedRounds` (default `['RS']`, edited only in Admin -> Settings). Scoring/leaderboard/reconcile (Phase 3) MUST filter with `countsForStandings(game, countedRounds)` from `shared/games.js`.
- Open design points this raises (decide before Phase 2/6): Predictions UI must browse ~1,230 games by day (not one long list); H2H stages cannot be R1/R2/CF/F (need e.g. weekly/monthly stages); bonus categories should be season-long / monthly rather than per playoff round; jokers = 3 for the whole regular season.

## Update: schedule import (balldontlie)
- Functions `listScheduleGames` (admin) + `importScheduleGames` (admin, audited) in `functions/index.js`; secret `NBA_API_KEY`. Pure helpers + tests in `shared/schedule.js`.
- Admin -> Games -> "Import from schedule": date range (<=14 days), grouped by day, "select day"/"select all new", already-added and playoff games disabled. Imported games get `apiGameId` (needed for Phase 4 live scores).
- API facts (docs checked 2026-10-09): `GET /v1/games`, header `Authorization: <key>` (no Bearer), `start_date/end_date`, `per_page<=100`, cursor pagination; free plan includes Games, 5 req/min; per-game `datetime` is UTC tip-off; `home_team`=t1, `visitor_team`=t2.
- To verify on first real import: tip-off `datetime` is present for upcoming games; regular-season/NBA Cup flags look right.

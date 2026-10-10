# HANDOFF_SUMMARY_1 — Phase 0 (Scaffold)

## Built
Vite+React app; router + layout (top nav desktop, bottom nav + More drawer mobile); ErrorBoundary on root/layout/every page/every tab/every admin panel; AuthContext (email+Google, admin from custom claim only); LangContext (he/en, `dir` on `<html>`); SettingsContext (`appSettings/main` merged over defaults, `useScoring()`); Rules page rendered from live scoring config; Admin tab shell + 8 empty panels; `shared/` constants + scoring + Vitest tests; `firestore.rules` skeleton; functions skeleton (Node 22, v2); scripts (sync-shared, set-admin; reconcile/seed stubs); vercel.json cache headers.

## Key paths
`shared/scoring.js`, `shared/constants.js`, `firestore.rules`, `src/contexts/*`, `src/components/layout/menu.js` (single menu definition), `src/pages/admin/AdminPage.jsx`.

## DB changes vs Blueprint §3 (pending owner approval)
1. NEW `participants/{id}`: displayName, normalizedName, claimedBy (uid|null), claimedAt, paid, createdAt — admin whitelist; registration only after admin adds name.
2. `predictions/{uid}` written via callable `savePredictions` (rules cannot loop map keys to check each tip-off).
3. `points/{uid}` gains `gamePtsByRound` (per-round H2H, WC lesson #12).
4. `games` gains `seriesId`, `round`; status includes `cancelled`; `series/{seriesId}` collection proposed.
5. `predictions.jokers` becomes `{ [gameId]: true }` (3 per season).
6. `diffBonus` is `[{maxErr, pts}]`.

## Known issues / placeholders
- All `DEFAULT_SCORING` values are placeholders.
- v2 has no non-blocking auth onCreate → `beforeUserCreated` (blocking, needs Identity Platform) planned for Phase 1.
- Registration UI disabled until Phase 1. Not yet run against a real Firebase project (no .env).

## Reconciliation
Nothing persisted yet. `shared/scoring.test.js` covers the pure functions.

## Owner decisions (after Phase 0)
- Live API: balldontlie (key -> Secret Manager `NBA_API_KEY`). Verify playoff coverage + rate limit in Phase 4.
- OT POLICY (final): the FINAL score INCLUDING OT counts. Regulation score is NOT used. `games.s1/s2` = final score; `ot` stored for stats only. No ties possible, so tie predictions are invalid (validate s1 != s2 in `savePredictions`).
- Registration: Identity Platform upgrade + `beforeUserCreated` blocking function checking `participants` whitelist; `ADMIN_EMAILS` bypass for bootstrap. Email/password and Google both allowed once approved.
- Jokers: 3 per season on any game, admin-editable (`scoring.jokersPerSeason`) until season starts. Auto-fill factor 0.5.
- Tiebreakers: total -> exactHits -> uniqueHits -> bonus.
- Still pending: scoring point values, project ID, domain, admin email.

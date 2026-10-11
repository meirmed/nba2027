# NBA 2027 Playoffs Prediction App

Private prediction game (~60 friends). Sibling of the World Cup 2026 app. See `docs/NBA2027_BLUEPRINT.md` and `HANDOFF_SUMMARY_*.md` (read the latest first).

Stack: React + Vite (Vercel) · Firebase Auth/Firestore/Storage · Cloud Functions v2 (Node 22). Config via env vars only.

## Setup
```bash
cp .env.example .env        # fill in the NEW Firebase project's web config
npm install
cd functions && npm install && cd ..
```

## Commands
```bash
npm run dev                          # frontend (http://localhost:5173)
npm run test                         # vitest (shared/scoring)
npm run lint                         # eslint incl. no-undef (CI gate)
npm run build                        # production build
npm run sync-shared                  # copy shared/ -> functions/shared (also runs on functions predeploy)
firebase emulators:start             # local Auth/Firestore/Functions (set VITE_USE_EMULATORS=true)
firebase deploy --only functions
firebase deploy --only firestore:rules,firestore:indexes
git push origin main                 # Vercel auto-deploy
# first admin: put your email in functions/.env (ADMIN_EMAILS=...), create the user in Firebase console (Authentication > Add user), sign in -> claim is granted automatically
node scripts/reconcile-points.mjs    # Phase 3: expect 0 mismatches
```

## Repo rules
- One scoring module: `shared/scoring.js`. Config = `{...DEFAULTS, ...appSettings/main.scoring}` via `useScoring()`.
- Every page/tab/admin panel wrapped in `ErrorBoundary`. Every Cloud Function lives in `functions/`.
- Admin = custom claim `admin:true`. Predictions are written only by the `savePredictions` callable.
- Strings via `t('key')` in `src/i18n/{he,en}.json`; logical CSS properties; `dir="ltr"` on score inputs/number tables.

## Go-live checklist
Budget alerts + Blaze confirmed · secrets set · rules + indexes deployed · backup restore tested · reconcile = 0 mismatches.

## Live-score / schedule API (balldontlie)
```bash
firebase functions:secrets:set NBA_API_KEY     # paste the balldontlie key when prompted (never in .env / client)
firebase deploy --only functions
```
Admin -> Games -> "Import from schedule": pick dates, tick games, add. Free tier = 5 requests/min.

## Live scores (Phase 4)
`pollLiveScores` runs every minute. It reads only games that are scheduled/live, tipped off in the last 48 h (or within 15 min) and have an `apiGameId`
(games created via "Import from schedule"), calls balldontlie ONCE for their dates, and updates status / score (final incl. OT) / OT / live text.
Games with the manual lock (`overridden`) are never touched. Admin -> Games shows the heartbeat; "Re-sync from API" unlocks a single game.
```bash
firebase deploy --only firestore:indexes,firestore:rules,functions   # first deploy needs the new games index (status + tipoff)
```

## Bonus questions (Phase 5)
Admin -> Bonus: questions (numeric / as-close-as-possible / choice / team / player / odds-based / free text; "ranking" is reserved) and the players list.
Users answer under Predictions -> Bonus (autosave; the server checks the deadline). Setting a correct answer in Admin closes the question and rescores
everyone (`onBonusUpdated`). Bonus points have their own leaderboard column and tab.

## Head to Head (Phase 6)
Admin -> H2H -> Tournament: pick participants, draw groups (random, then move players by hand), start the league. League standings = game points
(bonus never counts) from the league start day. "Close the league" creates knockout stage 1 (seeded: group winners first). Each stage's points = game points
inside its day window; the admin closes a stage to create the next one (winners re-paired by seed). Admin -> H2H -> Pairs for fun: any two players, optional day window.
Everything is computed live from `points/{uid}.byDay`; run "Recalculate all points" once after deploying this version so `byDay` exists.

## Auto-fill, profile, avatars (Phase 7a)
`lockGamePicks` (every minute) auto-fills players who made no pick when a game tips off: random scores 20-99, margin 1-30, flagged `autoFilled`
(50% points, floored; never the unique bonus), then publishes everyone's picks. Switch: Admin -> Settings. Avatars live in Firebase Storage `avatars/{uid}.jpg`
(enable Storage once in the console, then `firebase deploy --only storage`). Names can only be changed by the admin (Admin -> Users -> Rename).

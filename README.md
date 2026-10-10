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

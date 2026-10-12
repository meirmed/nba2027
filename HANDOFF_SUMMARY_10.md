# HANDOFF_SUMMARY_10 — Phase 8 (hardening)

## What was done
- **Season dry run** (`scripts/lib/simulate.mjs`, `shared/simulation.test.js`, `scripts/simulate-season.mjs`): a seeded fake season with the REAL scoring / auto-fill / jokers / bonus / Head to Head code. Checks: per-game, per-day and per-round points all equal each player's total; results are deterministic and independent of user order; <= 1 unique bonus per game and never for auto-filled picks; jokers <= 3; bonus sums per question/category; ranks and ties; Head to Head windows partition the season exactly; a whole tournament (groups -> 16 qualifiers -> 8/4/2/1 pairs -> champion).
  - The Firebase emulators cannot run in the build environment (they need a Java download), so this replaces the emulator seed run. Firestore security rules are NOT unit-tested yet (they need the emulator): reviewed by hand instead (below).
- **Performance bug found and fixed by the dry run**: full recalculation of a finished season (60 players x 1,235 games) took **5.7 s**, now **0.24 s** (date formatter cached; day computed once per game).
- **Document sizes at season end** (Firestore limit 1,024 KB): predictions 38 KB, pointsDetail 61 KB, points + daily totals 4 KB. All comfortably small.
- **Safety nets in `npm run test`** (`shared/static-checks.test.js`, mutation-checked): Hebrew and English have identical keys and placeholders, every text key used in code exists, every template text family is complete, no physical left/right CSS (RTL safety), no secrets committed, client never imports server code.
- **Production error logging**: crashes on players' devices (error boundaries, `window.onerror`, unhandled promise rejections) are written to `clientErrors` (throttled, 5 per session, admin-read; rules validate shape and size). Admin -> Audit -> **App errors** shows them.
- **Faster, cache-friendly loading**: admin screens are lazy-loaded (players never download them); Firebase and React are separate long-cached files. Main app file: 1,040 KB -> 330 KB (104 KB compressed). First-load total is similar (the Firebase SDK dominates), but an app update now re-downloads only the 104 KB app file.
- **Cost model** (`scripts/estimate-cost.mjs`, `docs/COST_ESTIMATE.md`): about $3 / month at the busiest point of the season (<= ~$6 at higher regional prices), ~$0 early on.
- **Docs**: `docs/GO_LIVE_CHECKLIST.md`, `docs/QA_CHECKLIST.md`, `docs/COST_ESTIMATE.md`.

## Security review (manual, rules + functions)
- All admin callables check the admin claim; players can only write through `savePredictions` / `saveBonusAnswers` (server-time locks); players cannot write `points`, `picks`, `adjustments`, `games`, `bonus`; `users` self-update is limited to username/phone/team/photoURL/lang; names only via admin; backups readable by admins only.
- Known residual risks (accepted): `bonus` documents hold the correct answer (set it only after the deadline); `points` docs expose the adjustment TOTAL and the blocked flag to signed-in players (reasons are admin-only); a blocked player's existing token can read data for up to ~1 hour; `registerParticipant` is public (no rate limit; consider App Check if abused); anyone can pick any unclaimed name at registration (admin sees the email and can reset).

## Owner to-do before launch (see the go-live checklist)
Confirm the **risk-bonus points** (placeholder 2) - decide the **World Cup H2H tie rule** - describe the **ranking bonus type** (still reserved) - test Head to Head (Recalculate all points first) - clear all test data (checklist section 5) - soft launch with 3-5 friends.

## Deploy
`firebase deploy --only firestore:rules,functions` (rules: clientErrors) and push the app. No functions behaviour changed except that the points recalculation is faster (shared code).

## Update: Results page = 4 tabs (World Cup layout)
- Tabs: **Live games** (empty state "No live games right now"), **Finished** (count badge; last 7 days default + period filter), **Bonus** (count badge: each question with status, correct answer, my answer + points, everyone's answers once closed), **Bonus tracking** (players x closed questions matrix with points; first columns sticky).
- New collection `bonusPicks/{questionId}` = everyone's bonus answers, published when a question closes (deadline passed within the last hour via `lockGamePicks`, or the correct answer is set / the question is saved after its deadline via `onBonusUpdated`). Signed-in read, functions-only write; kept in line by `adminEditPredictions`; included in backups, restore defaults and season reset. Scheduled/upcoming games are no longer listed on the Results page (they live in Predictions).
- Deploy: `firebase deploy --only firestore:rules,functions` + push the app.

## Update: Bonus results redesign, "My predictions" with a Bonus tab
- Results -> **Bonus** tab (World Cup look): per question a card with the correct answer, a "max N pts" pill (`maxBonusPoints`), the answer distribution as bars with % of the players who answered (`bonusStats`; correct answer green) or "average of guesses" for number questions, my answer + points, and "All answers (n)". Open questions show only their status (nothing is revealed before the deadline). The **Bonus tracking** tab was removed.
- "My points and predictions" is now **"My predictions" / "הניחושים שלי"** with two tabs: **Games** (`UserPointsView`) and **Bonus** (`UserBonusView`: my answer, the correct answer, points earned of max, bonus total, answered X of Y). The admin's user Details page shows the same bonus view for any player.
- Tests: 135 (new: `maxBonusPoints`, `bonusStats`).

## Update: "Next 7 days" tab on Predictions
- Third tab (Games | Next 7 days | Bonus): counted games from today through the next 6 days (7 calendar days, Israel time) in one list grouped by day (`useWeekGames`, `rangeFor('next7')`). Same cards, autosave, jokers and Save bar as Games; the tab shows an amber number = open games in those 7 days without a pick.
- Editing state (typed scores, joker changes, autosave, rejection reasons) moved into `PredictionEditorProvider` (above the tabs), so it is shared by Games and Next 7 days and survives tab switches. `SaveBar` counts the saved games of the games shown in the current tab.
- Deep links: `/predictions?tab=week`. No server or data changes.

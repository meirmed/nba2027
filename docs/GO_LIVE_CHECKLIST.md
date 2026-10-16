# NBA 2027 — Go-live checklist

Tick every box in order. "(you)" = something only the owner can do in a console; the rest are commands or screens in the app.

## 1. Money and safety
- [ ] (you) Firebase project is on **Blaze**. Billing contacts: your email + one backup person.
- [ ] (you) **Budget alert** set (suggestion: $10 / month, alerts at 50%, 90%, 100%). Google Cloud console → Billing → Budgets & alerts.
- [ ] (you) Authentication → Settings → **Authorized domains** contains: your `*.vercel.app` address and `nba2027.myworldcup2026.club` (or the final domain).
- [ ] `functions/.env` has `ADMIN_EMAILS=<your email>` and `SEASON_RESET_ENABLED=false`.

## 2. Secrets and APIs
- [ ] `firebase functions:secrets:set NBA_API_KEY` done (balldontlie key). Test: Admin → Games → Import from schedule loads games.
- [ ] (you) **Cloud Translation API** enabled (needed only for one-language bonus questions).
- [ ] (you) **Identity Platform** upgrade done and **Storage** set up (done earlier).
- [ ] Vercel project has the 7 `VITE_*` variables (6 Firebase values + `VITE_FUNCTIONS_REGION=me-west1`) and **no** `VITE_USE_EMULATORS`.

## 3. Deploy everything
- [ ] `npm install` in the project folder and in `functions`.
- [ ] `npm run lint` and `npm run test` pass (these include the Hebrew/English completeness check).
- [ ] `firebase deploy --only firestore:rules,firestore:indexes,storage,functions`
- [ ] `firebase functions:list` shows all functions, region `me-west1` (29 at the time of writing). Scheduled ones: `lockGamePicks`, `pollLiveScores`, `dailyAutoBackup`.
- [ ] `git push` and Vercel's latest deployment is **Ready** (Ctrl+F5 on the site).

## 4. Load the season data
- [ ] Admin → Games → **Seed 30 teams**.
- [ ] Admin → Scoring: **confirm every value**. ⚠ The risk-bonus points (currently **2**) were never confirmed by the owner. Then press **Recalculate all points**.
- [ ] Admin → Games → **Import from schedule**: import the regular season in chunks of up to 14 days (Cup games included). Spot-check tip-off times against the NBA schedule.
- [ ] Admin → Bonus: players list first, then the questions (deadlines before the first deadline-sensitive game).
- [ ] Admin → Settings: announcement text; **auto-fill** switch ON; counted rounds = Regular season only.
- [ ] Registration: players register themselves with their first and last name (no list needed). The "Pre-add names" box in Admin → Users & Participants is optional. **A player can submit predictions only after you tick "שולם" (paid)** on their row; until then they can browse. Tick it for every player who should play, BEFORE the soft launch.

## 5. Remove all TEST data (before real registration)
Test games, test users, test bonus questions and the test tournament must not be in the real season.
- [ ] Delete test games (Admin → Games), test bonus questions (Admin → Bonus), test pairs for fun (Admin → H2H).
- [ ] Remove test players: Admin → Users → **Reset registration** for each (this deletes their data).
- [ ] The test tournament (Admin → H2H → Tournament) cannot be deleted from the screen. Either delete the document `h2hTournament/main` in the Firebase console (Firestore → Data), or use the season reset below.
- [ ] Easiest and cleanest: do **one** season reset before launch. Flip `SEASON_RESET_ENABLED` to `true` in `functions/.env` and in `AdminBackupPanel.jsx`, deploy, run the reset (type RESET), then flip both back to `false` and deploy again. (A backup is saved automatically first. Re-import the schedule afterwards.)
- [ ] Admin → Scoring → **Run reconciliation** shows **0 mismatches**.

## 6. Soft launch (recommended): 3–5 friends, one real game night
- [ ] Open registration (Admin → Settings). Friends register (email and Google), set a phone number and picture.
- [ ] They predict, use a joker, and open Everyone's picks after tip-off.
- [ ] Watch one game: green **Live** label, score updates, final score, points appear, leaderboard updates by itself.
- [ ] Admin → Games shows the green "Live scores running" line all night.
- [ ] Admin → Audit → **App errors** is empty (or every entry is understood).
- [ ] Reconciliation = 0 mismatches. Create a backup, download it, delete the test one.

## 7. Launch day
- [ ] Final **backup** created and downloaded.
- [ ] Share the link; tell everyone: register with the exact name you were given, use a real email and phone, "Forgot password?" exists on the login page.
- [ ] Admin → Settings: tick **Season started** when the first game begins (this locks "jokers per season").
- [ ] Keep Head to Head for after registration closes (Admin → H2H → Tournament).

## 8. Every day / week during the season
- [ ] Daily: Admin → Games shows the green health line; look at Admin → Audit → App errors.
- [ ] Weekly: Run reconciliation (expect 0); check the backup list (nightly backups exist).
- [ ] Monthly: Google Cloud → Billing: check the cost against the estimate in `docs/COST_ESTIMATE.md`.

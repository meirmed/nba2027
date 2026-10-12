# NBA 2027 — Manual QA checklist (phones and Hebrew)

Test on at least: **iPhone Safari**, **Android Chrome**, and **desktop Chrome/Edge**. Do everything once in **Hebrew** and once in **English**. Use a real *player* account (not only the admin).

## Everywhere
- [ ] No horizontal scrolling on a phone; nothing cut off at the screen edges (check the iPhone notch / home bar).
- [ ] Hebrew: text right-aligned, **home team on the right**, scores next to their team; English mirrored.
- [ ] Bottom bar visible and not covering the Save bar; More menu opens and closes.
- [ ] Number keyboard appears for score fields; typing a score does not zoom the page.

## Flows
- [ ] **Register**: wrong name refused; right name accepted; phone required; email+password and Google both work.
- [ ] **Login / Forgot password**: reset email arrives; sign out and in again.
- [ ] **Home**: announcement, next lock countdown, "you haven't predicted", today's games, rank, top 5, phone reminder if missing.
- [ ] **Predictions → Games**: day arrows; type a score → green ✓ Saved by itself; tie refused with a message; joker on/off and the "jokers left" counter; locks at tip-off (try a game that starts in 2 minutes).
- [ ] After tip-off: the middle shows the real score and **Live**/final label; Everyone's picks lists everyone with (you), ⭐, 🎲 and reason labels.
- [ ] **Predictions → Bonus**: one question of each type; autosave ✓; locked after the deadline; correct answer and points after it is set.
- [ ] **Results**: last 7 days by default; filters 30 days / season / upcoming / custom; Everyone's picks on started games only.
- [ ] **My Points**: one line per game (short city names on the phone), 🎲 on auto-filled picks, totals and rank, bonus section, "Admin adjustment" line only when there is one.
- [ ] **Leaderboard**: Total / Games / Bonus columns, tabs, your row highlighted, pictures.
- [ ] **Head to Head**: league tables, knockout, pairs for fun.
- [ ] **Profile**: name read-only; upload a picture from the phone camera/gallery; save phone, team, language.

## Admin (on desktop and once on a phone)
- [ ] Games: create, edit, live/final override, Re-sync from API, import schedule.
- [ ] Users: Details page, edit a pick (points change), add and delete an adjustment, block/unblock, rename, reset registration.
- [ ] Backup: create, download (file lands in Downloads), restore preview, delete, recover users preview.
- [ ] Audit: every action above appears. App errors tab loads.

## Slow network
- [ ] Switch the phone to a weak 3G/4G connection: the app still loads in a few seconds and shows "loading" rather than a blank screen.

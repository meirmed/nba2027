# HANDOFF_SUMMARY_8 — Phase 7a (Home, Profile, auto-fill, Results filter)

## Owner decisions
- **Auto-fill**: random scores 20..99 each, margin 1..30 (either team may win); only for players with NO pick, at tip-off, only counted rounds with both teams set; 50% points (floored); never the unique bonus (and does not block another player's unique bonus). Admin switch: Settings -> auto-fill.
- Players cannot change their name (rules updated: `name` removed from the allowed self-update fields). Admin renames via the `renameParticipant` callable (updates participants, users, leaderboard name, Auth displayName; audited).
- Results page: last-7-days default + the same period filter as My Points (shared `usePeriod` / `PeriodFilter` / `shared/period.js`).
- Automatic translation of bonus questions works (Cloud Translation API enabled).

## Built
- `shared/autofill.js` (`makeAutoPick`), `shared/period.js` (+ tests; 106 total).
- `lockGamePicks` now auto-fills THEN publishes picks (one function, so published picks include the filled ones). Games get `autoFilledCount`. Window = games that tipped off in the last 30 min (if the function is down longer, those games are not auto-filled).
- `onUserUpdated` (users -> points: name, photoURL, team), `renameParticipant`.
- Pages: Home (announcement, next lock countdown, "you haven't predicted N", today's/next games with my pick + result, my rank, top 3, bonus reminder), Profile (read-only name, avatar upload, favorite team, phone, language), Leaderboard shows avatars, My Points/prediction cards show 🎲 on auto-filled picks.
- `storage.rules` + `firebase.json` storage target.

## Deploy
1. Enable **Storage** once in the Firebase console (Build -> Storage -> Get started; production mode; same region), otherwise avatar upload fails.
2. `firebase deploy --only firestore:rules,storage,functions`, push the app.

## Reminders for the owner
- Head to Head testing: press Admin -> Scoring -> Recalculate all points first if test games finished before Phase 6.
- Tell the assistant the World Cup H2H tie rule (current order: exact hits, unique hits, better seed, admin decides).
- Ranking bonus type: still reserved, owner will specify.
- Risk-bonus points (2) are a placeholder.

## Next: Phase 7b (admin tools)
Daily backup + restore, reset a wrongly claimed name, edit a user's pick (audited), block a user, manual points adjustment with reason, audit-log viewer, season reset.

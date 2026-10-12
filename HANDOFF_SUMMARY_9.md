# HANDOFF_SUMMARY_9 — Phase 7b (admin tools)

## Owner decisions
- Edited picks are NOT marked for other players (option B): only the audit log records them.
- Phone and email are mandatory at registration (done in 7a-update); players can't change their name.

## Built (all admin-only, all audited)
- **Audit viewer** (Admin -> Audit): newest first, filter by action type + search, expandable before/after, load more.
- **Block / unblock** (`setUserBlocked`): disables the Auth account, revokes tokens, `users.blocked` (synced to `points.blocked`); blocked players cannot save picks/bonus answers and are skipped by auto-fill. Admin accounts can't be blocked.
- **Reset registration** (`resetParticipantClaim`, Admin -> Users): deletes the wrongly registered account (Auth, users, points, predictions, pointsDetail, adjustments), frees the participant name, rescoring. Typed-name confirmation. Admin accounts can't be reset. (Entries already published in old `picks/{gameId}` docs are left as history.)
- **Edit predictions** (`adminEditPredictions`, Admin -> Users -> Details): any game pick / joker / bonus answer, any time; admin-set pick = normal pick (auto-fill flag removed); jokers still limited to `jokersPerSeason`; updates the already-published `picks/{gameId}`; rescoring; audit has old + new values.
- **Points adjustments** (`addAdjustment` / `deleteAdjustment`): `adjustments/{id} {uid, pts, reason, by, ts}`; `points.adjust`, `total = games + bonus + adjust`; the player sees them (with the reason) in My Points; NOT counted in Head to Head (game points only). Reconciliation checks `adjust`.
- **Backups**: `createBackup`, `dailyAutoBackup` (03:30 Asia/Jerusalem, keeps newest 14 `auto-*`), JSON in Storage `backups/`. Storage rules: admin read only. UI: create, list, download.
- **Restore** (`restoreBackup`): choose collections (default games, predictions, picks, bonus, players, appSettings, h2hTournament, h2h, adjustments, teams; also allowed: points, pointsDetail), dry-run preview (+added / -removed / ~changed), typed `RESTORE`, saves a `pre-restore-*` backup first, then rescoring. Never touches users / participants / auditLog.
- **Season reset** (`seasonReset`): typed `RESET`; saves `pre-reset-*` backup; deletes games, picks, bonus, pointsDetail, adjustments, h2h, h2hTournament; empties predictions; zeroes points (keeps name/photo/team/blocked); `seasonStarted=false`. Keeps users, participants, teams, players, settings, audit log.
- Pure logic + tests: `shared/backup.js` (diff, safe names, restore allow-list).

## Notes
- Cloud Scheduler: 3 jobs now (lockGamePicks, pollLiveScores, dailyAutoBackup). Google's free tier covers 3 jobs per billing account; a 4th (e.g. from another project on the same account) costs about $0.10/month.
- Restore/season reset run as one function call (up to 9 min). Not atomic: do it when no game is in play.
- Backups contain personal data (emails, phones): treat downloaded files as private.

## Reminders for the owner
Head to Head testing (Recalculate all points first) · World Cup H2H tie rule · ranking bonus type · risk-bonus points (2 = placeholder).

## Next: Phase 8 (hardening)
Emulator dry-run of a fake season, mobile/Hebrew QA, cost check, go-live checklist.

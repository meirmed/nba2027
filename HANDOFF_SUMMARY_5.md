# HANDOFF_SUMMARY_5 — Phase 4 (Live scores)

## Built
- `shared/live.js` (`parseApiGame`, `planGameUpdate`, 14 tests): balldontlie game -> our update. `status_state` mapping: in_progress=live, final=finished, canceled=cancelled; postponed/delayed/suspended/abandoned/unknown = ignored (admin decides). Scores = FINAL incl. OT; `ot` from ot1-3 fields or period>4; live text "Q3 5:12" / "Half" / "OT1 2:10".
- `pollLiveScores` (scheduler, every minute, secret `NBA_API_KEY`): query `games` where status in [scheduled, live] AND tipoff in (now-48h, now+15min] (needs composite index status+tipoff - in `firestore.indexes.json`); keeps games with `apiGameId` and not `overridden`; ONE API call with `dates[]` (UTC tip-off date and the day before) <= 4 pages; applies patches in one batch. No candidates => no API call, only a heartbeat write.
- Never: touches `overridden` games, moves finished -> live, finishes on tie/missing score. Corrections to a finished game's score ARE applied (triggers `onGameUpdated` -> rescoring). Reschedules (`tipoff` change) only for open, not-yet-published games, to a later future time, >60 s difference.
- `resyncGame` (admin callable, audited): clears `overridden` for one game and applies the API state now. Button in Admin -> Games -> Edit.
- Heartbeat doc `system/poller` (admin-read only): lastRunAt, lastFetchAt, lastSuccessAt, inWindow, candidates, lastUpdated, lastError. Admin -> Games shows green/red status (red after 2.5 min without a run).
- New game fields: `liveText` (string|null). Results page and prediction cards show the live clock.
- `functions/lib/balldontlie.js` is now the only API client (import + poller + resync).

## Rate limit
Free plan = 5 requests/min. Poller uses 1 call/min (2 only if >100 games match). Import and resync add occasional calls. If a 429 happens the poller records `lastError` and retries next minute.

## Notes / known limits
- Manually created games (no `apiGameId`) and games with the manual lock are never auto-updated.
- Postponed games are ignored by the poller (status stays scheduled); admin edits the tip-off or cancels the game.
- Cloud Scheduler: 2 jobs now (lockGamePicks, pollLiveScores).
- Verify on the first real game night: statuses/scores arrive, OT games show `ot` correctly, heartbeat stays green.

## Deploy
`firebase deploy --only firestore:indexes,firestore:rules,functions` (the index takes a few minutes to build; the poller errors until it is READY - heartbeat shows the error).

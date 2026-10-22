# Deploying the Cloud Functions (33 functions, region me-west1)

Normal case: one command, then wait for `+ Deploy complete!` (it can take 10-20 minutes and prints nothing in between):

    firebase deploy --only functions

## If it ends with "Container Healthcheck failed ... failed to start and listen on the port" for MANY functions

This happened on 2026-10-22: the full deploy failed for all 33 functions at once (and the functions that were running stopped answering: saving predictions
failed and "Recalculate all points" gave CORS / `internal` errors). The code was fine (it starts and listens when run by hand); deploying that many functions
at once overloaded the region. **Do not repeat the full deploy and do not delete functions.** Deploy in small groups, one command at a time, and wait for
`+ Deploy complete!` before the next one (the groups run fine one by one):

    firebase deploy --only functions:registrationStatus

    firebase deploy --only functions:savePredictions,functions:saveBonusAnswers,functions:recalcAll,functions:reconcilePoints

    firebase deploy --only functions:pollLiveScores,functions:lockGamePicks,functions:onGameUpdated,functions:onBonusUpdated,functions:resyncGame

    firebase deploy --only functions:registerParticipant,functions:ensureProfile,functions:beforeUserCreatedGate,functions:onUserUpdated,functions:onParticipantUpdated

    firebase deploy --only functions:addAdjustment,functions:deleteAdjustment,functions:adminEditPredictions,functions:renameParticipant,functions:resetParticipantClaim

    firebase deploy --only functions:setUserBlocked,functions:setGameManager,functions:importScheduleGames,functions:listScheduleGames,functions:translateTexts

    firebase deploy --only functions:bonusMissingReport,functions:gamesMissingReport,functions:createBackup,functions:dailyAutoBackup,functions:deleteBackup

    firebase deploy --only functions:restoreBackup,functions:recoverUsers,functions:seasonReset

(1 + 4 + 5 + 5 + 5 + 5 + 5 + 3 = 33 functions.) If a group fails, redeploy its functions one by one (`firebase deploy --only functions:NAME`) to find the one that fails.
Most important first: the save / scoring group, then the live-score group. Only changed functions need to be deployed; the code in `shared/` is copied into
`functions/shared/` by the predeploy script on every deploy.

## Checks afterwards

    firebase functions:list          (33 functions)

Admin -> Scoring -> "Recalculate all points" must say "חושבו מחדש N משתמשים ✓"; a player must be able to save a prediction; the Results page must show live scores.
The browser console (F12) shows the real error of a failing callable (`functions/internal`, `not-found`, `permission-denied`); a CORS error on a callable
usually means the function did not answer at all (not running / not deployed).

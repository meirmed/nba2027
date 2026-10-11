# HANDOFF_SUMMARY_6 — Phase 5 (Bonus questions)

## Rules (owner-approved)
- Categories: `general` | `season` | `month` (+ `month: 'YYYY-MM'`). No playoff rounds.
- Types: `numeric` (exact), **`closest`** (max points, minus `penalty` (default 1) per unit of distance, never below 0; exact = full points; e.g. correct 20, answered 18 -> max-2, 24 -> max-4),
  `choice`, `team`, `player`, `dynamic_score` (points per option), `text` (admin ticks accepted answers). **`ranking` is RESERVED** (shown disabled, not scorable) — owner will specify it next.
- Several correct answers are accepted for any option/team/player question; with `multi` a player may pick several (<= `maxPicks`): points per correct pick, no penalty for wrong picks.
- Setting a correct answer CLOSES the question (also closed after the deadline). Bonus points add to `total`; the `bonus` tiebreaker uses them.

## Built
- `shared/bonus.js` (`scoreBonus`, `cleanAnswer`, `bonusClosedReason`, `computeBonusPoints`, `validateQuestion`) + 18 tests.
- Functions: `saveBonusAnswers` (callable; server-time deadline; merge-set on `bonus.{id}`; checks player ids exist), `onBonusUpdated` (rescoring when answer/points/options/penalty/category change or a question is deleted). `recalcAllPoints`/`reconcileAll` now include bonus.
- Client: Predictions -> Bonus tab (grouped General / Season / months; autosave + saved check; after close shows correct answer and earned points), Admin -> Bonus (Questions form + Players list), Leaderboard (Total tab = Total/Games/Bonus columns in World-Cup colours + Bonus tab), My Points (bonus section).

## DB
- `bonus/{id}`: question{he,en}, type, category, month, deadline, pts, penalty, multi, maxPicks, options[{id,he,en,pts?}], answer[strings], createdAt, updatedAt.
- `players/{id}`: name, team (code|null), normalizedName. Signed-in read, admin write.
- `predictions/{uid}.bonus.{id}: {answer:[strings], updatedAt}` (written only by `saveBonusAnswers`).
- `points/{uid}`: `bonus`, `bonusByCategory`, `total = gamePts + bonus`. `pointsDetail/{uid}.bonus: {questionId: pts}`.

## Notes
- The correct answer is stored on the question doc (readable by signed-in users): set it only AFTER the deadline.
- Not built yet: "everyone's bonus answers" after the deadline, per-month leaderboard, the ranking type.
- Deploy: `firebase deploy --only firestore:rules,functions`, then push the app.

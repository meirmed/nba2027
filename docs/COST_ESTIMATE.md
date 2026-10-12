# NBA 2027 — Running-cost estimate

Output of `node scripts/estimate-cost.mjs` (assumptions at the top of that file; change them and re-run).
Prices checked 2026-10 on Google's Firestore pricing page: reads $0.03 per 100,000, writes $0.09 per 100,000 (US price), free every day: 50,000 reads and 20,000 writes.
Tel Aviv and other regions cost somewhat more per unit, so an upper bound at twice the price is shown.

```
--- Firestore document operations per day at the END of the season (peak) ---
reads: apps starting (listeners attach)          325,920
reads: live score updates pushed to players       26,250
reads: points updates pushed to players           10,500
reads: server (scoring, lock, poller)             14,508
READS total                                      377,178
WRITES total                                       2,510
estimated cost per day / month at US price : $0.10 / $2.94
upper bound (x2 price, e.g. other regions)  : $0.20 / $5.89
reads/day from app starts with 100 games in the app: 53,520  (free allowance covers it)
```

**Reading it:** about **$3 a month** at the busiest point of the season (up to about $6), and close to **$0** during the first weeks, because the app downloads all games at start and early in the season there are few. Writes stay far below the free allowance.

## Other services (all inside their free allowances at this size)
| Service | Why it is free here |
|---|---|
| Cloud Functions | ~90,000 scheduled runs a month, each well under a second; free allowance is 2,000,000 invocations |
| Cloud Scheduler | 3 jobs (lock, live scores, nightly backup): the free allowance is 3 jobs per billing account; a 4th job costs about $0.10 / month |
| Authentication / Identity Platform | free up to 50,000 monthly users |
| Storage (pictures, backups) | a few MB in total |
| Secret Manager, Translation, Artifact Registry | a handful of operations / tiny storage |
| Vercel | the free (Hobby) plan is for non-commercial use, which a private league is |

## What would raise the cost
1. **More app starts per player** (each start reads every game): the single biggest lever (91% of session reads).
2. **The season getting longer** (more games to read).
3. A bug that loops writes. This is what the budget alert is for.

## Cheap fix if the cost ever matters
Make the app read only the last ~10 days and the future games at start, and fetch older games only when someone chooses "whole season" or a custom period. That would cut about 80% of the reads (roughly $2.50 a month saved). Not built, because at these numbers it is not worth the added complexity.

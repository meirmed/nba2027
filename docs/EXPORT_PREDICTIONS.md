# Export of the predictions (external tool)

A command-line tool, **not part of the app and not part of the admin panel**. It lists every player's pick for every game and writes:

- `predictions-matrix_<date>.csv`: a row per game, a column per player (open it in Excel).
- `predictions-long_<date>.csv`: a row per pick (game, player, home / away pick, joker, auto-filled, when it was saved): good for filters and pivot tables.
- `predictions_<date>.html`: one page with the matrix and two search boxes (games / players). No internet needed.

In a cell: `110-102` = the pick, `110-102 J` = with a joker, `110-102 A` = auto-filled, empty = no pick.

## One-time setup: a key (the tool reads the database directly)
1. Firebase console -> project **nba2027** -> the gear -> **Project settings** -> **Service accounts** -> **Generate new private key**. A `.json` file is downloaded.
2. Save it **outside the project folder**, for example `C:\Meir\NBA 2027\secrets\nba2027-key.json`. **Never** share it, send it or push it to GitHub: whoever has it can read and change the whole database. (`exports/` and `*-key.json` are in `.gitignore` as a safety net.) When you do not need it any more, delete it in the same console page.

## Run (from the project folder `C:\Meir\NBA 2027\nba2027`)
```
node scripts/export-predictions.mjs --key "C:\Meir\NBA 2027\secrets\nba2027-key.json"
```
The files appear in the folder `exports`. To see the format first, without a key: `node scripts/export-predictions.mjs --demo`.

## Options
| Option | Meaning |
|---|---|
| `--out <folder>` | where to write the files (default `exports`) |
| `--from 2026-11-01` / `--to 2026-11-30` | only games on these dates (Israel date of the game) |
| `--lang he` / `--lang en` | headers and team names (default Hebrew) |
| `--future` | also games that have NOT started. The admin can see those picks, **do not share that file** before the games start. Default: only games that already started |
| `--all-users` | every registered player (default: players who are paid or have a pick in the exported games; admins are never included) |

## Notes
- The tool only **reads** Firestore. It does not change anything and does not need the app to be running.
- Prediction times are the time each pick was last saved (UTC, in the long file).

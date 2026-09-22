# Play: camera games, wins and ranking

The **Play** button in the middle of the tab bar opens `Play` (`/play`). The camera
counter itself (push-ups / squats, Solo / 1v1 / 2v2, matchmaking) runs on the
separate rep counter server, configured with `EXPO_PUBLIC_REPS_URL`.

## Where the numbers come from

| on screen | source |
|---|---|
| Your record (wins, win rate, 1v1 / 2v2, reps) | `GET /reps/me` — CRW+ database |
| Top 3 in the world | `GET /reps/leaderboard?limit=3` — CRW+ database |
| Queue badges, "in a match", "online" | `GET /api/queues` — rep counter server |

When a match ends, the counter sends a `result` message (with its match id) to the
page that hosts it. The Push-ups / Squats screen forwards it to `POST /reps/results`
for the signed-in player. The pair (account, match id) is unique, so a result is
never counted twice. Results are self-reported by the player's app, like any score
in a client-side game.

The leaderboard follows the XP leaderboard's privacy rules: only active accounts
with a public profile that has competition turned on.

## `rep_matches` table

Migration `005_rep_matches.sql`. One row per player per match, so a 2v2 match is four
rows sharing `external_id`.

| column | notes |
|---|---|
| `user_id` | the player |
| `external_id` | the counter server's match id; `demo-N` for seeded matches |
| `mode`, `exercise` | `1v1`/`2v2`, `pushup`/`squat` |
| `won`, `reason` | `target` or `walkover` |
| `reps` | this player's own reps |
| `team_score`, `opponent_score` | final score from this player's side |
| `opponents` | opponent display names at the time |
| `played_at` | |

## Demo accounts

Development databases get twelve clearly fictional people — Alex Demo, Olivia
Organizer, Adam Admin, Pushup Pete, Squat Sally and so on — with no profile photos,
full account details (country `LB`, language `en`) and a history of 60 matches over
the last three weeks. The history is generated deterministically, so every machine
shows the same ranking.

The login emails are unchanged (`alex@pace.local`, `organizer@pace.local`,
`admin@pace.local`, `memberN@pace.local`) with the password printed by the seed.

- New database: `npm run seed` creates them.
- Existing database: `npm run demo:accounts -w @crw/api` renames the demo people,
  fills their account details and adds the match history. Run it with the API
  stopped — the embedded development database allows one process at a time, and
  opening it from a second process can corrupt it. Running it again adds nothing.

Google-linked accounts are never touched by the demo script.

<p align="center">
  <img src="web/logo.png" alt="MatchMaker logo" width="200">
</p>

# MatchMaker

**Languages**: English · [简体中文](README.zh-CN.md)

🔗 **Live app**: **[CaiZhou2.github.io/MatchMaker](https://CaiZhou2.github.io/MatchMaker/)** — open this URL on your phone, add to home screen, done.

A mobile-friendly Progressive Web App for planning weekly team tournaments. MatchMaker keeps a persistent roster of players, drafts balanced teams based on historical win rate, auto-picks a sensible cup format, runs the tournament, and tracks points and expenses across weeks — all in your phone's browser, no install or account required.

> **Non-commercial use only.** See [LICENSE](LICENSE).

> ⭐ **If MatchMaker is useful for your group, please consider starring the repository** — it's the simplest way to help other organizers find the project, and it costs you nothing. Thank you!

📖 **Just running a tournament?** Skip the rest of this README and read the [**Organizer Quick-Start Guide**](docs/ORGANIZER_GUIDE.md) — written for non-technical users, gets you from zero to running your first event in 10 minutes.

---

## Features

- **Weekly cup workflow**: pick attendees → auto-form balanced teams → play → record results → commit
- **Balanced draft**: top `N` players by win rate become captains (one per team); the rest are distributed randomly round-robin
- **Five tournament modes** the user picks per event: **Auto** (recommended — tries groups+knockout, then round-robin, then friendly), **Groups + Knockout**, **Round-robin only**, **Single elimination** (power-of-2 brackets with seeded pairings), **Friendly only** (random fair pairings — no tournament points awarded, but win rate / W-D-L / head-to-head still update)
- **Free court during knockout**: reserves a court for eliminated teams' friendly matches so nobody sits around bored
- **Points and win-rate leaderboards**: `Win = 3`, `Draw = 1`, `Loss = 0`
- **Expense tracking**: split this week's total cost across attendees automatically; per-player running totals; double-confirm reset with undo-until-next-event
- **Shareable schedule**: one-tap "copy as text" for pasting into WeChat / Telegram / other chats
- **History archive**: every completed event is stored with full detail (teams, results, points/expense deltas, player-name snapshots)
- **Import / export**: full JSON data dump / restore for backup
- **Offline**: works offline once installed as a PWA
- **Multilingual**: auto-detects your browser language (Simplified Chinese or American English) with a manual switcher
- **Zero backend**: all data lives in `localStorage` on your device

## Quick Start

### Run locally

You only need a static HTTP server — no build step, no dependencies.

```bash
git clone https://github.com/<your-user>/MatchMaker.git
cd MatchMaker/web
python3 -m http.server 8080
# open http://localhost:8080 in your browser
```

Any static server works (`python3 -m http.server`, `npx serve`, nginx, caddy, GitHub Pages, Netlify, etc.).

### Install on your phone (PWA)

MatchMaker is a Progressive Web App, so you can "install" it from any modern mobile browser and use it like a native app — offline, fullscreen, with an icon on your home screen.

**Easiest option — use the live deployment:** open **<https://CaiZhou2.github.io/MatchMaker/>** on your phone and skip straight to the install step below. No hosting needed.

<details>
<summary><strong>Or self-host your own copy</strong> (alternative — for forks / custom branding / private use)</summary>

| Option | Cost | Notes |
| --- | --- | --- |
| **GitHub Pages** | Free | Fork this repo, enable Pages with Source = "GitHub Actions" — the bundled `.github/workflows/deploy.yml` handles the rest |
| **Cloudflare Pages** | Free | Connect your fork, output dir `web` |
| **Netlify / Vercel (drop)** | Free | Drag-and-drop `web/` onto their dashboard |
| **Self-host (LAN)** | Free | `python3 -m http.server` on a laptop on the same Wi-Fi |

> ⚠️ PWAs require **HTTPS** (except on `localhost`). GitHub Pages / Netlify / Vercel all provide HTTPS automatically.

</details>

**Then install on your phone:**

#### iOS (Safari)

1. Open the MatchMaker URL in **Safari** (not Chrome — iOS only lets Safari install PWAs).
2. Tap the **Share** button (the square with an up-arrow at the bottom).
3. Scroll down and tap **Add to Home Screen**.
4. Name it and tap **Add**.
5. Launch from the new home screen icon. It will open fullscreen without the browser chrome.

#### Android (Chrome / Edge / Samsung Internet)

1. Open the MatchMaker URL in Chrome.
2. Tap the **⋮** menu in the top right.
3. Tap **Install app** (or **Add to Home screen**).
4. Confirm. The app icon is added to your home screen and app drawer.
5. Launch from the icon.

**Offline support**: after your first visit, the service worker caches all assets. You can use MatchMaker without internet.

**Data location**: everything is stored in your browser's `localStorage` on this device. Use **Export JSON** inside the app to back up, and **Import JSON** to restore on a new device.

---

## Usage walkthrough

### 1. Build your player database

- Home → **Player Database** → type a name → **Add**.
- Only do this once per new player. Their stats will accumulate across weeks.

### 2. Start a weekly event

- Home → **Start this week's event**.
- Tick the attendees. You can quick-add a new player here too.
- Set:
  - **Team size** (players per team)
  - **Number of courts**
  - **Match duration** (minutes)
  - **Total time budget** (minutes)
  - **Weekly expense** (¥) — split equally across attendees on commit
- Tap **Generate teams**.

### 3. Review teams

- Captains (ranked by win rate) are marked with 👑.
- Tap **🔄 Re-randomize** to roll again.
- Tap **🔀 Manual adjust** to swap two players between teams.
- The format preview at the bottom shows what will be played: groups + knockout, round-robin, single elimination, or friendly (depending on the mode picked in setup).
- Tap **📋 Copy schedule** to share the plan to a chat group.
- Tap **Start tournament** to lock in.

### 4. Run the tournament

- Each slot shows the matches on each court.
- Tap **A wins / Draw / B wins** for each match.
- The finish button appears once all ranked matches have a result.
- Tap **Finish & update points** → confirm → points and expense are committed.

### 5. Review / manage

- **Leaderboards** on home (points / win rate / spent tabs)
- **Player database** for individual stats (+ delete)
- **History** for expandable past-event detail
- **Expense statistics** card for total spent + reset (double-confirm) + undo (valid until next event commit)
- **Data** → **Export JSON** / **Import JSON**

---

## Architecture

```
MatchMaker/
├── web/                The actual app (PWA)
│   ├── index.html      Multi-view SPA layout
│   ├── style.css
│   ├── i18n.js         Translation module (zh-CN, en-US) + auto-detect
│   ├── storage.js      localStorage CRUD + schema migrations
│   ├── scheduler.js    Team formation + format recommendation + schedule generation
│   ├── app.js          View router + all UI interaction
│   ├── manifest.json   PWA manifest
│   └── sw.js           Service worker (offline cache)
├── tests/              node:test specs (JS unit + integration tests)
├── LICENSE             PolyForm Noncommercial 1.0.0
├── README.md           (this file)
└── README.zh-CN.md     Simplified Chinese mirror
```

### Data model

Schema in `localStorage` under key `matchmaker-data-v1`:

```jsonc
{
  "players": {
    "p_xxx": {
      "id": "p_xxx",
      "name": "Alice",
      "points": 30, "wins": 10, "draws": 0, "losses": 0,
      "events": 5,
      "totalSpent": 160.00
    }
  },
  "currentEvent": null | { ... },         // the in-progress event
  "history": [ { ... } ],                 // completed events with full snapshots
  "expenseBackup": null | { "p_xxx": 40 } // temporary undo after reset
}
```

Forward migrations live in `Storage._migrate()` — always additive so older saves upgrade on read.

### Algorithm notes

> **Friendship first.** Every team-formation and match-pairing
> algorithm in MatchMaker exists to make matches *competitive* —
> not to determine "who's actually the best". The goal is that two
> teams with similar overall skill (loose Elo proxy = win rate)
> end up across the net from each other so the games are fun for
> everyone, not blowouts. When that's not possible (small roster,
> skewed skill distribution), we degrade gracefully toward
> "everyone plays roughly equally and nobody sits around bored",
> and explicitly never toward "the strongest player gets the most
> points".

#### Skill estimate: cumulative win rate

The skill signal used everywhere is each player's cumulative win
rate from the persistent player database — `wins / (wins + draws +
losses)`, with games-played as a tiebreaker for the ranking sort.
This is a deliberately simple, transparent Elo proxy. We don't
maintain an actual Elo rating because the player database is
small-group / weekly-event scale where the simpler signal works
well and is easy for users to reason about.

#### `formBalancedTeams` — fixed weekly teams (cup formats)

Used by every cup format (groups+knockout, round-robin, single
elimination). Forms `T = floor(N / teamSize)` teams from the
ranked attendees in two phases:

1. **Snake-draft phase** for the top half (ranks `0..⌊N/2⌋ − 1`).
   Walks ranks in serpentine fantasy-draft order:
   - round 0 (forward):  rank 0 → T0, rank 1 → T1, ..., rank T−1 → T_{T−1}
   - round 1 (backward): rank T → T_{T−1}, rank T+1 → T_{T−2}, ...
   - round 2 (forward):  ...

   This places the highest-WR captains as `team[i].players[0]`
   (so display + manual swap still treat them as "captains") and
   then fills the rest of the top half such that the SUM of
   top-half rank indices is as equal as possible across teams.
   Worked example for 12 players × team_size 4:

   ```
   T0 picks: ranks {0, 5}  → rank-sum 5
   T1 picks: ranks {1, 4}  → rank-sum 5
   T2 picks: ranks {2, 3}  → rank-sum 5  ← perfectly balanced
   ```

2. **Random fill phase** for the bottom half (ranks `⌊N/2⌋..T·teamSize`).
   Shuffle and round-robin into teams that still have empty slots.
   Random distribution at this tier is fine because by definition
   these are the lower-WR players; even an "unlucky" pick won't
   create a major imbalance once the snake-balanced top half is
   set.

For `teamSize = 2` (the most common case) the snake phase only
fills the top `T` captains and the bottom half is purely random
— exactly the historical "captain + 1 random" rule. The snake
matters mostly when team sizes grow (3, 4, 5+), where a pure
random fill of `2T+` non-captain players could create wildly
unbalanced teams.

Spectators: if `N % teamSize > 0`, the leftover players sit out
as "spectators". The user can adjust attendees on the setup view
to land on a clean multiple.

#### `planRoundRobin` — circle method

Berger/circle method: `T − 1` rounds (T even) or `T` rounds (T
odd, one team has a bye each round). Each round packs as many
matches in parallel as the court count allows. `floor(T/2)`
matches per round, slot count grows with the team count.

#### `planGroupsKnockout` — groups + bracket

Tries group sizes of 4 first, then 3, picking whichever produces
a feasible plan within the time budget. Top 2 of each group
advance. The advancing teams form a power-of-two knockout bracket
(extras dropped from the lowest seeds if the count isn't a
power of 2). During the knockout phase, **one court is reserved
for free friendly matches** between eliminated teams whenever
the round has spare capacity (`numCourts > matches needed in
this round`). Eliminated players don't sit around bored.

#### `planPureKnockout` — single elimination

Standard tennis-seeded bracket via `seedBracket()`: top seed and
second seed land on opposite halves so they can only meet in the
final. **Requires the team count to be a power of 2** (2 / 4 / 8
/ 16 / 32). Non-power-of-2 team counts are explicitly rejected so
the user picks a different mode rather than getting an awkward
bye structure. Knockout rounds also reserve a friendly court for
eliminated teams.

#### `planRandomFairFallback` / `planFriendly` — template-based per-match selection

The most algorithmically elaborate planner, used by both the
explicit Friendly mode and the Auto mode's last-resort fallback.
There are no fixed weekly teams here — every match has its own
ad-hoc cohort and team split.

**The user-facing rule** (keeping the "friendship first" framing):

1. Sort attendees by cumulative win rate. Top 50% = STRONG pool,
   bottom 50% = WEAK pool.
2. Each match picks one of `teamSize + 1` templates indexed by
   `k` = strong-per-team count:
   - `k = 0` → all-weak vs all-weak (`WW vs WW`)
   - `k = teamSize` → all-strong vs all-strong (`SS vs SS`)
   - intermediate `k` → mixed (`SW vs SW`, `SSW vs SSW`, etc.)

   For `teamSize = 2` this is exactly the user's "三个模板" spec:
   `WW-WW / SW-SW / SS-SS`. For larger team sizes the template
   list extends naturally.
3. The chosen template determines how many strong + weak players
   are drawn from each pool. If the requested pool is short, the
   deficit is filled from the other pool.
4. Inside the match, strong players are distributed round-robin
   across the teams and weak players are distributed snake-style,
   so each team ends up with the right `k` strong + `(teamSize − k)`
   weak split.

**Three refinements on top of the basic template draw**:

a. **Pool-balance bias** (equal participation). Before picking a
   template, we compute the average game-count of the strong pool
   vs the weak pool. If they're unequal, we **force the extreme
   corrective template** — `k = teamSize` (all-strong) when
   strong is under-played, `k = 0` (all-weak) when weak is. Mixed
   templates can't actually close a participation gap because
   they add to both pools equally; only the extremes do. This
   keeps every player's match count even across the event when
   the math allows it.

b. **No-repeat tracking** (the user's "尽量不要出现 已经在同一个
   场子出现过的相同的人 重新组合后出现在另一场" rule). Every
   cohort generated this event is recorded in `allCohortKeys`
   (sorted player-id string). When picking a new cohort, we
   retry the template's selection a few times (the per-pool
   greedy selector has random tiebreakers, so retries can
   produce different SW combinations) and accept the first
   cohort whose key isn't already used. SS-SS and WW-WW have
   only one possible cohort each on small rosters, so each can
   be used at most once per event before the no-repeat rule
   forces a switch to SW. If even SW can't produce a fresh
   cohort, the algorithm accepts the forced repeat — it's
   mathematically unavoidable.

c. **Cross-pool fallback** (the user's "群体不够的话再从剩下的人
   中随机抽" rule). If the chosen pool is too small to fill the
   template demand (e.g. on the second court of a slot, the
   strong pool may already be partially used), the deficit is
   drawn from the other pool. The exclusion logic is careful:
   `pickFromPool` excludes players already in the running cohort
   (not just the slot-wide used set), otherwise the cross-pool
   fallback could re-pick a player already chosen on a previous
   leg, producing duplicate-player matches. (This was a real
   bug — see `tests/fallback.test.js` "no match has duplicate
   players".)

**Why a template approach instead of pure greedy snake?** A
greedy "pick the 4 lowest-co-occurrence players, snake them by
WR" approach (which the project tried before this rewrite) tends
to cluster the same skill tier together every match, because
when game counts are tied the WR ordering dominates. The
template approach explicitly cycles through `WW / SW / SS`
patterns, so over the course of an event the user sees ALL
THREE shapes — strong-vs-strong skirmishes, weak-vs-weak rallies,
and mixed pickup matches — instead of "the top 4 always playing
each other".

**Why is this still 'friendship first'?** Within a single match,
the template structure guarantees both teams have the same
strong-count and weak-count, so the two sides are balanced by
construction. Pool-balance bias ensures everyone plays roughly
the same number of matches. No-repeat tracking ensures the same
4 people don't get stuck playing only with each other. The
result: every match feels competitive, and over the course of
the event everyone plays with and against many different
opponents.

#### Friendly result accounting

`planFriendly` is a thin wrapper around `planRandomFairFallback`
that stamps every match as `kind: 'friendly'`. `commitEvent`'s
delta accumulator calls `accumulateDelta(..., countPoints=false)`
for friendly matches: wins / draws / losses are still recorded
(so the win-rate leaderboard, head-to-head records, and player
detail stats reflect friendly results), but **no tournament
points are awarded** — the points leaderboard is unaffected.
The same rule propagates through `getHeadToHead`, the history
detail view, and the post-event summary.

#### Group standings tiebreaker

`computeGroupTable` sorts by **points → score difference →
deterministic random**. The "random" is a stable djb2 hash of
`(team.id, event.date, groupIdx)`, so the resolved order is
identical on every read (no flicker when re-rendering the
tournament view) but doesn't degenerate to "lower team index
wins" (which would be equivalent to no tiebreak at all).

When a group becomes complete (every group match has a recorded
result) AND has at least one tied position in its standings, the
tournament view shows a one-time popup notice via
`maybeShowTiebreakerNotices()`, explaining how the tie was
resolved (score-diff ranking, or random if score-diff was also
tied). Already-shown notices are persisted on
`ev.tiebreakerNoticesShown` so editing a result later doesn't
re-fire the popup.

#### Group-completion gate for placeholder resolution

Knockout matches in `planGroupsKnockout` are scheduled with
placeholder team refs like `"G1-1"` (first place in group 1) and
`"KR1-M2-W"` (winner of knockout round 1 match 2). These get
resolved at render time by `resolvePlaceholder`. **The G-branch
won't resolve until every match in that group has a recorded
result** (`isGroupComplete` gate) — otherwise the standings
would be a partial table where unplayed teams sit tied at 0 pts
and the "winner" would just be `teams[0]`. Before the gate, the
tournament view shows the human-readable label
`小组1第1 / Group 1 #1` instead of leaking a fake team name.

#### `planByMode` mode dispatch

A single entry point routes to the right planner based on the
user's setup-screen choice:

- `auto` — tries `recommendFormat` (groups+knockout → round-robin)
  first, then falls all the way through to `planFriendly` if
  neither cup format fits the time budget. **Always finds
  *something* the user can play**, even on tight budgets.
- `groups-knockout`, `round-robin`, `knockout`, `friendly` —
  explicit modes. If the chosen mode is infeasible, the UI alerts
  the user with the specific reason and refuses to proceed (no
  silent fallback). The user has to either change the mode or
  adjust a parameter (more time, more courts, fewer attendees).

## Testing

MatchMaker uses Node's built-in `node:test` runner (Node 18+) — zero dependencies.

```bash
# Run all tests
node --test tests/*.test.js
# (or, from the project root with no path, Node auto-discovers test files:)
node --test
```

See [tests/](tests/) for the specs.

## Contributing

This is a hobby project, but PRs and issues for bug fixes or noncommercial improvements are welcome. Please note the license: derivative works must also remain noncommercial.

## License

[PolyForm Noncommercial License 1.0.0](LICENSE). Personal use, hobby projects, educational institutions, charities, and public research organizations are all permitted. **Commercial use is prohibited.**

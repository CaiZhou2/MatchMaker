# MatchMaker — Architecture & Algorithms

**Languages**: English · [简体中文](ARCHITECTURE.zh-CN.md)

This document covers the things you'd want to know if you were modifying the code: the layout of the source tree, the on-disk data shape, and the algorithms that make MatchMaker tick. For the user-facing tour, see the [main README](../README.md). For the non-technical "how do I run an event" walkthrough, see the [Organizer Quick-Start Guide](ORGANIZER_GUIDE.md).

## Source layout

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
├── docs/               This file, the organizer guide, and translations
├── LICENSE             PolyForm Noncommercial 1.0.0
├── README.md           User-facing introduction
└── README.zh-CN.md     Simplified Chinese mirror
```

## Data model

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

Forward migrations live in `Storage._migrate()` — always additive so older saves upgrade on read. The same data is mirrored into IndexedDB as a shadow backup so iOS Safari's ITP `localStorage` cleanup doesn't wipe everything when a user skips a week.

### Event shape

Every event — whether a cup tournament or a record-only session — follows the same shape so `commitEvent` can stay format-agnostic:

```jsonc
{
  "date": "2026-04-09",
  "teamSize": 2, "numCourts": 2, "matchDuration": 15, "totalTime": 180,
  "expense": 200,
  "attendees": ["p_a", "p_b", ...],
  "teams": [ { "id": "t_0", "name": "Team 1", "players": ["p_a", ...] }, ... ],
  "plan": {
    "format": "groups-knockout" | "round-robin" | "knockout" | "friendly" | "random-fair" | "recordonly",
    "schedule": [ { "phase": "...", "round": 1, "slot": 1, "matches": [{ "court": 1, "team_a": 0, "team_b": 1, "kind": "ranked" | "friendly" }] } ],
    "slotsUsed": ..., "fits": true
  },
  "results": { "0:1": { "result": "A", "scoreA": 21, "scoreB": 18 }, ... },
  "phase": "setup" | "teams" | "running" | "recording" | "done"
}
```

`commitEvent` walks `plan.schedule`, looks each match up in `results`, and applies `accumulateDelta(..., countPoints = match.kind === 'ranked')`. This single rule covers every format: cup matches are `kind: 'ranked'`, friendly mode stamps `'friendly'`, and record-only mode lets the user choose per match.

## Algorithms

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

### Skill estimate: cumulative win rate

The skill signal used everywhere is each player's cumulative win
rate from the persistent player database — `wins / (wins + draws +
losses)`, with games-played as a tiebreaker for the ranking sort.
This is a deliberately simple, transparent Elo proxy. We don't
maintain an actual Elo rating because the player database is
small-group / weekly-event scale where the simpler signal works
well and is easy for users to reason about.

### `formBalancedTeams` — fixed weekly teams (cup formats)

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

### `planRoundRobin` — circle method

Berger/circle method: `T − 1` rounds (T even) or `T` rounds (T
odd, one team has a bye each round). Each round packs as many
matches in parallel as the court count allows. `floor(T/2)`
matches per round, slot count grows with the team count.

### `planGroupsKnockout` — groups + bracket

Tries group sizes of 4 first, then 3, picking whichever produces
a feasible plan within the time budget. Top 2 of each group
advance. The advancing teams form a power-of-two knockout bracket
(extras dropped from the lowest seeds if the count isn't a
power of 2). During the knockout phase, **one court is reserved
for free friendly matches** between eliminated teams whenever
the round has spare capacity (`numCourts > matches needed in
this round`). Eliminated players don't sit around bored.

### `planPureKnockout` — single elimination

Standard tennis-seeded bracket via `seedBracket()`: top seed and
second seed land on opposite halves so they can only meet in the
final. **Requires the team count to be a power of 2** (2 / 4 / 8
/ 16 / 32). Non-power-of-2 team counts are explicitly rejected so
the user picks a different mode rather than getting an awkward
bye structure. Knockout rounds also reserve a friendly court for
eliminated teams.

### `planRandomFairFallback` / `planFriendly` — template-based per-match selection

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

### Friendly result accounting

`planFriendly` is a thin wrapper around `planRandomFairFallback`
that stamps every match as `kind: 'friendly'`. `commitEvent`'s
delta accumulator calls `accumulateDelta(..., countPoints=false)`
for friendly matches: wins / draws / losses are still recorded
(so the win-rate leaderboard, head-to-head records, and player
detail stats reflect friendly results), but **no tournament
points are awarded** — the points leaderboard is unaffected.
The same rule propagates through `getHeadToHead`, the history
detail view, and the post-event summary.

### Group standings tiebreaker

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

### Group-completion gate for placeholder resolution

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

### `planByMode` mode dispatch

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

### Record-only mode (no scheduler involvement)

Record-only mode bypasses every planner above. The setup view
exposes a separate "Record-only mode" button next to the regular
"Generate teams" flow; tapping it creates an event with
`plan.format = 'recordonly'`, an empty `plan.schedule`, and an
empty `teams` array, then drops the user into a dedicated view
where they can add match cards on demand.

Each match card is fully editable until the user taps "Finish &
submit all matches":

- Tapping a player chip cycles through `none → Team A → Team B → none`,
  mutating the relevant `ev.teams[m.team_a].players` array in place.
  Indices into `ev.teams` are stable (we never reorder), so cards
  added earlier keep working when later ones are removed.
- Each card has its own score inputs, A/D/B result buttons, and a
  "this match counts for points" checkbox. The checkbox flips the
  match's `kind` between `'ranked'` and `'friendly'`, which is
  exactly the same flag the friendly-mode planner uses. Auto-derive:
  filling both score fields sets the result automatically.
- Removing a card splices the slot out of `plan.schedule`,
  re-keys `ev.results` so the slot indices stay contiguous, and
  leaves the now-orphaned team objects in `ev.teams` (harmless,
  keeps the indices in surviving cards stable).
- "Finish & submit all matches" walks every card and validates
  that both teams are non-empty and a result is set. If anything
  is incomplete, the user gets a pinpoint alert ("Match 3 is
  incomplete: …") and the commit is blocked.

Once validation passes, `commitEvent` runs the same code path as
any other format. There is no record-only-specific commit logic —
the per-match `kind` flag is the only thing that distinguishes a
ranked record-only match from a friendly one, and that flag is
already understood by `accumulateDelta`.

# 🏆 MatchMaker

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
├── README.zh-CN.md     Simplified Chinese mirror
└── CLAUDE.md           Project guide for AI assistants
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

- **Balanced draft**: `T = floor(N / teamSize)`; top `T` players by win rate become captains (one per team); remaining players are shuffled and round-robin into teams. Tiebreakers for the ranking: games played desc, then random.
- **Round-robin**: Berger/circle rotation, parallelized across available courts.
- **Groups + knockout**: tries groups of 4, then 3; advances top 2 per group; builds a power-of-two knockout bracket. Reserves one court per knockout slot for friendly matches when the round has spare capacity.
- **Pure single elimination**: standard tennis-style seeded bracket (`seedBracket()`) so the top seed and second seed end up on opposite halves and can only meet in the final. Requires the team count to be a power of 2 (2/4/8/16/32) — non-power-of-2 counts are explicitly rejected so the user picks a different mode rather than getting an awkward bye structure.
- **Friendly mode** (`planFriendly`): wraps `planRandomFairFallback` and stamps every match as `kind: 'friendly'`. `commitEvent`'s accumulator passes `countPoints=false` for friendly matches — they update wins / draws / losses (so the win-rate leaderboard and head-to-head reflect them) but never award tournament points (so the points leaderboard is unaffected). The same rule applies in the head-to-head walker and history detail.
- **Mode dispatch**: a single `planByMode(mode, opts)` entry point routes to the right planner. The `auto` mode preserves the historical "smart pick" behaviour (groups+knockout → round-robin → friendly). The other four modes are explicit — if the chosen mode is infeasible, the UI alerts and refuses to proceed (no silent fallback).

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

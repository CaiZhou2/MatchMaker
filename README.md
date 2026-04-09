# 🏆 MatchMaker

**Languages**: English · [简体中文](README.zh-CN.md)

A mobile-friendly Progressive Web App for planning weekly team tournaments. MatchMaker keeps a persistent roster of players, drafts balanced teams based on historical win rate, auto-picks a sensible cup format, runs the tournament, and tracks points and expenses across weeks — all in your phone's browser, no install or account required.

> **Non-commercial use only.** See [LICENSE](LICENSE).

---

## Features

- **Weekly cup workflow**: pick attendees → auto-form balanced teams → play → record results → commit
- **Balanced draft**: top `N` players by win rate become captains (one per team); the rest are distributed randomly round-robin
- **Auto format recommendation**: prefers group stage + knockout, falls back to round-robin for small fields, automatically respects time and court budgets
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

**First, host the `web/` folder somewhere your phone can reach.** Easiest options:

| Option | Cost | Notes |
| --- | --- | --- |
| **GitHub Pages** | Free | Push `web/` to a repo, enable Pages — gets you HTTPS automatically |
| **Netlify / Vercel (drop)** | Free | Drag-and-drop `web/` onto their dashboard |
| **Self-host (LAN)** | Free | `python3 -m http.server` on a laptop on the same Wi-Fi |
| **Cloudflare Pages** | Free | Similar to Netlify |

> ⚠️ PWAs require **HTTPS** (except on `localhost`). GitHub Pages / Netlify / Vercel all provide HTTPS automatically.

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
- A recommended format is shown (groups + knockout, or round-robin).
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
├── algorithm/          Python prototype (algorithm validation)
│   └── scheduler.py
├── web/                The actual app (PWA)
│   ├── index.html      Multi-view SPA layout
│   ├── style.css
│   ├── i18n.js         Translation module (zh-CN, en-US) + auto-detect
│   ├── storage.js      localStorage CRUD + schema migrations
│   ├── scheduler.js    Team formation + format recommendation + schedule generation
│   ├── app.js          View router + all UI interaction
│   ├── manifest.json   PWA manifest
│   └── sw.js           Service worker (offline cache)
├── tests/              node:test specs + Python tests
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
- **Format selection**: prefer groups + knockout for `T ≥ 4`, otherwise round-robin. Falls back if the chosen plan doesn't fit the time budget.

## Testing

MatchMaker uses the Node `node:test` built-in runner (Node 18+) for the web code and plain Python for the algorithm prototype — zero dependencies.

```bash
# JS unit tests (storage, scheduler, i18n)
node --test tests/*.test.js
# (or, from the project root with no path, Node auto-discovers test files:)
node --test

# Python prototype tests
python3 tests/test_scheduler.py
```

See [tests/](tests/) for the specs.

## Contributing

This is a hobby project, but PRs and issues for bug fixes or noncommercial improvements are welcome. Please note the license: derivative works must also remain noncommercial.

## License

[PolyForm Noncommercial License 1.0.0](LICENSE). Personal use, hobby projects, educational institutions, charities, and public research organizations are all permitted. **Commercial use is prohibited.**

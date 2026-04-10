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
- **Balanced draft**: top `N` players by win rate become captains (one per team); the rest are distributed via snake-draft + random fill (see [algorithm details](docs/ARCHITECTURE.md))
- **Five tournament modes**: **Auto** (recommended — tries groups+knockout, then round-robin, then friendly), **Groups + Knockout**, **Round-robin**, **Single elimination**, **Friendly** (random fair pairings — no points, but win rate still updates)
- **Record-only mode**: skip the team-formation pipeline entirely — add match cards by hand, pick players per match, choose whether each match counts for points. All cards stay editable until you tap "Finish & submit all"
- **Free court during knockout**: reserves a court for eliminated teams' friendly matches
- **Points and win-rate leaderboards**: `Win = 3`, `Draw = 1`, `Loss = 0`
- **Expense tracking**: split venue cost, per-player running totals, reset with undo
- **Shareable schedule**: one-tap "copy as text" for group chats
- **History archive**: every committed event stored with full detail
- **Import / export**: full JSON backup / restore
- **Offline PWA** · **Multilingual** (zh-CN / en-US) · **Zero backend**

## Quick Start

### Run locally

```bash
git clone https://github.com/<your-user>/MatchMaker.git
cd MatchMaker/web
python3 -m http.server 8080
# open http://localhost:8080
```

Any static server works (`python3 -m http.server`, `npx serve`, GitHub Pages, Netlify, etc.).

### Install on your phone (PWA)

**Easiest option:** open **<https://CaiZhou2.github.io/MatchMaker/>** on your phone and follow the install step below.

<details>
<summary><strong>Or self-host your own copy</strong></summary>

| Option | Cost | Notes |
| --- | --- | --- |
| **GitHub Pages** | Free | Fork, enable Pages with Source = "GitHub Actions" — the bundled workflow handles the rest |
| **Cloudflare Pages** | Free | Connect your fork, output dir `web` |
| **Netlify / Vercel** | Free | Drag-and-drop `web/` onto their dashboard |
| **Self-host (LAN)** | Free | `python3 -m http.server` on the same Wi-Fi |

> ⚠️ PWAs require **HTTPS** (except on `localhost`).

</details>

**iOS (Safari):** Share → Add to Home Screen → launch from icon.
**Android (Chrome):** ⋮ menu → Install app → launch from icon.

---

## Documentation

| Document | Audience |
| --- | --- |
| [Organizer Quick-Start Guide](docs/ORGANIZER_GUIDE.md) | Non-technical users running events |
| [Architecture & Algorithms](docs/ARCHITECTURE.md) | Developers modifying the code |

Both documents are available in [English](docs/) and [简体中文](docs/).

---

## Testing

Node's built-in `node:test` runner (Node 18+) — zero dependencies.

```bash
node --test tests/*.test.js
# or: node --test
```

## Contributing

Hobby project — PRs and issues for bug fixes or noncommercial improvements are welcome. Derivative works must remain noncommercial per the license.

## License

[PolyForm Noncommercial License 1.0.0](LICENSE). Personal use, hobby projects, educational institutions, charities, and public research organizations are all permitted. **Commercial use is prohibited.**

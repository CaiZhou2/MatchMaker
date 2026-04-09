# MatchMaker — Organizer Quick Start

**Languages**: English · [简体中文](ORGANIZER_GUIDE.zh-CN.md)

🔗 **App URL**: **<https://CaiZhou2.github.io/MatchMaker/>**

You're running a weekly tournament and someone shared MatchMaker with you. This guide gets you from zero to "running my first event" in about 10 minutes — no coding, no accounts.

> **TL;DR**: Open the URL above on your phone → Add to Home Screen → start your first event. **Always export a backup after each event.** That's it.

---

## What is this?

MatchMaker is a small web app that lives in your phone's browser (no app store, no login, no internet needed during play). It does four things:

1. **Tracks your players** with running points and win-rate stats across weeks.
2. **Drafts balanced teams** automatically based on each player's win rate.
3. **Picks a tournament format** for the time and courts you have — you can let the app auto-choose, or pick from groups+knockout / round-robin / single elimination / friendly (no points).
4. **Records match results** as you play, then commits everyone's points + costs in one tap at the end.

All data lives on **your phone only**. Nothing is uploaded to a server, no other organizer can see it.

> 🤝 **Friendship first.** MatchMaker tries to make every match
> *competitive*, not to figure out who's "actually the best".
> Teams are drafted so the two sides have similar overall skill
> (we use cumulative win rate as a simple Elo proxy), and in
> friendly mode the algorithm explicitly cycles through three
> match patterns — strong-vs-strong, weak-vs-weak, and mixed —
> so over the course of an event everyone plays competitive
> games against many different opponents instead of getting
> stuck with the same crew or in lopsided blowouts.

---

## Step 1 — Install on your phone (one time, ~2 minutes)

The app is a PWA (Progressive Web App), which means it installs from a URL like a regular app icon — no App Store / Play Store needed.

### iOS (iPhone / iPad)

1. Open the MatchMaker URL **in Safari** (not Chrome — iOS only lets Safari install PWAs).
2. Tap the **Share** button (square with an up-arrow at the bottom of the screen).
3. Scroll down in the share sheet, tap **Add to Home Screen**.
4. Tap **Add** in the top right.
5. A 🏆 icon appears on your home screen. Tap it — the app opens fullscreen, no browser bar.

### Android

1. Open the MatchMaker URL in Chrome (or Edge / Samsung Internet / any modern browser).
2. Tap the **⋮** menu in the top right.
3. Tap **Install app** (or **Add to Home screen**).
4. Confirm the install dialog.
5. The 🏆 icon appears in your app drawer and home screen.

### Verify the install worked

- Close Safari / Chrome completely.
- Tap the home screen icon.
- The app should open fullscreen (no URL bar visible).
- Try turning your phone to **airplane mode** and reopen — it should still work. If yes, you're set; the app is fully installed and works offline.

---

## Step 2 — Set up your player roster (one time)

You only need to do this once. New players added later just get added on top.

1. Open the app → tap **📇 Player Database**.
2. Type a name, tap **Add**. Repeat for everyone in your group.
3. The list shows each player's points, win rate, weeks played, and total spent. All zeros to start.

> 💡 You don't have to add everyone right away. You can use the quick-add field on the event setup screen to add new people the first time they show up.

---

## Step 3 — Run your first event (~5 min setup, then play)

1. Home → **Start this week's event**.
2. **Tick the people who showed up today.** The count appears at the top.
3. Set the parameters:
   - **Players per team** — usually 2 for doubles, 1 for singles
   - **Courts** — how many courts you have
   - **Match duration (min)** — typical badminton match: 15
   - **Total time (min)** — how long the venue is booked for
   - **Tournament mode** — pick one of:
     - **Auto (recommended)** — let the app pick for you. It tries groups + knockout first, then round-robin, then friendly mode if neither fits the time budget. Always finds *something* you can play.
     - **Groups + Knockout** — explicit group stage followed by a knockout bracket. Needs at least 6 teams to form 2 groups.
     - **Round-robin only** — every team plays every other team once.
     - **Single elimination** — straight knockout bracket. **Requires the team count to be a power of 2** (2 / 4 / 8 / 16 / 32). If your numbers don't fit, the app will tell you to switch modes.
     - **Friendly only (no points)** — no fixed weekly teams. Teams are re-formed every match by win rate so everyone plays balanced matches. **No tournament points are awarded**, so the points leaderboard doesn't move. **But wins / draws / losses ARE recorded**, so the win-rate leaderboard and head-to-head stats still update — friendly matches still affect skill rating, just not standings. Good for casual sessions / mixed-skill warm-ups / "we just want to play" days.
4. **This week's expense** — the venue cost in your local currency. The app splits it equally across attendees automatically when you finish the event.
5. Tap **Generate teams**.

> ⚠️ The four explicit modes (everything except Auto) **don't silently fall back**. If your chosen mode can't fit the current attendees + time + courts budget, the app alerts you and stays on the setup view — you have to either change the mode or change a parameter. Auto is the only mode that's guaranteed to find something playable.

### What you'll see

- **Teams** — the auto-generated lineup. The 👑 marks the captain (highest win rate per team). Each team gets one captain plus randomly distributed other players, so the teams are roughly balanced in skill. *(Friendly mode is different — see the friendly notice.)*
- **Friendly mode notice** — if you picked Friendly (or Auto fell back to it), you'll see a banner explaining that teams change every match and results don't count toward the leaderboard. The display shows the per-slot match preview instead of static team cards.
- **Format preview** — the format and stats (X matches · Y slots · ~Z minutes) the app will run with the current settings.
- **🔄 Re-randomize** — roll the draft again (or re-randomise the friendly cohorts)
- **🔀 Manual swap** — tap two players to swap them between teams (fixed-team modes only)
- **📋 Copy schedule** — copies the schedule as plain text. Paste into your group chat so everyone knows what's happening.

When you're happy with the lineup, tap **Start tournament**.

---

## Step 4 — Recording match results (during play)

The tournament view shows every match in time-slot order. For each match:

- **A wins / Draw / B wins** buttons record the result with one tap.
- Or, type the actual scores in the two number fields (e.g. `21` and `15`) — the result is auto-determined and stored alongside the scores.
- Tapping the same result button again clears it (in case you tapped wrong).

Progress bar at the top shows `done / total` matches. The **Finish & update points** button only appears once every match has a recorded result.

> 💡 Score entry is optional. If you're playing fast and just want to mark wins/losses, the three buttons are enough. Scores give you a tie-breaker for groups + nicer history detail.

---

## Step 5 — Finishing the event (the most important step)

Tap **Finish & update points** → confirm.

The app does three things automatically:

1. **Writes everyone's new points / wins / losses / spending into the database.** Once committed, this can't be un-done from the app.
2. **Auto-downloads a backup file** named `matchmaker-backup-YYYY-MM-DD.json` to your phone's Downloads folder. A green "Backup downloaded" notice appears on the success screen.
3. **Offers a "📤 Share backup" button** (on phones that support it). Tap it to send the backup file to yourself in one tap.

### ⚠️ Read this part — it's the difference between zero data loss and crying

**Always send the auto-downloaded backup somewhere safe.** The simplest workflow:

- Tap **📤 Share backup** → choose your messenger of choice → send it to yourself (e.g. your own "saved messages" / "file transfer" chat in Telegram, WhatsApp, WeChat, etc.).
- That's it. Your backup is now in the cloud, accessible from any device, free, forever.
- Alternatively: send it to yourself via email, AirDrop to your laptop, save to iCloud Drive, etc.

**Why this matters:**

- iOS Safari has a "smart" privacy feature called ITP that may delete your stored data after **7 days of not opening the app**. If you skip a week of tournaments, you may come back to find everything reset to zero.
- Switching phones / clearing your browser / a browser bug can also wipe everything.
- The app has internal safeguards (it mirrors data to a more durable storage layer too), but **a file in your chat history is the only 100% reliable backup**.

**If the worst happens** (app shows zero players when you know you had some): see Troubleshooting below.

---

## Step 6 — Looking at stats during the week

The home screen has three leaderboard tabs:

- **Points** — cumulative points. Win = 3, Draw = 1, Loss = 0.
- **Win Rate** — wins ÷ total games.
- **Attendance** — most weeks attended (good for "regular member of the year" type fun).

Tap any player in the **Player Database** or use **🔍 Find Player** to see their detailed page: full stat breakdown plus a head-to-head table showing their record against every other player.

The expense card on the home screen shows the running total spent. **📋 Copy expense info** copies the per-player breakdown for sharing in your group chat ("here's what everyone owes"). **🗑 Reset expenses** resets all totals (e.g., at the start of a new month) — there's a one-step undo until the next event is committed.

---

## Updates

When the developer pushes new features, you'll see a banner at the top of the app saying **"✨ A new version is available"**. Tap **Update now** and the app reloads with the new version. Your data is preserved across updates.

If you don't see the banner but think there should be a new version: close the app completely (swipe it away from your recent apps) and reopen. The banner will appear if there's an update.

---

## Importing data on a new phone (or after a wipe)

1. Get the backup JSON file onto the new phone (e.g. download it from your saved chat / email).
2. Open MatchMaker on the new phone.
3. Tap **📇 Player Database** → scroll to **Import / Export** → tap **📥 Import JSON**.
4. Pick the backup file. The app shows you "X players, Y history entries — confirm?" → tap OK.
5. Done. Everything is back.

---

## Troubleshooting

**The app shows zero players, but I had data yesterday.**
- iOS Safari may have cleared `localStorage` due to ITP (the 7-day cleanup).
- The app's IndexedDB shadow backup *should* automatically restore the data on next open. If it does, you'll just see your players reappear silently.
- If it doesn't, import the most recent JSON backup you have (see "Importing data on a new phone" above).

**I can't add the app to my home screen on iOS.**
- You must use Safari, not Chrome or any other browser. iOS restricts PWA install to Safari.

**The 📤 Share backup button doesn't appear on the success screen.**
- Your browser doesn't support the Web Share API for files. The app should still have auto-downloaded the backup to your Downloads folder — just share it manually from there.

**Score entry doesn't auto-fill the result.**
- Both score fields need to be filled. As soon as both have a number, the result is set automatically (higher = winner, equal = draw).

**I tapped the wrong result button.**
- Tap the correct one. The new value overwrites the old one. (Tapping the *same* button again clears the result — you can also use that to undo and re-enter.)

**I want to fix a player name / merge two players.**
- Currently the only way is: export → edit the JSON file by hand → import. The app doesn't have a built-in rename or merge yet.

**The tournament won't fit in my time budget.**
- If you're in **Auto** mode, the app falls back automatically (groups+knockout → round-robin → friendly mode). You'll see a banner explaining the switch.
- If you picked an **explicit** mode (groups+knockout / round-robin / single elimination / friendly), the app will alert you with the specific reason and refuse to proceed. Your options: switch to a different mode (Auto is the easiest fix), add time, add courts, or change attendees.

**Single elimination says my team count isn't a power of 2.**
- That mode only accepts 2 / 4 / 8 / 16 / 32 teams to keep the bracket clean. Either switch to Groups+Knockout (handles any team count), or add/remove an attendee to land on a power of 2.

---

## Need help?

If something's broken or unclear, file a GitHub issue at [the repository](../../). Pull requests are welcome too — see the main [README](../README.md) for contribution notes.

If MatchMaker has been useful for your group, please consider **starring the repository** ⭐ — it helps other organizers find the project.

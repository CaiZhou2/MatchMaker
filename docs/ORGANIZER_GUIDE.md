# MatchMaker — Organizer Quick Start

**Languages**: English · [简体中文](ORGANIZER_GUIDE.zh-CN.md)

You're running a weekly tournament and someone shared MatchMaker with you. This guide gets you from zero to "running my first event" in about 10 minutes — no coding, no accounts.

> **TL;DR**: Open the URL on your phone → Add to Home Screen → start your first event. **Always export a backup after each event.** That's it.

---

## What is this?

MatchMaker is a small web app that lives in your phone's browser (no app store, no login, no internet needed during play). It does four things:

1. **Tracks your players** with running points and win-rate stats across weeks.
2. **Drafts balanced teams** automatically based on each player's win rate.
3. **Picks a tournament format** for the time and courts you have (groups + knockout, round-robin, or random pairing).
4. **Records match results** as you play, then commits everyone's points + costs in one tap at the end.

All data lives on **your phone only**. Nothing is uploaded to a server, no other organizer can see it.

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

1. Open the app → tap **📋 选手数据库** (Player Database).
2. Type a name, tap **添加** (Add). Repeat for everyone in your group.
3. The list shows each player's points, win rate, weeks played, and total spent. All zeros to start.

> 💡 You don't have to add everyone right away. You can use the **快速添加** (Quick Add) field on the event setup screen to add new people the first time they show up.

---

## Step 3 — Run your first event (~5 min setup, then play)

1. Home → **开始本周比赛** (Start this week's event).
2. **Tick the people who showed up today.** The count appears at the top.
3. Set the four parameters:
   - **每队人数** (Players per team) — usually 2 for doubles, 1 for singles
   - **场地数** (Courts) — how many courts you have
   - **每场时长** (Match duration, minutes) — typical badminton match: 15
   - **总时间** (Total time, minutes) — how long the venue is booked for
4. **本周消费** (This week's expense) — the venue cost in your local currency. The app splits it equally across attendees automatically when you finish the event.
5. Tap **生成队伍** (Generate teams).

### What you'll see

- **Teams** — the auto-generated lineup. The 👑 marks the captain (highest win rate per team). Each team gets one captain plus randomly distributed other players, so the teams are roughly balanced in skill.
- **Recommended format** — the app picks groups+knockout for ≥4 teams with enough time, round-robin for fewer teams or tighter time, and a "random fair" fallback if neither cup format fits.
- **🔄 Re-randomize** — roll the captains again
- **🔀 Manual swap** — tap two players to swap them between teams
- **📋 复制比赛安排** — copies the schedule as plain text. Paste into your group chat (WeChat, Telegram, etc.) so everyone knows what's happening.

When you're happy with the lineup, tap **开始比赛** (Start tournament).

---

## Step 4 — Recording match results (during play)

The tournament view shows every match in time-slot order. For each match:

- **A wins / Draw / B wins** buttons record the result with one tap.
- Or, type the actual scores in the two number fields (e.g. `21` and `15`) — the result is auto-determined and stored alongside the scores.
- Tapping the same result button again clears it (in case you tapped wrong).

Progress bar at the top shows `done / total` matches. The **完成比赛 & 更新积分** (Finish & update points) button only appears once every match has a recorded result.

> 💡 Score entry is optional. If you're playing fast and just want to mark wins/losses, the three buttons are enough. Scores give you a tie-breaker for groups + nicer history detail.

---

## Step 5 — Finishing the event (the most important step)

Tap **完成比赛 & 更新积分** → confirm.

The app does three things automatically:

1. **Writes everyone's new points / wins / losses / spending into the database.** Once committed, this can't be un-done from the app.
2. **Auto-downloads a backup file** named `matchmaker-backup-YYYY-MM-DD.json` to your phone's Downloads folder. You'll see a green "💾 备份已自动下载" notice on the success screen.
3. **Offers a "📤 分享备份" button** (on phones that support it). Tap it to send the backup file to yourself via WeChat / email / AirDrop in one tap.

### ⚠️ Read this part — it's the difference between zero data loss and crying

**Always send the auto-downloaded backup somewhere safe.** The simplest workflow:

- Tap **📤 分享备份** → choose **WeChat (微信)** → choose **文件传输助手 (File Transfer)**.
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

- **积分榜** (Points) — cumulative points. Win = 3, Draw = 1, Loss = 0.
- **胜率榜** (Win Rate) — wins ÷ total games.
- **参与榜** (Attendance) — most weeks attended (good for "regular member of the year" type fun).

Tap any player in the **选手数据库** (Player Database) or use **🔍 选手查询** (Find Player) to see their detailed page: full stat breakdown plus a head-to-head table showing their record against every other player.

The expense card on the home screen shows the running total spent. **复制消费信息** copies the per-player breakdown for sharing in your group chat ("here's what everyone owes"). **清零消费** resets all totals (e.g., at the start of a new month) — there's a one-step undo until the next event is committed.

---

## Updates

When the developer pushes new features, you'll see a banner at the top of the app saying **"✨ 有新版本可用 / Update now"**. Tap **立即更新** and the app reloads with the new version. Your data is preserved across updates.

If you don't see the banner but think there should be a new version: close the app completely (swipe it away from your recent apps) and reopen. The banner will appear if there's an update.

---

## Importing data on a new phone (or after a wipe)

1. Get the backup JSON file onto the new phone (e.g. download it from WeChat 文件传输助手).
2. Open MatchMaker on the new phone.
3. Tap **📋 选手数据库** → scroll to **数据导入 / 导出** → tap **📥 导入 JSON**.
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

**The 📤 分享备份 button doesn't appear on the success screen.**
- Your browser doesn't support the Web Share API for files. The app should still have auto-downloaded the backup to your Downloads folder — just share it manually from there.

**Score entry doesn't auto-fill the result.**
- Both score fields need to be filled. As soon as both have a number, the result is set automatically (higher = winner, equal = draw).

**I tapped the wrong result button.**
- Tap the correct one. The new value overwrites the old one. (Tapping the *same* button again clears the result — you can also use that to undo and re-enter.)

**I want to fix a player name / merge two players.**
- Currently the only way is: export → edit the JSON file by hand → import. The app doesn't have a built-in rename or merge yet.

**The tournament won't fit in my time budget.**
- The app will automatically fall back to "random pairing" mode when the cup format doesn't fit. You'll see a banner explaining the switch. If even that doesn't work, the only options are: more time, more courts, fewer attendees, or shorter matches.

---

## Need help?

If something's broken or unclear, file a GitHub issue at [the repository](../../). Pull requests are welcome too — see the main [README](../README.md) for contribution notes.

If MatchMaker has been useful for your group, please consider **starring the repository** ⭐ — it helps other organizers find the project.

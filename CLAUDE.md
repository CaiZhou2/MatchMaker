# MatchMaker - Project Guide

## Project Overview
MatchMaker is a mobile-friendly weekly tournament scheduling app. It tracks a roster of players across events, auto-forms balanced teams based on historical ranking, picks a suitable cup format, runs the tournament, and updates points.

## Workflow (per weekly event)
1. **Database**: persistent player database with points/wins/draws/losses. Stored locally (localStorage in PWA).
2. **Attendance**: pick this week's attendees from the database (or add new players).
3. **Balanced team formation**:
   - Sort attendees by **win rate** (descending). Tiebreakers: games played desc, then random.
   - `T = floor(N / teamSize)` teams are created.
   - Top T players become captains — one per team.
   - Remaining players are shuffled and distributed round-robin into the teams.
   - Manual swap/adjust is allowed after auto-generation.
4. **Format recommendation**: given team count, match duration, courts, and time budget, the app picks a format — prefer **group stage + knockout**. Falls back to round-robin for few teams.
5. **Tournament**: generate schedule, enter results per match.
   - **Points**: Win = +3, Draw = +1, Loss = 0. Applied per player on the team.
   - **Knockout phase**: reserve at least one court (if available) for eliminated teams' friendly matches (no points), so eliminated players aren't bored.
6. **Commit**: confirm results → database is updated.

## Input Parameters
- Player names (from database or newly added)
- Team size (players per team)
- Match duration (minutes)
- Number of courts
- Total time budget (minutes)

## Leaderboards
- **Points leaderboard**: sorted by cumulative points (W=3, D=1, L=0).
- **Win rate leaderboard**: sorted by `wins / (wins + draws + losses)`, tiebroken by games played.
- Both shown as tabs on the home screen.

## History & Data Portability
- Every completed event is archived with full detail: teams, match results, per-player point deltas, and player name snapshots (readable even if a player is later deleted).
- History view shows past events with expandable detail.
- Export: full data dump (players + history + current event) as a JSON file download.
- Import: JSON file upload, replaces existing data after confirmation.

## Project Structure
- `algorithm/` — Python algorithm prototype for validation
- `web/` — PWA frontend (HTML/CSS/JS), the actual mobile app
  - `storage.js` — localStorage CRUD for player DB and current event
  - `scheduler.js` — team formation + format recommendation + schedule generation
  - `app.js` — UI view router and interaction
  - `index.html` / `style.css` — multi-view SPA
  - `sw.js` / `manifest.json` — PWA setup

## Development Rules
- **Do NOT install any system tools/packages without discussing with the user first.** Always ask before running `apt install`, `pip install`, `npm install`, etc.
- Requirements evolve iteratively. Expect the user to update requirements step-by-step. Keep the code modular to absorb changes cleanly.

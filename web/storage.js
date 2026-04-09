/**
 * MatchMaker - localStorage persistence layer
 *
 * Schema:
 * {
 *   players: { [id]: { id, name, points, wins, draws, losses, events } },
 *   currentEvent: null | {
 *     date, teamSize, matchDuration, numCourts, totalTime,
 *     attendees: [id],
 *     teams: [{ id, name, players: [id] }],
 *     plan: <scheduler output>,
 *     results: { [matchKey]: 'A'|'B'|'D' },
 *     phase: 'setup'|'teams'|'running'|'done'
 *   },
 *   history: [{ date, summary, results }]
 * }
 */

const STORAGE_KEY = 'matchmaker-data-v1';

const Storage = {
  _data: null,

  load() {
    if (this._data) return this._data;
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      const parsed = raw ? JSON.parse(raw) : null;
      this._data = this._migrate(parsed);
    } catch (e) {
      console.error('Storage load failed:', e);
      this._data = this._empty();
    }
    return this._data;
  },

  save() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this._data));
    } catch (e) {
      console.error('Storage save failed:', e);
    }
  },

  _empty() {
    return { players: {}, currentEvent: null, history: [], expenseBackup: null };
  },

  // Forward-migrate data shape so older saves don't crash newer code.
  _migrate(data) {
    if (!data || typeof data !== 'object') return this._empty();
    if (typeof data.players !== 'object' || data.players === null) data.players = {};
    if (!Array.isArray(data.history)) data.history = [];
    if (data.currentEvent === undefined) data.currentEvent = null;
    if (data.expenseBackup === undefined) data.expenseBackup = null;
    // Ensure every player has the expected fields
    Object.values(data.players).forEach(p => {
      if (p.points === undefined) p.points = 0;
      if (p.wins === undefined) p.wins = 0;
      if (p.draws === undefined) p.draws = 0;
      if (p.losses === undefined) p.losses = 0;
      if (p.events === undefined) p.events = 0;
      if (p.totalSpent === undefined) p.totalSpent = 0;
    });
    return data;
  },

  // ─── Players ──────────────────────────────────────────────
  getAllPlayers() {
    const d = this.load();
    return Object.values(d.players);
  },

  getPlayer(id) {
    return this.load().players[id] || null;
  },

  getPlayerByName(name) {
    return this.getAllPlayers().find(p => p.name === name) || null;
  },

  addPlayer(name) {
    name = name.trim();
    if (!name) return null;
    const d = this.load();
    if (this.getPlayerByName(name)) return null;  // duplicate
    const id = 'p_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6);
    d.players[id] = {
      id, name,
      points: 0, wins: 0, draws: 0, losses: 0,
      events: 0,
      totalSpent: 0,
    };
    this.save();
    return d.players[id];
  },

  deletePlayer(id) {
    const d = this.load();
    delete d.players[id];
    this.save();
  },

  renamePlayer(id, newName) {
    const d = this.load();
    if (d.players[id]) {
      d.players[id].name = newName.trim();
      this.save();
    }
  },

  // ─── Current Event ────────────────────────────────────────
  getCurrentEvent() {
    return this.load().currentEvent;
  },

  setCurrentEvent(ev) {
    const d = this.load();
    d.currentEvent = ev;
    this.save();
  },

  clearCurrentEvent() {
    const d = this.load();
    d.currentEvent = null;
    this.save();
  },

  // ─── Win rate helpers ─────────────────────────────────────
  getWinRate(player) {
    if (!player) return 0;
    const total = (player.wins || 0) + (player.draws || 0) + (player.losses || 0);
    return total > 0 ? player.wins / total : 0;
  },

  getTotalGames(player) {
    if (!player) return 0;
    return (player.wins || 0) + (player.draws || 0) + (player.losses || 0);
  },

  // ─── Commit event results to database ─────────────────────
  commitEvent() {
    const d = this.load();
    const ev = d.currentEvent;
    if (!ev) return;

    if (!Array.isArray(d.history)) d.history = [];

    // Compute per-player point/wld deltas for this event (for history archival)
    const delta = {};
    ev.attendees.forEach(pid => {
      delta[pid] = { points: 0, wins: 0, draws: 0, losses: 0, spent: 0 };
    });

    Object.entries(ev.results || {}).forEach(([key, result]) => {
      const match = findMatchByKey(ev.plan, key);
      if (!match || match.kind !== 'ranked') return;
      const ta = resolveTeam(match.team_a, ev);
      const tb = resolveTeam(match.team_b, ev);
      if (!ta || !tb) return;
      accumulateDelta(delta, ta, tb, result);
    });

    // Split the weekly expense equally across attendees
    const expense = Number(ev.expense) || 0;
    const attendeeCount = ev.attendees.length;
    const perHead = attendeeCount > 0 ? expense / attendeeCount : 0;
    if (perHead > 0) {
      ev.attendees.forEach(pid => {
        if (delta[pid]) delta[pid].spent = perHead;
      });
    }

    // Apply deltas to DB + bump events count for attendees
    ev.attendees.forEach(pid => {
      if (d.players[pid]) d.players[pid].events += 1;
    });
    Object.entries(delta).forEach(([pid, dx]) => {
      const p = d.players[pid];
      if (!p) return;
      p.points += dx.points;
      p.wins += dx.wins;
      p.draws += dx.draws;
      p.losses += dx.losses;
      p.totalSpent = (p.totalSpent || 0) + (dx.spent || 0);
    });

    // A new event's expenses invalidate any prior "reset" undo backup.
    d.expenseBackup = null;

    // Snapshot player names at commit time (so history remains readable if players deleted)
    const nameSnapshot = {};
    ev.attendees.forEach(pid => {
      if (d.players[pid]) nameSnapshot[pid] = d.players[pid].name;
    });

    // Archive full event detail to history
    d.history.push({
      id: 'h_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
      date: ev.date,
      teamSize: ev.teamSize,
      numCourts: ev.numCourts,
      matchDuration: ev.matchDuration,
      totalTime: ev.totalTime,
      expense,
      attendees: ev.attendees.slice(),
      teams: JSON.parse(JSON.stringify(ev.teams)),
      plan: JSON.parse(JSON.stringify(ev.plan)),
      results: { ...ev.results },
      delta,
      nameSnapshot,
    });

    d.currentEvent = null;
    this.save();
  },

  // ─── Expense helpers ──────────────────────────────────────
  getTotalSpent() {
    return this.getAllPlayers().reduce((s, p) => s + (p.totalSpent || 0), 0);
  },

  // Wipe all players' totalSpent. Keeps a snapshot so the user can undo
  // until the next event commit. Returns the snapshot size.
  resetExpenses() {
    const d = this.load();
    const snapshot = {};
    Object.values(d.players).forEach(p => {
      snapshot[p.id] = p.totalSpent || 0;
      p.totalSpent = 0;
    });
    d.expenseBackup = snapshot;
    this.save();
  },

  hasExpenseBackup() {
    const d = this.load();
    return !!(d.expenseBackup && Object.keys(d.expenseBackup).length > 0);
  },

  undoExpenseReset() {
    const d = this.load();
    if (!d.expenseBackup) return false;
    Object.entries(d.expenseBackup).forEach(([pid, amount]) => {
      if (d.players[pid]) d.players[pid].totalSpent = amount;
    });
    d.expenseBackup = null;
    this.save();
    return true;
  },

  // ─── History ──────────────────────────────────────────────
  getHistory() {
    return this.load().history || [];
  },

  deleteHistoryEntry(id) {
    const d = this.load();
    d.history = (d.history || []).filter(h => h.id !== id);
    this.save();
  },

  // ─── Import / Export ──────────────────────────────────────
  exportJSON() {
    return JSON.stringify(this.load(), null, 2);
  },

  importJSON(jsonStr) {
    const parsed = JSON.parse(jsonStr);
    // Basic shape validation
    if (!parsed || typeof parsed !== 'object') {
      throw new Error('Invalid JSON: not an object');
    }
    if (typeof parsed.players !== 'object') {
      throw new Error('Invalid JSON: missing players object');
    }
    if (!Array.isArray(parsed.history)) {
      parsed.history = [];
    }
    if (parsed.currentEvent === undefined) {
      parsed.currentEvent = null;
    }
    this._data = parsed;
    this.save();
  },
};

// ─── Helpers ──────────────────────────────────────────────────
function findMatchByKey(plan, key) {
  if (!plan || !plan.schedule) return null;
  const [slotIdx, courtIdx] = key.split(':').map(Number);
  const slot = plan.schedule[slotIdx];
  if (!slot) return null;
  return slot.matches.find(m => m.court === courtIdx) || null;
}

function resolveTeam(teamRef, ev) {
  // teamRef is either a number (team index) or a placeholder string (knockout)
  if (typeof teamRef === 'number') {
    return ev.teams[teamRef] || null;
  }
  // Placeholder — need to resolve from prior results
  return resolvePlaceholder(teamRef, ev);
}

function resolvePlaceholder(ref, ev) {
  // "G1-1" = first place in group 1, "KR1-M1-W" = winner of knockout round 1 match 1
  if (ref.startsWith('G')) {
    // Parse "G{group}-{rank}"
    const m = ref.match(/^G(\d+)-(\d+)$/);
    if (!m) return null;
    const groupIdx = +m[1] - 1;
    const rank = +m[2] - 1;
    const groupTable = computeGroupTable(ev, groupIdx);
    return groupTable[rank] || null;
  }
  if (ref.startsWith('KR')) {
    // Parse "KR{round}-M{matchNum}-W"
    const m = ref.match(/^KR(\d+)-M(\d+)-W$/);
    if (!m) return null;
    const round = +m[1];
    const matchNum = +m[2];
    return findKnockoutWinner(ev, round, matchNum);
  }
  return null;
}

function computeGroupTable(ev, groupIdx) {
  // Collect all group-phase matches, group by inferred group membership
  // We need to figure out which teams belong to which group.
  // plan.group_sizes tells us the sizes; teams are assigned sequentially.
  const sizes = ev.plan.group_sizes || [];
  let start = 0;
  for (let i = 0; i < groupIdx; i++) start += sizes[i];
  const size = sizes[groupIdx] || 0;
  const teamIndices = Array.from({ length: size }, (_, i) => start + i);

  const stats = {};
  teamIndices.forEach(i => { stats[i] = { pts: 0, diff: 0, teamIdx: i }; });

  ev.plan.schedule.forEach((slot, slotIdx) => {
    if (slot.phase !== 'group') return;
    slot.matches.forEach(match => {
      if (match.kind !== 'ranked') return;
      const a = match.team_a, b = match.team_b;
      if (typeof a !== 'number' || typeof b !== 'number') return;
      if (!teamIndices.includes(a) || !teamIndices.includes(b)) return;
      const key = `${slotIdx}:${match.court}`;
      const result = ev.results[key];
      if (!result) return;
      if (result === 'A') { stats[a].pts += 3; }
      else if (result === 'B') { stats[b].pts += 3; }
      else if (result === 'D') { stats[a].pts += 1; stats[b].pts += 1; }
    });
  });

  const sorted = Object.values(stats).sort((x, y) => y.pts - x.pts);
  return sorted.map(s => ev.teams[s.teamIdx]);
}

function findKnockoutWinner(ev, round, matchNum) {
  let count = 0;
  for (let slotIdx = 0; slotIdx < ev.plan.schedule.length; slotIdx++) {
    const slot = ev.plan.schedule[slotIdx];
    if (slot.phase !== 'knockout') continue;
    if (slot.round !== `KR${round}`) continue;
    for (const match of slot.matches) {
      if (match.kind !== 'ranked') continue;
      count++;
      if (count === matchNum) {
        const key = `${slotIdx}:${match.court}`;
        const result = ev.results[key];
        if (!result || result === 'D') return null;
        const winnerRef = result === 'A' ? match.team_a : match.team_b;
        return resolveTeam(winnerRef, ev);
      }
    }
  }
  return null;
}

function accumulateDelta(delta, teamA, teamB, result) {
  const bump = (pid, field, amount = 1) => {
    if (delta[pid]) delta[pid][field] += amount;
  };
  if (result === 'A') {
    teamA.players.forEach(pid => { bump(pid, 'points', 3); bump(pid, 'wins'); });
    teamB.players.forEach(pid => bump(pid, 'losses'));
  } else if (result === 'B') {
    teamB.players.forEach(pid => { bump(pid, 'points', 3); bump(pid, 'wins'); });
    teamA.players.forEach(pid => bump(pid, 'losses'));
  } else if (result === 'D') {
    [...teamA.players, ...teamB.players].forEach(pid => {
      bump(pid, 'points', 1); bump(pid, 'draws');
    });
  }
}

// Expose helpers for scheduler.js to reuse
Storage._helpers = { resolveTeam, resolvePlaceholder, computeGroupTable, findKnockoutWinner };

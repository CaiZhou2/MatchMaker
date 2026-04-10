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

// ─── Multi-project registry ──────────────────────────────────
// Each project stores its data under its own localStorage key
// (PROJECT_DATA_PREFIX + projectId). The registry itself lives
// under PROJECTS_KEY and is a JSON array of project metadata.
const PROJECTS_KEY = 'matchmaker-projects';
const PROJECT_DATA_PREFIX = 'matchmaker-data-v1-';

// IndexedDB shadow-backup constants. We never read from IDB during
// normal operation — it's only consulted on startup IF localStorage
// turns up empty (i.e. iOS Safari ITP just nuked it). The whole point
// of this layer is durability against ITP eviction, since IDB is NOT
// subject to the same 7-day cleanup as localStorage.
const IDB_NAME = 'matchmaker';
const IDB_VERSION = 1;
const IDB_STORE = 'state';
const IDB_KEY = 'data';

// Lightweight Promise wrapper around the (callback-based) IDB API.
// Returns null when IDB isn't available (e.g. private browsing mode
// in some browsers, or our test harness without an IDB shim).
function _idbOpen() {
  return new Promise((resolve) => {
    if (typeof indexedDB === 'undefined') {
      resolve(null);
      return;
    }
    let req;
    try {
      req = indexedDB.open(IDB_NAME, IDB_VERSION);
    } catch (e) {
      resolve(null);
      return;
    }
    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains(IDB_STORE)) {
        db.createObjectStore(IDB_STORE);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => resolve(null);
    req.onblocked = () => resolve(null);
  });
}

async function _idbWrite(jsonString, key) {
  if (key === undefined) key = IDB_KEY;
  try {
    const db = await _idbOpen();
    if (!db) return false;
    return new Promise((resolve) => {
      const tx = db.transaction(IDB_STORE, 'readwrite');
      tx.objectStore(IDB_STORE).put(jsonString, key);
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => resolve(false);
      tx.onabort = () => resolve(false);
    });
  } catch (e) {
    console.warn('IDB write failed:', e);
    return false;
  }
}

async function _idbRead(key) {
  if (key === undefined) key = IDB_KEY;
  try {
    const db = await _idbOpen();
    if (!db) return null;
    return new Promise((resolve) => {
      const tx = db.transaction(IDB_STORE, 'readonly');
      const req = tx.objectStore(IDB_STORE).get(key);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => resolve(null);
    });
  } catch (e) {
    console.warn('IDB read failed:', e);
    return null;
  }
}

// ═══════════════════════════════════════════════════════════════
// ProjectRegistry — manages the project list (metadata only).
// Per-project data is handled by Storage after bindProject().
// ═══════════════════════════════════════════════════════════════
const ProjectRegistry = {
  _projects: null,

  load() {
    if (this._projects) return this._projects;
    try {
      const raw = localStorage.getItem(PROJECTS_KEY);
      this._projects = raw ? JSON.parse(raw) : [];
    } catch (e) {
      this._projects = [];
    }
    return this._projects;
  },

  save() {
    const json = JSON.stringify(this._projects);
    localStorage.setItem(PROJECTS_KEY, json);
    _idbWrite(json, PROJECTS_KEY).catch(() => {});
  },

  getAll() {
    return this.load().slice();
  },

  getById(id) {
    return this.load().find(p => p.id === id) || null;
  },

  create(name) {
    const projects = this.load();
    const id = 'proj_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6);
    const now = new Date().toISOString();
    const proj = { id, name: name.trim(), createdAt: now, updatedAt: now };
    projects.push(proj);
    this.save();
    // Initialize empty project data
    const emptyData = JSON.stringify({ players: {}, currentEvent: null, history: [], expenseBackup: null });
    localStorage.setItem(PROJECT_DATA_PREFIX + id, emptyData);
    _idbWrite(emptyData, PROJECT_DATA_PREFIX + id).catch(() => {});
    return proj;
  },

  rename(id, name) {
    const proj = this.getById(id);
    if (!proj) return;
    proj.name = name.trim();
    proj.updatedAt = new Date().toISOString();
    this.save();
  },

  delete(id) {
    const projects = this.load();
    const idx = projects.findIndex(p => p.id === id);
    if (idx < 0) return;
    projects.splice(idx, 1);
    this.save();
    localStorage.removeItem(PROJECT_DATA_PREFIX + id);
    // IDB cleanup is best-effort
    _idbWrite('', PROJECT_DATA_PREFIX + id).catch(() => {});
  },

  updateTimestamp(id) {
    const proj = this.getById(id);
    if (!proj) return;
    proj.updatedAt = new Date().toISOString();
    this.save();
  },

  // ─── Sorting helpers (return new arrays) ──────────────────
  sortByName(list) {
    return [...list].sort((a, b) => a.name.localeCompare(b.name));
  },

  sortByUpdatedAt(list) {
    return [...list].sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''));
  },

  sortByPlayerCount(list) {
    return [...list].sort((a, b) => {
      const countA = ProjectRegistry._peekPlayerCount(a.id);
      const countB = ProjectRegistry._peekPlayerCount(b.id);
      return countB - countA;
    });
  },

  // Peek into a project's data to count players without fully loading
  _peekPlayerCount(id) {
    try {
      const raw = localStorage.getItem(PROJECT_DATA_PREFIX + id);
      if (!raw) return 0;
      const data = JSON.parse(raw);
      return data && data.players ? Object.keys(data.players).length : 0;
    } catch (e) { return 0; }
  },

  _peekHistoryCount(id) {
    try {
      const raw = localStorage.getItem(PROJECT_DATA_PREFIX + id);
      if (!raw) return 0;
      const data = JSON.parse(raw);
      return Array.isArray(data?.history) ? data.history.length : 0;
    } catch (e) { return 0; }
  },

  // ─── Bulk export / import ─────────────────────────────────
  exportAll() {
    const projects = this.load();
    const data = {};
    projects.forEach(proj => {
      try {
        const raw = localStorage.getItem(PROJECT_DATA_PREFIX + proj.id);
        data[proj.id] = raw ? JSON.parse(raw) : null;
      } catch (e) { data[proj.id] = null; }
    });
    return JSON.stringify({ version: 1, projects, data }, null, 2);
  },

  importAll(jsonStr) {
    const parsed = JSON.parse(jsonStr);
    if (!parsed || parsed.version !== 1 || !Array.isArray(parsed.projects) || typeof parsed.data !== 'object') {
      throw new Error('Invalid multi-project backup format');
    }
    // Clear all existing project data keys
    const oldProjects = this.load();
    oldProjects.forEach(p => localStorage.removeItem(PROJECT_DATA_PREFIX + p.id));
    // Write new projects
    parsed.projects.forEach(proj => {
      const projData = parsed.data[proj.id];
      if (projData) {
        const json = JSON.stringify(projData);
        localStorage.setItem(PROJECT_DATA_PREFIX + proj.id, json);
        _idbWrite(json, PROJECT_DATA_PREFIX + proj.id).catch(() => {});
      }
    });
    this._projects = parsed.projects;
    this.save();
  },
};

// ═══════════════════════════════════════════════════════════════
// Migration: existing single-project data → multi-project
// ═══════════════════════════════════════════════════════════════
function migrateToMultiProject() {
  // Already migrated?
  const existingRegistry = localStorage.getItem(PROJECTS_KEY);
  if (existingRegistry) return;

  const legacyRaw = localStorage.getItem(STORAGE_KEY);
  if (!legacyRaw) {
    // No existing data — initialize empty registry
    localStorage.setItem(PROJECTS_KEY, '[]');
    return;
  }

  // Validate legacy data
  try { JSON.parse(legacyRaw); } catch (e) {
    localStorage.setItem(PROJECTS_KEY, '[]');
    return;
  }

  // Create a default project from legacy data
  const id = 'proj_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6);
  const now = new Date().toISOString();
  const defaultName = (typeof t === 'function') ? t('projects.default_name') : 'My Tournament';
  const registry = [{ id, name: defaultName, createdAt: now, updatedAt: now }];

  // Copy legacy data to the new per-project key
  localStorage.setItem(PROJECT_DATA_PREFIX + id, legacyRaw);
  localStorage.setItem(PROJECTS_KEY, JSON.stringify(registry));

  // Mirror to IDB
  _idbWrite(legacyRaw, PROJECT_DATA_PREFIX + id).catch(() => {});
  _idbWrite(JSON.stringify(registry), PROJECTS_KEY).catch(() => {});

  // DO NOT delete the legacy key — safety net for rollback.
}

// ═══════════════════════════════════════════════════════════════
// Storage — per-project data (players, events, history, expenses)
// Call bindProject(id) before using any other method.
// ═══════════════════════════════════════════════════════════════
const Storage = {
  _data: null,
  _projectId: null,

  // Bind to a specific project. Must be called before load/save.
  bindProject(id) {
    this._projectId = id;
    this._data = null;  // force reload from the new key
  },

  _storageKey() {
    if (this._projectId) return PROJECT_DATA_PREFIX + this._projectId;
    return STORAGE_KEY;  // legacy fallback during migration
  },

  load() {
    if (this._data) return this._data;
    try {
      const raw = localStorage.getItem(this._storageKey());
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
      const lsKey = this._storageKey();
      const json = JSON.stringify(this._data);
      localStorage.setItem(lsKey, json);
      // Mirror to IndexedDB. Use the project-specific key when bound,
      // or the legacy IDB_KEY when unbound (backward compat with
      // pre-multi-project data).
      const idbKey = this._projectId ? lsKey : IDB_KEY;
      _idbWrite(json, idbKey).catch(() => {});
      // Keep the project registry's updatedAt fresh
      if (this._projectId) {
        ProjectRegistry.updateTimestamp(this._projectId);
      }
    } catch (e) {
      console.error('Storage save failed:', e);
    }
  },

  /**
   * Called once at app startup, BEFORE the first load(), to recover
   * data from the IDB shadow if localStorage has been wiped.
   * Now handles both legacy single-key and multi-project keys.
   */
  async restoreFromIdbIfNeeded() {
    let restored = false;
    try {
      // 1. Restore legacy key (needed for migration)
      const existingLegacy = localStorage.getItem(STORAGE_KEY);
      if (!existingLegacy || existingLegacy.length <= 2) {
        const legacyJson = await _idbRead(IDB_KEY);
        if (legacyJson) {
          JSON.parse(legacyJson);  // validate
          localStorage.setItem(STORAGE_KEY, legacyJson);
          restored = true;
        }
      }

      // 2. Restore project registry
      const existingReg = localStorage.getItem(PROJECTS_KEY);
      if (!existingReg || existingReg.length <= 2) {
        const regJson = await _idbRead(PROJECTS_KEY);
        if (regJson) {
          JSON.parse(regJson);
          localStorage.setItem(PROJECTS_KEY, regJson);
          restored = true;
        }
      }

      // 3. Restore each project's data
      let projects = [];
      try {
        projects = JSON.parse(localStorage.getItem(PROJECTS_KEY) || '[]');
      } catch (e) { /* ignore */ }
      for (const proj of projects) {
        const dataKey = PROJECT_DATA_PREFIX + proj.id;
        const existing = localStorage.getItem(dataKey);
        if (!existing || existing.length <= 2) {
          const json = await _idbRead(dataKey);
          if (json) {
            JSON.parse(json);
            localStorage.setItem(dataKey, json);
            restored = true;
          }
        }
      }

      // Force re-load on next access
      this._data = null;
      ProjectRegistry._projects = null;
      return restored;
    } catch (e) {
      console.warn('IDB restore failed:', e);
      return false;
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

    Object.entries(ev.results || {}).forEach(([key, entry]) => {
      const match = findMatchByKey(ev.plan, key);
      if (!match) return;
      // Skip the eliminated-team free-court placeholder rows (no team
      // refs) — those are display hints, not real matches.
      if (match.team_a == null || match.team_b == null) return;
      const ta = resolveTeam(match.team_a, ev);
      const tb = resolveTeam(match.team_b, ev);
      if (!ta || !tb) return;
      const result = getMatchResult(entry);
      if (!result) return;
      // Friendly matches still update wins/draws/losses (so the
      // win-rate leaderboard reflects them) but DO NOT award
      // tournament points. Only ranked matches award points.
      const countPoints = (match.kind === 'ranked');
      accumulateDelta(delta, ta, tb, result, countPoints);
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

  /**
   * Walks the history archive and tallies head-to-head records for one
   * player. Returns a map keyed by opponent player id, with counts of
   * how many times that opponent has been on the OPPOSING team in a
   * ranked match together with this player.
   *
   *   { [opponentId]: { name, wins, draws, losses, games } }
   *
   * - `wins`   = matches where playerId's team won the result
   * - `losses` = matches where opponent's team won
   * - `draws`  = drawn matches
   * - `name`   = pulled from the history entry's nameSnapshot first
   *              (so deleted players still show up by name), falling
   *              back to the live DB row.
   *
   * Knockout placeholder refs (e.g. "G1-1" / "KR1-M2-W") are resolved
   * via the existing _helpers.resolvePlaceholder logic, which already
   * walks the same history entry's results to figure out who advanced.
   */
  /**
   * Walks the history archive in chronological order and returns this
   * player's cumulative win rate AFTER each event they attended.
   * Used by the player-detail view to render a trend sparkline.
   *
   * Returns: [{ date, wins, draws, losses, games, winRate }, ...]
   *   - One entry per event the player participated in
   *   - Sorted by event date ascending
   *   - winRate is the CUMULATIVE rate as of that event (not per-event)
   *   - games is the cumulative game count
   *
   * Friendly events ARE included because friendly matches now update
   * W/D/L (per the user's "no points but yes win rate" rule).
   *
   * If a history entry pre-dates the delta-archival format and lacks
   * a `delta` map, that event contributes 0/0/0 — the trend stays
   * flat instead of throwing.
   */
  getWinRateTrend(playerId) {
    if (!playerId) return [];
    const history = this.getHistory();
    // Sort chronologically. Most events have ISO date strings; falling
    // back to '' for malformed entries keeps them at the front.
    const sorted = [...history].sort((a, b) =>
      (a.date || '').localeCompare(b.date || '')
    );

    let wins = 0, draws = 0, losses = 0;
    const trend = [];
    for (const ev of sorted) {
      if (!Array.isArray(ev.attendees) || !ev.attendees.includes(playerId)) continue;
      const d = (ev.delta && ev.delta[playerId]) || {};
      wins   += d.wins   || 0;
      draws  += d.draws  || 0;
      losses += d.losses || 0;
      const games = wins + draws + losses;
      trend.push({
        date: ev.date || '',
        wins, draws, losses, games,
        winRate: games > 0 ? wins / games : 0,
      });
    }
    return trend;
  },

  getHeadToHead(playerId) {
    if (!playerId) return {};
    const history = this.getHistory();
    const out = {};

    const ensure = (oppId, name) => {
      if (!out[oppId]) {
        out[oppId] = { name: name || oppId, wins: 0, draws: 0, losses: 0, games: 0 };
      } else if (name && out[oppId].name === oppId) {
        // Upgrade an id-only entry to a named one
        out[oppId].name = name;
      }
      return out[oppId];
    };

    history.forEach(h => {
      if (!h.plan || !h.plan.schedule || !h.results) return;
      const evLike = { plan: h.plan, teams: h.teams, results: h.results };

      h.plan.schedule.forEach((slot, slotIdx) => {
        slot.matches.forEach(m => {
          // Include both ranked AND friendly matches in head-to-head:
          // friendly matches still affect win/draw/loss (and therefore
          // a player's record against any specific opponent). Skip
          // only the free-court placeholder rows that have no team refs.
          if (m.team_a == null || m.team_b == null) return;
          const key = `${slotIdx}:${m.court}`;
          const result = getMatchResult(h.results[key]);
          if (!result) return;

          const ta = resolveTeam(m.team_a, evLike);
          const tb = resolveTeam(m.team_b, evLike);
          if (!ta || !tb) return;

          const inA = ta.players.includes(playerId);
          const inB = tb.players.includes(playerId);
          if (!inA && !inB) return;

          // The opponents are everyone on the team this player is NOT on.
          const them = inA ? tb : ta;
          const wePlayedA = inA;
          const playerOnWinningSide =
            (wePlayedA && result === 'A') || (!wePlayedA && result === 'B');
          const playerOnLosingSide =
            (wePlayedA && result === 'B') || (!wePlayedA && result === 'A');

          them.players.forEach(oppId => {
            if (!oppId) return;
            const name =
              h.nameSnapshot?.[oppId] ||
              this.getPlayer(oppId)?.name ||
              oppId;
            const rec = ensure(oppId, name);
            rec.games += 1;
            if (playerOnWinningSide) rec.wins += 1;
            else if (playerOnLosingSide) rec.losses += 1;
            else rec.draws += 1;  // result === 'D'
          });
        });
      });
    });

    return out;
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

// Match results may be stored in two shapes:
//   - legacy: a bare string 'A' | 'B' | 'D' (pre-score-entry data)
//   - current: an object { result: 'A'|'B'|'D', scoreA?: n, scoreB?: n }
// All readers in storage.js / app.js / tests should go through these
// helpers so old localStorage data and old history entries keep
// rendering correctly.
function getMatchResult(entry) {
  if (entry == null) return null;
  if (typeof entry === 'string') return entry;
  if (typeof entry === 'object' && typeof entry.result === 'string') return entry.result;
  return null;
}

function getMatchScores(entry) {
  if (entry && typeof entry === 'object') {
    return {
      a: typeof entry.scoreA === 'number' ? entry.scoreA : null,
      b: typeof entry.scoreB === 'number' ? entry.scoreB : null,
    };
  }
  return { a: null, b: null };
}

function hasMatchScores(entry) {
  const s = getMatchScores(entry);
  return s.a !== null && s.b !== null;
}

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
    // Don't resolve until ALL of this group's matches have been
    // recorded — otherwise computeGroupTable would return a partial
    // standings table where unplayed teams are tied at 0 pts and the
    // "winner" is whichever happens to sort first by team index.
    // That was the user-reported bug: knockout slots showing concrete
    // teams before the group stage was complete.
    if (!isGroupComplete(ev, groupIdx)) return null;
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

// True iff every group-stage match belonging to the given group has
// a recorded result. Used by resolvePlaceholder to gate the
// "G{n}-{rank}" branch — we only know who advances from a group
// once every match in that group has been played.
function isGroupComplete(ev, groupIdx) {
  if (!ev.plan || !Array.isArray(ev.plan.schedule)) return false;
  const sizes = ev.plan.group_sizes || [];
  let start = 0;
  for (let i = 0; i < groupIdx; i++) start += sizes[i];
  const size = sizes[groupIdx] || 0;
  if (size === 0) return false;
  // Build a set of team indices belonging to this group
  const teamIndices = new Set();
  for (let i = 0; i < size; i++) teamIndices.add(start + i);

  for (let slotIdx = 0; slotIdx < ev.plan.schedule.length; slotIdx++) {
    const slot = ev.plan.schedule[slotIdx];
    if (slot.phase !== 'group') continue;
    for (const match of slot.matches) {
      if (match.kind !== 'ranked') continue;
      if (typeof match.team_a !== 'number' || typeof match.team_b !== 'number') continue;
      if (!teamIndices.has(match.team_a) || !teamIndices.has(match.team_b)) continue;
      const key = `${slotIdx}:${match.court}`;
      if (getMatchResult(ev.results?.[key]) == null) return false;
    }
  }
  return true;
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
      const entry = ev.results[key];
      const result = getMatchResult(entry);
      if (!result) return;
      if (result === 'A') { stats[a].pts += 3; }
      else if (result === 'B') { stats[b].pts += 3; }
      else if (result === 'D') { stats[a].pts += 1; stats[b].pts += 1; }
      // Score-difference tiebreaker (only when scores were entered)
      const scores = getMatchScores(entry);
      if (scores.a !== null && scores.b !== null) {
        stats[a].diff += scores.a - scores.b;
        stats[b].diff += scores.b - scores.a;
      }
    });
  });

  // Sort by points → score difference → deterministic random.
  // The "random" tiebreaker is a stable hash of the team's id and the
  // event date, so the resolved order is the same on every read but
  // looks unrelated to team index. This means once a tiebreaker has
  // been decided, the same teams keep advancing on subsequent reads
  // (no flicker), but it's not just "lower team index wins".
  const dateSeed = (ev.date || '') + ':g' + groupIdx;
  function tiebreakHash(teamIdx) {
    const team = ev.teams[teamIdx];
    const id = (team && team.id) || String(teamIdx);
    let h = 5381;
    const s = dateSeed + ':' + id;
    for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
    return h;
  }
  const sorted = Object.values(stats).sort((x, y) => {
    if (x.pts !== y.pts) return y.pts - x.pts;
    if (x.diff !== y.diff) return y.diff - x.diff;
    return tiebreakHash(x.teamIdx) - tiebreakHash(y.teamIdx);
  });
  return sorted.map(s => ev.teams[s.teamIdx]);
}

// Walks one group's standings and reports any tied positions —
// places where two or more teams have the same point total. Used to
// surface a notice on the tournament view when a knockout slot is
// being decided by tiebreaker rather than head-to-head record.
//
// Returns an array of tiebreaker descriptions:
//
//   [
//     {
//       pts: 4,                 // the tied point total
//       teams: [team0, team1],  // the tied team objects, in resolved order
//       resolvedBy: 'diff',     // 'diff' | 'random'
//       diffs: [+5, -2],        // (when 'diff') the score diffs that decided
//     },
//     ...
//   ]
//
// Multiple tiebreaker buckets can exist in the same group (e.g. 1st
// and 2nd are tied AND 3rd and 4th are tied). Each is its own entry.
function detectGroupTiebreakers(ev, groupIdx) {
  if (!ev || !ev.plan) return [];
  const sizes = ev.plan.group_sizes || [];
  let start = 0;
  for (let i = 0; i < groupIdx; i++) start += sizes[i];
  const size = sizes[groupIdx] || 0;
  if (size < 2) return [];

  // Re-compute the raw stats so we can group by point total before
  // the random tiebreaker collapses them.
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
      const entry = ev.results[key];
      const result = getMatchResult(entry);
      if (!result) return;
      if (result === 'A') { stats[a].pts += 3; }
      else if (result === 'B') { stats[b].pts += 3; }
      else if (result === 'D') { stats[a].pts += 1; stats[b].pts += 1; }
      const scores = getMatchScores(entry);
      if (scores.a !== null && scores.b !== null) {
        stats[a].diff += scores.a - scores.b;
        stats[b].diff += scores.b - scores.a;
      }
    });
  });

  // Group teams by point total
  const byPoints = new Map();
  Object.values(stats).forEach(s => {
    if (!byPoints.has(s.pts)) byPoints.set(s.pts, []);
    byPoints.get(s.pts).push(s);
  });

  const finalOrder = computeGroupTable(ev, groupIdx);  // already tiebroken
  const out = [];
  byPoints.forEach((tiedStats, pts) => {
    if (tiedStats.length < 2) return;
    const distinctDiffs = new Set(tiedStats.map(s => s.diff));
    const allSameDiff = distinctDiffs.size === 1;
    // Find these teams in the resolved order so we can report them
    // in the order they ended up advancing
    const orderedTeams = finalOrder.filter(team =>
      tiedStats.some(s => ev.teams[s.teamIdx] === team)
    );
    const orderedDiffs = orderedTeams.map(team => {
      const s = tiedStats.find(st => ev.teams[st.teamIdx] === team);
      return s.diff;
    });
    out.push({
      pts,
      teams: orderedTeams,
      resolvedBy: allSameDiff ? 'random' : 'diff',
      diffs: orderedDiffs,
    });
  });
  return out;
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
        const result = getMatchResult(ev.results[key]);
        if (!result || result === 'D') return null;
        const winnerRef = result === 'A' ? match.team_a : match.team_b;
        return resolveTeam(winnerRef, ev);
      }
    }
  }
  return null;
}

// Walks one match result and adds the per-player W/D/L (and
// optionally points) deltas to the `delta` map. `countPoints`
// defaults to true (ranked-match behaviour); set it to false for
// friendly matches, which contribute to win/draw/loss totals (and
// therefore to win rate + head-to-head) but never to the points
// leaderboard.
function accumulateDelta(delta, teamA, teamB, result, countPoints = true) {
  const bump = (pid, field, amount = 1) => {
    if (delta[pid]) delta[pid][field] += amount;
  };
  if (result === 'A') {
    teamA.players.forEach(pid => {
      if (countPoints) bump(pid, 'points', 3);
      bump(pid, 'wins');
    });
    teamB.players.forEach(pid => bump(pid, 'losses'));
  } else if (result === 'B') {
    teamB.players.forEach(pid => {
      if (countPoints) bump(pid, 'points', 3);
      bump(pid, 'wins');
    });
    teamA.players.forEach(pid => bump(pid, 'losses'));
  } else if (result === 'D') {
    [...teamA.players, ...teamB.players].forEach(pid => {
      if (countPoints) bump(pid, 'points', 1);
      bump(pid, 'draws');
    });
  }
}

// Expose helpers for scheduler.js / app.js / tests to reuse
Storage._helpers = {
  resolveTeam,
  resolvePlaceholder,
  computeGroupTable,
  isGroupComplete,
  detectGroupTiebreakers,
  findKnockoutWinner,
  getMatchResult,
  getMatchScores,
  hasMatchScores,
};

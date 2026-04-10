/**
 * MatchMaker - App View Router & Controller
 *
 * All user-facing strings go through `t(key, params)` from i18n.js.
 * Static HTML strings use `data-i18n` / `data-i18n-ph` attributes and
 * are applied by `I18N.applyToDOM()`. Dynamically-rendered strings
 * call `t()` at render time, so switching languages simply re-renders
 * the current view.
 */

/* ─── View Router ───────────────────────────────────────────── */
const Views = ['home', 'db', 'setup', 'teams', 'tournament', 'done', 'history', 'player', 'search', 'recordonly'];
let currentView = 'home';

function showView(name) {
  Views.forEach(v => {
    document.getElementById('view-' + v).classList.toggle('hidden', v !== name);
  });
  currentView = name;
  window.scrollTo({ top: 0, behavior: 'smooth' });
  // Refresh per-view data
  if (name === 'home') renderHome();
  if (name === 'db') renderDB();
  if (name === 'setup') renderSetup();
  if (name === 'teams') renderTeams();
  if (name === 'tournament') renderTournament();
  if (name === 'done') renderDone();
  if (name === 'history') renderHistory();
  if (name === 'player') renderPlayerDetail();
  if (name === 'search') renderSearch();
  if (name === 'recordonly') renderRecordOnly();
}

function rerenderCurrentView() {
  // Called after a language switch — re-renders the currently visible view
  // so dynamically-generated strings pick up the new language.
  showView(currentView);
}

/* ─── Transient UI State ────────────────────────────────────── */
const ui = {
  selectedAttendees: new Set(),
  swapMode: false,
  swapSelection: null,  // {teamIdx, playerIdx}
  pendingTeams: null,
  pendingPlan: null,
  leaderboardTab: 'points',  // 'points' | 'winrate' | 'participation'
  expandedHistory: new Set(),
  dbSelectMode: false,
  dbSelected: new Set(),  // player ids
  detailPlayerId: null,   // currently-viewed player on the detail page
  detailFrom: 'db',       // 'db' | 'search' — where to return on back
  searchQuery: '',        // current text in the search input
  chosenMode: 'auto',     // user's selection from the tournament-mode dropdown
  // True when the active plan uses per-match teams (friendly /
  // random-fair). The teams view enters its "fallback preview"
  // rendering path when this is set, and the notice text branches
  // on chosenMode to distinguish "user picked friendly" from
  // "auto fell back to friendly".

  // Snapshot of the just-committed event + the auto-backup outcome,
  // kept around so the done view can re-render after a language
  // switch (otherwise the imperatively-set HTML stays stuck in the
  // language that was active when the user clicked "完成比赛").
  lastEventSnapshot: null,
  lastBackupSuccess: null,
  lastCanShareFiles: false,

};

/* ─── Small helpers ─────────────────────────────────────────── */
function fmtPct(r) {
  return (r * 100).toFixed(0) + '%';
}
function fmtWLD(p) {
  return t('home.lb.wld', { w: p.wins, d: p.draws, l: p.losses });
}
function fmtMoney(n) {
  const v = Number(n) || 0;
  return v.toFixed(2);
}

/* ─── HOME ──────────────────────────────────────────────────── */
function renderHome() {
  const players = Storage.getAllPlayers();
  const ev = Storage.getCurrentEvent();

  // Stats
  const totalEvents = players.reduce((m, p) => Math.max(m, p.events), 0);
  document.getElementById('home-stats').innerHTML = `
    <div class="stat-block"><div class="val">${players.length}</div><div class="lbl">${escapeHtml(t('home.stats.players'))}</div></div>
    <div class="stat-block"><div class="val">${totalEvents}</div><div class="lbl">${escapeHtml(t('home.stats.weeks'))}</div></div>
  `;

  // Resume button
  const resumeBtn = document.getElementById('btn-resume-event');
  if (ev && ev.phase !== 'done') {
    resumeBtn.style.display = '';
    resumeBtn.textContent = t('home.btn.resume', { phase: phaseLabel(ev.phase) });
  } else {
    resumeBtn.style.display = 'none';
  }

  // Tab state
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.tab === ui.leaderboardTab);
  });

  // Leaderboard
  const lbDiv = document.getElementById('home-leaderboard');
  if (players.length === 0) {
    lbDiv.innerHTML = `<p class="empty">${escapeHtml(t('home.leaderboard.empty'))}</p>`;
  } else {
    let sorted;
    if (ui.leaderboardTab === 'points') {
      sorted = [...players].sort((a, b) =>
        b.points - a.points || a.name.localeCompare(b.name)
      );
    } else if (ui.leaderboardTab === 'winrate') {
      sorted = [...players].sort((a, b) => {
        const wrA = Storage.getWinRate(a), wrB = Storage.getWinRate(b);
        if (wrA !== wrB) return wrB - wrA;
        const gA = Storage.getTotalGames(a), gB = Storage.getTotalGames(b);
        if (gA !== gB) return gB - gA;
        return a.name.localeCompare(b.name);
      });
    } else { // participation
      sorted = [...players].sort((a, b) =>
        (b.events || 0) - (a.events || 0)
        || Storage.getTotalGames(b) - Storage.getTotalGames(a)
        || a.name.localeCompare(b.name)
      );
    }
    const top = sorted.slice(0, 10);

    lbDiv.innerHTML = top.map((p, i) => {
      let main, sub;
      if (ui.leaderboardTab === 'points') {
        main = t('home.lb.points', { n: p.points });
        sub = fmtWLD(p);
      } else if (ui.leaderboardTab === 'winrate') {
        main = fmtPct(Storage.getWinRate(p));
        sub = `${t('home.lb.games', { n: Storage.getTotalGames(p) })} · ${fmtWLD(p)}`;
      } else { // participation
        main = t('home.lb.events', { n: p.events });
        sub = t('home.lb.games', { n: Storage.getTotalGames(p) });
      }
      return `
        <div class="lb-row">
          <span class="lb-rank">#${i + 1}</span>
          <span class="lb-name">${escapeHtml(p.name)}</span>
          <span class="lb-points">${escapeHtml(main)}</span>
          <span class="lb-wld">${escapeHtml(sub)}</span>
        </div>
      `;
    }).join('');
  }

  // Expense card
  const totalSpent = Storage.getTotalSpent();
  document.getElementById('expense-total').textContent = fmtMoney(totalSpent);
  const undoBtn = document.getElementById('btn-undo-expenses');
  const hasBackup = Storage.hasExpenseBackup();
  undoBtn.classList.toggle('hidden', !hasBackup);
  document.getElementById('expense-hint').textContent = hasBackup
    ? t('expense.hint.has_backup')
    : '';
}

function phaseLabel(phase) {
  return t('phase.' + phase) || phase;
}

/* ─── DB ────────────────────────────────────────────────────── */
function renderDB() {
  const players = Storage.getAllPlayers();
  const sorted = [...players].sort((a, b) => b.points - a.points || a.name.localeCompare(b.name));

  // Drop any selected ids that no longer exist
  const liveIds = new Set(sorted.map(p => p.id));
  for (const id of [...ui.dbSelected]) {
    if (!liveIds.has(id)) ui.dbSelected.delete(id);
  }

  // Toggle button label + controls visibility
  document.getElementById('btn-select-mode').textContent = ui.dbSelectMode
    ? t('db.select.cancel')
    : t('db.select.toggle');
  document.getElementById('db-select-controls').classList.toggle('hidden', !ui.dbSelectMode);

  // Refresh the "select all" checkbox state
  const selectAllCb = document.getElementById('db-select-all-cb');
  if (sorted.length === 0) {
    selectAllCb.checked = false;
    selectAllCb.indeterminate = false;
  } else if (ui.dbSelected.size === 0) {
    selectAllCb.checked = false;
    selectAllCb.indeterminate = false;
  } else if (ui.dbSelected.size === sorted.length) {
    selectAllCb.checked = true;
    selectAllCb.indeterminate = false;
  } else {
    selectAllCb.checked = false;
    selectAllCb.indeterminate = true;
  }

  const listDiv = document.getElementById('db-player-list');
  if (sorted.length === 0) {
    listDiv.innerHTML = `<p class="empty">${escapeHtml(t('db.empty'))}</p>`;
    return;
  }

  listDiv.innerHTML = sorted.map(p => {
    const games = Storage.getTotalGames(p);
    const wr = games > 0 ? fmtPct(Storage.getWinRate(p)) : '—';
    const mainText = t('db.row.main', { points: p.points, wr });
    const statsText = t('db.row.stats', {
      events: p.events,
      games,
      wld: fmtWLD(p),
      spent: fmtMoney(p.totalSpent || 0),
    });
    const checkboxOrDelete = ui.dbSelectMode
      ? `<input type="checkbox" class="db-row-cb" data-cb="${p.id}" ${ui.dbSelected.has(p.id) ? 'checked' : ''}>`
      : `<button class="btn-icon" data-del="${p.id}">×</button>`;
    return `
      <div class="db-row ${ui.dbSelectMode && ui.dbSelected.has(p.id) ? 'selected' : ''}" data-id="${p.id}">
        <div class="db-main">
          <span class="db-name">${escapeHtml(p.name)}</span>
          <span class="db-points">${escapeHtml(mainText)}</span>
        </div>
        <div class="db-sub">
          <span>${escapeHtml(statsText)}</span>
          ${checkboxOrDelete}
        </div>
      </div>
    `;
  }).join('');

  if (ui.dbSelectMode) {
    // Tapping anywhere on the row toggles its selection
    listDiv.querySelectorAll('.db-row').forEach(row => {
      row.onclick = (e) => {
        // Avoid double-toggle when clicking the checkbox itself
        if (e.target.classList && e.target.classList.contains('db-row-cb')) return;
        const id = row.dataset.id;
        if (ui.dbSelected.has(id)) ui.dbSelected.delete(id);
        else ui.dbSelected.add(id);
        renderDB();
      };
    });
    listDiv.querySelectorAll('[data-cb]').forEach(cb => {
      cb.onclick = (e) => {
        e.stopPropagation();
        const id = cb.dataset.cb;
        if (cb.checked) ui.dbSelected.add(id);
        else ui.dbSelected.delete(id);
        renderDB();
      };
    });
  } else {
    // Single-row delete button (× on the right)
    listDiv.querySelectorAll('[data-del]').forEach(btn => {
      btn.onclick = (e) => {
        e.stopPropagation();
        const id = btn.dataset.del;
        const p = Storage.getPlayer(id);
        if (confirm(t('db.confirm.delete', { name: p.name }))) {
          Storage.deletePlayer(id);
          renderDB();
        }
      };
    });
    // Tap a row (anywhere outside the × button) to open the player
    // detail view (head-to-head, etc.).
    listDiv.querySelectorAll('.db-row').forEach(row => {
      row.classList.add('clickable');
      row.onclick = () => {
        ui.detailPlayerId = row.dataset.id;
        ui.detailFrom = 'db';
        showView('player');
      };
    });
  }
}

/* ─── SEARCH ────────────────────────────────────────────── */
function renderSearch() {
  const players = Storage.getAllPlayers();
  const resultsDiv = document.getElementById('search-results');
  const input = document.getElementById('search-input');

  // Restore the prior query when returning to this view; auto-focus
  // so the keyboard pops on mobile.
  if (input.value !== ui.searchQuery) input.value = ui.searchQuery;
  // Defer focus until after the view becomes visible, otherwise iOS
  // Safari refuses to focus a hidden element.
  setTimeout(() => {
    try { input.focus(); } catch (e) { /* ignore */ }
  }, 50);

  if (players.length === 0) {
    resultsDiv.innerHTML = `<p class="empty">${escapeHtml(t('search.empty.db'))}</p>`;
    return;
  }

  const q = ui.searchQuery.trim().toLowerCase();
  const filtered = q === ''
    ? [...players]
    : players.filter(p => p.name.toLowerCase().includes(q));

  if (filtered.length === 0) {
    resultsDiv.innerHTML = `<p class="empty">${escapeHtml(t('search.no_results', { q: ui.searchQuery }))}</p>`;
    return;
  }

  // Empty query → sort by points desc (mirror the leaderboard).
  // Active query → exact match first, then prefix match, then substring.
  filtered.sort((a, b) => {
    if (q !== '') {
      const an = a.name.toLowerCase(), bn = b.name.toLowerCase();
      const aExact = an === q, bExact = bn === q;
      if (aExact !== bExact) return aExact ? -1 : 1;
      const aPrefix = an.startsWith(q), bPrefix = bn.startsWith(q);
      if (aPrefix !== bPrefix) return aPrefix ? -1 : 1;
    }
    return b.points - a.points || a.name.localeCompare(b.name);
  });

  resultsDiv.innerHTML = filtered.map(p => {
    const games = Storage.getTotalGames(p);
    const wr = games > 0 ? fmtPct(Storage.getWinRate(p)) : '—';
    const summary = t('search.row.summary', { points: p.points, wr });
    return `
      <div class="search-row clickable" data-id="${p.id}">
        <span class="search-name">${escapeHtml(p.name)}</span>
        <span class="search-summary">${escapeHtml(summary)}</span>
      </div>
    `;
  }).join('');

  resultsDiv.querySelectorAll('.search-row').forEach(row => {
    row.onclick = () => {
      ui.detailPlayerId = row.dataset.id;
      ui.detailFrom = 'search';
      showView('player');
    };
  });
}

/* ─── PLAYER DETAIL ──────────────────────────────────────── */
function renderPlayerDetail() {
  const player = ui.detailPlayerId ? Storage.getPlayer(ui.detailPlayerId) : null;
  if (!player) {
    showView(ui.detailFrom || 'db');
    return;
  }

  // Update the back button so it returns to wherever we came from
  // (db row click vs. search result click).
  const backBtn = document.querySelector('#view-player .btn-back');
  if (backBtn) backBtn.dataset.goto = ui.detailFrom || 'db';

  document.getElementById('player-detail-name').textContent = player.name;

  const games = Storage.getTotalGames(player);
  const wr = games > 0 ? fmtPct(Storage.getWinRate(player)) : '—';
  const statsDiv = document.getElementById('player-detail-stats');
  statsDiv.innerHTML = `
    <div class="stat-block"><div class="val">${player.points}</div><div class="lbl">${escapeHtml(t('player.stats.points'))}</div></div>
    <div class="stat-block"><div class="val">${escapeHtml(wr)}</div><div class="lbl">${escapeHtml(t('player.stats.winrate'))}</div></div>
    <div class="stat-block"><div class="val">${games}</div><div class="lbl">${escapeHtml(t('player.stats.games'))}</div></div>
    <div class="stat-block"><div class="val">${player.events}</div><div class="lbl">${escapeHtml(t('player.stats.weeks'))}</div></div>
    <div class="stat-block"><div class="val">${escapeHtml(fmtMoney(player.totalSpent || 0))}</div><div class="lbl">${escapeHtml(t('player.stats.spent'))}</div></div>
    <div class="stat-block"><div class="val">${player.wins}/${player.draws}/${player.losses}</div><div class="lbl">${escapeHtml(t('player.stats.wdl'))}</div></div>
  `;

  // Win-rate trend chart (cumulative WR after each event the player attended)
  const trendDiv = document.getElementById('player-detail-trend');
  const trend = Storage.getWinRateTrend(player.id);
  trendDiv.innerHTML = renderWinRateTrendChart(trend);

  const h2hDiv = document.getElementById('player-detail-h2h');
  const h2h = Storage.getHeadToHead(player.id);
  const opponents = Object.entries(h2h)
    .map(([oppId, rec]) => ({ id: oppId, ...rec }))
    .sort((a, b) => b.games - a.games || b.wins - a.wins || a.name.localeCompare(b.name));

  if (opponents.length === 0) {
    h2hDiv.innerHTML = `<p class="empty">${escapeHtml(t('player.h2h.empty'))}</p>`;
    return;
  }

  h2hDiv.innerHTML = opponents.map(opp => {
    const rate = opp.games > 0 ? opp.wins / opp.games : 0;
    return `
      <div class="h2h-row">
        <span class="h2h-name">${escapeHtml(opp.name)}</span>
        <span class="h2h-record">${opp.wins}-${opp.draws}-${opp.losses}</span>
        <span class="h2h-rate">${escapeHtml(fmtPct(rate))}</span>
      </div>
    `;
  }).join('');
}

/**
 * Inline-SVG sparkline-style chart of cumulative win rate over time.
 *
 * Why inline SVG instead of a chart library? Two reasons: zero new
 * dependencies (the project rule), and the chart is simple enough
 * that hand-rolling it is shorter than wiring up Chart.js. The
 * downside is no fancy tooltips, but for a one-line trend over a
 * handful of points that's overkill anyway.
 *
 * Layout:
 *   - 0-1 events → empty-state hint, no chart
 *   - 2+ events → polyline with dots, plus a baseline at 50%, plus
 *     the start/current/peak labels at the right
 *
 * The chart uses CSS variables (var(--primary), etc.) so it adapts
 * to dark mode automatically. Y-axis is fixed 0-100%; X-axis is
 * sequential event index (no time scaling — events are equidistant
 * regardless of how far apart in calendar time they happened).
 */
function renderWinRateTrendChart(trend) {
  if (!trend || trend.length < 2) {
    return `<p class="empty">${escapeHtml(t('player.trend.empty'))}</p>`;
  }

  const W = 320, H = 100;
  const padL = 8, padR = 56, padT = 8, padB = 8;
  const innerW = W - padL - padR;
  const innerH = H - padT - padB;

  const lastIdx = trend.length - 1;
  const xAt = (i) => padL + (lastIdx === 0 ? 0 : (i / lastIdx) * innerW);
  const yAt = (wr) => padT + (1 - wr) * innerH;

  const linePoints = trend.map((p, i) => `${xAt(i).toFixed(1)},${yAt(p.winRate).toFixed(1)}`).join(' ');

  const dots = trend.map((p, i) => `
    <circle cx="${xAt(i).toFixed(1)}" cy="${yAt(p.winRate).toFixed(1)}"
            r="2.5" class="trend-dot"/>
  `).join('');

  // Y baseline at 50%
  const baselineY = yAt(0.5);

  // Current value label, anchored to the right of the last point
  const lastPt = trend[lastIdx];
  const labelX = padL + innerW + 6;
  const labelY = yAt(lastPt.winRate);

  // Current / peak summary line below the chart
  const peakWr = trend.reduce((m, p) => p.winRate > m ? p.winRate : m, 0);

  return `
    <div class="trend-chart">
      <svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid meet" aria-label="${escapeHtml(t('player.trend.title'))}">
        <!-- 50% baseline -->
        <line x1="${padL}" y1="${baselineY}" x2="${padL + innerW}" y2="${baselineY}"
              class="trend-baseline" stroke-dasharray="2 3"/>
        <!-- 0% / 100% labels on the right axis -->
        <text x="${labelX}" y="${padT + 4}" class="trend-axis-label">100%</text>
        <text x="${labelX}" y="${baselineY + 3}" class="trend-axis-label">50%</text>
        <text x="${labelX}" y="${padT + innerH + 4}" class="trend-axis-label">0%</text>
        <!-- Trend line -->
        <polyline points="${linePoints}" fill="none" class="trend-line"/>
        <!-- Dots -->
        ${dots}
        <!-- Current-value highlight -->
        <circle cx="${xAt(lastIdx).toFixed(1)}" cy="${labelY.toFixed(1)}"
                r="4" class="trend-dot trend-dot-current"/>
      </svg>
      <div class="trend-summary">
        ${escapeHtml(t('player.trend.summary', {
          events: trend.length,
          current: fmtPct(lastPt.winRate),
          peak: fmtPct(peakWr),
        }))}
      </div>
    </div>
  `;
}

function toggleDbSelectMode() {
  ui.dbSelectMode = !ui.dbSelectMode;
  ui.dbSelected.clear();
  renderDB();
}

function handleDbSelectAll(checked) {
  const players = Storage.getAllPlayers();
  if (checked) {
    players.forEach(p => ui.dbSelected.add(p.id));
  } else {
    ui.dbSelected.clear();
  }
  renderDB();
}

function handleDeleteSelected() {
  if (ui.dbSelected.size === 0) {
    alert(t('db.select.empty'));
    return;
  }
  const count = ui.dbSelected.size;
  // Double confirm
  if (!confirm(t('db.select.confirm1', { n: count }))) return;
  if (!confirm(t('db.select.confirm2'))) return;
  for (const id of ui.dbSelected) {
    Storage.deletePlayer(id);
  }
  ui.dbSelected.clear();
  ui.dbSelectMode = false;
  renderDB();
}

/* ─── HISTORY ───────────────────────────────────────────────── */
function renderHistory() {
  const list = Storage.getHistory();
  const div = document.getElementById('history-list');

  if (list.length === 0) {
    div.innerHTML = `<p class="empty">${escapeHtml(t('hist.empty'))}</p>`;
    return;
  }

  // Newest first
  const sorted = [...list].reverse();

  div.innerHTML = sorted.map(h => {
    const expanded = ui.expandedHistory.has(h.id);
    const planFormat = h.plan?.format;
    let fmt;
    if (planFormat === 'groups-knockout') {
      fmt = t('teams.format.groups_knockout', {
        groups: (h.plan.group_sizes || []).join('/'),
        n: h.plan.knockout_size,
      });
    } else if (planFormat === 'knockout') {
      fmt = t('teams.format.knockout', { n: h.plan.knockout_size || 0 });
    } else if (planFormat === 'random-fair') {
      fmt = t('teams.format.random_fair');
    } else if (planFormat === 'friendly') {
      fmt = t('teams.format.friendly');
    } else {
      fmt = t('teams.format.round_robin');
    }
    // Count every playable match (excludes the eliminated-team
    // free-court placeholder rows). Works uniformly across ranked
    // tournament events and friendly-mode events.
    const totalMatches = h.plan?.schedule.reduce(
      (s, slot) => s + slot.matches.filter(isPlayableMatch).length, 0
    ) || 0;
    const rankedMatches = totalMatches;
    const completedMatches = Object.values(h.results || {})
      .filter(e => Storage._helpers.getMatchResult(e) != null).length;

    const summary = t('hist.row.summary', {
      teams: h.teams.length,
      players: h.attendees.length,
      done: completedMatches,
      total: rankedMatches,
    });

    return `
      <div class="history-row">
        <div class="history-head" data-toggle="${h.id}">
          <div class="history-main">
            <span class="history-date">${escapeHtml(h.date)}</span>
            <span class="history-fmt">${escapeHtml(fmt)}</span>
          </div>
          <div class="history-sub">
            ${escapeHtml(summary)}
            <button class="btn-icon" data-del-hist="${h.id}">×</button>
          </div>
        </div>
        ${expanded ? renderHistoryDetail(h) : ''}
      </div>
    `;
  }).join('');

  div.querySelectorAll('[data-toggle]').forEach(el => {
    el.onclick = (e) => {
      if (e.target.hasAttribute('data-del-hist')) return;
      const id = el.dataset.toggle;
      if (ui.expandedHistory.has(id)) ui.expandedHistory.delete(id);
      else ui.expandedHistory.add(id);
      renderHistory();
    };
  });

  div.querySelectorAll('[data-del-hist]').forEach(btn => {
    btn.onclick = (e) => {
      e.stopPropagation();
      const id = btn.dataset.delHist;
      if (confirm(t('hist.confirm.delete'))) {
        Storage.deleteHistoryEntry(id);
        ui.expandedHistory.delete(id);
        renderHistory();
      }
    };
  });
}

function renderHistoryDetail(h) {
  // Teams (using name snapshot)
  const nameOf = (pid) => h.nameSnapshot?.[pid] || Storage.getPlayer(pid)?.name || '?';

  const sep = t('text.name.separator');
  const teamsHtml = h.teams.map(t_ => `
    <div class="hist-team">
      <div class="hist-team-name">${escapeHtml(t_.name)}</div>
      <div class="hist-team-players">${t_.players.map(nameOf).map(escapeHtml).join(sep)}</div>
    </div>
  `).join('');

  // Per-player points earned
  const deltaRows = Object.entries(h.delta || {})
    .map(([pid, d]) => ({ name: nameOf(pid), d }))
    .sort((a, b) => b.d.points - a.d.points || a.name.localeCompare(b.name));

  const deltaHtml = deltaRows.map(r => `
    <div class="summary-row">
      <span class="sr-name">${escapeHtml(r.name)}</span>
      <span class="sr-delta">${escapeHtml(t('done.delta.row', { pts: r.d.points }))}</span>
      <span class="sr-wld">${escapeHtml(fmtWLD({ wins: r.d.wins, draws: r.d.draws, losses: r.d.losses }))}</span>
    </div>
  `).join('');

  // Match results — include both ranked and friendly playable matches
  // (skip only the eliminated-team free-court placeholders).
  const matches = [];
  (h.plan?.schedule || []).forEach((slot, slotIdx) => {
    slot.matches.forEach(m => {
      if (m.team_a == null || m.team_b == null) return;
      const key = `${slotIdx}:${m.court}`;
      const entry = h.results?.[key];
      const result = Storage._helpers.getMatchResult(entry);
      if (!result) return;
      const evLike = { plan: h.plan, teams: h.teams, results: h.results };
      const ta = resolveTeamFromHist(m.team_a, evLike);
      const tb = resolveTeamFromHist(m.team_b, evLike);
      if (!ta || !tb) return;
      const scores = Storage._helpers.getMatchScores(entry);
      const scoreText = scores.a !== null && scores.b !== null
        ? ` ${scores.a}-${scores.b}`
        : '';
      const resultText =
        result === 'A' ? t('hist.result.a_won', { name: ta.name })
      : result === 'B' ? t('hist.result.b_won', { name: tb.name })
      : t('hist.result.draw');
      matches.push(`
        <div class="hist-match">
          <span class="hist-match-phase">${escapeHtml(phaseDisplay(slot.phase))}</span>
          <span>${escapeHtml(ta.name)} vs ${escapeHtml(tb.name)}${escapeHtml(scoreText)}</span>
          <span class="hist-match-result">${escapeHtml(resultText)}</span>
        </div>
      `);
    });
  });

  return `
    <div class="history-detail">
      <h4>${escapeHtml(t('hist.detail.teams'))}</h4>
      <div class="hist-teams">${teamsHtml}</div>

      <h4>${escapeHtml(t('hist.detail.matches'))}</h4>
      <div class="hist-matches">${matches.join('') || '<p class="empty">' + escapeHtml(t('hist.detail.no_matches')) + '</p>'}</div>

      <h4>${escapeHtml(t('hist.detail.deltas'))}</h4>
      <div class="summary-list">${deltaHtml}</div>
    </div>
  `;
}

function resolveTeamFromHist(ref, evLike) {
  if (typeof ref === 'number') return evLike.teams[ref];
  return Storage._helpers.resolvePlaceholder(ref, evLike);
}

/* ─── SETUP ─────────────────────────────────────────────────── */
function renderSetup() {
  const players = Storage.getAllPlayers();
  const sorted = [...players].sort((a, b) => b.points - a.points || a.name.localeCompare(b.name));

  const listDiv = document.getElementById('attendee-list');
  if (sorted.length === 0) {
    listDiv.innerHTML = `<p class="empty">${escapeHtml(t('setup.empty.db'))}</p>`;
    updateAttendeeCount();
    return;
  }

  listDiv.innerHTML = sorted.map(p => `
    <label class="attendee-row">
      <input type="checkbox" data-id="${p.id}" ${ui.selectedAttendees.has(p.id) ? 'checked' : ''}>
      <span class="att-name">${escapeHtml(p.name)}</span>
      <span class="att-pts">${escapeHtml(t('home.lb.points', { n: p.points }))}</span>
    </label>
  `).join('');

  listDiv.querySelectorAll('input[type=checkbox]').forEach(cb => {
    cb.onchange = () => {
      if (cb.checked) ui.selectedAttendees.add(cb.dataset.id);
      else ui.selectedAttendees.delete(cb.dataset.id);
      updateAttendeeCount();
    };
  });

  updateAttendeeCount();
}

function updateAttendeeCount() {
  document.getElementById('attendee-count-hint').textContent =
    t('setup.attendees.selected', { n: ui.selectedAttendees.size });
}

/* ─── TEAMS VIEW ────────────────────────────────────────────── */
function renderTeams() {
  if (!ui.pendingTeams) return;

  const teams = ui.pendingTeams;
  const teamSize = parseInt(document.getElementById('team-size').value, 10) || 2;
  const display = document.getElementById('teams-display');

  // Manual-swap doesn't apply in fallback mode (per-match teams),
  // but reshuffle DOES — it re-randomises the cohort grouping so
  // the user can get a different set of pairings.
  const swapBtn = document.getElementById('btn-swap-mode');
  const reshuffleBtn = document.getElementById('btn-reshuffle');
  if (ui.fallbackMode) {
    swapBtn.classList.add('hidden');
    reshuffleBtn.classList.remove('hidden');

    // The notice differs based on WHY we're in fallback mode:
    //   - User explicitly picked friendly: a friendly-mode notice
    //   - Auto mode silently fell back to friendly because the cup
    //     formats wouldn't fit: the original "auto fallback" notice
    //     (now relabelled to make the auto framing explicit)
    const noticeKey = ui.chosenMode === 'friendly'
      ? 'teams.notice.friendly_explicit'
      : 'teams.notice.auto_fallback';
    document.getElementById('teams-hint').textContent = t(noticeKey);

    // In fallback mode the teams display becomes a per-slot match
    // preview rather than static team cards.
    display.innerHTML = renderFallbackPreview(ui.pendingPlan);
    renderFormatPreview();
    return;
  }

  swapBtn.classList.remove('hidden');
  reshuffleBtn.classList.remove('hidden');

  document.getElementById('teams-hint').textContent = ui.swapMode
    ? t('teams.hint.swap', { count: teams.length, size: teamSize })
    : t('teams.hint', { count: teams.length, size: teamSize });

  // Swap-mode button label
  swapBtn.textContent = ui.swapMode
    ? t('teams.btn.swap.done')
    : t('teams.btn.swap.start');

  display.innerHTML = teams.map((team, ti) => `
    <div class="team-card">
      <div class="team-card-head">${escapeHtml(team.name)}</div>
      <div class="team-players">
        ${team.players.map((pid, pi) => {
          const p = Storage.getPlayer(pid);
          const isCap = pi === 0;
          const selected = ui.swapSelection &&
            ui.swapSelection.teamIdx === ti && ui.swapSelection.playerIdx === pi;
          return `<div class="team-player ${isCap ? 'captain' : ''} ${selected ? 'selected' : ''}"
                       data-team="${ti}" data-pi="${pi}">
            ${isCap ? '👑 ' : ''}${escapeHtml(p?.name || '?')}
            <span class="mini-pts">${p?.points || 0}</span>
          </div>`;
        }).join('')}
      </div>
    </div>
  `).join('');

  if (ui.swapMode) {
    display.querySelectorAll('.team-player').forEach(el => {
      el.onclick = () => handleSwapClick(
        parseInt(el.dataset.team, 10),
        parseInt(el.dataset.pi, 10)
      );
    });
  }

  // Format preview
  renderFormatPreview();
}

// Renders a slot-by-slot match preview for the random-fair fallback.
// Each match shows the player names directly because the per-match
// teams are short-lived and have no meaningful "team identity".
function renderFallbackPreview(plan) {
  const sep = t('text.name.separator');
  const nameOf = (pid) => Storage.getPlayer(pid)?.name || '?';
  return plan.schedule.map(slot => {
    const matches = slot.matches.map(m => {
      const teamA = plan.teams[m.team_a];
      const teamB = plan.teams[m.team_b];
      const aNames = teamA.players.map(nameOf).map(escapeHtml).join(sep);
      const bNames = teamB.players.map(nameOf).map(escapeHtml).join(sep);
      return `
        <div class="fallback-match">
          <div class="fallback-court">${escapeHtml(t('tour.court', { n: m.court }))}</div>
          <div class="fallback-vs">
            <span class="fallback-side">${aNames}</span>
            <span class="vs">${escapeHtml(t('tour.vs'))}</span>
            <span class="fallback-side">${bNames}</span>
          </div>
        </div>
      `;
    }).join('');
    return `
      <div class="fallback-slot">
        <div class="fallback-slot-head">${escapeHtml(t('tour.slot', { n: slot.slot }))}</div>
        ${matches}
      </div>
    `;
  }).join('');
}

function handleSwapClick(teamIdx, playerIdx) {
  if (!ui.swapSelection) {
    ui.swapSelection = { teamIdx, playerIdx };
  } else {
    const a = ui.swapSelection;
    const b = { teamIdx, playerIdx };
    if (a.teamIdx === b.teamIdx && a.playerIdx === b.playerIdx) {
      ui.swapSelection = null;  // deselect
    } else {
      const tA = ui.pendingTeams[a.teamIdx];
      const tB = ui.pendingTeams[b.teamIdx];
      [tA.players[a.playerIdx], tB.players[b.playerIdx]] =
        [tB.players[b.playerIdx], tA.players[a.playerIdx]];
      ui.swapSelection = null;
      planPendingTournament();
    }
  }
  renderTeams();
}

function renderFormatPreview() {
  const plan = ui.pendingPlan;
  const preview = document.getElementById('format-preview');
  if (!plan) {
    preview.innerHTML = '';
    return;
  }
  if (plan.error || !plan.fits) {
    const reason = translateFormatReason(plan.reason) || plan.error || '';
    preview.innerHTML = `<div class="error-msg">${escapeHtml(t('teams.format.infeasible', { reason }))}</div>`;
    return;
  }

  let fmtText;
  if (plan.format === 'groups-knockout') {
    fmtText = t('teams.format.groups_knockout', {
      groups: plan.group_sizes.join('/'),
      n: plan.knockout_size,
    });
  } else if (plan.format === 'knockout') {
    fmtText = t('teams.format.knockout', { n: plan.knockout_size || 0 });
  } else if (plan.format === 'random-fair') {
    fmtText = t('teams.format.random_fair');
  } else if (plan.format === 'friendly') {
    fmtText = t('teams.format.friendly');
  } else {
    fmtText = t('teams.format.round_robin');
  }

  const d = parseInt(document.getElementById('match-duration').value, 10) || 15;
  const totalMin = plan.slotsUsed * d;
  // Count playable matches uniformly (excludes free-court placeholders)
  const matchCount = plan.schedule.reduce(
    (s, slot) => s + slot.matches.filter(isPlayableMatch).length, 0);

  const isFriendly = plan.format === 'friendly';
  const statsKey = isFriendly ? 'teams.format.stats_friendly' : 'teams.format.stats';
  preview.innerHTML = `
    <div class="preview-title">${escapeHtml(t('teams.format.recommended'))}</div>
    <div class="preview-main">${escapeHtml(fmtText)}</div>
    <div class="preview-sub">
      ${escapeHtml(t(statsKey, { ranked: matchCount, friendly: matchCount, slots: plan.slotsUsed, min: totalMin }))}
    </div>
  `;
}

// Map scheduler.js reason strings (which are still hardcoded Chinese for
// historical reasons) to translation keys.
function translateFormatReason(reason) {
  if (!reason) return '';
  const map = {
    '时间不足': 'format.out_of_time',
    '队伍太少': 'format.not_enough_teams',
    '小组赛超时': 'format.group_too_long',
    '淘汰赛超时': 'format.ko_too_long',
    '时间不足以完成小组赛+淘汰赛': 'format.groups_not_feasible',
    '至少需要2支队伍': 'format.need_two_teams',
  };
  const key = map[reason];
  return key ? t(key) : reason;
}

// Re-runs the tournament planner against ui.pendingTeams using the
// currently-selected mode. Called from generateTeams (initial) and
// from manual swap / re-shuffle actions in the teams view (so the
// schedule preview reflects the new team order).
//
// Also calls syncPendingTeamsFromPlan() so that if the result has
// per-match teams (friendly mode, or auto falling back to friendly),
// ui.pendingTeams gets replaced with them and ui.fallbackMode is set.
// Callers don't need to do this themselves.
function planPendingTournament() {
  const mode = ui.chosenMode || 'auto';
  const numCourts = parseInt(document.getElementById('num-courts').value, 10) || 2;
  const matchDuration = parseInt(document.getElementById('match-duration').value, 10) || 15;
  const totalTime = parseInt(document.getElementById('total-time').value, 10) || 180;
  const teamSize = parseInt(document.getElementById('team-size').value, 10) || 2;

  const playersMap = {};
  Storage.getAllPlayers().forEach(p => { playersMap[p.id] = p; });

  ui.pendingPlan = planByMode(mode, {
    teams: ui.pendingTeams,
    attendeeIds: Array.from(ui.selectedAttendees),
    playersMap,
    teamSize,
    teamsPerMatch: 2,
    numCourts,
    matchDuration,
    totalTime,
  });
  syncPendingTeamsFromPlan();
}

// After planByMode runs, if the resulting plan brings its own
// per-match teams (friendly / random-fair), copy them into
// ui.pendingTeams (with localised labels) and set ui.fallbackMode so
// the teams view enters the per-slot match-preview rendering path.
// For non-fallback plans this is a no-op except for clearing
// fallbackMode.
function syncPendingTeamsFromPlan() {
  ui.fallbackMode = false;
  if (!ui.pendingPlan) return;
  const fmt = ui.pendingPlan.format;
  const isFallback = (fmt === 'friendly' || fmt === 'random-fair');
  if (isFallback && Array.isArray(ui.pendingPlan.teams)) {
    ui.pendingPlan.teams.forEach((team, i) => {
      team.name = t('team.default.name', { n: i + 1 });
    });
    ui.pendingTeams = ui.pendingPlan.teams;
    ui.fallbackMode = true;
  }
}

/* ─── TOURNAMENT VIEW ───────────────────────────────────────── */
function renderTournament() {
  const ev = Storage.getCurrentEvent();
  if (!ev || !ev.plan) {
    showView('home');
    return;
  }

  // Progress — count every PLAYABLE match (one that has real team
  // references), regardless of whether it's ranked or friendly.
  // Excludes the eliminated-team free-court placeholder rows whose
  // team_a/team_b are null.
  // `done` counts entries with a recorded result; score-only entries
  // (mid-typing, no result yet) still don't count.
  const total = ev.plan.schedule.reduce(
    (s, slot) => s + slot.matches.filter(isPlayableMatch).length, 0);
  const done = Object.values(ev.results || {})
    .filter(entry => Storage._helpers.getMatchResult(entry) != null).length;
  document.getElementById('tournament-progress').innerHTML = `
    <div class="progress-bar"><div class="progress-fill" style="width:${total ? (done / total * 100) : 0}%"></div></div>
    <div class="progress-text">${escapeHtml(t('tour.progress', { done, total }))}</div>
  `;

  // Schedule
  const scheduleDiv = document.getElementById('tournament-schedule');
  scheduleDiv.innerHTML = ev.plan.schedule.map((slot, slotIdx) => {
    const phaseTag = phaseDisplay(slot.phase);
    const roundText = typeof slot.round === 'string' ? slot.round : t('tour.round.num', { n: slot.round });
    return `
      <div class="slot-card">
        <div class="slot-head">
          <span class="slot-num">${escapeHtml(t('tour.slot', { n: slot.slot }))}</span>
          <span class="slot-phase">${escapeHtml(phaseTag)} ${escapeHtml(roundText)}</span>
        </div>
        ${slot.matches.map(m => renderMatch(m, slotIdx, ev)).join('')}
      </div>
    `;
  }).join('');

  scheduleDiv.querySelectorAll('[data-result-btn]').forEach(btn => {
    btn.onclick = () => {
      const [slotIdx, court, res] = btn.dataset.resultBtn.split(':');
      recordResult(parseInt(slotIdx, 10), parseInt(court, 10), res);
    };
  });

  // Score inputs save on blur (so the user can finish typing first) and
  // also on Enter. Click-into-input doesn't fire any handler — only the
  // committed change does.
  scheduleDiv.querySelectorAll('[data-score]').forEach(input => {
    const commit = () => {
      const [slotIdx, court, side] = input.dataset.score.split(':');
      recordScore(parseInt(slotIdx, 10), parseInt(court, 10), side, input.value);
    };
    input.addEventListener('blur', commit);
    input.addEventListener('keydown', e => {
      if (e.key === 'Enter') {
        e.preventDefault();
        input.blur();  // triggers commit
      }
    });
  });

  const finishBtn = document.getElementById('btn-finish-tournament');
  finishBtn.classList.toggle('hidden', done < total);
}

function phaseDisplay(phase) {
  const map = {
    'group': 'tour.phase.group',
    'knockout': 'tour.phase.knockout',
    'round-robin': 'tour.phase.round_robin',
    'random-fair': 'tour.phase.random_fair',
    'friendly': 'tour.phase.friendly',
  };
  return t(map[phase] || phase);
}

// True for any match that has real team references — i.e. excludes
// the eliminated-team free-court placeholder rows reserved during the
// knockout phase. Used by progress counters and the schedule renderer
// to distinguish "this is something the user actually plays + records"
// from "this is just a hint that the court is free".
function isPlayableMatch(match) {
  return match.team_a != null && match.team_b != null;
}

function renderMatch(match, slotIdx, ev) {
  const ta = resolveTeamDisplay(match.team_a, ev);
  const tb = resolveTeamDisplay(match.team_b, ev);
  const key = `${slotIdx}:${match.court}`;
  const entry = ev.results?.[key];
  const result = Storage._helpers.getMatchResult(entry);
  const scores = Storage._helpers.getMatchScores(entry);

  // Two distinct kinds of "friendly" match:
  //
  //   1. The eliminated-team free-court placeholder reserved during
  //      the knockout phase of groups+knockout / pure-knockout. These
  //      have no team refs (team_a/team_b are null) — render a
  //      static "free court for eliminated teams" hint, no inputs.
  //
  //   2. A real match in pure-friendly mode (planFriendly): per-match
  //      teams with concrete player IDs. These need the FULL match
  //      UI — team labels, player names, score inputs, result buttons —
  //      otherwise the user can't see who's playing or record results.
  //      The "doesn't count for points" semantics happen later in
  //      commitEvent (which skips kind!='ranked' when accumulating
  //      deltas), not in the render layer.
  if (match.kind === 'friendly' && (match.team_a == null || match.team_b == null)) {
    return `
      <div class="match-row friendly">
        <div class="court-label">${escapeHtml(t('tour.court.friendly', { n: match.court }))}</div>
        <div class="friendly-note">${escapeHtml(t('tour.friendly.note'))}</div>
      </div>
    `;
  }

  const btnCls = r => `result-btn ${result === r ? 'active' : ''}`;
  const scoreA = scores.a !== null ? scores.a : '';
  const scoreB = scores.b !== null ? scores.b : '';
  return `
    <div class="match-row">
      <div class="court-label">${escapeHtml(t('tour.court', { n: match.court }))}</div>
      <div class="match-teams">
        <div class="match-team ${result === 'A' ? 'winner' : ''}">${escapeHtml(ta.name)}<div class="match-members">${escapeHtml(ta.members)}</div></div>
        <div class="vs">${escapeHtml(t('tour.vs'))}</div>
        <div class="match-team ${result === 'B' ? 'winner' : ''}">${escapeHtml(tb.name)}<div class="match-members">${escapeHtml(tb.members)}</div></div>
      </div>
      <div class="score-inputs">
        <input class="score-input" type="number" inputmode="numeric" min="0" max="999"
               value="${scoreA}" placeholder="${escapeHtml(t('tour.score.placeholder'))}"
               data-score="${slotIdx}:${match.court}:a">
        <span class="score-dash">−</span>
        <input class="score-input" type="number" inputmode="numeric" min="0" max="999"
               value="${scoreB}" placeholder="${escapeHtml(t('tour.score.placeholder'))}"
               data-score="${slotIdx}:${match.court}:b">
      </div>
      <div class="result-btns">
        <button class="${btnCls('A')}" data-result-btn="${slotIdx}:${match.court}:A">${escapeHtml(t('tour.result.a'))}</button>
        <button class="${btnCls('D')}" data-result-btn="${slotIdx}:${match.court}:D">${escapeHtml(t('tour.result.d'))}</button>
        <button class="${btnCls('B')}" data-result-btn="${slotIdx}:${match.court}:B">${escapeHtml(t('tour.result.b'))}</button>
      </div>
    </div>
  `;
}

function resolveTeamDisplay(ref, ev) {
  const sep = t('text.name.separator');
  if (ref === null) return { name: '-', members: '' };
  if (typeof ref === 'number') {
    const team = ev.teams[ref];
    if (!team) return { name: '?', members: '' };
    const members = team.players
      .map(pid => Storage.getPlayer(pid)?.name || '?')
      .join(sep);
    return { name: team.name, members };
  }
  // Placeholder: try to resolve dynamically
  const resolved = Storage._helpers.resolvePlaceholder(ref, ev);
  if (resolved) {
    const members = resolved.players
      .map(pid => Storage.getPlayer(pid)?.name || '?')
      .join(sep);
    return { name: resolved.name, members };
  }
  return { name: placeholderLabel(ref), members: '' };
}

function placeholderLabel(ref) {
  if (typeof ref !== 'string') return String(ref);
  let m = ref.match(/^G(\d+)-(\d+)$/);
  if (m) return t('placeholder.group_rank', { g: m[1], r: m[2] });
  m = ref.match(/^KR(\d+)-M(\d+)-W$/);
  if (m) return t('placeholder.kr_winner', { r: m[1], m: m[2] });
  return ref;
}

// Reads any prior entry, merges fresh fields, and writes the unified
// `{ result, scoreA?, scoreB? }` object back. Pass `partial` like
// `{ result: 'A' }` or `{ scoreA: 21 }` and the rest is preserved.
function updateMatchEntry(slotIdx, court, partial) {
  const ev = Storage.getCurrentEvent();
  if (!ev) return;
  if (!ev.results) ev.results = {};
  const key = `${slotIdx}:${court}`;

  // Normalize the existing entry into the object form
  const prev = ev.results[key];
  let next;
  if (prev == null) {
    next = {};
  } else if (typeof prev === 'string') {
    next = { result: prev };
  } else {
    next = { ...prev };
  }
  Object.assign(next, partial);

  // If everything got cleared (no result and no scores), drop the entry
  if (next.result == null
      && (next.scoreA == null || Number.isNaN(next.scoreA))
      && (next.scoreB == null || Number.isNaN(next.scoreB))) {
    delete ev.results[key];
  } else {
    // Strip undefined / NaN so the persisted shape stays clean
    if (next.scoreA == null || Number.isNaN(next.scoreA)) delete next.scoreA;
    if (next.scoreB == null || Number.isNaN(next.scoreB)) delete next.scoreB;
    ev.results[key] = next;
  }
  Storage.setCurrentEvent(ev);
}

function recordResult(slotIdx, court, result) {
  const ev = Storage.getCurrentEvent();
  if (!ev) return;
  const key = `${slotIdx}:${court}`;
  const prevResult = Storage._helpers.getMatchResult(ev.results?.[key]);
  // Tapping the same button again clears just the result (keeps scores
  // if the user had already typed any).
  updateMatchEntry(slotIdx, court, { result: prevResult === result ? null : result });
  maybeShowTiebreakerNotices();
  renderTournament();
}

function recordScore(slotIdx, court, side, raw) {
  const trimmed = String(raw).trim();
  let value = null;
  if (trimmed !== '') {
    const n = Number(trimmed);
    if (Number.isFinite(n) && n >= 0) value = n;
  }

  // Save the score on the entry
  const partial = side === 'a' ? { scoreA: value } : { scoreB: value };
  updateMatchEntry(slotIdx, court, partial);

  // Auto-derive the result from the new pair of scores when both are
  // present. This is the typical "I just typed 21-15" flow — the user
  // shouldn't also have to tap a result button. We DO NOT clear an
  // existing result if scores become incomplete; the user can still
  // override by tapping a button.
  const ev = Storage.getCurrentEvent();
  if (!ev) return;
  const key = `${slotIdx}:${court}`;
  const scores = Storage._helpers.getMatchScores(ev.results?.[key]);
  if (scores.a !== null && scores.b !== null) {
    let derived;
    if (scores.a > scores.b) derived = 'A';
    else if (scores.a < scores.b) derived = 'B';
    else derived = 'D';
    updateMatchEntry(slotIdx, court, { result: derived });
  }

  maybeShowTiebreakerNotices();
  renderTournament();
}

// Detects groups that are now complete (every group match has a
// recorded result) AND have at least one tied position in their
// standings, and shows a one-time alert explaining how the tie was
// resolved (score difference or random tiebreak). Already-shown
// notices are tracked on ev.tiebreakerNoticesShown so the alert
// fires at most once per group per event.
function maybeShowTiebreakerNotices() {
  const ev = Storage.getCurrentEvent();
  if (!ev || !ev.plan || !ev.plan.group_sizes) return;
  if (!Array.isArray(ev.tiebreakerNoticesShown)) {
    ev.tiebreakerNoticesShown = [];
  }
  const sizes = ev.plan.group_sizes;
  let dirty = false;
  for (let g = 0; g < sizes.length; g++) {
    if (ev.tiebreakerNoticesShown.includes(g)) continue;
    if (!Storage._helpers.isGroupComplete(ev, g)) continue;
    const ties = Storage._helpers.detectGroupTiebreakers(ev, g);
    // Mark as "shown" regardless — we won't re-fire even if the user
    // edits a result later (their explicit choice not to disturb).
    ev.tiebreakerNoticesShown.push(g);
    dirty = true;
    if (ties.length === 0) continue;

    const lines = [];
    lines.push(t('tiebreaker.notice.header', { group: g + 1 }));
    ties.forEach(tie => {
      const teamNames = tie.teams.map(team => team.name).join(t('text.name.separator'));
      if (tie.resolvedBy === 'diff') {
        const diffStrs = tie.teams.map((team, i) =>
          `${team.name}: ${tie.diffs[i] >= 0 ? '+' : ''}${tie.diffs[i]}`
        ).join(t('text.name.separator'));
        lines.push(t('tiebreaker.notice.diff', {
          pts: tie.pts,
          teams: teamNames,
          diffs: diffStrs,
        }));
      } else {
        lines.push(t('tiebreaker.notice.random', {
          pts: tie.pts,
          teams: teamNames,
        }));
      }
    });
    alert(lines.join('\n\n'));
  }
  if (dirty) Storage.setCurrentEvent(ev);
}

/* ─── EVENT LIFECYCLE ───────────────────────────────────────── */
function startNewEvent() {
  ui.selectedAttendees = new Set();
  ui.pendingTeams = null;
  ui.pendingPlan = null;
  showView('setup');
}

function generateTeams() {
  const attendeeIds = Array.from(ui.selectedAttendees);
  const teamSize = parseInt(document.getElementById('team-size').value, 10) || 2;
  const mode = document.getElementById('tournament-mode').value || 'auto';
  if (attendeeIds.length < teamSize * 2) {
    alert(t('setup.alert.need_players', { n: teamSize * 2 }));
    return;
  }

  const playersMap = {};
  Storage.getAllPlayers().forEach(p => { playersMap[p.id] = p; });

  // Friendly mode skips the balanced-draft step entirely — its teams
  // are generated per-match by planFriendly / planRandomFairFallback.
  // Auto mode does form the draft up-front because cup formats might
  // succeed; if auto then falls back to friendly, syncPendingTeamsFromPlan
  // will swap pendingTeams over to the per-match teams.
  if (mode === 'friendly') {
    ui.pendingTeams = [];
    ui.spectators = [];
  } else {
    const result = formBalancedTeams(attendeeIds, playersMap, teamSize);
    if (result.error) {
      alert(result.error);
      return;
    }
    result.teams.forEach((team, i) => {
      team.name = t('team.default.name', { n: i + 1 });
    });
    ui.pendingTeams = result.teams;
    ui.spectators = result.spectators || [];
  }

  ui.swapMode = false;
  ui.swapSelection = null;
  ui.chosenMode = mode;

  // planPendingTournament internally calls syncPendingTeamsFromPlan,
  // which sets ui.fallbackMode and replaces pendingTeams when the
  // result is friendly/random-fair (whether from explicit mode OR
  // from auto's friendly fallback).
  planPendingTournament();

  if (!ui.pendingPlan || !ui.pendingPlan.fits) {
    const reason = translateFormatReason(ui.pendingPlan?.reason);
    alert(t('setup.alert.mode_infeasible', {
      mode: t('setup.mode.' + mode.replace('-', '_')),
      reason,
    }));
    return;
  }

  showView('teams');
}

function confirmStartTournament() {
  if (!ui.pendingPlan || !ui.pendingPlan.fits) {
    alert(t('teams.format.infeasible', { reason: translateFormatReason(ui.pendingPlan?.reason) }));
    return;
  }

  const ev = {
    date: new Date().toISOString().slice(0, 10),
    teamSize: parseInt(document.getElementById('team-size').value, 10),
    numCourts: parseInt(document.getElementById('num-courts').value, 10),
    matchDuration: parseInt(document.getElementById('match-duration').value, 10),
    totalTime: parseInt(document.getElementById('total-time').value, 10),
    expense: parseFloat(document.getElementById('weekly-expense').value) || 0,
    attendees: Array.from(ui.selectedAttendees),
    teams: ui.pendingTeams,
    plan: ui.pendingPlan,
    results: {},
    phase: 'running',
  };
  Storage.setCurrentEvent(ev);
  showView('tournament');
}

/* ─── RECORD-ONLY MODE ──────────────────────────────────────── */
//
// An alternative to the cup pipeline: skip team formation entirely
// and let the user log arbitrary matches as they happen, picking the
// player composition for each match by hand. Each match independently
// chooses whether it counts for tournament points; W/D/L (and therefore
// win rate, head-to-head, attendance) always count.
//
// Storage shape: same as a regular event, with plan.format = 'recordonly'
// and a per-match team list that grows as the user adds matches. Each
// added match becomes its own one-court slot. commitEvent doesn't need
// to know about the format — it just walks ev.results and applies the
// `accumulateDelta(..., countPoints=match.kind === 'ranked')` rule that
// already exists for friendly mode.
//
// UI model: every match in ev.plan.schedule renders as its own
// editable card. There is no separate "draft" — the schedule itself
// IS the draft until the user taps "Finish & submit all", at which
// point we validate every card and run the same commitEvent path the
// regular tournament uses.

function startRecordOnly() {
  const attendeeIds = Array.from(ui.selectedAttendees);
  if (attendeeIds.length < 2) {
    alert(t('record.alert.need_attendees'));
    return;
  }
  const ev = {
    date: new Date().toISOString().slice(0, 10),
    teamSize: parseInt(document.getElementById('team-size').value, 10) || 2,
    numCourts: 1,
    matchDuration: parseInt(document.getElementById('match-duration').value, 10) || 15,
    totalTime: 0,  // not meaningful in record-only mode
    expense: parseFloat(document.getElementById('weekly-expense').value) || 0,
    attendees: attendeeIds,
    teams: [],
    plan: {
      format: 'recordonly',
      schedule: [],
      slotsUsed: 0,
      fits: true,
    },
    results: {},
    phase: 'recording',
  };
  Storage.setCurrentEvent(ev);
  showView('recordonly');
}

function renderRecordOnly() {
  const ev = Storage.getCurrentEvent();
  if (!ev || ev.plan?.format !== 'recordonly') {
    showView('home');
    return;
  }

  // Header line: date · attendees · expense
  const expenseStr = ev.expense > 0 ? fmtMoney(ev.expense) : '0';
  document.getElementById('record-event-info').textContent = t('record.event.info', {
    date: ev.date,
    attendees: ev.attendees.length,
    expense: expenseStr,
  });

  const matchListDiv = document.getElementById('record-match-list');
  if (ev.plan.schedule.length === 0) {
    matchListDiv.innerHTML = `<p class="empty">${escapeHtml(t('record.list.empty'))}</p>`;
    return;
  }
  matchListDiv.innerHTML = ev.plan.schedule
    .map((slot, slotIdx) => renderRecordOnlyMatchCard(ev, slot, slotIdx))
    .join('');
  bindRecordOnlyMatchCards();
}

// Renders one editable match card. Each card is fully self-contained
// — its own player chips, score inputs, result buttons, kind toggle
// and remove button. State is read directly from ev.teams /
// ev.results so there's no separate draft model to keep in sync.
function renderRecordOnlyMatchCard(ev, slot, slotIdx) {
  const m = slot.matches[0];
  const teamA = ev.teams[m.team_a];
  const teamB = ev.teams[m.team_b];
  const aSet = new Set(teamA.players);
  const bSet = new Set(teamB.players);
  const entry = ev.results[`${slotIdx}:1`] || {};
  const result = entry.result || null;
  const scoreA = entry.scoreA != null ? entry.scoreA : '';
  const scoreB = entry.scoreB != null ? entry.scoreB : '';
  const isRanked = m.kind !== 'friendly';

  const chipsHtml = ev.attendees.map(pid => {
    const p = Storage.getPlayer(pid);
    if (!p) return '';
    let cls = 'record-attendee';
    let badge = '';
    if (aSet.has(pid)) { cls += ' team-a'; badge = ' A'; }
    else if (bSet.has(pid)) { cls += ' team-b'; badge = ' B'; }
    return `<div class="${cls}" data-pid="${pid}" data-action="chip">${escapeHtml(p.name)}${badge}</div>`;
  }).join('');

  const phPlaceholder = escapeHtml(t('tour.score.placeholder'));
  return `
    <div class="record-match-card" data-slot="${slotIdx}">
      <div class="record-match-card-header">
        <strong>${escapeHtml(t('record.match.label', { n: slotIdx + 1 }))}</strong>
        <button class="btn-icon" data-action="remove" title="×">×</button>
      </div>
      <div class="record-attendee-list">${chipsHtml}</div>
      <div class="record-team-counts">${escapeHtml(t('record.add.counts_line', { a: aSet.size, b: bSet.size }))}</div>
      <div class="score-inputs">
        <input class="score-input" type="number" inputmode="numeric" min="0" max="999"
               data-action="score" data-side="a" value="${scoreA}" placeholder="${phPlaceholder}">
        <span class="score-dash">−</span>
        <input class="score-input" type="number" inputmode="numeric" min="0" max="999"
               data-action="score" data-side="b" value="${scoreB}" placeholder="${phPlaceholder}">
      </div>
      <div class="result-btns">
        <button class="result-btn ${result === 'A' ? 'active' : ''}" data-action="result" data-result="A">${escapeHtml(t('tour.result.a'))}</button>
        <button class="result-btn ${result === 'D' ? 'active' : ''}" data-action="result" data-result="D">${escapeHtml(t('tour.result.d'))}</button>
        <button class="result-btn ${result === 'B' ? 'active' : ''}" data-action="result" data-result="B">${escapeHtml(t('tour.result.b'))}</button>
      </div>
      <label class="record-toggle">
        <input type="checkbox" data-action="counts" ${isRanked ? 'checked' : ''}>
        <span>${escapeHtml(t('record.add.counts'))}</span>
      </label>
    </div>
  `;
}

function bindRecordOnlyMatchCards() {
  document.querySelectorAll('#record-match-list .record-match-card').forEach(card => {
    const slotIdx = parseInt(card.dataset.slot, 10);
    card.querySelectorAll('[data-action="chip"]').forEach(el => {
      el.onclick = () => toggleRecordOnlyChip(slotIdx, el.dataset.pid);
    });
    card.querySelectorAll('[data-action="result"]').forEach(btn => {
      btn.onclick = () => setRecordOnlyMatchResult(slotIdx, btn.dataset.result);
    });
    card.querySelectorAll('[data-action="score"]').forEach(input => {
      input.addEventListener('blur', () => setRecordOnlyMatchScore(slotIdx, input.dataset.side, input.value));
    });
    const countsCb = card.querySelector('[data-action="counts"]');
    if (countsCb) countsCb.onchange = () => setRecordOnlyMatchCounts(slotIdx, countsCb.checked);
    const removeBtn = card.querySelector('[data-action="remove"]');
    if (removeBtn) removeBtn.onclick = () => removeRecordOnlyMatch(slotIdx);
  });
}

// Cycle a player chip on a specific match: none → A → B → none.
// Mutates the team's player list directly — the schedule references
// teams by index into ev.teams, and we never reorder ev.teams, so
// other matches keep working.
function toggleRecordOnlyChip(slotIdx, pid) {
  const ev = Storage.getCurrentEvent();
  if (!ev) return;
  const slot = ev.plan.schedule[slotIdx];
  if (!slot) return;
  const m = slot.matches[0];
  const teamA = ev.teams[m.team_a];
  const teamB = ev.teams[m.team_b];
  const aIdx = teamA.players.indexOf(pid);
  const bIdx = teamB.players.indexOf(pid);
  if (aIdx >= 0) {
    teamA.players.splice(aIdx, 1);
    teamB.players.push(pid);
  } else if (bIdx >= 0) {
    teamB.players.splice(bIdx, 1);
  } else {
    teamA.players.push(pid);
  }
  Storage.setCurrentEvent(ev);
  renderRecordOnly();
}

function setRecordOnlyMatchResult(slotIdx, result) {
  const ev = Storage.getCurrentEvent();
  if (!ev) return;
  const key = `${slotIdx}:1`;
  const entry = ev.results[key] || {};
  // Tap-to-toggle: same button twice clears the result
  entry.result = entry.result === result ? null : result;
  ev.results[key] = entry;
  Storage.setCurrentEvent(ev);
  renderRecordOnly();
}

function setRecordOnlyMatchScore(slotIdx, side, raw) {
  const ev = Storage.getCurrentEvent();
  if (!ev) return;
  const key = `${slotIdx}:1`;
  const entry = ev.results[key] || {};
  const trimmed = String(raw).trim();
  let value = null;
  if (trimmed !== '') {
    const n = Number(trimmed);
    if (Number.isFinite(n) && n >= 0) value = n;
  }
  if (side === 'a') entry.scoreA = value;
  else entry.scoreB = value;
  // Auto-derive the result from a complete score pair (same rule as
  // the in-tournament score entry).
  if (entry.scoreA != null && entry.scoreB != null) {
    if (entry.scoreA > entry.scoreB) entry.result = 'A';
    else if (entry.scoreA < entry.scoreB) entry.result = 'B';
    else entry.result = 'D';
  }
  ev.results[key] = entry;
  Storage.setCurrentEvent(ev);
  renderRecordOnly();
}

function setRecordOnlyMatchCounts(slotIdx, checked) {
  const ev = Storage.getCurrentEvent();
  if (!ev) return;
  const slot = ev.plan.schedule[slotIdx];
  if (!slot) return;
  slot.matches[0].kind = checked ? 'ranked' : 'friendly';
  Storage.setCurrentEvent(ev);
  // No re-render needed — checkbox state is already on the DOM and
  // the visible card doesn't change shape based on this flag.
}

// Append a fresh empty match card. The user fills in players +
// scores in place; nothing commits until "Finish".
function addRecordOnlyMatch() {
  const ev = Storage.getCurrentEvent();
  if (!ev || ev.plan?.format !== 'recordonly') return;

  const matchNum = ev.plan.schedule.length + 1;
  const teamAIdx = ev.teams.length;
  ev.teams.push({
    id: `t_ro_${teamAIdx}`,
    name: t('record.match.team_a_n', { n: matchNum }),
    players: [],
  });
  const teamBIdx = ev.teams.length;
  ev.teams.push({
    id: `t_ro_${teamBIdx}`,
    name: t('record.match.team_b_n', { n: matchNum }),
    players: [],
  });
  ev.plan.schedule.push({
    phase: 'recordonly',
    round: matchNum,
    slot: matchNum,
    matches: [{
      court: 1,
      team_a: teamAIdx,
      team_b: teamBIdx,
      kind: 'ranked',
    }],
  });
  ev.plan.slotsUsed = ev.plan.schedule.length;
  Storage.setCurrentEvent(ev);
  renderRecordOnly();
  // Bring the new card into view so the user knows where to start typing.
  setTimeout(() => {
    const cards = document.querySelectorAll('#record-match-list .record-match-card');
    const last = cards[cards.length - 1];
    if (last && last.scrollIntoView) last.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, 0);
}

// Removes one recorded match. Re-keys ev.results so the slot indices
// stay contiguous; leaves orphan teams in ev.teams (harmless — nothing
// references them, and renumbering would invalidate references in the
// other still-existing slots).
function removeRecordOnlyMatch(slotIdx) {
  const ev = Storage.getCurrentEvent();
  if (!ev || ev.plan?.format !== 'recordonly') return;
  if (!confirm(t('record.confirm.remove'))) return;

  ev.plan.schedule.splice(slotIdx, 1);
  const oldResults = ev.results;
  const newResults = {};
  ev.plan.schedule.forEach((slot, newIdx) => {
    const oldIdx = newIdx >= slotIdx ? newIdx + 1 : newIdx;
    slot.matches.forEach(m => {
      const oldKey = `${oldIdx}:${m.court}`;
      const newKey = `${newIdx}:${m.court}`;
      if (oldResults[oldKey]) newResults[newKey] = oldResults[oldKey];
    });
    slot.slot = newIdx + 1;
    slot.round = newIdx + 1;
  });
  ev.results = newResults;
  ev.plan.slotsUsed = ev.plan.schedule.length;
  Storage.setCurrentEvent(ev);
  renderRecordOnly();
}

// Wraps up the record-only event. Validates every card first; if any
// is incomplete, alerts with the offending match number. Otherwise
// goes through the same commitEvent + auto-backup + done view path
// that finishTournament uses.
function finishRecordOnly() {
  const ev = Storage.getCurrentEvent();
  if (!ev) return;

  for (let i = 0; i < ev.plan.schedule.length; i++) {
    const slot = ev.plan.schedule[i];
    const m = slot.matches[0];
    const teamA = ev.teams[m.team_a];
    const teamB = ev.teams[m.team_b];
    if (!teamA.players.length || !teamB.players.length) {
      alert(t('record.alert.match_invalid', {
        n: i + 1,
        reason: t('record.alert.need_both_teams'),
      }));
      return;
    }
    const entry = ev.results[`${i}:1`];
    if (!entry || !entry.result) {
      alert(t('record.alert.match_invalid', {
        n: i + 1,
        reason: t('record.alert.need_result'),
      }));
      return;
    }
  }

  if (!confirm(t('record.confirm.finish'))) return;

  try {
    ui.lastEventSnapshot = JSON.parse(JSON.stringify(ev));
    Storage.commitEvent();
    ui.lastBackupSuccess = triggerBackupDownload();
    ui.lastCanShareFiles = !!(
      navigator.share &&
      navigator.canShare &&
      navigator.canShare({
        files: [new File(['x'], 'x.json', { type: 'application/json' })],
      })
    );
    showView('done');
  } catch (e) {
    console.error('Finish record-only failed:', e);
    alert(t('tour.error.finish', { msg: e.message || String(e) }));
  }
}

function finishTournament() {
  const ev = Storage.getCurrentEvent();
  if (!ev) return;
  if (!confirm(t('tour.confirm.finish'))) return;

  try {
    // Snapshot the event BEFORE commitEvent nulls it out, so renderDone
    // can re-build the summary on language switch later.
    ui.lastEventSnapshot = JSON.parse(JSON.stringify(ev));

    Storage.commitEvent();

    // Auto-backup: download the new state immediately so the organizer
    // doesn't have to remember to do it manually. The done view's
    // backup notice tells them what happened.
    ui.lastBackupSuccess = triggerBackupDownload();

    // Whether the browser supports the Web Share API for files
    // (Android Chrome, iOS Safari ≥ 15-ish). Cached so renderDone
    // doesn't have to recompute it on every language switch.
    ui.lastCanShareFiles = !!(
      navigator.share &&
      navigator.canShare &&
      navigator.canShare({
        files: [new File(['x'], 'x.json', { type: 'application/json' })],
      })
    );

    showView('done');
  } catch (e) {
    console.error('Finish tournament failed:', e);
    alert(t('tour.error.finish', { msg: e.message || String(e) }));
  }
}

// Re-renders the done view from the snapshot we captured at commit
// time. Called by showView('done') so that:
//   1. The initial post-commit render shows the correct summary +
//      backup notice in the active language.
//   2. A subsequent language switch (rerenderCurrentView) re-runs us
//      and updates every translated string on the view, instead of
//      leaving them frozen at whatever language was active when the
//      user originally tapped "完成比赛".
function renderDone() {
  if (!ui.lastEventSnapshot) {
    // User landed on done without going through finishTournament
    // (e.g. deep-linked or refreshed) — bail back to home.
    showView('home');
    return;
  }
  document.getElementById('done-summary').innerHTML =
    buildEventSummary(ui.lastEventSnapshot);
  showBackupNotice(ui.lastBackupSuccess);
  document.getElementById('btn-share-backup')
    .classList.toggle('hidden', !ui.lastCanShareFiles);
}

function showBackupNotice(success) {
  const el = document.getElementById('backup-notice');
  const txt = document.getElementById('backup-notice-text');
  el.classList.remove('hidden', 'failed');
  if (success) {
    txt.textContent = t('backup.notice.success');
  } else {
    el.classList.add('failed');
    txt.textContent = t('backup.notice.failed');
  }
}

function buildEventSummary(ev) {
  const isFriendly = ev.plan && ev.plan.format === 'friendly';

  // Walk match results and accumulate per-player deltas. Friendly
  // matches contribute W/D/L (so the win rate updates) but NOT
  // points. Free-court placeholder rows (no team refs) are skipped.
  const earned = {};
  ev.attendees.forEach(pid => {
    earned[pid] = { points: 0, w: 0, d: 0, l: 0 };
  });

  Object.entries(ev.results || {}).forEach(([key, entry]) => {
    const match = findMatch(ev, key);
    if (!match) return;
    if (match.team_a == null || match.team_b == null) return;
    const ta = resolveTeamForSummary(match.team_a, ev);
    const tb = resolveTeamForSummary(match.team_b, ev);
    if (!ta || !tb) return;
    const result = Storage._helpers.getMatchResult(entry);
    if (!result) return;
    const countPoints = (match.kind === 'ranked');
    if (result === 'A') {
      ta.players.forEach(pid => {
        if (!earned[pid]) return;
        if (countPoints) earned[pid].points += 3;
        earned[pid].w++;
      });
      tb.players.forEach(pid => { if (earned[pid]) earned[pid].l++; });
    } else if (result === 'B') {
      tb.players.forEach(pid => {
        if (!earned[pid]) return;
        if (countPoints) earned[pid].points += 3;
        earned[pid].w++;
      });
      ta.players.forEach(pid => { if (earned[pid]) earned[pid].l++; });
    } else if (result === 'D') {
      [...ta.players, ...tb.players].forEach(pid => {
        if (!earned[pid]) return;
        if (countPoints) earned[pid].points += 1;
        earned[pid].d++;
      });
    }
  });

  // For friendly events, sort by wins (then -losses) instead of points,
  // since points are always 0. Otherwise sort by points like before.
  const rows = Object.entries(earned)
    .map(([pid, e]) => ({ player: Storage.getPlayer(pid), e }))
    .filter(x => x.player)
    .sort((a, b) => isFriendly
      ? (b.e.w - a.e.w) || (a.e.l - b.e.l) || a.player.name.localeCompare(b.player.name)
      : (b.e.points - a.e.points));

  // Friendly mode: show a clarifying note + the W/D/L breakdown,
  // but NOT the "+N pts" delta (which is always 0).
  if (isFriendly) {
    const matchCount = ev.plan.schedule.reduce(
      (s, slot) => s + slot.matches.filter(isPlayableMatch).length, 0);
    const playedCount = Object.values(ev.results || {})
      .filter(entry => Storage._helpers.getMatchResult(entry) != null).length;
    return `
      <div class="friendly-summary">
        <p>${escapeHtml(t('done.friendly.note'))}</p>
        <p>${escapeHtml(t('done.friendly.stats', {
          played: playedCount,
          total: matchCount,
          attendees: ev.attendees.length,
        }))}</p>
      </div>
      <h3>${escapeHtml(t('done.friendly.records'))}</h3>
      <div class="summary-list">
        ${rows.map(r => `
          <div class="summary-row">
            <span class="sr-name">${escapeHtml(r.player.name)}</span>
            <span class="sr-wld">${escapeHtml(fmtWLD({ wins: r.e.w, draws: r.e.d, losses: r.e.l }))}</span>
          </div>
        `).join('')}
      </div>
    `;
  }

  return `
    <h3>${escapeHtml(t('done.delta.title'))}</h3>
    <div class="summary-list">
      ${rows.map(r => `
        <div class="summary-row">
          <span class="sr-name">${escapeHtml(r.player.name)}</span>
          <span class="sr-delta">${escapeHtml(t('done.delta.row', { pts: r.e.points }))}</span>
          <span class="sr-wld">${escapeHtml(fmtWLD({ wins: r.e.w, draws: r.e.d, losses: r.e.l }))}</span>
        </div>
      `).join('')}
    </div>
  `;
}

function findMatch(ev, key) {
  const [slotIdx, court] = key.split(':').map(Number);
  const slot = ev.plan.schedule[slotIdx];
  return slot ? slot.matches.find(m => m.court === court) : null;
}

function resolveTeamForSummary(ref, ev) {
  if (typeof ref === 'number') return ev.teams[ref];
  return Storage._helpers.resolvePlaceholder(ref, ev);
}

/* ─── Expense copy / reset / undo ──────────────────────────── */
function buildExpenseText() {
  const players = Storage.getAllPlayers()
    .filter(p => (p.totalSpent || 0) > 0)
    .sort((a, b) => (b.totalSpent || 0) - (a.totalSpent || 0)
                 || a.name.localeCompare(b.name));
  const total = Storage.getTotalSpent();
  const lines = [];
  lines.push(t('expense.text.header'));
  lines.push(t('expense.text.total', { total: fmtMoney(total) }));
  if (players.length > 0) {
    lines.push('');
    players.forEach(p => {
      lines.push(t('expense.text.row', {
        name: p.name,
        amount: fmtMoney(p.totalSpent || 0),
      }));
    });
  }
  return lines.join('\n');
}

async function handleCopyExpenses() {
  const total = Storage.getTotalSpent();
  if (total === 0) {
    alert(t('expense.alert.already_zero'));
    return;
  }
  const text = buildExpenseText();
  const ok = await copyText(text);
  alert(ok ? t('copy.success') : t('copy.failure'));
}

function handleResetExpenses() {
  const total = Storage.getTotalSpent();
  if (total === 0 && !Storage.hasExpenseBackup()) {
    alert(t('expense.alert.already_zero'));
    return;
  }
  if (!confirm(t('expense.confirm.reset1', { total: fmtMoney(total) }))) return;
  if (!confirm(t('expense.confirm.reset2'))) return;
  Storage.resetExpenses();
  renderHome();
  if (currentView === 'db') renderDB();
}

function handleUndoExpenses() {
  if (!confirm(t('expense.confirm.undo'))) return;
  if (Storage.undoExpenseReset()) {
    renderHome();
    if (currentView === 'db') renderDB();
  } else {
    alert(t('expense.alert.nothing_to_undo'));
  }
}

/* ─── Copy Schedule to Clipboard ───────────────────────────── */
function buildScheduleText(teams, plan, opts = {}) {
  const { date, matchDuration, expense } = opts;
  const lines = [];
  lines.push(date ? t('text.header', { date }) : t('text.header.no_date'));
  lines.push('');

  // Teams — skip the static team list in friendly mode (the per-match
  // teams are auto-generated and would clutter the output; the schedule
  // section below renders player names inline instead).
  const sep = t('text.name.separator');
  const isFriendly = plan.format === 'friendly';
  if (!isFriendly) {
    lines.push(t('text.teams.header', { n: teams.length }));
    teams.forEach(team => {
      const names = team.players
        .map(pid => Storage.getPlayer(pid)?.name || '?')
        .join(sep);
      lines.push(t('text.team.line', { name: team.name, players: names }));
    });
    lines.push('');
  }

  // Format label
  let fmt;
  if (plan.format === 'groups-knockout') {
    fmt = t('teams.format.groups_knockout', {
      groups: plan.group_sizes.join('/'),
      n: plan.knockout_size,
    });
  } else if (plan.format === 'knockout') {
    fmt = t('teams.format.knockout', { n: plan.knockout_size || 0 });
  } else if (plan.format === 'random-fair') {
    fmt = t('teams.format.random_fair');
  } else if (plan.format === 'friendly') {
    fmt = t('teams.format.friendly');
  } else {
    fmt = t('teams.format.round_robin');
  }
  lines.push(t('text.format.header', { fmt }));
  lines.push('');

  // Schedule
  lines.push(t('text.schedule.header'));
  const evLike = { plan, teams, results: {} };
  const dur = matchDuration || 0;
  plan.schedule.forEach((slot) => {
    const startMin = (slot.slot - 1) * dur;
    const endMin = startMin + dur;
    const timeStr = dur > 0
      ? t('text.slot.time', { start: fmtMin(startMin), end: fmtMin(endMin) })
      : '';
    const phaseText = phaseDisplay(slot.phase);
    const roundText = typeof slot.round === 'string'
      ? slot.round
      : t('tour.round.num', { n: slot.round });
    lines.push(t('text.slot.header', {
      n: slot.slot, time: timeStr, phase: phaseText, round: roundText,
    }));
    slot.matches.forEach(m => {
      // Two flavours of friendly:
      //   - Eliminated-team free-court placeholder during knockout: no
      //     teams set, render as "free court for eliminated teams"
      //   - Pure friendly mode (planFriendly): real per-match teams,
      //     render with player names inline (since the auto-generated
      //     team labels are uninformative)
      if (m.kind === 'friendly' && (m.team_a == null || m.team_b == null)) {
        lines.push(t('text.friendly.line', { n: m.court }));
      } else if (isFriendly) {
        // Pure friendly mode: dump the player names instead of team labels
        const aPlayers = (evLike.teams[m.team_a]?.players || [])
          .map(pid => Storage.getPlayer(pid)?.name || '?').join(sep);
        const bPlayers = (evLike.teams[m.team_b]?.players || [])
          .map(pid => Storage.getPlayer(pid)?.name || '?').join(sep);
        lines.push(t('text.court.line', { n: m.court, a: aPlayers, b: bPlayers }));
      } else {
        const aName = scheduleTeamName(m.team_a, evLike);
        const bName = scheduleTeamName(m.team_b, evLike);
        lines.push(t('text.court.line', { n: m.court, a: aName, b: bName }));
      }
    });
    lines.push('');
  });

  // Summary — count playable matches uniformly (excludes free-court
  // placeholders).
  const matchCount = plan.schedule.reduce(
    (s, slot) => s + slot.matches.filter(isPlayableMatch).length, 0);
  const totalMin = plan.slotsUsed * dur;
  lines.push(t('text.summary', { ranked: matchCount, slots: plan.slotsUsed, min: totalMin }));

  if (expense > 0) {
    const perHead = teams.reduce((s, team) => s + team.players.length, 0);
    const share = perHead > 0 ? (expense / perHead) : 0;
    lines.push('');
    lines.push(t('text.expense.line', { total: fmtMoney(expense), share: fmtMoney(share) }));
  }

  return lines.join('\n');
}

function scheduleTeamName(ref, evLike) {
  if (typeof ref === 'number') {
    return evLike.teams[ref]?.name || '?';
  }
  // Placeholder — always show the pretty label in the shared text form.
  // Resolving with a partial/empty results map would give misleading
  // "insertion-order" names (e.g. "Team 1 vs Team 2") that look like
  // real matchups. Users sharing schedules typically do so
  // pre-tournament, so the placeholder label is both safer and more
  // informative.
  return placeholderLabel(ref);
}

function fmtMin(minutes) {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${h}:${String(m).padStart(2, '0')}`;
}

async function copyText(text) {
  try {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch (e) { /* fall through */ }
  // Fallback: hidden textarea + execCommand for browsers without the
  // modern Clipboard API. execCommand is deprecated but still works
  // almost everywhere and is the only option on some older iOS Safari.
  try {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.top = '-1000px';
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(ta);
    return ok;
  } catch (e) {
    return false;
  }
}

async function handleCopyScheduleFromTeams() {
  if (!ui.pendingTeams || !ui.pendingPlan || !ui.pendingPlan.fits) {
    alert(t('copy.need_plan'));
    return;
  }
  const text = buildScheduleText(ui.pendingTeams, ui.pendingPlan, {
    date: new Date().toISOString().slice(0, 10),
    matchDuration: parseInt(document.getElementById('match-duration').value, 10) || 0,
    expense: parseFloat(document.getElementById('weekly-expense').value) || 0,
  });
  const ok = await copyText(text);
  alert(ok ? t('copy.success') : t('copy.failure'));
}

async function handleCopyScheduleFromTournament() {
  const ev = Storage.getCurrentEvent();
  if (!ev || !ev.plan) {
    alert(t('copy.no_tournament'));
    return;
  }
  const text = buildScheduleText(ev.teams, ev.plan, {
    date: ev.date,
    matchDuration: ev.matchDuration,
    expense: ev.expense || 0,
  });
  const ok = await copyText(text);
  alert(ok ? t('copy.success') : t('copy.failure'));
}

/* ─── Bulk roster paste (e.g. WeChat 接龙) ──────────────────── */
//
// Parses a numbered list out of a free-form roster message and
// returns the names in order. Designed for the WeChat group sign-up
// format the organizer typically receives:
//
//     #Group Note
//     周五5-8pm，2场，16人
//
//     1. 张三
//     2. 李四
//     ...
//     16. 王五
//
// Tolerates:
//   - Real newlines (copy from WeChat) AND literal <br/> tags (copy
//     from a webview that renders the message as HTML).
//   - Different number-prefix separators: "1." / "1、" / "1)" / "1:"
//   - Header / commentary lines (skipped — must start with a digit
//     followed by a separator)
//   - Whitespace within names ("Player Name") — preserved but
//     collapsed to single spaces
//   - CJK characters in names
//   - Empty entries like "5. " — silently dropped
function parseBulkRoster(text) {
  if (typeof text !== 'string' || !text) return [];
  // Normalize line breaks: HTML <br>, <br/>, <br /> all become \n
  const normalized = text
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/\r\n?/g, '\n');

  const out = [];
  for (const rawLine of normalized.split('\n')) {
    const line = rawLine.trim();
    if (!line) continue;
    // Match "<digits><separator><whitespace?><name>"
    // Separators: . ) 、 ：:
    const m = line.match(/^\d{1,3}\s*[.\u3001\u3002):：]\s*(.+)$/);
    if (!m) continue;
    const name = m[1].trim().replace(/\s+/g, ' ');
    if (name) out.push(name);
  }
  return out;
}

// Adds the parsed names to the player database, deduping
// case-INsensitively against both the existing roster AND earlier
// names within the same paste. Returns counts so the caller can
// surface a confirmation message.
//
// Why case-insensitive? Sign-up messages frequently have wonky
// casing (e.g. "Alice" vs "alice" vs "ALICE") and they should
// obviously map to the same person.
// Storage.addPlayer() does exact-string dedup which we don't want
// to relax (other call sites depend on it), so we filter here
// before calling it.
function bulkAddPlayers(text) {
  const names = parseBulkRoster(text);
  const seen = new Set(
    Storage.getAllPlayers().map(p => p.name.toLowerCase())
  );
  let added = 0;
  let skipped = 0;
  for (const name of names) {
    const lower = name.toLowerCase();
    if (seen.has(lower)) {
      skipped++;
      continue;
    }
    if (Storage.addPlayer(name)) {
      added++;
      seen.add(lower);
    } else {
      // Storage.addPlayer rejects empty/dup; treat as skipped
      skipped++;
    }
  }
  return { added, skipped, total: names.length };
}

function handleBulkAdd() {
  const ta = document.getElementById('bulk-add-input');
  const text = ta.value;
  if (!text || !text.trim()) {
    alert(t('bulk_add.empty_input'));
    return;
  }
  const { added, skipped, total } = bulkAddPlayers(text);
  if (total === 0) {
    alert(t('bulk_add.no_names'));
    return;
  }
  alert(t('bulk_add.result', { added, skipped }));
  ta.value = '';
  // Collapse the <details> after a successful add and re-render
  const det = document.getElementById('bulk-add-details');
  if (det) det.open = false;
  renderDB();
}

/* ─── Import / Export ───────────────────────────────────────── */

// Builds the standard backup filename ("matchmaker-backup-2026-04-09.json")
// and triggers a browser download. Returns true on success, false on
// failure (so callers can decide whether to surface a notice). Used by
// the manual "📤 导出 JSON" button AND by the post-event auto-backup.
function triggerBackupDownload() {
  try {
    const json = Storage.exportJSON();
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const date = new Date().toISOString().slice(0, 10);
    a.href = url;
    a.download = `matchmaker-backup-${date}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    return true;
  } catch (e) {
    console.error('Backup download failed:', e);
    return false;
  }
}

// Web Share API: opens the system share sheet (微信 / Telegram /
// AirDrop / email / ...) directly with the backup as a file
// attachment. Falls back to triggerBackupDownload() if file sharing
// isn't supported (some Android browsers, all desktop browsers).
async function shareBackup() {
  try {
    const json = Storage.exportJSON();
    const date = new Date().toISOString().slice(0, 10);
    const filename = `matchmaker-backup-${date}.json`;
    const blob = new Blob([json], { type: 'application/json' });
    const file = new File([blob], filename, { type: 'application/json' });

    // Prefer files (share sheet → 微信 sends as attachment).
    if (navigator.share && navigator.canShare && navigator.canShare({ files: [file] })) {
      await navigator.share({
        files: [file],
        title: 'MatchMaker backup',
        text: filename,
      });
      return true;
    }

    // No file-share support — fall back to a regular download. The user
    // can then attach the file from their Downloads folder.
    triggerBackupDownload();
    alert(t('backup.share.fallback'));
    return false;
  } catch (e) {
    // AbortError == user dismissed the share sheet — silent
    if (e && e.name === 'AbortError') return false;
    console.error('Share failed:', e);
    alert(t('backup.share.failed', { msg: e.message || String(e) }));
    return false;
  }
}

function handleExport() {
  triggerBackupDownload();
}

function handleImport(e) {
  const file = e.target.files && e.target.files[0];
  e.target.value = '';
  if (!file) return;

  const reader = new FileReader();
  reader.onload = () => {
    try {
      const text = String(reader.result);
      const parsed = JSON.parse(text);
      const pCount = parsed.players ? Object.keys(parsed.players).length : 0;
      const hCount = Array.isArray(parsed.history) ? parsed.history.length : 0;
      const msg = t('io.import.confirm', { players: pCount, history: hCount });
      if (!confirm(msg)) return;
      Storage.importJSON(text);
      alert(t('io.import.success'));
      showView('home');
    } catch (err) {
      alert(t('io.import.error', { msg: err.message || String(err) }));
    }
  };
  reader.onerror = () => alert(t('io.read.error'));
  reader.readAsText(file);
}

/* ─── Utilities ─────────────────────────────────────────────── */
function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}

/* ─── Event Wiring ──────────────────────────────────────────── */
document.addEventListener('DOMContentLoaded', async () => {
  // BEFORE any view renders, try to recover state from the IDB shadow
  // backup. This is a no-op when localStorage already has data; the
  // only time it does anything is after iOS Safari ITP wipes
  // localStorage. Without this, the user would lose all of their
  // history even though IDB still had the data.
  try {
    await Storage.restoreFromIdbIfNeeded();
  } catch (e) {
    console.warn('Startup IDB restore failed:', e);
  }

  // Initialize i18n first — applies static string translations to the DOM.
  I18N.init();

  // Refresh the theme toggle's icon now that the button exists in the DOM.
  // (applyTheme() was called pre-DOMContentLoaded to avoid a flash; this
  // call just updates the button glyph.)
  applyTheme(document.documentElement.dataset.theme || 'light');
  document.getElementById('theme-toggle').onclick = toggleTheme;

  // Update banner: hard-reload when user taps "立即更新".
  document.getElementById('btn-update-reload').onclick = () => {
    location.reload();
  };

  // Language selector
  const langSel = document.getElementById('lang-select');
  langSel.value = I18N.getLang();
  langSel.addEventListener('change', () => {
    if (I18N.set(langSel.value)) {
      rerenderCurrentView();
    }
  });

  // Home
  document.getElementById('btn-start-event').onclick = startNewEvent;
  document.getElementById('btn-goto-db').onclick = () => showView('db');
  document.getElementById('btn-goto-search').onclick = () => {
    ui.searchQuery = '';
    showView('search');
  };
  document.getElementById('btn-resume-event').onclick = () => {
    // Dispatch by event format — record-only events live in their own view,
    // every other format runs through the regular tournament view.
    const ev = Storage.getCurrentEvent();
    if (!ev) return;
    if (ev.plan?.format === 'recordonly') showView('recordonly');
    else showView('tournament');
  };

  // Search
  document.getElementById('search-input').addEventListener('input', e => {
    ui.searchQuery = e.target.value;
    renderSearch();
  });

  // Leaderboard tabs
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.onclick = () => {
      ui.leaderboardTab = btn.dataset.tab;
      renderHome();
    };
  });

  // Import / Export
  document.getElementById('btn-export').onclick = handleExport;
  document.getElementById('btn-import').onclick = () => {
    document.getElementById('import-file').click();
  };
  document.getElementById('import-file').onchange = handleImport;

  // DB
  document.getElementById('btn-add-player').onclick = () => {
    const input = document.getElementById('new-player-name');
    if (Storage.addPlayer(input.value)) {
      input.value = '';
      renderDB();
    } else {
      alert(t('db.alert.add_failed'));
    }
  };
  document.getElementById('new-player-name').addEventListener('keypress', e => {
    if (e.key === 'Enter') document.getElementById('btn-add-player').click();
  });

  // DB bulk select
  document.getElementById('btn-select-mode').onclick = toggleDbSelectMode;
  document.getElementById('db-select-all-cb').onclick = (e) => handleDbSelectAll(e.target.checked);
  document.getElementById('btn-delete-selected').onclick = handleDeleteSelected;

  // DB bulk paste (WeChat group sign-up)
  document.getElementById('btn-bulk-add-submit').onclick = handleBulkAdd;

  // Setup
  document.getElementById('btn-form-teams').onclick = generateTeams;
  document.getElementById('btn-record-only').onclick = startRecordOnly;

  // Record-only view: per-card controls are wired by bindRecordOnlyMatchCards()
  // on each render, so the only top-level buttons here are "add" and "finish".
  document.getElementById('btn-record-add').onclick = addRecordOnlyMatch;
  document.getElementById('btn-record-finish').onclick = finishRecordOnly;
  document.getElementById('btn-quick-add').onclick = () => {
    const input = document.getElementById('quick-add-player');
    const p = Storage.addPlayer(input.value);
    if (p) {
      ui.selectedAttendees.add(p.id);
      input.value = '';
      renderSetup();
    } else {
      alert(t('db.alert.add_failed'));
    }
  };
  document.getElementById('quick-add-player').addEventListener('keypress', e => {
    if (e.key === 'Enter') document.getElementById('btn-quick-add').click();
  });

  // Teams
  document.getElementById('btn-reshuffle').onclick = generateTeams;
  document.getElementById('btn-swap-mode').onclick = () => {
    ui.swapMode = !ui.swapMode;
    ui.swapSelection = null;
    renderTeams();
  };
  document.getElementById('btn-start-tournament').onclick = confirmStartTournament;
  document.getElementById('btn-copy-schedule-teams').onclick = handleCopyScheduleFromTeams;

  // Tournament
  document.getElementById('btn-finish-tournament').onclick = finishTournament;
  document.getElementById('btn-copy-schedule-tour').onclick = handleCopyScheduleFromTournament;

  // Expense copy / reset / undo
  document.getElementById('btn-copy-expenses').onclick = handleCopyExpenses;
  document.getElementById('btn-reset-expenses').onclick = handleResetExpenses;
  document.getElementById('btn-undo-expenses').onclick = handleUndoExpenses;

  // Done
  document.getElementById('btn-done-home').onclick = () => showView('home');
  document.getElementById('btn-share-backup').onclick = shareBackup;

  // Back buttons
  document.querySelectorAll('.btn-back').forEach(btn => {
    btn.onclick = () => showView(btn.dataset.goto);
  });

  // Initial render
  showView('home');
});

/* ─── Theme (light / dark) ──────────────────────────────────── */
const THEME_KEY = 'matchmaker-theme';

function getStoredTheme() {
  try {
    return localStorage.getItem(THEME_KEY);
  } catch (e) { return null; }
}

function setStoredTheme(theme) {
  try {
    if (theme) localStorage.setItem(THEME_KEY, theme);
    else localStorage.removeItem(THEME_KEY);
  } catch (e) { /* ignore */ }
}

function detectInitialTheme() {
  const saved = getStoredTheme();
  if (saved === 'light' || saved === 'dark') return saved;
  if (typeof window.matchMedia === 'function'
      && window.matchMedia('(prefers-color-scheme: dark)').matches) {
    return 'dark';
  }
  return 'light';
}

function applyTheme(theme) {
  document.documentElement.dataset.theme = theme;
  const btn = document.getElementById('theme-toggle');
  if (btn) btn.textContent = theme === 'dark' ? '☀️' : '🌙';
}

function toggleTheme() {
  const current = document.documentElement.dataset.theme || 'light';
  const next = current === 'dark' ? 'light' : 'dark';
  applyTheme(next);
  setStoredTheme(next);
}

// Apply ASAP, before DOMContentLoaded, to avoid a flash of light theme
applyTheme(detectInitialTheme());

/* ─── PWA + Update Banner ───────────────────────────────────── */
//
// The Service Worker is "cache-first": users keep using the cached
// version until a new SW is detected. The detection sequence is:
//
//   1. The browser fetches sw.js on each page load (HTTP-cached for at
//      most 24h, but typically refetched). If the BYTES differ from the
//      installed SW, the new SW enters install state.
//   2. installing → installed (and the OLD SW is still controlling the
//      page). At this point we know there's an update waiting.
//   3. The new SW calls skipWaiting() (in our sw.js) and immediately
//      becomes the active SW. clients.claim() then gives it control of
//      open pages.
//   4. The page itself is still rendering with the OLD code in memory.
//      We need a reload to actually swap.
//
// Without a banner: the user has to manually close + reopen the app.
// With this code: as soon as the new SW reaches "installed", we show
// a banner with a single "立即更新 / Update now" button that calls
// location.reload().
function showUpdateBanner() {
  const banner = document.getElementById('update-banner');
  if (banner) banner.classList.remove('hidden');
}

function setupServiceWorker() {
  if (!('serviceWorker' in navigator)) return;

  navigator.serviceWorker.register('sw.js').then(reg => {
    // Update found while the page is open (e.g. user reloaded after a
    // deploy and the browser fetched the new sw.js).
    reg.addEventListener('updatefound', () => {
      const newWorker = reg.installing;
      if (!newWorker) return;
      newWorker.addEventListener('statechange', () => {
        if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
          // Old SW is in control AND new SW is installed → real update
          // (vs. first install on a fresh load, which has no controller)
          showUpdateBanner();
        }
      });
    });

    // Also poll for updates periodically: if the user keeps the app open
    // for hours, we want to know about a new deploy without waiting for
    // them to manually refresh.
    setInterval(() => reg.update().catch(() => {}), 60 * 60 * 1000);
  }).catch(() => {});

  // Belt-and-suspenders: if the controller swaps (which happens after
  // skipWaiting + clients.claim in sw.js), surface the banner too. This
  // covers the case where the new SW reaches "activated" before our
  // statechange listener was registered (e.g. SW already updating in
  // another tab).
  let controllerChanged = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (controllerChanged) return;
    controllerChanged = true;
    showUpdateBanner();
  });
}
setupServiceWorker();

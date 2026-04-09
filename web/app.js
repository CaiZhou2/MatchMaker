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
const Views = ['home', 'db', 'setup', 'teams', 'tournament', 'done', 'history', 'player', 'search'];
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
  if (name === 'history') renderHistory();
  if (name === 'player') renderPlayerDetail();
  if (name === 'search') renderSearch();
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
    const fmt = h.plan?.format === 'groups-knockout'
      ? t('teams.format.groups_knockout', {
          groups: (h.plan.group_sizes || []).join('/'),
          n: h.plan.knockout_size,
        })
      : t('teams.format.round_robin');
    const rankedMatches = h.plan?.schedule.reduce(
      (s, slot) => s + slot.matches.filter(m => m.kind === 'ranked').length, 0
    ) || 0;
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

  // Match results
  const matches = [];
  (h.plan?.schedule || []).forEach((slot, slotIdx) => {
    slot.matches.forEach(m => {
      if (m.kind !== 'ranked') return;
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

  // Reshuffle / Manual-swap controls only make sense for fixed cup teams.
  // The fallback random-fair mode generates per-match teams that change
  // every slot, so swapping is meaningless there.
  const swapBtn = document.getElementById('btn-swap-mode');
  const reshuffleBtn = document.getElementById('btn-reshuffle');
  if (ui.fallbackMode) {
    swapBtn.classList.add('hidden');
    reshuffleBtn.classList.add('hidden');

    document.getElementById('teams-hint').textContent =
      t('teams.fallback.notice');

    // In fallback mode the teams display becomes a per-slot match preview
    // (rather than a static team-cards list).
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
  } else if (plan.format === 'random-fair') {
    fmtText = t('teams.format.random_fair');
  } else {
    fmtText = t('teams.format.round_robin');
  }

  const d = parseInt(document.getElementById('match-duration').value, 10) || 15;
  const totalMin = plan.slotsUsed * d;
  const rankedCount = plan.schedule.reduce(
    (s, slot) => s + slot.matches.filter(m => m.kind === 'ranked').length, 0);

  preview.innerHTML = `
    <div class="preview-title">${escapeHtml(t('teams.format.recommended'))}</div>
    <div class="preview-main">${escapeHtml(fmtText)}</div>
    <div class="preview-sub">
      ${escapeHtml(t('teams.format.stats', { ranked: rankedCount, slots: plan.slotsUsed, min: totalMin }))}
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

function planPendingTournament() {
  const numCourts = parseInt(document.getElementById('num-courts').value, 10) || 2;
  const matchDuration = parseInt(document.getElementById('match-duration').value, 10) || 15;
  const totalTime = parseInt(document.getElementById('total-time').value, 10) || 180;
  ui.pendingPlan = recommendFormat(ui.pendingTeams, numCourts, matchDuration, totalTime);
}

/* ─── TOURNAMENT VIEW ───────────────────────────────────────── */
function renderTournament() {
  const ev = Storage.getCurrentEvent();
  if (!ev || !ev.plan) {
    showView('home');
    return;
  }

  // Progress — only count entries with a recorded *result*. Score-only
  // entries (e.g. mid-typing) don't count as completed matches.
  const total = ev.plan.schedule.reduce(
    (s, slot) => s + slot.matches.filter(m => m.kind === 'ranked').length, 0);
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
  };
  return t(map[phase] || phase);
}

function renderMatch(match, slotIdx, ev) {
  const ta = resolveTeamDisplay(match.team_a, ev);
  const tb = resolveTeamDisplay(match.team_b, ev);
  const key = `${slotIdx}:${match.court}`;
  const entry = ev.results?.[key];
  const result = Storage._helpers.getMatchResult(entry);
  const scores = Storage._helpers.getMatchScores(entry);

  if (match.kind === 'friendly') {
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

  renderTournament();
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
  if (attendeeIds.length < teamSize * 2) {
    alert(t('setup.alert.need_players', { n: teamSize * 2 }));
    return;
  }

  const playersMap = {};
  Storage.getAllPlayers().forEach(p => { playersMap[p.id] = p; });

  const result = formBalancedTeams(attendeeIds, playersMap, teamSize);
  if (result.error) {
    alert(result.error);
    return;
  }

  // Give teams localized default names ("Team 1" / "第1队" style)
  result.teams.forEach((team, i) => {
    team.name = t('team.default.name', { n: i + 1 });
  });

  ui.pendingTeams = result.teams;
  ui.spectators = result.spectators || [];
  ui.swapMode = false;
  ui.swapSelection = null;
  ui.fallbackMode = false;

  planPendingTournament();

  // If neither cup format fits, fall back to random-fair scheduling.
  // The fallback DISCARDS the fixed weekly teams and generates per-match
  // teams instead — see scheduler.js:planRandomFairFallback for the
  // rationale (snake-drafting similar-skill cohorts).
  if (ui.pendingPlan && !ui.pendingPlan.fits) {
    const numCourts = parseInt(document.getElementById('num-courts').value, 10) || 2;
    const matchDuration = parseInt(document.getElementById('match-duration').value, 10) || 15;
    const totalTime = parseInt(document.getElementById('total-time').value, 10) || 180;
    const teamsPerMatch = 2;  // currently fixed; could be exposed in setup later

    const fallback = planRandomFairFallback({
      attendeeIds, playersMap, teamSize, teamsPerMatch,
      numCourts, matchDuration, totalTime,
    });

    if (fallback.fits) {
      ui.fallbackMode = true;
      ui.pendingPlan = fallback;
      // The fallback's `teams` field replaces the cup teams. Localize names.
      fallback.teams.forEach((team, i) => {
        team.name = t('team.default.name', { n: i + 1 });
      });
      ui.pendingTeams = fallback.teams;
    }
    // If the fallback also doesn't fit, leave the original infeasible
    // plan in place so the format-preview banner explains why.
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

function finishTournament() {
  const ev = Storage.getCurrentEvent();
  if (!ev) return;
  if (!confirm(t('tour.confirm.finish'))) return;

  try {
    const summary = buildEventSummary(ev);
    Storage.commitEvent();
    document.getElementById('done-summary').innerHTML = summary;

    // Auto-backup: download the new state immediately so the organizer
    // doesn't have to remember to do it manually. The backup notice on
    // the Done view tells them what just happened (success → green
    // notice; failure → orange "please export manually" notice).
    const ok = triggerBackupDownload();
    showBackupNotice(ok);

    // Show the "📤 分享备份" button only if the browser supports
    // sharing files (Android Chrome, iOS Safari ≥ 15-ish). On
    // unsupported browsers we hide it instead of showing a non-working
    // button.
    const shareBtn = document.getElementById('btn-share-backup');
    const canShareFiles =
      navigator.share &&
      navigator.canShare &&
      navigator.canShare({
        files: [new File(['x'], 'x.json', { type: 'application/json' })],
      });
    shareBtn.classList.toggle('hidden', !canShareFiles);

    showView('done');
  } catch (e) {
    console.error('Finish tournament failed:', e);
    alert(t('tour.error.finish', { msg: e.message || String(e) }));
  }
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
  const earned = {};
  ev.attendees.forEach(pid => {
    earned[pid] = { points: 0, w: 0, d: 0, l: 0 };
  });

  Object.entries(ev.results || {}).forEach(([key, entry]) => {
    const match = findMatch(ev, key);
    if (!match || match.kind !== 'ranked') return;
    const ta = resolveTeamForSummary(match.team_a, ev);
    const tb = resolveTeamForSummary(match.team_b, ev);
    if (!ta || !tb) return;
    const result = Storage._helpers.getMatchResult(entry);
    if (!result) return;
    if (result === 'A') {
      ta.players.forEach(pid => { if (earned[pid]) { earned[pid].points += 3; earned[pid].w++; } });
      tb.players.forEach(pid => { if (earned[pid]) earned[pid].l++; });
    } else if (result === 'B') {
      tb.players.forEach(pid => { if (earned[pid]) { earned[pid].points += 3; earned[pid].w++; } });
      ta.players.forEach(pid => { if (earned[pid]) earned[pid].l++; });
    } else if (result === 'D') {
      [...ta.players, ...tb.players].forEach(pid => {
        if (earned[pid]) { earned[pid].points += 1; earned[pid].d++; }
      });
    }
  });

  const rows = Object.entries(earned)
    .map(([pid, e]) => ({ player: Storage.getPlayer(pid), e }))
    .filter(x => x.player)
    .sort((a, b) => b.e.points - a.e.points);

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

  // Teams
  const sep = t('text.name.separator');
  lines.push(t('text.teams.header', { n: teams.length }));
  teams.forEach(team => {
    const names = team.players
      .map(pid => Storage.getPlayer(pid)?.name || '?')
      .join(sep);
    lines.push(t('text.team.line', { name: team.name, players: names }));
  });
  lines.push('');

  // Format
  const fmt = plan.format === 'groups-knockout'
    ? t('teams.format.groups_knockout', {
        groups: plan.group_sizes.join('/'),
        n: plan.knockout_size,
      })
    : t('teams.format.round_robin');
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
      if (m.kind === 'friendly') {
        lines.push(t('text.friendly.line', { n: m.court }));
      } else {
        const aName = scheduleTeamName(m.team_a, evLike);
        const bName = scheduleTeamName(m.team_b, evLike);
        lines.push(t('text.court.line', { n: m.court, a: aName, b: bName }));
      }
    });
    lines.push('');
  });

  // Summary
  const rankedCount = plan.schedule.reduce(
    (s, slot) => s + slot.matches.filter(m => m.kind === 'ranked').length, 0);
  const totalMin = plan.slotsUsed * dur;
  lines.push(t('text.summary', { ranked: rankedCount, slots: plan.slotsUsed, min: totalMin }));

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
document.addEventListener('DOMContentLoaded', () => {
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
  document.getElementById('btn-resume-event').onclick = () => showView('tournament');

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

  // Setup
  document.getElementById('btn-form-teams').onclick = generateTeams;
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

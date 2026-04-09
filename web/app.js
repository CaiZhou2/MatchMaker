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
const Views = ['home', 'db', 'setup', 'teams', 'tournament', 'done', 'history'];
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
  leaderboardTab: 'points',  // 'points' | 'winrate' | 'spent'
  expandedHistory: new Set(),
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
  return '¥' + v.toFixed(2);
}

/* ─── HOME ──────────────────────────────────────────────────── */
function renderHome() {
  const players = Storage.getAllPlayers();
  const ev = Storage.getCurrentEvent();

  // Stats
  const totalEvents = players.reduce((m, p) => Math.max(m, p.events), 0);
  const totalHistory = Storage.getHistory().length;
  document.getElementById('home-stats').innerHTML = `
    <div class="stat-block"><div class="val">${players.length}</div><div class="lbl">${escapeHtml(t('home.stats.players'))}</div></div>
    <div class="stat-block"><div class="val">${totalEvents}</div><div class="lbl">${escapeHtml(t('home.stats.weeks'))}</div></div>
    <div class="stat-block"><div class="val">${totalHistory}</div><div class="lbl">${escapeHtml(t('home.stats.events'))}</div></div>
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
    } else { // spent
      sorted = [...players].sort((a, b) =>
        (b.totalSpent || 0) - (a.totalSpent || 0) || a.name.localeCompare(b.name)
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
      } else {
        main = fmtMoney(p.totalSpent || 0);
        sub = t('home.lb.events', { n: p.events });
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
    return `
      <div class="db-row" data-id="${p.id}">
        <div class="db-main">
          <span class="db-name">${escapeHtml(p.name)}</span>
          <span class="db-points">${escapeHtml(mainText)}</span>
        </div>
        <div class="db-sub">
          ${escapeHtml(statsText)}
          <button class="btn-icon" data-del="${p.id}">×</button>
        </div>
      </div>
    `;
  }).join('');

  listDiv.querySelectorAll('[data-del]').forEach(btn => {
    btn.onclick = () => {
      const id = btn.dataset.del;
      const p = Storage.getPlayer(id);
      if (confirm(t('db.confirm.delete', { name: p.name }))) {
        Storage.deletePlayer(id);
        renderDB();
      }
    };
  });
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
    const completedMatches = Object.keys(h.results || {}).length;

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
      const result = h.results?.[key];
      if (!result) return;
      const evLike = { plan: h.plan, teams: h.teams, results: h.results };
      const ta = resolveTeamFromHist(m.team_a, evLike);
      const tb = resolveTeamFromHist(m.team_b, evLike);
      if (!ta || !tb) return;
      const resultText =
        result === 'A' ? t('hist.result.a_won', { name: ta.name })
      : result === 'B' ? t('hist.result.b_won', { name: tb.name })
      : t('hist.result.draw');
      matches.push(`
        <div class="hist-match">
          <span class="hist-match-phase">${escapeHtml(phaseDisplay(slot.phase))}</span>
          <span>${escapeHtml(ta.name)} vs ${escapeHtml(tb.name)}</span>
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

  document.getElementById('teams-hint').textContent = ui.swapMode
    ? t('teams.hint.swap', { count: teams.length, size: teamSize })
    : t('teams.hint', { count: teams.length, size: teamSize });

  // Swap-mode button label
  document.getElementById('btn-swap-mode').textContent = ui.swapMode
    ? t('teams.btn.swap.done')
    : t('teams.btn.swap.start');

  const display = document.getElementById('teams-display');
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

  const fmtText = plan.format === 'groups-knockout'
    ? t('teams.format.groups_knockout', {
        groups: plan.group_sizes.join('/'),
        n: plan.knockout_size,
      })
    : t('teams.format.round_robin');

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

  // Progress
  const total = ev.plan.schedule.reduce(
    (s, slot) => s + slot.matches.filter(m => m.kind === 'ranked').length, 0);
  const done = Object.keys(ev.results || {}).length;
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

  const finishBtn = document.getElementById('btn-finish-tournament');
  finishBtn.classList.toggle('hidden', done < total);
}

function phaseDisplay(phase) {
  const map = {
    'group': 'tour.phase.group',
    'knockout': 'tour.phase.knockout',
    'round-robin': 'tour.phase.round_robin',
  };
  return t(map[phase] || phase);
}

function renderMatch(match, slotIdx, ev) {
  const ta = resolveTeamDisplay(match.team_a, ev);
  const tb = resolveTeamDisplay(match.team_b, ev);
  const key = `${slotIdx}:${match.court}`;
  const result = ev.results?.[key];

  if (match.kind === 'friendly') {
    return `
      <div class="match-row friendly">
        <div class="court-label">${escapeHtml(t('tour.court.friendly', { n: match.court }))}</div>
        <div class="friendly-note">${escapeHtml(t('tour.friendly.note'))}</div>
      </div>
    `;
  }

  const btnCls = r => `result-btn ${result === r ? 'active' : ''}`;
  return `
    <div class="match-row">
      <div class="court-label">${escapeHtml(t('tour.court', { n: match.court }))}</div>
      <div class="match-teams">
        <div class="match-team ${result === 'A' ? 'winner' : ''}">${escapeHtml(ta.name)}<div class="match-members">${escapeHtml(ta.members)}</div></div>
        <div class="vs">${escapeHtml(t('tour.vs'))}</div>
        <div class="match-team ${result === 'B' ? 'winner' : ''}">${escapeHtml(tb.name)}<div class="match-members">${escapeHtml(tb.members)}</div></div>
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

function recordResult(slotIdx, court, result) {
  const ev = Storage.getCurrentEvent();
  if (!ev) return;
  if (!ev.results) ev.results = {};
  const key = `${slotIdx}:${court}`;
  if (ev.results[key] === result) {
    delete ev.results[key];
  } else {
    ev.results[key] = result;
  }
  Storage.setCurrentEvent(ev);
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

  planPendingTournament();
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
    showView('done');
  } catch (e) {
    console.error('Finish tournament failed:', e);
    alert(t('tour.error.finish', { msg: e.message || String(e) }));
  }
}

function buildEventSummary(ev) {
  const earned = {};
  ev.attendees.forEach(pid => {
    earned[pid] = { points: 0, w: 0, d: 0, l: 0 };
  });

  Object.entries(ev.results || {}).forEach(([key, result]) => {
    const match = findMatch(ev, key);
    if (!match || match.kind !== 'ranked') return;
    const ta = resolveTeamForSummary(match.team_a, ev);
    const tb = resolveTeamForSummary(match.team_b, ev);
    if (!ta || !tb) return;
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

/* ─── Expense Reset / Undo ──────────────────────────────────── */
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
function handleExport() {
  const json = Storage.exportJSON();
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const date = new Date().toISOString().slice(0, 10);
  a.href = url;
  a.download = `matchmaker-${date}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
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
  document.getElementById('btn-goto-history').onclick = () => showView('history');
  document.getElementById('btn-resume-event').onclick = () => showView('tournament');

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

  // Expense reset / undo
  document.getElementById('btn-reset-expenses').onclick = handleResetExpenses;
  document.getElementById('btn-undo-expenses').onclick = handleUndoExpenses;

  // Done
  document.getElementById('btn-done-home').onclick = () => showView('home');

  // Back buttons
  document.querySelectorAll('.btn-back').forEach(btn => {
    btn.onclick = () => showView(btn.dataset.goto);
  });

  // Initial render
  showView('home');
});

/* ─── PWA ───────────────────────────────────────────────────── */
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}

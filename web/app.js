/**
 * MatchMaker - App View Router & Controller
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

/* ─── Transient UI State ────────────────────────────────────── */
const ui = {
  selectedAttendees: new Set(),
  swapMode: false,
  swapSelection: null,  // {teamIdx, playerIdx}
  pendingTeams: null,
  pendingPlan: null,
  leaderboardTab: 'points',  // 'points' | 'winrate'
  expandedHistory: new Set(),
};

/* ─── Small helpers ─────────────────────────────────────────── */
function fmtPct(r) {
  return (r * 100).toFixed(0) + '%';
}
function fmtWLD(p) {
  return `${p.wins}胜 ${p.draws}平 ${p.losses}负`;
}

/* ─── HOME ──────────────────────────────────────────────────── */
function renderHome() {
  const players = Storage.getAllPlayers();
  const ev = Storage.getCurrentEvent();

  // Stats
  const totalEvents = players.reduce((m, p) => Math.max(m, p.events), 0);
  const totalHistory = Storage.getHistory().length;
  document.getElementById('home-stats').innerHTML = `
    <div class="stat-block"><div class="val">${players.length}</div><div class="lbl">已注册选手</div></div>
    <div class="stat-block"><div class="val">${totalEvents}</div><div class="lbl">最多参与周数</div></div>
    <div class="stat-block"><div class="val">${totalHistory}</div><div class="lbl">历史比赛</div></div>
  `;

  // Resume button
  const resumeBtn = document.getElementById('btn-resume-event');
  if (ev && ev.phase !== 'done') {
    resumeBtn.style.display = '';
    resumeBtn.textContent = `继续未完成的比赛 (阶段: ${phaseLabel(ev.phase)}) →`;
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
    lbDiv.innerHTML = '<p class="empty">尚无选手。点击"选手数据库"添加。</p>';
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
        main = `${p.points} 分`;
        sub = fmtWLD(p);
      } else if (ui.leaderboardTab === 'winrate') {
        main = fmtPct(Storage.getWinRate(p));
        sub = `${Storage.getTotalGames(p)} 场 · ${fmtWLD(p)}`;
      } else {
        main = fmtMoney(p.totalSpent || 0);
        sub = `${p.events} 周参与`;
      }
      return `
        <div class="lb-row">
          <span class="lb-rank">#${i + 1}</span>
          <span class="lb-name">${escapeHtml(p.name)}</span>
          <span class="lb-points">${main}</span>
          <span class="lb-wld">${sub}</span>
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
    ? '上次清零的数据已备份，可在下次比赛提交前恢复。'
    : '';
}

function fmtMoney(n) {
  const v = Number(n) || 0;
  return '¥' + v.toFixed(2);
}

function phaseLabel(phase) {
  return { setup: '设置', teams: '分组', running: '进行中', done: '已结束' }[phase] || phase;
}

/* ─── DB ────────────────────────────────────────────────────── */
function renderDB() {
  const players = Storage.getAllPlayers();
  const sorted = [...players].sort((a, b) => b.points - a.points || a.name.localeCompare(b.name));

  const listDiv = document.getElementById('db-player-list');
  if (sorted.length === 0) {
    listDiv.innerHTML = '<p class="empty">尚无选手。</p>';
    return;
  }

  listDiv.innerHTML = sorted.map(p => {
    const games = Storage.getTotalGames(p);
    const wr = games > 0 ? fmtPct(Storage.getWinRate(p)) : '—';
    return `
      <div class="db-row" data-id="${p.id}">
        <div class="db-main">
          <span class="db-name">${escapeHtml(p.name)}</span>
          <span class="db-points">${p.points} 分 · ${wr}</span>
        </div>
        <div class="db-sub">
          ${p.events} 周 · ${games} 场 · ${fmtWLD(p)} · 消费 ${fmtMoney(p.totalSpent || 0)}
          <button class="btn-icon" data-del="${p.id}">×</button>
        </div>
      </div>
    `;
  }).join('');

  listDiv.querySelectorAll('[data-del]').forEach(btn => {
    btn.onclick = () => {
      const id = btn.dataset.del;
      const p = Storage.getPlayer(id);
      if (confirm(`删除 ${p.name} 吗？积分将丢失。`)) {
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
    div.innerHTML = '<p class="empty">尚无历史记录。完成一场比赛后这里会出现。</p>';
    return;
  }

  // Newest first
  const sorted = [...list].reverse();

  div.innerHTML = sorted.map(h => {
    const expanded = ui.expandedHistory.has(h.id);
    const fmt = h.plan?.format === 'groups-knockout'
      ? `小组赛 + ${h.plan.knockout_size}强淘汰`
      : '循环赛';
    const rankedMatches = h.plan?.schedule.reduce(
      (s, slot) => s + slot.matches.filter(m => m.kind === 'ranked').length, 0
    ) || 0;
    const completedMatches = Object.keys(h.results || {}).length;

    return `
      <div class="history-row">
        <div class="history-head" data-toggle="${h.id}">
          <div class="history-main">
            <span class="history-date">${escapeHtml(h.date)}</span>
            <span class="history-fmt">${fmt}</span>
          </div>
          <div class="history-sub">
            ${h.teams.length} 队 · ${h.attendees.length} 人 · ${completedMatches}/${rankedMatches} 场
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
      if (confirm('删除这条历史记录？此操作不会退回积分。')) {
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

  const teamsHtml = h.teams.map(t => `
    <div class="hist-team">
      <div class="hist-team-name">${escapeHtml(t.name)}</div>
      <div class="hist-team-players">${t.players.map(nameOf).map(escapeHtml).join(', ')}</div>
    </div>
  `).join('');

  // Per-player points earned
  const deltaRows = Object.entries(h.delta || {})
    .map(([pid, d]) => ({ name: nameOf(pid), d }))
    .sort((a, b) => b.d.points - a.d.points || a.name.localeCompare(b.name));

  const deltaHtml = deltaRows.map(r => `
    <div class="summary-row">
      <span class="sr-name">${escapeHtml(r.name)}</span>
      <span class="sr-delta">+${r.d.points} 分</span>
      <span class="sr-wld">${r.d.wins}胜 ${r.d.draws}平 ${r.d.losses}负</span>
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
      // Resolve teams via placeholder helpers using an event-like object
      const evLike = { plan: h.plan, teams: h.teams, results: h.results };
      const ta = resolveTeamFromHist(m.team_a, evLike);
      const tb = resolveTeamFromHist(m.team_b, evLike);
      if (!ta || !tb) return;
      const resultText = result === 'A' ? `${ta.name} 胜`
                       : result === 'B' ? `${tb.name} 胜`
                       : '平局';
      matches.push(`
        <div class="hist-match">
          <span class="hist-match-phase">${phaseDisplay(slot.phase)}</span>
          <span>${escapeHtml(ta.name)} vs ${escapeHtml(tb.name)}</span>
          <span class="hist-match-result">${escapeHtml(resultText)}</span>
        </div>
      `);
    });
  });

  return `
    <div class="history-detail">
      <h4>队伍</h4>
      <div class="hist-teams">${teamsHtml}</div>

      <h4>比赛结果</h4>
      <div class="hist-matches">${matches.join('') || '<p class="empty">无结果</p>'}</div>

      <h4>积分变化</h4>
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
    listDiv.innerHTML = '<p class="empty">先在"选手数据库"中添加选手。</p>';
    updateAttendeeCount();
    return;
  }

  listDiv.innerHTML = sorted.map(p => `
    <label class="attendee-row">
      <input type="checkbox" data-id="${p.id}" ${ui.selectedAttendees.has(p.id) ? 'checked' : ''}>
      <span class="att-name">${escapeHtml(p.name)}</span>
      <span class="att-pts">${p.points} 分</span>
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
  document.getElementById('attendee-count').textContent = ui.selectedAttendees.size;
}

/* ─── TEAMS VIEW ────────────────────────────────────────────── */
function renderTeams() {
  if (!ui.pendingTeams) return;

  const teams = ui.pendingTeams;
  const teamSize = parseInt(document.getElementById('team-size').value, 10) || 2;

  document.getElementById('teams-hint').textContent =
    `共 ${teams.length} 支队伍，每队 ${teamSize} 人。${ui.swapMode ? '点击两位选手进行交换。' : ''}`;

  const display = document.getElementById('teams-display');
  display.innerHTML = teams.map((t, ti) => `
    <div class="team-card">
      <div class="team-card-head">${t.name}</div>
      <div class="team-players">
        ${t.players.map((pid, pi) => {
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
      // Swap
      const tA = ui.pendingTeams[a.teamIdx];
      const tB = ui.pendingTeams[b.teamIdx];
      [tA.players[a.playerIdx], tB.players[b.playerIdx]] =
        [tB.players[b.playerIdx], tA.players[a.playerIdx]];
      ui.swapSelection = null;
      // Re-plan with new teams
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
    preview.innerHTML = `<div class="error-msg">⚠️ ${plan.reason || plan.error || '方案不可行'}</div>`;
    return;
  }

  const fmt = plan.format === 'groups-knockout'
    ? `小组赛 + 淘汰赛 (小组: ${plan.group_sizes.join('/')}, 淘汰: ${plan.knockout_size}强)`
    : '单循环赛';

  const d = parseInt(document.getElementById('match-duration').value, 10) || 15;
  const totalMin = plan.slotsUsed * d;
  const rankedCount = plan.schedule.reduce(
    (s, slot) => s + slot.matches.filter(m => m.kind === 'ranked').length, 0);

  preview.innerHTML = `
    <div class="preview-title">📋 推荐赛制</div>
    <div class="preview-main">${fmt}</div>
    <div class="preview-sub">
      ${rankedCount} 场正赛 · ${plan.slotsUsed} 个时间段 · 约 ${totalMin} 分钟
    </div>
  `;
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
    <div class="progress-text">${done} / ${total} 场已完成</div>
  `;

  // Schedule
  const scheduleDiv = document.getElementById('tournament-schedule');
  scheduleDiv.innerHTML = ev.plan.schedule.map((slot, slotIdx) => {
    const phaseTag = phaseDisplay(slot.phase);
    return `
      <div class="slot-card">
        <div class="slot-head">
          <span class="slot-num">时间段 ${slot.slot}</span>
          <span class="slot-phase">${phaseTag} ${typeof slot.round === 'string' ? slot.round : '第' + slot.round + '轮'}</span>
        </div>
        ${slot.matches.map(m => renderMatch(m, slotIdx, ev)).join('')}
      </div>
    `;
  }).join('');

  // Bind result buttons
  scheduleDiv.querySelectorAll('[data-result-btn]').forEach(btn => {
    btn.onclick = () => {
      const [slotIdx, court, res] = btn.dataset.resultBtn.split(':');
      recordResult(parseInt(slotIdx, 10), parseInt(court, 10), res);
    };
  });

  // Show finish button if all ranked matches have results
  const finishBtn = document.getElementById('btn-finish-tournament');
  finishBtn.classList.toggle('hidden', done < total);
}

function phaseDisplay(phase) {
  return { 'group': '小组赛', 'knockout': '淘汰赛', 'round-robin': '循环赛' }[phase] || phase;
}

function renderMatch(match, slotIdx, ev) {
  const ta = resolveTeamDisplay(match.team_a, ev);
  const tb = resolveTeamDisplay(match.team_b, ev);
  const key = `${slotIdx}:${match.court}`;
  const result = ev.results?.[key];

  if (match.kind === 'friendly') {
    return `
      <div class="match-row friendly">
        <div class="court-label">场地 ${match.court} · 自由场</div>
        <div class="friendly-note">被淘汰的队伍可在此场地自由组队比赛（不计积分）</div>
      </div>
    `;
  }

  const btnCls = r => `result-btn ${result === r ? 'active' : ''}`;
  return `
    <div class="match-row">
      <div class="court-label">场地 ${match.court}</div>
      <div class="match-teams">
        <div class="match-team ${result === 'A' ? 'winner' : ''}">${escapeHtml(ta.name)}<div class="match-members">${ta.members}</div></div>
        <div class="vs">VS</div>
        <div class="match-team ${result === 'B' ? 'winner' : ''}">${escapeHtml(tb.name)}<div class="match-members">${tb.members}</div></div>
      </div>
      <div class="result-btns">
        <button class="${btnCls('A')}" data-result-btn="${slotIdx}:${match.court}:A">A胜</button>
        <button class="${btnCls('D')}" data-result-btn="${slotIdx}:${match.court}:D">平局</button>
        <button class="${btnCls('B')}" data-result-btn="${slotIdx}:${match.court}:B">B胜</button>
      </div>
    </div>
  `;
}

function resolveTeamDisplay(ref, ev) {
  if (ref === null) return { name: '-', members: '' };
  if (typeof ref === 'number') {
    const t = ev.teams[ref];
    if (!t) return { name: '?', members: '' };
    const members = t.players
      .map(pid => Storage.getPlayer(pid)?.name || '?')
      .join(', ');
    return { name: t.name, members };
  }
  // Placeholder: try to resolve dynamically
  const resolved = Storage._helpers.resolvePlaceholder(ref, ev);
  if (resolved) {
    const members = resolved.players
      .map(pid => Storage.getPlayer(pid)?.name || '?')
      .join(', ');
    return { name: resolved.name, members };
  }
  return { name: placeholderLabel(ref), members: '待定' };
}

function placeholderLabel(ref) {
  if (ref.startsWith('G')) {
    const m = ref.match(/^G(\d+)-(\d+)$/);
    if (m) return `小组${m[1]} 第${m[2]}名`;
  }
  if (ref.startsWith('KR')) {
    const m = ref.match(/^KR(\d+)-M(\d+)-W$/);
    if (m) return `KR${m[1]}-M${m[2]} 胜者`;
  }
  return ref;
}

function recordResult(slotIdx, court, result) {
  const ev = Storage.getCurrentEvent();
  if (!ev) return;
  if (!ev.results) ev.results = {};
  const key = `${slotIdx}:${court}`;
  if (ev.results[key] === result) {
    // Toggle off
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
    alert(`至少需要 ${teamSize * 2} 人才能组队。`);
    return;
  }

  const playersMap = {};
  Storage.getAllPlayers().forEach(p => { playersMap[p.id] = p; });

  const result = formBalancedTeams(attendeeIds, playersMap, teamSize);
  if (result.error) {
    alert(result.error);
    return;
  }

  ui.pendingTeams = result.teams;
  ui.spectators = result.spectators || [];
  ui.swapMode = false;
  ui.swapSelection = null;

  planPendingTournament();
  showView('teams');
}

function confirmStartTournament() {
  if (!ui.pendingPlan || !ui.pendingPlan.fits) {
    alert('赛制方案不可行，请调整参数。');
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
  if (!confirm('确认比赛结束？积分将写入数据库。')) return;

  try {
    // Build summary before commit (reads currentEvent, which commit will null out)
    const summary = buildEventSummary(ev);
    Storage.commitEvent();
    document.getElementById('done-summary').innerHTML = summary;
    showView('done');
  } catch (e) {
    console.error('Finish tournament failed:', e);
    alert('完成比赛时出错：' + (e.message || e));
  }
}

function buildEventSummary(ev) {
  // Compute points earned per player this event
  const earned = {};  // pid -> {points, w, d, l}
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
    <h3>本轮积分变化</h3>
    <div class="summary-list">
      ${rows.map(r => `
        <div class="summary-row">
          <span class="sr-name">${escapeHtml(r.player.name)}</span>
          <span class="sr-delta">+${r.e.points} 分</span>
          <span class="sr-wld">${r.e.w}胜 ${r.e.d}平 ${r.e.l}负</span>
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
    alert('当前消费总额已为零。');
    return;
  }
  // Double confirm
  if (!confirm(`确定要将所有选手的累计消费清零吗？\n\n当前总额：${fmtMoney(total)}\n\n此操作可在下次比赛提交前恢复。`)) {
    return;
  }
  if (!confirm('再次确认：清零？')) {
    return;
  }
  Storage.resetExpenses();
  renderHome();
  if (currentView === 'db') renderDB();
}

function handleUndoExpenses() {
  if (!confirm('恢复上次清零前的消费数据？')) return;
  if (Storage.undoExpenseReset()) {
    renderHome();
    if (currentView === 'db') renderDB();
  } else {
    alert('无可恢复的数据。');
  }
}

/* ─── Copy Schedule to Clipboard ───────────────────────────── */
function buildScheduleText(teams, plan, opts = {}) {
  const { date, matchDuration, expense } = opts;
  const lines = [];
  lines.push('🏆 MatchMaker 比赛安排' + (date ? ` · ${date}` : ''));
  lines.push('');

  // Teams
  lines.push(`【队伍】共 ${teams.length} 队`);
  teams.forEach(t => {
    const names = t.players
      .map(pid => Storage.getPlayer(pid)?.name || '?')
      .join('、');
    lines.push(`· ${t.name}：${names}`);
  });
  lines.push('');

  // Format
  const fmt = plan.format === 'groups-knockout'
    ? `小组赛 + ${plan.knockout_size}强淘汰`
    : '循环赛';
  lines.push(`【赛制】${fmt}`);
  lines.push('');

  // Schedule
  lines.push('【赛程】');
  const evLike = { plan, teams, results: {} };
  const dur = matchDuration || 0;
  plan.schedule.forEach((slot) => {
    const startMin = (slot.slot - 1) * dur;
    const endMin = startMin + dur;
    const timeStr = dur > 0 ? ` (${fmtMin(startMin)}-${fmtMin(endMin)})` : '';
    const phaseText = phaseDisplay(slot.phase);
    const roundText = typeof slot.round === 'string' ? slot.round : `第${slot.round}轮`;
    lines.push(`━━ 时段${slot.slot}${timeStr} · ${phaseText}${roundText} ━━`);
    slot.matches.forEach(m => {
      if (m.kind === 'friendly') {
        lines.push(`  📍 场地${m.court}：自由场（淘汰队伍友谊赛）`);
      } else {
        const aName = scheduleTeamName(m.team_a, evLike);
        const bName = scheduleTeamName(m.team_b, evLike);
        lines.push(`  📍 场地${m.court}：${aName} vs ${bName}`);
      }
    });
    lines.push('');
  });

  // Summary
  const rankedCount = plan.schedule.reduce(
    (s, slot) => s + slot.matches.filter(m => m.kind === 'ranked').length, 0);
  const totalMin = plan.slotsUsed * dur;
  lines.push(`共 ${rankedCount} 场正赛 · ${plan.slotsUsed} 时段 · 约 ${totalMin} 分钟`);

  if (expense > 0) {
    const perHead = teams.reduce((s, t) => s + t.players.length, 0);
    const share = perHead > 0 ? (expense / perHead) : 0;
    lines.push('');
    lines.push(`💰 本周消费：${fmtMoney(expense)}（人均 ${fmtMoney(share)}）`);
  }

  return lines.join('\n');
}

function scheduleTeamName(ref, evLike) {
  if (typeof ref === 'number') {
    return evLike.teams[ref]?.name || '?';
  }
  // Placeholder (knockout) — always show the pretty label in the shared text
  // form. Resolving with a partial/empty results map would give misleading
  // "insertion-order" names (e.g. "Team 1 vs Team 2") that look like real
  // matchups. Users sharing schedules typically do so pre-tournament, so the
  // placeholder label is both safer and more informative.
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
  // Fallback: hidden textarea + execCommand
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
    alert('请先生成有效的比赛方案。');
    return;
  }
  const text = buildScheduleText(ui.pendingTeams, ui.pendingPlan, {
    date: new Date().toISOString().slice(0, 10),
    matchDuration: parseInt(document.getElementById('match-duration').value, 10) || 0,
    expense: parseFloat(document.getElementById('weekly-expense').value) || 0,
  });
  const ok = await copyText(text);
  alert(ok ? '✓ 比赛安排已复制到剪贴板，可直接粘贴到聊天软件。' : '复制失败，请手动复制。');
}

async function handleCopyScheduleFromTournament() {
  const ev = Storage.getCurrentEvent();
  if (!ev || !ev.plan) {
    alert('没有正在进行的比赛。');
    return;
  }
  const text = buildScheduleText(ev.teams, ev.plan, {
    date: ev.date,
    matchDuration: ev.matchDuration,
    expense: ev.expense || 0,
  });
  const ok = await copyText(text);
  alert(ok ? '✓ 比赛安排已复制到剪贴板，可直接粘贴到聊天软件。' : '复制失败，请手动复制。');
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
  e.target.value = '';  // reset so same file can be imported again
  if (!file) return;

  const reader = new FileReader();
  reader.onload = () => {
    try {
      const text = String(reader.result);
      // Preview counts before confirming
      const parsed = JSON.parse(text);
      const pCount = parsed.players ? Object.keys(parsed.players).length : 0;
      const hCount = Array.isArray(parsed.history) ? parsed.history.length : 0;
      const msg = `导入将覆盖现有数据：\n  ${pCount} 个选手\n  ${hCount} 条历史记录\n\n确认继续？`;
      if (!confirm(msg)) return;
      Storage.importJSON(text);
      alert('导入成功。');
      showView('home');
    } catch (err) {
      alert('导入失败：' + (err.message || err));
    }
  };
  reader.onerror = () => alert('读取文件失败。');
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
      alert('姓名为空或已存在。');
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
      alert('姓名为空或已存在。');
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
    document.getElementById('btn-swap-mode').textContent = ui.swapMode ? '✓ 完成调整' : '🔀 手动调整';
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

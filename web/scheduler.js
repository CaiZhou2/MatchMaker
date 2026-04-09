/**
 * MatchMaker - Team formation + tournament format planner
 *
 * Exported functions:
 *   - formBalancedTeams(attendees, playersMap, teamSize) → { teams, spectators }
 *   - recommendFormat(teams, numCourts, matchDuration, totalTime) → plan
 *
 * Team formation rule:
 *   - T = floor(N / teamSize)
 *   - Top T ranked attendees = captains (1 per team)
 *   - Remaining shuffled, distributed round-robin into teams
 *   - Ranking metric: win rate (ties broken by total games desc, then random)
 */

function playerWinRate(p) {
  if (!p) return 0;
  const total = (p.wins || 0) + (p.draws || 0) + (p.losses || 0);
  return total > 0 ? p.wins / total : 0;
}

function playerTotalGames(p) {
  if (!p) return 0;
  return (p.wins || 0) + (p.draws || 0) + (p.losses || 0);
}

/* ─── Team Formation ────────────────────────────────────────── */
function formBalancedTeams(attendeeIds, playersMap, teamSize) {
  const n = attendeeIds.length;
  const numTeams = Math.floor(n / teamSize);

  if (numTeams < 2) {
    return { error: `至少需要 ${2 * teamSize} 人 (当前 ${n} 人)。`, teams: [], spectators: attendeeIds };
  }

  // Rank by win rate desc, then games played desc (more reliable), then random
  const jitter = {};
  attendeeIds.forEach(id => { jitter[id] = Math.random(); });

  const ranked = [...attendeeIds].sort((a, b) => {
    const wrA = playerWinRate(playersMap[a]);
    const wrB = playerWinRate(playersMap[b]);
    if (wrA !== wrB) return wrB - wrA;
    const gA = playerTotalGames(playersMap[a]);
    const gB = playerTotalGames(playersMap[b]);
    if (gA !== gB) return gB - gA;
    return jitter[a] - jitter[b];
  });

  const captains = ranked.slice(0, numTeams);
  const rest = shuffleCopy(ranked.slice(numTeams, numTeams * teamSize));
  const spectators = ranked.slice(numTeams * teamSize);

  const teams = captains.map((cap, i) => ({
    id: `t_${i}`,
    name: `Team ${i + 1}`,
    players: [cap],
  }));

  rest.forEach((pid, i) => {
    teams[i % numTeams].players.push(pid);
  });

  return { teams, spectators };
}

function shuffleCopy(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/* ─── Round-robin pairings (Berger/circle method) ───────────── */
function roundRobinPairings(n) {
  const teams = Array.from({ length: n }, (_, i) => i);
  if (teams.length % 2 === 1) teams.push(-1);  // bye
  const m = teams.length;
  const rounds = [];
  let arr = teams.slice();
  for (let r = 0; r < m - 1; r++) {
    const roundPairs = [];
    for (let i = 0; i < m / 2; i++) {
      const a = arr[i], b = arr[m - 1 - i];
      if (a !== -1 && b !== -1) roundPairs.push([a, b]);
    }
    rounds.push(roundPairs);
    // rotate (fix first, move last to second)
    arr = [arr[0], arr[m - 1], ...arr.slice(1, m - 1)];
  }
  return rounds;
}

/* ─── Round-robin planner ───────────────────────────────────── */
function planRoundRobin(teams, numCourts, matchDuration, totalTime) {
  const T = teams.length;
  const rounds = roundRobinPairings(T);
  const maxSlots = Math.floor(totalTime / matchDuration);

  const schedule = [];
  let slotIdx = 0;

  for (let r = 0; r < rounds.length; r++) {
    const rp = rounds[r];
    for (let bs = 0; bs < rp.length; bs += numCourts) {
      const batch = rp.slice(bs, bs + numCourts);
      if (slotIdx >= maxSlots) {
        return { format: 'round-robin', schedule, fits: false, reason: '时间不足', slotsUsed: slotIdx };
      }
      schedule.push({
        phase: 'round-robin',
        round: r + 1,
        slot: slotIdx + 1,
        matches: batch.map(([a, b], i) => ({
          court: i + 1, team_a: a, team_b: b, kind: 'ranked',
        })),
      });
      slotIdx++;
    }
  }

  return { format: 'round-robin', schedule, fits: true, slotsUsed: slotIdx };
}

/* ─── Groups + Knockout planner ─────────────────────────────── */
function planGroupsKnockout(teams, numCourts, matchDuration, totalTime) {
  const T = teams.length;
  if (T < 4) return { fits: false, reason: '队伍太少' };

  let best = null;

  for (const groupSize of [4, 3]) {
    const numGroups = Math.floor(T / groupSize);
    if (numGroups < 2) continue;
    const remainder = T - numGroups * groupSize;
    const groupSizes = Array.from({ length: numGroups }, (_, i) =>
      groupSize + (i < remainder ? 1 : 0)
    );

    const totalAdvancing = 2 * numGroups;
    // Round down to power of 2
    let kn = 1;
    while (kn * 2 <= totalAdvancing) kn *= 2;
    if (kn < 2) continue;

    const plan = buildGroupsKnockout(teams, groupSizes, kn, numCourts, matchDuration, totalTime);
    if (plan.fits) {
      if (!best || plan.slotsUsed < best.slotsUsed) best = plan;
    }
  }

  return best || { fits: false, reason: '时间不足以完成小组赛+淘汰赛' };
}

function buildGroupsKnockout(teams, groupSizes, knSize, numCourts, matchDuration, totalTime) {
  const maxSlots = Math.floor(totalTime / matchDuration);

  // Assign team indices to groups sequentially (top teams get distributed later; for now seq)
  const groupTeamIds = [];
  let idx = 0;
  for (const size of groupSizes) {
    groupTeamIds.push(Array.from({ length: size }, (_, i) => idx + i));
    idx += size;
  }

  const schedule = [];
  let slotIdx = 0;

  // Group stage: compute rounds for each group, then interleave by round
  const groupRounds = groupTeamIds.map(ids => {
    const pairs = roundRobinPairings(ids.length);
    // Map local indices back to actual team indices
    return pairs.map(roundPairs =>
      roundPairs.map(([a, b]) => [ids[a], ids[b]])
    );
  });
  const maxRounds = Math.max(...groupRounds.map(g => g.length));

  for (let r = 0; r < maxRounds; r++) {
    const roundMatches = [];
    groupRounds.forEach(gr => {
      if (r < gr.length) gr[r].forEach(p => roundMatches.push(p));
    });
    for (let bs = 0; bs < roundMatches.length; bs += numCourts) {
      const batch = roundMatches.slice(bs, bs + numCourts);
      if (slotIdx >= maxSlots) return { fits: false, reason: '小组赛超时' };
      schedule.push({
        phase: 'group',
        round: r + 1,
        slot: slotIdx + 1,
        matches: batch.map(([a, b], i) => ({
          court: i + 1, team_a: a, team_b: b, kind: 'ranked',
        })),
      });
      slotIdx++;
    }
  }

  // Knockout stage — use placeholders (resolved later from results)
  let advancing = [];
  groupSizes.forEach((_, i) => {
    advancing.push(`G${i + 1}-1`);
    advancing.push(`G${i + 1}-2`);
  });
  advancing = advancing.slice(0, knSize);

  let current = advancing.slice();
  let knRound = 0;
  while (current.length > 1) {
    knRound++;
    const roundMatches = [];
    const nextRound = [];
    for (let i = 0; i < current.length; i += 2) {
      roundMatches.push([current[i], current[i + 1]]);
      nextRound.push(`KR${knRound}-M${Math.floor(i / 2) + 1}-W`);
    }

    // Reserve 1 court for friendly matches if we have more than 1 court
    const tournamentCourts = numCourts > 1 ? numCourts - 1 : 1;

    for (let bs = 0; bs < roundMatches.length; bs += tournamentCourts) {
      const batch = roundMatches.slice(bs, bs + tournamentCourts);
      if (slotIdx >= maxSlots) return { fits: false, reason: '淘汰赛超时' };
      const matches = batch.map(([a, b], i) => ({
        court: i + 1, team_a: a, team_b: b, kind: 'ranked',
      }));
      if (numCourts > batch.length) {
        // Add friendly court for eliminated teams
        matches.push({
          court: numCourts,
          team_a: null,
          team_b: null,
          kind: 'friendly',
        });
      }
      schedule.push({
        phase: 'knockout',
        round: `KR${knRound}`,
        slot: slotIdx + 1,
        matches,
      });
      slotIdx++;
    }

    current = nextRound;
  }

  return {
    format: 'groups-knockout',
    group_sizes: groupSizes,
    knockout_size: knSize,
    schedule,
    fits: true,
    slotsUsed: slotIdx,
  };
}

/* ─── Main recommender ──────────────────────────────────────── */
function recommendFormat(teams, numCourts, matchDuration, totalTime) {
  const T = teams.length;
  if (T < 2) return { error: '至少需要 2 支队伍', fits: false };

  if (T >= 4) {
    const gk = planGroupsKnockout(teams, numCourts, matchDuration, totalTime);
    if (gk.fits) return gk;
  }

  return planRoundRobin(teams, numCourts, matchDuration, totalTime);
}

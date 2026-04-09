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

    const plan = buildGroupsKnockout(groupSizes, kn, numCourts, matchDuration, totalTime);
    if (plan.fits) {
      if (!best || plan.slotsUsed < best.slotsUsed) best = plan;
    }
  }

  return best || { fits: false, reason: '时间不足以完成小组赛+淘汰赛' };
}

function buildGroupsKnockout(groupSizes, knSize, numCourts, matchDuration, totalTime) {
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

/* ─── Pure single-elimination knockout ──────────────────────── */
//
// Standard single-elim bracket. Top seeds are placed on opposite
// sides via the recursive seedBracket() pattern so the strongest
// teams can't meet until the final.
//
// Constraint: requires the team count to be a power of 2 (2/4/8/16/
// 32). Byes would let us accept arbitrary counts but introduce
// awkward seeding choices that the user can't tweak through the UI;
// for v1 we just refuse and tell the user to switch modes or change
// the team count.
function planPureKnockout(teams, numCourts, matchDuration, totalTime) {
  const T = teams.length;
  if (T < 2) return { fits: false, reason: '至少需要 2 支队伍', format: 'knockout' };
  if ((T & (T - 1)) !== 0) {
    return {
      fits: false,
      reason: `纯淘汰赛要求队伍数为 2 的幂次（2/4/8/16/32），当前 ${T} 队`,
      format: 'knockout',
    };
  }

  const maxSlots = Math.floor(totalTime / matchDuration);
  if (maxSlots <= 0) return { fits: false, reason: '时间不足', format: 'knockout' };

  const schedule = [];
  let slotIdx = 0;

  // Seeded order: top seed and 2nd seed end up on opposite sides
  let current = seedBracket(T);
  let knRound = 1;

  while (current.length > 1) {
    const roundMatches = [];
    const nextRound = [];
    for (let i = 0; i < current.length; i += 2) {
      roundMatches.push([current[i], current[i + 1]]);
      nextRound.push(`KR${knRound}-M${Math.floor(i / 2) + 1}-W`);
    }

    for (let bs = 0; bs < roundMatches.length; bs += numCourts) {
      const batch = roundMatches.slice(bs, bs + numCourts);
      if (slotIdx >= maxSlots) {
        return { fits: false, reason: '淘汰赛时间不足', format: 'knockout' };
      }
      schedule.push({
        phase: 'knockout',
        round: `KR${knRound}`,
        slot: slotIdx + 1,
        matches: batch.map(([a, b], i) => ({
          court: i + 1, team_a: a, team_b: b, kind: 'ranked',
        })),
      });
      slotIdx++;
    }

    current = nextRound;
    knRound++;
  }

  return {
    format: 'knockout',
    schedule,
    fits: true,
    slotsUsed: slotIdx,
    knockout_size: T,
  };
}

// Standard tennis-style bracket seeding: returns an array of length n
// where adjacent pairs are the round-1 pairings, and the seeding
// guarantees the top two seeds (0, 1) end up on opposite sides of the
// bracket so they can only meet in the final.
//
//   seedBracket(2) = [0, 1]              → (0 vs 1)
//   seedBracket(4) = [0, 3, 1, 2]        → (0v3, 1v2)
//   seedBracket(8) = [0, 7, 3, 4, 1, 6, 2, 5]
//
// `n` MUST be a power of 2.
function seedBracket(n) {
  if (n === 2) return [0, 1];
  const half = seedBracket(n / 2);
  const out = [];
  for (let i = 0; i < half.length; i++) {
    out.push(half[i]);
    out.push(n - 1 - half[i]);
  }
  return out;
}

/* ─── Random-fair fallback ──────────────────────────────────── */
/**
 * Used when neither groups+knockout nor round-robin fit in the time budget.
 * Discards the fixed weekly teams and instead schedules per-match teams,
 * prioritising fairness within each match (强强 vs 强强 / 弱弱 vs 弱弱 /
 * 强弱 vs 强弱) and equal participation across players.
 *
 * Strategy per slot per court:
 *   1. From players not yet used this slot, sort by (gameCount asc,
 *      winRate desc) so that we both equalise play counts AND cluster
 *      similar-skill players together.
 *   2. Take the first `playersPerMatch` of that order — these become
 *      the four-ish players who play this match. Because of the WR
 *      tie-break, when many players are tied on play count they tend
 *      to be selected as a similar-skill cohort.
 *   3. Within the cohort, snake-draft by win rate into `teamsPerMatch`
 *      teams. Snake draft balances the two teams so the match is fair
 *      internally.
 *
 * Returns the same shape as planRoundRobin/planGroupsKnockout, plus a
 * `teams` array containing all the per-match teams generated. Match
 * `team_a` / `team_b` reference these teams by numeric index.
 */
function planRandomFairFallback({
  attendeeIds, playersMap, teamSize, teamsPerMatch,
  numCourts, matchDuration, totalTime,
  kind = 'ranked',     // 'ranked' (default) or 'friendly' (for 纯友谊赛)
  format = 'random-fair',  // override label when used as friendly mode
}) {
  const playersPerMatch = teamSize * teamsPerMatch;
  const maxSlots = Math.floor(totalTime / matchDuration);
  const n = attendeeIds.length;

  if (maxSlots <= 0) {
    return { fits: false, reason: '时间不足', format };
  }
  if (n < playersPerMatch) {
    return {
      fits: false,
      reason: `至少需要 ${playersPerMatch} 人，当前 ${n} 人`,
      format,
    };
  }

  const courtsPerSlot = Math.min(numCourts, Math.floor(n / playersPerMatch));
  if (courtsPerSlot <= 0) {
    return { fits: false, reason: '人数不足以填满一个场地', format };
  }

  const wr = (id) => playerWinRate(playersMap[id]);

  // Per-player game count for this event
  const gameCount = {};
  attendeeIds.forEach(id => { gameCount[id] = 0; });

  const teams = [];      // global team list (one entry per generated match-side)
  const schedule = [];

  let teamCounter = 0;

  for (let slotIdx = 0; slotIdx < maxSlots; slotIdx++) {
    const usedThisSlot = new Set();
    const slotMatches = [];

    for (let courtIdx = 0; courtIdx < courtsPerSlot; courtIdx++) {
      const available = attendeeIds.filter(id => !usedThisSlot.has(id));
      if (available.length < playersPerMatch) break;

      // Sort by play count asc, win rate desc, jitter to break ties
      available.sort((a, b) => {
        const gd = gameCount[a] - gameCount[b];
        if (gd !== 0) return gd;
        const wd = wr(b) - wr(a);
        if (wd !== 0) return wd;
        return Math.random() - 0.5;
      });

      const cohort = available.slice(0, playersPerMatch);

      // Within the cohort, sort strictly by win rate desc and snake-draft.
      cohort.sort((a, b) => wr(b) - wr(a));

      // Snake draft into teamsPerMatch teams
      const teamPlayers = Array.from({ length: teamsPerMatch }, () => []);
      cohort.forEach((pid, i) => {
        const round = Math.floor(i / teamsPerMatch);
        const pos = i % teamsPerMatch;
        const teamIdx = round % 2 === 0 ? pos : (teamsPerMatch - 1 - pos);
        teamPlayers[teamIdx].push(pid);
      });

      // Materialise teams as global team objects and remember their indices
      const teamIndices = teamPlayers.map(players => {
        const idx = teams.length;
        teams.push({
          id: `t_${teamCounter++}`,
          name: `Team ${idx + 1}`,
          players,
        });
        return idx;
      });

      // For teamsPerMatch === 2 we have a single ranked match between
      // teamIndices[0] and teamIndices[1]. For teamsPerMatch > 2 we still
      // emit a single "match" record with the two teams in a multi-team
      // contest — keeping the schema consistent with the cup planners,
      // which represent each court as a single match between team_a/team_b.
      // (For now teamsPerMatch is effectively 2 in the current UI.)
      slotMatches.push({
        court: courtIdx + 1,
        team_a: teamIndices[0],
        team_b: teamIndices[1] !== undefined ? teamIndices[1] : teamIndices[0],
        kind,
      });

      // Bump usage
      cohort.forEach(pid => {
        usedThisSlot.add(pid);
        gameCount[pid] += 1;
      });
    }

    if (slotMatches.length > 0) {
      schedule.push({
        phase: format === 'friendly' ? 'friendly' : 'random-fair',
        round: slotIdx + 1,
        slot: slotIdx + 1,
        matches: slotMatches,
      });
    }
  }

  if (schedule.length === 0) {
    return { fits: false, reason: '人数不足以填满一个场地', format };
  }

  return {
    format,
    schedule,
    teams,
    fits: true,
    slotsUsed: schedule.length,
  };
}

/* ─── Friendly mode (no points) ─────────────────────────────── */
//
// Wraps planRandomFairFallback so that all matches are stamped as
// `kind: 'friendly'`. commitEvent's accumulateDelta walker only
// counts ranked matches, so a friendly tournament records results
// for the user's convenience but never touches anyone's points,
// wins, draws, or losses. This is the explicit "纯友谊赛 / pure
// friendly" mode the user can pick from the setup view.
function planFriendly(opts) {
  return planRandomFairFallback({ ...opts, kind: 'friendly', format: 'friendly' });
}

/* ─── Mode dispatch ─────────────────────────────────────────── */
//
// Single entry point for the UI: takes a mode string (one of the
// five the user can select) and dispatches to the matching planner.
// Returns the planner's result object (with `fits`, `reason`, etc.)
// so callers can uniformly check `plan.fits` and surface
// `plan.reason` to the user.
//
//   - 'auto'             → recommendFormat (groups+knockout, then round-robin)
//   - 'round-robin'      → planRoundRobin              (uses fixed teams)
//   - 'groups-knockout'  → planGroupsKnockout          (uses fixed teams)
//   - 'knockout'         → planPureKnockout            (uses fixed teams)
//   - 'friendly'         → planFriendly                (per-match teams,
//                                                       no points awarded)
//
// `auto` is the default for backward compatibility — it preserves
// the original "smart pick" behaviour for users who don't care.
// The other four are explicit overrides; if the chosen one is
// infeasible, the UI alerts and refuses to proceed (no auto-fallback).
function planByMode(mode, opts) {
  const { teams, attendeeIds, playersMap, teamSize, teamsPerMatch,
          numCourts, matchDuration, totalTime } = opts;
  switch (mode) {
    case 'auto':
      return recommendFormat(teams, numCourts, matchDuration, totalTime);
    case 'round-robin':
      return planRoundRobin(teams, numCourts, matchDuration, totalTime);
    case 'groups-knockout':
      return planGroupsKnockout(teams, numCourts, matchDuration, totalTime);
    case 'knockout':
      return planPureKnockout(teams, numCourts, matchDuration, totalTime);
    case 'friendly':
      return planFriendly({
        attendeeIds, playersMap, teamSize, teamsPerMatch,
        numCourts, matchDuration, totalTime,
      });
    default:
      return { fits: false, reason: `未知模式: ${mode}`, format: mode };
  }
}

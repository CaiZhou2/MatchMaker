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
/**
 * Forms `numTeams = floor(N / teamSize)` balanced teams from a roster.
 *
 * Two-phase distribution to keep matches fair regardless of team size:
 *
 *   1. **Snake-draft phase** for the top 50% of ranked attendees.
 *      Walks ranks 0..⌊N/2⌋-1 like a serpentine fantasy draft —
 *      forward through the teams (rank 0 → team 0, rank 1 → team 1,
 *      ..., rank T-1 → team T-1), then backward (rank T → team T-1,
 *      rank T+1 → team T-2, ...), and so on. This gives every team
 *      one "captain"-tier player plus a balanced mix of upper-mid
 *      players, so the SUM of the top-half ranks per team is as
 *      equal as possible.
 *
 *   2. **Random fill phase** for the bottom 50%. Shuffle the
 *      remaining attendees and round-robin them into the teams that
 *      still have empty slots.
 *
 * Why split this way? With small teamSize (1 or 2), the snake phase
 * is mostly captains and the result is indistinguishable from the
 * old "captain + random fill" rule. With LARGER teamSize (3, 4, 5)
 * the old rule was unfair: random distribution of 6+ non-captain
 * players easily produces wildly unbalanced teams. Snake-drafting
 * the top half tames the worst case while still leaving enough
 * randomness in the bottom half to keep weekly events fresh.
 *
 * @returns {{teams: Array, spectators: Array}}
 *   `teams[i].players` always has captain at index 0, then snake
 *   picks, then random fills. `spectators` are extras that don't
 *   evenly divide into teams (only happens when N % teamSize != 0).
 */
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

  const teams = Array.from({ length: numTeams }, (_, i) => ({
    id: `t_${i}`,
    name: `Team ${i + 1}`,
    players: [],
  }));

  // Half-boundary capped at the total slot count (T*teamSize), so a
  // roster with extras (N % teamSize > 0) doesn't push spectators
  // into the snake phase.
  const totalSlots = numTeams * teamSize;
  const halfBoundary = Math.min(Math.floor(n / 2), totalSlots);

  // Phase 1: snake draft for ranks [0, halfBoundary)
  for (let i = 0; i < halfBoundary; i++) {
    const round = Math.floor(i / numTeams);
    const posInRound = i % numTeams;
    const teamIdx = (round % 2 === 0) ? posInRound : (numTeams - 1 - posInRound);
    teams[teamIdx].players.push(ranked[i]);
  }

  // Phase 2: random fill for ranks [halfBoundary, totalSlots)
  const bottomHalf = shuffleCopy(ranked.slice(halfBoundary, totalSlots));
  let cursor = 0;
  for (const pid of bottomHalf) {
    // Skip teams that are already full (can happen with small N where
    // the snake phase already filled some teams to capacity).
    let safety = numTeams;
    while (teams[cursor].players.length >= teamSize && safety-- > 0) {
      cursor = (cursor + 1) % numTeams;
    }
    teams[cursor].players.push(pid);
    cursor = (cursor + 1) % numTeams;
  }

  // Anything past totalSlots is a spectator (extras that don't
  // evenly divide). The snake never sees these, so they sit out.
  const spectators = ranked.slice(totalSlots);

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
/**
 * Friendly / random-fair scheduler.
 *
 * Goal: schedule matches that are
 *   (a) **Internally fair** — within each match, the two teams should
 *       have similar total skill (so the game is competitive).
 *   (b) **Equal participation** — every player plays roughly the
 *       same number of matches across the event.
 *   (c) **Mixed pairings** — over the course of an event, every
 *       player should play with and against many different opponents,
 *       not just the same 3 people every slot.
 *   (d) **No consecutive repeats** — the same 4 people shouldn't be
 *       grouped together in two slots in a row when there are other
 *       players who could fill in instead.
 *
 * Algorithm — greedy co-occurrence minimisation:
 *
 *   1. Track a pairwise co-occurrence count: how many times each pair
 *      of players has been on the same court so far. This is the
 *      anti-clique signal.
 *
 *   2. For each (slot, court), build a cohort by greedy selection:
 *
 *      a. Pick a "seed" player from the lowest-game-count pool
 *         (random tiebreak). This guarantees property (b).
 *
 *      b. Repeatedly add the player whose sum of co-occurrence
 *         counts with the already-picked cohort is LOWEST. Tiebreak
 *         by game count, then random. This naturally:
 *           - mixes tiers in slot 1 (everyone is co=0, so the picks
 *             are pure random — produces 强弱 mixes too, not just
 *             tier clusters)
 *           - in later slots, prefers players who haven't yet been
 *             grouped with the seed — so the same 4 won't replay
 *           - is bounded: when the pool is exactly playersPerMatch
 *             large, the algorithm has no choice and picks them all
 *             (this can't be helped)
 *
 *   3. INSIDE each cohort, sort by win rate descending and snake-draft
 *      into teams. This is property (a) — even when the cohort spans
 *      multiple skill tiers, snake-drafting gives each side one high
 *      pick + one low pick, so the two teams' total strengths are
 *      roughly equal.
 *
 *   4. After each match, bump the co-occurrence counter for every
 *      pair in the cohort (regardless of which team they're on — we
 *      consider "played on the same court" the relevant signal).
 *
 * Why greedy and not optimal? An optimal "minimum total co-occurrence
 * over all slots" assignment is a hard combinatorial problem. Greedy
 * gets us most of the way at trivial cost.
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

  // Pairwise co-occurrence: coOccur[a][b] = number of times a and b
  // have been on the same court together so far this event.
  const coOccur = {};
  attendeeIds.forEach(id => { coOccur[id] = {}; });
  function pairCo(a, b) { return coOccur[a][b] || 0; }
  function bumpPair(a, b) {
    coOccur[a][b] = (coOccur[a][b] || 0) + 1;
    coOccur[b][a] = (coOccur[b][a] || 0) + 1;
  }

  // Greedy cohort selector. `available` is the pool to pick from
  // (players not yet used in the current slot). Returns the chosen
  // cohort, or null if `available` is too small.
  function pickCohort(available) {
    if (available.length < playersPerMatch) return null;

    // Seed: random pick from the lowest-game-count tier
    const minGc = Math.min(...available.map(id => gameCount[id]));
    const seedPool = available.filter(id => gameCount[id] === minGc);
    // Fisher-Yates shuffle in place
    for (let i = seedPool.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [seedPool[i], seedPool[j]] = [seedPool[j], seedPool[i]];
    }
    const cohort = [seedPool[0]];

    while (cohort.length < playersPerMatch) {
      // Score each remaining candidate by (sum-co with cohort, gc, random)
      let best = null;
      let bestKey = null;
      for (const id of available) {
        if (cohort.includes(id)) continue;
        let coSum = 0;
        for (const pid of cohort) coSum += pairCo(id, pid);
        const key = [coSum, gameCount[id], Math.random()];
        if (!bestKey
            || key[0] < bestKey[0]
            || (key[0] === bestKey[0] && key[1] < bestKey[1])
            || (key[0] === bestKey[0] && key[1] === bestKey[1] && key[2] < bestKey[2])) {
          best = id;
          bestKey = key;
        }
      }
      cohort.push(best);
    }
    return cohort;
  }

  const teams = [];      // global team list (one entry per generated match-side)
  const schedule = [];

  let teamCounter = 0;

  for (let slotIdx = 0; slotIdx < maxSlots; slotIdx++) {
    const usedThisSlot = new Set();
    const slotMatches = [];

    for (let courtIdx = 0; courtIdx < courtsPerSlot; courtIdx++) {
      const available = attendeeIds.filter(id => !usedThisSlot.has(id));
      const cohort = pickCohort(available);
      if (!cohort) break;

      // Within the cohort, sort by win rate descending and snake-draft
      // for INTERNAL match balance. This is property (a) — the two
      // teams of a single match always end up with one stronger and
      // one weaker player when the cohort spans multiple WR levels,
      // producing 强弱 vs 强弱. When the cohort is all-strong or
      // all-weak (which still happens occasionally because the cohort
      // selection is random in the early slots), snake gives 强强 vs
      // 强强 / 弱弱 vs 弱弱 — also fair, just at different absolute
      // levels.
      const ranked = [...cohort].sort((a, b) => wr(b) - wr(a));

      const teamPlayers = Array.from({ length: teamsPerMatch }, () => []);
      ranked.forEach((pid, i) => {
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

      slotMatches.push({
        court: courtIdx + 1,
        team_a: teamIndices[0],
        team_b: teamIndices[1] !== undefined ? teamIndices[1] : teamIndices[0],
        kind,
      });

      // Bump per-player game count + pairwise co-occurrence for the
      // entire cohort (so future slots try not to repeat this group).
      cohort.forEach(pid => {
        usedThisSlot.add(pid);
        gameCount[pid] += 1;
      });
      for (let i = 0; i < cohort.length; i++) {
        for (let j = i + 1; j < cohort.length; j++) {
          bumpPair(cohort[i], cohort[j]);
        }
      }
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
    case 'auto': {
      // Auto's purpose is "always give the user *something*" — so it
      // tries cup formats first, and if neither fits the time/courts
      // budget it falls all the way back to friendly mode (which is
      // almost always feasible: 1 slot + enough players for a single
      // match is enough). Only if even friendly fails do we surface
      // the original cup-plan reason as the failure.
      const cupPlan = recommendFormat(teams, numCourts, matchDuration, totalTime);
      if (cupPlan.fits) return cupPlan;
      const friendly = planFriendly({
        attendeeIds, playersMap, teamSize, teamsPerMatch,
        numCourts, matchDuration, totalTime,
      });
      if (friendly.fits) return friendly;
      return cupPlan;
    }
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

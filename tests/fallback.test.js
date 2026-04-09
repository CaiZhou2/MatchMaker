const test = require('node:test');
const assert = require('node:assert/strict');
const { createHarness } = require('./harness');

// Build a players map with deterministic WR records
function buildPlayers(h, specs) {
  const map = {};
  specs.forEach(spec => {
    const p = h.Storage.addPlayer(spec.name);
    p.wins = spec.w; p.draws = spec.d; p.losses = spec.l;
    p.points = spec.w * 3 + spec.d;
    map[p.id] = p;
  });
  h.Storage.save();
  return map;
}

/* ──────────────────────────────────────────────────────────
 * Random-fair fallback algorithm
 * ────────────────────────────────────────────────────────── */

test('fallback: returns fits=false when there is no time at all', () => {
  const h = createHarness();
  const map = buildPlayers(h, [
    { name: 'A', w: 0, d: 0, l: 0 },
    { name: 'B', w: 0, d: 0, l: 0 },
    { name: 'C', w: 0, d: 0, l: 0 },
    { name: 'D', w: 0, d: 0, l: 0 },
  ]);
  const result = h.planRandomFairFallback({
    attendeeIds: Object.keys(map),
    playersMap: map,
    teamSize: 2,
    teamsPerMatch: 2,
    numCourts: 1,
    matchDuration: 10,
    totalTime: 5,  // less than one match
  });
  assert.equal(result.fits, false);
  assert.equal(result.format, 'random-fair');
});

test('fallback: returns fits=false when not enough players', () => {
  const h = createHarness();
  const map = buildPlayers(h, [
    { name: 'A', w: 0, d: 0, l: 0 },
    { name: 'B', w: 0, d: 0, l: 0 },
    { name: 'C', w: 0, d: 0, l: 0 },
  ]);
  const result = h.planRandomFairFallback({
    attendeeIds: Object.keys(map),
    playersMap: map,
    teamSize: 2,
    teamsPerMatch: 2,
    numCourts: 1,
    matchDuration: 10,
    totalTime: 60,
  });
  // 3 players can't form a 4-player match
  assert.equal(result.fits, false);
});

test('fallback: produces a feasible plan when cup format does not fit', () => {
  const h = createHarness();
  const map = buildPlayers(h, [
    { name: 'A', w: 10, d: 0, l: 0 },
    { name: 'B', w: 8,  d: 0, l: 2 },
    { name: 'C', w: 6,  d: 0, l: 4 },
    { name: 'D', w: 4,  d: 0, l: 6 },
    { name: 'E', w: 2,  d: 0, l: 8 },
    { name: 'F', w: 0,  d: 0, l: 10 },
    { name: 'G', w: 0,  d: 0, l: 0 },
    { name: 'H', w: 0,  d: 0, l: 0 },
  ]);

  // Tight budget: 2 slots × 1 court = 2 matches max. A round-robin
  // for 4 fixed teams needs 6 matches → infeasible. The fallback
  // should still produce a 2-match plan covering all 8 players.
  const result = h.planRandomFairFallback({
    attendeeIds: Object.keys(map),
    playersMap: map,
    teamSize: 2,
    teamsPerMatch: 2,
    numCourts: 1,
    matchDuration: 10,
    totalTime: 20,
  });

  assert.equal(result.fits, true);
  assert.equal(result.format, 'random-fair');
  assert.equal(result.schedule.length, 2);
  // Each slot has exactly 1 match (1 court)
  result.schedule.forEach(slot => {
    assert.equal(slot.matches.length, 1);
    assert.equal(slot.matches[0].kind, 'ranked');
  });
  // 4 unique teams generated (2 matches × 2 sides)
  assert.equal(result.teams.length, 4);
});

test('fallback: each match has balanced teams (snake-drafted within cohort)', () => {
  const h = createHarness();
  // 4 players with very different skill levels: 100%, 75%, 50%, 25%
  const map = buildPlayers(h, [
    { name: 'A', w: 4, d: 0, l: 0 },  // 100% WR
    { name: 'B', w: 3, d: 0, l: 1 },  // 75%
    { name: 'C', w: 2, d: 0, l: 2 },  // 50%
    { name: 'D', w: 1, d: 0, l: 3 },  // 25%
  ]);

  const result = h.planRandomFairFallback({
    attendeeIds: Object.keys(map),
    playersMap: map,
    teamSize: 2,
    teamsPerMatch: 2,
    numCourts: 1,
    matchDuration: 10,
    totalTime: 10,  // exactly 1 slot, 1 match
  });

  assert.equal(result.fits, true);
  assert.equal(result.teams.length, 2);

  // Snake draft over [A, B, C, D] (sorted by WR desc):
  //   round 0: pos 0 → team 0 (A), pos 1 → team 1 (B)
  //   round 1: pos 0 → team 1 (C), pos 1 → team 0 (D)
  //   → team 0 = [A, D]   (rank 1 + rank 4)
  //   → team 1 = [B, C]   (rank 2 + rank 3)
  // Both teams have one strong + one weak — fair.
  const idOf = name => Object.keys(map).find(id => map[id].name === name);
  const team0 = result.teams[0].players.sort();
  const team1 = result.teams[1].players.sort();
  assert.equal(team0.join(','), [idOf('A'), idOf('D')].sort().join(','));
  assert.equal(team1.join(','), [idOf('B'), idOf('C')].sort().join(','));
});

test('fallback: equalises participation across many slots', () => {
  const h = createHarness();
  const map = buildPlayers(h, Array.from({ length: 8 }, (_, i) => ({
    name: 'P' + i, w: i, d: 0, l: 7 - i,
  })));

  // 1 court, 4 slots → 4 matches × 4 players = 16 player-slots, 8 players
  // → each player should play exactly 2 matches.
  const result = h.planRandomFairFallback({
    attendeeIds: Object.keys(map),
    playersMap: map,
    teamSize: 2,
    teamsPerMatch: 2,
    numCourts: 1,
    matchDuration: 10,
    totalTime: 40,
  });

  assert.equal(result.fits, true);
  assert.equal(result.schedule.length, 4);

  // Count plays per player
  const plays = {};
  Object.keys(map).forEach(id => { plays[id] = 0; });
  result.schedule.forEach(slot => {
    slot.matches.forEach(m => {
      result.teams[m.team_a].players.forEach(pid => plays[pid]++);
      result.teams[m.team_b].players.forEach(pid => plays[pid]++);
    });
  });

  // All players should have played exactly 2 times (max - min = 0)
  const counts = Object.values(plays);
  const maxPlays = Math.max(...counts);
  const minPlays = Math.min(...counts);
  assert.equal(maxPlays - minPlays, 0,
    `Play counts not balanced: max=${maxPlays}, min=${minPlays}`);
  assert.equal(maxPlays, 2);
});

test('fallback: never schedules a player twice in the same slot', () => {
  const h = createHarness();
  const map = buildPlayers(h, Array.from({ length: 8 }, (_, i) => ({
    name: 'P' + i, w: i, d: 0, l: 7 - i,
  })));

  // 2 courts, several slots
  const result = h.planRandomFairFallback({
    attendeeIds: Object.keys(map),
    playersMap: map,
    teamSize: 2,
    teamsPerMatch: 2,
    numCourts: 2,
    matchDuration: 10,
    totalTime: 60,
  });

  assert.equal(result.fits, true);
  result.schedule.forEach(slot => {
    const usedPlayers = new Set();
    slot.matches.forEach(m => {
      const a = result.teams[m.team_a].players;
      const b = result.teams[m.team_b].players;
      [...a, ...b].forEach(pid => {
        assert.ok(!usedPlayers.has(pid),
          `Player ${pid} plays twice in slot ${slot.slot}`);
        usedPlayers.add(pid);
      });
    });
  });
});

test('fallback: snake-draft within each cohort pairs extremes (best+worst vs mid+mid)', () => {
  // Internal match fairness property: whatever cohort the selector
  // chooses for a given court, the snake draft must pair the best
  // and worst players from that cohort on one team, and the two
  // middle players on the other. This is the optimal split for any
  // 4 values: it minimises the rank-sum difference between the two
  // teams. (For a cohort sorted [r0 < r1 < r2 < r3], the optimal
  // split is {r0, r3} vs {r1, r2} regardless of how skewed the
  // ranks are.)
  //
  // Note: this does NOT assert that absolute team strengths are
  // close — that depends on cohort composition, which may legitimately
  // be skewed (e.g. one strong + three weak players, in which case
  // even the best split is unbalanced). What we DO assert is that
  // the algorithm always picks the best-of-a-bad-job split.
  const h = createHarness();
  const map = buildPlayers(h, [
    { name: 'A', w: 10, d: 0, l: 0 },   // rank 0 (strongest)
    { name: 'B', w: 9,  d: 0, l: 1 },
    { name: 'C', w: 8,  d: 0, l: 2 },
    { name: 'D', w: 7,  d: 0, l: 3 },
    { name: 'E', w: 3,  d: 0, l: 7 },
    { name: 'F', w: 2,  d: 0, l: 8 },
    { name: 'G', w: 1,  d: 0, l: 9 },
    { name: 'H', w: 0,  d: 0, l: 10 },  // rank 7 (weakest)
  ]);
  const ids = Object.keys(map);
  const rankOf = {};
  ids.sort((a, b) => map[b].wins - map[a].wins).forEach((id, i) => { rankOf[id] = i; });

  const result = h.planRandomFairFallback({
    attendeeIds: Object.keys(map),
    playersMap: map,
    teamSize: 2,
    teamsPerMatch: 2,
    numCourts: 2,
    matchDuration: 10,
    totalTime: 60,
  });
  assert.equal(result.fits, true);

  result.schedule.forEach(slot => {
    slot.matches.forEach(m => {
      const teamARanks = result.teams[m.team_a].players.map(p => rankOf[p]);
      const teamBRanks = result.teams[m.team_b].players.map(p => rankOf[p]);
      const cohort = [...teamARanks, ...teamBRanks].sort((x, y) => x - y);
      // The team that contains the best player (cohort[0]) should
      // also contain the worst player (cohort[3]). That's snake.
      const teamWithBest = teamARanks.includes(cohort[0]) ? teamARanks : teamBRanks;
      assert.ok(teamWithBest.includes(cohort[3]),
        `snake should pair best+worst on the same team. cohort=${cohort}, teamA=${teamARanks}, teamB=${teamBRanks}`);
    });
  });
});

test('fallback: cohorts mix tiers across the event (NOT pure tier clustering)', () => {
  // Regression test for the bug where the algorithm always paired
  // strong-with-strong and weak-with-weak. The user explicitly wants
  // mixed-tier pairings (强弱 vs 强弱) to appear too — across multiple
  // slots, NOT every cohort should be a perfect skill tier.
  //
  // We measure: across all matches, how many had a "mixed" cohort
  // (containing at least one player from the top half AND at least
  // one from the bottom half)? If the algorithm purely clusters by
  // tier, this count is zero.
  const h = createHarness();
  const map = buildPlayers(h, [
    { name: 'A', w: 10, d: 0, l: 0 },
    { name: 'B', w: 9,  d: 0, l: 1 },
    { name: 'C', w: 8,  d: 0, l: 2 },
    { name: 'D', w: 7,  d: 0, l: 3 },
    { name: 'E', w: 3,  d: 0, l: 7 },
    { name: 'F', w: 2,  d: 0, l: 8 },
    { name: 'G', w: 1,  d: 0, l: 9 },
    { name: 'H', w: 0,  d: 0, l: 10 },
  ]);
  const ids = Object.keys(map);
  const sortedByWR = [...ids].sort((a, b) => map[b].wins - map[a].wins);
  const topHalf = new Set(sortedByWR.slice(0, 4));
  const bottomHalf = new Set(sortedByWR.slice(4));

  // 8 players, 2 courts, 4 slots → 8 matches total.
  const result = h.planRandomFairFallback({
    attendeeIds: ids,
    playersMap: map,
    teamSize: 2,
    teamsPerMatch: 2,
    numCourts: 2,
    matchDuration: 10,
    totalTime: 40,
  });
  assert.equal(result.fits, true);

  let mixedCount = 0;
  let totalMatches = 0;
  result.schedule.forEach(slot => {
    slot.matches.forEach(m => {
      totalMatches++;
      const cohort = [
        ...result.teams[m.team_a].players,
        ...result.teams[m.team_b].players,
      ];
      const hasTop = cohort.some(p => topHalf.has(p));
      const hasBottom = cohort.some(p => bottomHalf.has(p));
      if (hasTop && hasBottom) mixedCount++;
    });
  });

  // We don't require EVERY match to be mixed (the algorithm is
  // randomized and pure-tier cohorts are still valid), but at least
  // SOMETIMES the cohorts should mix tiers. Conservatively, expect
  // at least 1/4 of all matches to have a mixed cohort.
  assert.ok(mixedCount >= Math.floor(totalMatches / 4),
    `expected at least ${Math.floor(totalMatches / 4)} mixed-tier cohorts out of ${totalMatches}, got ${mixedCount}`);
});

test('fallback: same 4 players do not form a cohort in two CONSECUTIVE slots', () => {
  // The user's specific complaint: with 8 players and 2 courts, the
  // old algorithm would always pair the strongest 4 in slot 1 court 1
  // AND slot 2 court 1, because both slots had everyone tied on game
  // count and falling through to "top 4 by WR". The new algorithm
  // tracks pairwise co-occurrence so the same group can't repeat
  // when there's a less-overlapping alternative.
  //
  // We run with 8 players and check that no two consecutive slots
  // share an identical cohort on any court.
  const h = createHarness();
  const map = buildPlayers(h, [
    { name: 'A', w: 10, d: 0, l: 0 },
    { name: 'B', w: 9,  d: 0, l: 1 },
    { name: 'C', w: 8,  d: 0, l: 2 },
    { name: 'D', w: 7,  d: 0, l: 3 },
    { name: 'E', w: 3,  d: 0, l: 7 },
    { name: 'F', w: 2,  d: 0, l: 8 },
    { name: 'G', w: 1,  d: 0, l: 9 },
    { name: 'H', w: 0,  d: 0, l: 10 },
  ]);

  const result = h.planRandomFairFallback({
    attendeeIds: Object.keys(map),
    playersMap: map,
    teamSize: 2,
    teamsPerMatch: 2,
    numCourts: 2,
    matchDuration: 10,
    totalTime: 60,  // 6 slots, plenty of opportunities for repeats
  });
  assert.equal(result.fits, true);

  // Build a sorted-string cohort key per slot per court
  function cohortKey(match) {
    return [
      ...result.teams[match.team_a].players,
      ...result.teams[match.team_b].players,
    ].sort().join(',');
  }
  for (let i = 1; i < result.schedule.length; i++) {
    const prevKeys = new Set(result.schedule[i - 1].matches.map(cohortKey));
    const currKeys = result.schedule[i].matches.map(cohortKey);
    currKeys.forEach(k => {
      assert.ok(!prevKeys.has(k),
        `slot ${i + 1} re-uses the same cohort as slot ${i}: ${k}`);
    });
  }
});

test('fallback: pairwise co-occurrence stays bounded across many slots', () => {
  // Stronger property than "no consecutive repeats": across the
  // whole event, the pairwise co-occurrence counts should be roughly
  // uniform. With 8 players and N matches per slot × M slots, the
  // total cohort-pair-count is M × matches × C(playersPerMatch, 2),
  // and the C(8,2) = 28 unique pairs should each get its share.
  //
  // We assert that no single pair is "stuck" together — the max pair
  // count shouldn't be more than 2× the average.
  const h = createHarness();
  const map = buildPlayers(h, Array.from({ length: 8 }, (_, i) => ({
    name: 'P' + i, w: 8 - i, d: 0, l: i,
  })));

  const result = h.planRandomFairFallback({
    attendeeIds: Object.keys(map),
    playersMap: map,
    teamSize: 2,
    teamsPerMatch: 2,
    numCourts: 2,
    matchDuration: 10,
    totalTime: 80,  // 8 slots × 2 courts = 16 matches
  });
  assert.equal(result.fits, true);

  // Tally per-pair co-occurrence (alphabetic key)
  const pairCount = {};
  result.schedule.forEach(slot => {
    slot.matches.forEach(m => {
      const cohort = [
        ...result.teams[m.team_a].players,
        ...result.teams[m.team_b].players,
      ];
      for (let i = 0; i < cohort.length; i++) {
        for (let j = i + 1; j < cohort.length; j++) {
          const k = [cohort[i], cohort[j]].sort().join('|');
          pairCount[k] = (pairCount[k] || 0) + 1;
        }
      }
    });
  });

  const counts = Object.values(pairCount);
  const total = counts.reduce((s, n) => s + n, 0);
  const max = Math.max(...counts);
  // 28 unique pairs are POSSIBLE; the algorithm may not exercise all
  // of them in only 16 matches (each match contributes 6 pairs → 96
  // pair-uses), but no single pair should dominate. Average is
  // total/possiblePairs ≈ 96/28 ≈ 3.4; cap max at 6 (≈ 2× average +
  // some slack for randomness).
  assert.ok(max <= 6,
    `co-occurrence imbalance: max pair appears ${max} times, total pair-uses=${total}, distribution=${JSON.stringify(pairCount)}`);
});

// (Tests for the old recommendFormatOrFallback wrapper were removed
// when the auto-fallback logic was deleted in favour of explicit
// tournament-mode selection. See tests/modes.test.js for the new
// planByMode dispatch tests.)

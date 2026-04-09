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

// (The "snake-draft within cohort" test was removed when the
// algorithm switched from greedy snake to template-based selection.
// The "each match has the template structure" test below covers
// the equivalent property — each team gets the same template
// composition of strong + weak players.)

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

test('fallback: each match has the template structure (each team has same strong-count)', () => {
  // The template-based algorithm guarantees that within a single
  // match, both teams have the same number of strong-pool players
  // (and the same number of weak-pool players). This is what makes
  // the SS-SS / SW-SW / WW-WW templates the user asked for: each
  // team has k strong + (T−k) weak.
  //
  // We don't assert WHICH template was chosen for each match — that
  // is randomised — but whatever template was used, both teams must
  // have the same composition by tier.
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
  const sortedByWR = [...ids].sort((a, b) => map[b].wins - map[a].wins);
  const strongPool = new Set(sortedByWR.slice(0, 4));

  const result = h.planRandomFairFallback({
    attendeeIds: ids,
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
      const teamA = result.teams[m.team_a].players;
      const teamB = result.teams[m.team_b].players;
      const aStrong = teamA.filter(p => strongPool.has(p)).length;
      const bStrong = teamB.filter(p => strongPool.has(p)).length;
      // Both teams must have the same strong-count → both came from
      // the same template.
      assert.equal(aStrong, bStrong,
        `template structure violated: team A has ${aStrong} strong, team B has ${bStrong} strong`);
    });
  });
});

test('fallback: no match has duplicate players (sanity check on cross-pool fallback)', () => {
  // Regression for a bug where the cross-pool fallback path could
  // re-pick a player who was already in the cohort, producing matches
  // like "A+C vs C+A". Run a stress event and assert every cohort
  // is exactly playersPerMatch unique players.
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
    totalTime: 80,  // 8 slots × 2 courts = 16 matches
  });
  assert.equal(result.fits, true);

  result.schedule.forEach(slot => {
    slot.matches.forEach(m => {
      const cohort = [
        ...result.teams[m.team_a].players,
        ...result.teams[m.team_b].players,
      ];
      const unique = new Set(cohort);
      assert.equal(unique.size, cohort.length,
        `duplicate players in match (slot ${slot.slot} court ${m.court}): ${cohort}`);
    });
  });
});

test('fallback: produces all three template patterns over a typical event (k=0, k=1, k=2 for teamSize=2)', () => {
  // The user's spec: "from three templates draw one — SS-SS / SW-SW
  // / WW-WW". Across a multi-slot event, all three templates should
  // appear at least sometimes (not always the same one). We don't
  // require uniform distribution, just that no template is starved.
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
  const strongPool = new Set([...ids].sort((a, b) => map[b].wins - map[a].wins).slice(0, 4));

  // Run several events and aggregate so we don't depend on a single
  // unlucky random seed
  const templateCounts = { 0: 0, 1: 0, 2: 0 };
  for (let trial = 0; trial < 5; trial++) {
    const result = h.planRandomFairFallback({
      attendeeIds: ids,
      playersMap: map,
      teamSize: 2, teamsPerMatch: 2,
      numCourts: 2, matchDuration: 10, totalTime: 80,
    });
    result.schedule.forEach(slot => {
      slot.matches.forEach(m => {
        const cohort = [
          ...result.teams[m.team_a].players,
          ...result.teams[m.team_b].players,
        ];
        const strongCount = cohort.filter(p => strongPool.has(p)).length;
        const k = Math.round(strongCount / 2);
        templateCounts[k]++;
      });
    });
  }

  // All three templates should appear at least once across 80 matches
  assert.ok(templateCounts[0] > 0, `WW-WW template never appeared: ${JSON.stringify(templateCounts)}`);
  assert.ok(templateCounts[1] > 0, `SW-SW template never appeared: ${JSON.stringify(templateCounts)}`);
  assert.ok(templateCounts[2] > 0, `SS-SS template never appeared: ${JSON.stringify(templateCounts)}`);
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

test('fallback: with the SMALLEST possible roster, every player still gets diverse partners over time', () => {
  // With a tight roster (8 players, 4 strong + 4 weak), templates
  // SS-SS and WW-WW are FORCED to use the same 4 players every time
  // they're picked — there's no other choice. The "尽量不要" rule
  // accepts that as the math, but the algorithm should still ensure
  // every player ends up with several DIFFERENT partners over the
  // course of the event (not just the same teammate every time).
  //
  // We measure this by: for each player, count how many DISTINCT
  // partners they ever played with. Across an 8-slot 2-court event
  // (16 matches), every player should have played with at least 4
  // different partners.
  const h = createHarness();
  const map = buildPlayers(h, Array.from({ length: 8 }, (_, i) => ({
    name: 'P' + i, w: 8 - i, d: 0, l: i,
  })));
  const ids = Object.keys(map);

  const result = h.planRandomFairFallback({
    attendeeIds: ids,
    playersMap: map,
    teamSize: 2, teamsPerMatch: 2,
    numCourts: 2, matchDuration: 10, totalTime: 80,
  });
  assert.equal(result.fits, true);

  // For each player, build a set of distinct partners (teammates)
  const partners = {};
  ids.forEach(id => { partners[id] = new Set(); });
  result.schedule.forEach(slot => {
    slot.matches.forEach(m => {
      [result.teams[m.team_a].players, result.teams[m.team_b].players].forEach(team => {
        team.forEach(p => {
          team.forEach(q => {
            if (p !== q) partners[p].add(q);
          });
        });
      });
    });
  });

  ids.forEach(id => {
    assert.ok(partners[id].size >= 4,
      `player ${map[id].name} only had ${partners[id].size} distinct partners across the event (expected ≥ 4)`);
  });
});

// (Tests for the old recommendFormatOrFallback wrapper were removed
// when the auto-fallback logic was deleted in favour of explicit
// tournament-mode selection. See tests/modes.test.js for the new
// planByMode dispatch tests.)

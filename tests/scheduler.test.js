const test = require('node:test');
const assert = require('node:assert/strict');
const { createHarness } = require('./harness');

// Helper: build a players map with deterministic WR records
function buildPlayers(h, specs) {
  // specs: [{name, w, d, l}]
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
 * Team formation
 * ────────────────────────────────────────────────────────── */

test('scheduler: form_balanced_teams makes floor(N/size) teams', () => {
  const h = createHarness();
  const map = buildPlayers(h, [
    { name: 'A', w: 5, d: 0, l: 0 },
    { name: 'B', w: 3, d: 0, l: 2 },
    { name: 'C', w: 2, d: 0, l: 3 },
    { name: 'D', w: 1, d: 0, l: 4 },
    { name: 'E', w: 0, d: 0, l: 0 },
    { name: 'F', w: 0, d: 0, l: 0 },
    { name: 'G', w: 0, d: 0, l: 0 },
    { name: 'H', w: 0, d: 0, l: 0 },
  ]);
  const ids = Object.keys(map);

  const result = h.formBalancedTeams(ids, map, 2);
  assert.equal(result.teams.length, 4);
  result.teams.forEach(team => {
    assert.equal(team.players.length, 2);
  });
});

test('scheduler: captains are the top-ranked players by win rate', () => {
  const h = createHarness();
  // Alice: 100% WR (10 games), Bob: 60%, Cara: 40%, Dan: 20%
  const map = buildPlayers(h, [
    { name: 'Alice', w: 10, d: 0, l: 0 },  // 100%
    { name: 'Bob',   w: 6,  d: 0, l: 4 },  // 60%
    { name: 'Cara',  w: 4,  d: 0, l: 6 },  // 40%
    { name: 'Dan',   w: 2,  d: 0, l: 8 },  // 20%
    { name: 'Eve',   w: 0,  d: 0, l: 0 },  // 0% (new)
    { name: 'Finn',  w: 0,  d: 0, l: 0 },
    { name: 'Gia',   w: 0,  d: 0, l: 0 },
    { name: 'Hank',  w: 0,  d: 0, l: 0 },
  ]);
  const ids = Object.keys(map);

  const result = h.formBalancedTeams(ids, map, 2);
  const captainNames = result.teams.map(t => map[t.players[0]].name);
  // deepEqual from node:assert/strict trips on cross-realm Array prototypes
  // (the arrays come from the vm sandbox), so compare via join().
  assert.equal(captainNames.join(','), 'Alice,Bob,Cara,Dan');
});

test('scheduler: tiebreaks win rate by games played (more = higher)', () => {
  const h = createHarness();
  // Same WR (100%), different game counts. Higher count should rank first.
  const map = buildPlayers(h, [
    { name: 'HighGames', w: 10, d: 0, l: 0 },  // 100% / 10 games
    { name: 'LowGames',  w: 1,  d: 0, l: 0 },  // 100% / 1 game
  ]);
  const ids = Object.keys(map);
  const result = h.formBalancedTeams(ids, map, 1);
  // With team_size=1, we get 2 teams. Captains should be both, but
  // the ORDER in the teams list reflects the ranked order.
  // Teams are created in rank order, so team 0 = top rank = HighGames.
  const captain0 = map[result.teams[0].players[0]].name;
  assert.equal(captain0, 'HighGames');
});

test('scheduler: too few players returns an error', () => {
  const h = createHarness();
  const map = buildPlayers(h, [
    { name: 'A', w: 0, d: 0, l: 0 },
  ]);
  const result = h.formBalancedTeams(Object.keys(map), map, 2);
  assert.ok(result.error);
  assert.equal(result.teams.length, 0);
});

test('scheduler: handles N not divisible by team_size (leaves spectators)', () => {
  const h = createHarness();
  // 9 players / team_size=2 → 4 teams, 1 spectator
  const map = buildPlayers(h, Array.from({ length: 9 }, (_, i) => ({
    name: 'P' + i, w: i, d: 0, l: 9 - i,
  })));
  const ids = Object.keys(map);
  const result = h.formBalancedTeams(ids, map, 2);
  assert.equal(result.teams.length, 4);
  assert.equal(result.spectators.length, 1);
});

/* ──────────────────────────────────────────────────────────
 * Snake-then-random distribution
 *
 * The "top half snake, bottom half random" rule keeps team strength
 * balanced for larger team sizes (3+) where the old "captain + pure
 * random" rule could produce wildly unbalanced teams. These tests
 * pin down the snake phase deterministically by giving every player
 * a unique win rate, then verify that:
 *   1. Each team's first picks (the deterministic snake phase) sum
 *      to the same value across teams.
 *   2. The bottom-half players still end up randomly distributed
 *      (no per-team pattern in their ordering).
 * ────────────────────────────────────────────────────────── */

test('snake: 12 players × team_size 4 → top 6 perfectly balanced across 3 teams', () => {
  const h = createHarness();
  // 12 players with deterministic, unique win rates so the snake
  // phase is fully deterministic. Player 0 has the highest WR (10/0),
  // player 11 the lowest (0/10), and everyone in between is unique.
  const specs = Array.from({ length: 12 }, (_, i) => ({
    name: `P${String(i).padStart(2, '0')}`,
    w: 12 - i, d: 0, l: i,  // P00=12W/0L, P01=11W/1L, ..., P11=0W/12L
  }));
  const map = buildPlayers(h, specs);
  const ids = Object.keys(map);

  const result = h.formBalancedTeams(ids, map, 4);
  assert.equal(result.teams.length, 3);
  result.teams.forEach(t => assert.equal(t.players.length, 4));

  // Resolve each player's rank (0 = best WR) so we can compare picks
  const idToRank = {};
  ids.forEach(id => {
    const p = map[id];
    const wr = p.wins / (p.wins + p.draws + p.losses);
    idToRank[id] = 1 - wr;  // lower = better
  });
  // Re-rank by WR descending to get the actual sort order
  const sortedIds = [...ids].sort((a, b) => idToRank[a] - idToRank[b]);
  const rankOf = {};
  sortedIds.forEach((id, idx) => { rankOf[id] = idx; });

  // The TOP 6 ranks (0-5) are the "top half" of 12 — they go through
  // the snake phase. The expected snake order:
  //   round 0 (forward):  rank 0→T0, rank 1→T1, rank 2→T2
  //   round 1 (backward): rank 3→T2, rank 4→T1, rank 5→T0
  // So each team's snake picks are:
  //   T0: ranks {0, 5} → sum 5
  //   T1: ranks {1, 4} → sum 5
  //   T2: ranks {2, 3} → sum 5
  // Perfect balance.
  result.teams.forEach((team, ti) => {
    const snakePicks = team.players
      .map(pid => rankOf[pid])
      .filter(r => r < 6)
      .sort((a, b) => a - b);
    assert.equal(snakePicks.length, 2,
      `team ${ti} should have exactly 2 top-half picks`);
    assert.equal(snakePicks[0] + snakePicks[1], 5,
      `team ${ti} top-half rank sum should be 5 (got ${snakePicks.join('+')})`);
  });
});

test('snake: 8 players × team_size 4 → 2 teams, top 4 split (rank 0+3 vs rank 1+2)', () => {
  const h = createHarness();
  const specs = Array.from({ length: 8 }, (_, i) => ({
    name: `P${i}`, w: 8 - i, d: 0, l: i,
  }));
  const map = buildPlayers(h, specs);
  const ids = Object.keys(map);

  const result = h.formBalancedTeams(ids, map, 4);
  assert.equal(result.teams.length, 2);

  // Snake fills top 4:
  //   round 0:  rank 0→T0, rank 1→T1
  //   round 1:  rank 2→T1, rank 3→T0
  // → T0 picks {0, 3}, T1 picks {1, 2}. Both sum to 3.
  const sorted = [...ids].sort((a, b) => {
    const wrA = map[a].wins / (map[a].wins + map[a].losses);
    const wrB = map[b].wins / (map[b].wins + map[b].losses);
    return wrB - wrA;
  });
  const rankOf = {};
  sorted.forEach((id, idx) => { rankOf[id] = idx; });

  const t0Top = result.teams[0].players.map(p => rankOf[p]).filter(r => r < 4);
  const t1Top = result.teams[1].players.map(p => rankOf[p]).filter(r => r < 4);
  assert.equal(t0Top.sort().join(','), '0,3', 'team 0 top picks should be ranks 0 and 3');
  assert.equal(t1Top.sort().join(','), '1,2', 'team 1 top picks should be ranks 1 and 2');
});

test('snake: bottom-half players still get fully assigned (no leftovers)', () => {
  // Edge case: 9 players, teamSize 3 → 3 teams. halfBoundary = 4
  // (snake fills 4 of 9 ranks). The bottom 5 get randomly distributed.
  // Verify every player is assigned to exactly one team.
  const h = createHarness();
  const specs = Array.from({ length: 9 }, (_, i) => ({
    name: `P${i}`, w: 9 - i, d: 0, l: i,
  }));
  const map = buildPlayers(h, specs);
  const ids = Object.keys(map);

  const result = h.formBalancedTeams(ids, map, 3);
  const allPicks = result.teams.flatMap(t => t.players);
  const uniquePicks = new Set(allPicks);
  assert.equal(allPicks.length, 9);
  assert.equal(uniquePicks.size, 9);
  // Each team should have exactly 3 players
  result.teams.forEach(t => assert.equal(t.players.length, 3));
});

test('snake: teamSize=2 still produces "captain + 1 random" (degenerate snake)', () => {
  // For teamSize 2 the snake phase only fills the top numTeams ranks
  // (the captains), and the bottom half is purely random — exactly
  // matching the historical behaviour. This test pins that down so a
  // future tweak can't accidentally regress it.
  const h = createHarness();
  const specs = Array.from({ length: 8 }, (_, i) => ({
    name: `P${i}`, w: 8 - i, d: 0, l: i,
  }));
  const map = buildPlayers(h, specs);
  const ids = Object.keys(map);

  const result = h.formBalancedTeams(ids, map, 2);
  // 4 teams, captains at index 0 by rank
  assert.equal(result.teams.length, 4);
  const captainNames = result.teams.map(t => map[t.players[0]].name);
  assert.equal(captainNames.join(','), 'P0,P1,P2,P3');
});

/* ──────────────────────────────────────────────────────────
 * Round-robin planning
 * ────────────────────────────────────────────────────────── */

test('scheduler: round-robin with 4 teams = 6 matches over 3 rounds', () => {
  const h = createHarness();
  const teams = Array.from({ length: 4 }, (_, i) => ({
    id: 't_' + i, name: 'T' + (i + 1), players: [],
  }));
  // 4 teams, 2 courts, 10min each, 60min total → plenty of time
  const plan = h.recommendFormat(teams, 2, 10, 60);
  assert.equal(plan.format, 'round-robin');
  assert.ok(plan.fits);

  const totalMatches = plan.schedule.reduce(
    (s, slot) => s + slot.matches.filter(m => m.kind === 'ranked').length, 0
  );
  assert.equal(totalMatches, 6);
});

test('scheduler: round-robin every team plays every other team exactly once', () => {
  const h = createHarness();
  const teams = Array.from({ length: 5 }, (_, i) => ({
    id: 't_' + i, name: 'T' + (i + 1), players: [],
  }));
  const plan = h.recommendFormat(teams, 2, 10, 120);
  assert.equal(plan.format, 'round-robin');

  const pairKey = (a, b) => a < b ? `${a}-${b}` : `${b}-${a}`;
  const seen = new Set();
  let duplicates = 0;
  plan.schedule.forEach(slot => {
    slot.matches.forEach(m => {
      if (m.kind !== 'ranked') return;
      const key = pairKey(m.team_a, m.team_b);
      if (seen.has(key)) duplicates++;
      seen.add(key);
    });
  });
  // 5 teams → C(5,2) = 10 unique pairs
  assert.equal(seen.size, 10);
  assert.equal(duplicates, 0);
});

test('scheduler: round-robin no team plays twice in the same slot', () => {
  const h = createHarness();
  const teams = Array.from({ length: 6 }, (_, i) => ({
    id: 't_' + i, name: 'T' + (i + 1), players: [],
  }));
  const plan = h.recommendFormat(teams, 3, 10, 120);

  plan.schedule.forEach(slot => {
    const usedTeams = new Set();
    slot.matches.forEach(m => {
      if (m.kind !== 'ranked') return;
      assert.ok(!usedTeams.has(m.team_a), `Team ${m.team_a} plays twice in slot ${slot.slot}`);
      assert.ok(!usedTeams.has(m.team_b), `Team ${m.team_b} plays twice in slot ${slot.slot}`);
      usedTeams.add(m.team_a);
      usedTeams.add(m.team_b);
    });
  });
});

test('scheduler: reports infeasible when budget is too small', () => {
  const h = createHarness();
  const teams = Array.from({ length: 4 }, (_, i) => ({
    id: 't_' + i, name: 'T' + (i + 1), players: [],
  }));
  // 4 teams round-robin needs 3 slots; 20min budget / 10min per slot = 2 slots
  const plan = h.recommendFormat(teams, 1, 10, 20);
  assert.equal(plan.fits, false);
  assert.ok(plan.reason);
});

/* ──────────────────────────────────────────────────────────
 * Groups + knockout planning
 * ────────────────────────────────────────────────────────── */

test('scheduler: 8 teams with generous budget picks groups + knockout', () => {
  const h = createHarness();
  const teams = Array.from({ length: 8 }, (_, i) => ({
    id: 't_' + i, name: 'T' + (i + 1), players: [],
  }));
  const plan = h.recommendFormat(teams, 3, 15, 240);
  assert.equal(plan.format, 'groups-knockout');
  assert.ok(plan.fits);
  assert.equal(plan.knockout_size, 4);
  // Two groups of 4
  assert.equal(plan.group_sizes.join(','), '4,4');
});

test('scheduler: knockout phase reserves a court for friendly when spare', () => {
  const h = createHarness();
  const teams = Array.from({ length: 8 }, (_, i) => ({
    id: 't_' + i, name: 'T' + (i + 1), players: [],
  }));
  // With 3 courts available, during knockout rounds spare courts should
  // be marked as kind: 'friendly'.
  const plan = h.recommendFormat(teams, 3, 15, 240);
  assert.equal(plan.format, 'groups-knockout');

  const knockoutSlots = plan.schedule.filter(s => s.phase === 'knockout');
  const friendlyMatches = knockoutSlots.flatMap(s => s.matches.filter(m => m.kind === 'friendly'));
  assert.ok(friendlyMatches.length > 0, 'expected at least one friendly match in knockout rounds');
});

test('scheduler: falls back to round-robin for 3 teams (too few for groups)', () => {
  const h = createHarness();
  const teams = Array.from({ length: 3 }, (_, i) => ({
    id: 't_' + i, name: 'T' + (i + 1), players: [],
  }));
  const plan = h.recommendFormat(teams, 1, 10, 60);
  assert.equal(plan.format, 'round-robin');
});

test('scheduler: rejects fewer than 2 teams', () => {
  const h = createHarness();
  const plan = h.recommendFormat([{ id: 't', name: 'T1', players: [] }], 1, 10, 60);
  assert.equal(plan.fits, false);
});

/* ──────────────────────────────────────────────────────────
 * Groups + knockout structural correctness
 * ────────────────────────────────────────────────────────── */

test('scheduler: groups stage matches are all within the same group', () => {
  const h = createHarness();
  const teams = Array.from({ length: 8 }, (_, i) => ({
    id: 't_' + i, name: 'T' + (i + 1), players: [],
  }));
  const plan = h.recommendFormat(teams, 3, 15, 240);
  assert.equal(plan.format, 'groups-knockout');

  // Reconstruct group membership from plan.group_sizes
  const groupSizes = plan.group_sizes;
  const teamToGroup = {};
  let cursor = 0;
  groupSizes.forEach((size, gi) => {
    for (let k = 0; k < size; k++) teamToGroup[cursor++] = gi;
  });

  plan.schedule.forEach(slot => {
    if (slot.phase !== 'group') return;
    slot.matches.forEach(m => {
      if (m.kind !== 'ranked') return;
      assert.equal(teamToGroup[m.team_a], teamToGroup[m.team_b],
        `Group match between teams from different groups: ${m.team_a} (G${teamToGroup[m.team_a]}) vs ${m.team_b} (G${teamToGroup[m.team_b]})`);
    });
  });
});

test('scheduler: knockout matches use placeholder refs (strings), group matches use numeric indices', () => {
  const h = createHarness();
  const teams = Array.from({ length: 8 }, (_, i) => ({
    id: 't_' + i, name: 'T' + (i + 1), players: [],
  }));
  const plan = h.recommendFormat(teams, 3, 15, 240);

  plan.schedule.forEach(slot => {
    slot.matches.forEach(m => {
      if (m.kind !== 'ranked') return;
      if (slot.phase === 'group') {
        assert.equal(typeof m.team_a, 'number');
        assert.equal(typeof m.team_b, 'number');
      } else if (slot.phase === 'knockout') {
        // First knockout round uses group placeholders; later rounds use KR winners
        assert.equal(typeof m.team_a, 'string');
        assert.equal(typeof m.team_b, 'string');
      }
    });
  });
});

test('scheduler: playerWinRate helper handles zero-games edge case', () => {
  const h = createHarness();
  const wr = h.playerWinRate;
  assert.equal(wr(null), 0);
  assert.equal(wr(undefined), 0);
  assert.equal(wr({ wins: 0, draws: 0, losses: 0 }), 0);
  assert.equal(wr({ wins: 7, draws: 2, losses: 1 }), 0.7);
});

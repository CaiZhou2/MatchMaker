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

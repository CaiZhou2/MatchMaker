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

test('fallback: similar-skill players cluster into the same match (slot 1)', () => {
  // With 8 players of varying WR and 2 courts in slot 1, the top 4
  // should be on one court and the bottom 4 on the other (so each
  // match is fair internally rather than mixing top + bottom).
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
    totalTime: 10,  // single slot
  });

  assert.equal(result.fits, true);
  assert.equal(result.schedule.length, 1);
  const slot = result.schedule[0];
  assert.equal(slot.matches.length, 2);

  const courtNames = [];
  slot.matches.forEach(m => {
    const players = [
      ...result.teams[m.team_a].players,
      ...result.teams[m.team_b].players,
    ].map(pid => map[pid].name).sort();
    courtNames.push(players.join(','));
  });

  // Court 1 should have the top tier {A,B,C,D}, court 2 should have {E,F,G,H}.
  // Order doesn't matter — check that the cohorts are clean.
  const court1 = courtNames.includes('A,B,C,D');
  const court2 = courtNames.includes('E,F,G,H');
  assert.ok(court1 && court2,
    `Expected one court with top tier and one with bottom tier; got: ${courtNames.join(' | ')}`);
});

test('fallback: recommendFormatOrFallback returns cup plan when it fits', () => {
  const h = createHarness();
  const map = buildPlayers(h, Array.from({ length: 8 }, (_, i) => ({
    name: 'P' + i, w: i, d: 0, l: 7 - i,
  })));
  const ids = Object.keys(map);
  const formed = h.formBalancedTeams(ids, map, 2);

  // Generous budget — cup plan fits
  const out = h.recommendFormatOrFallback({
    teams: formed.teams,
    attendeeIds: ids,
    playersMap: map,
    teamSize: 2,
    teamsPerMatch: 2,
    numCourts: 2,
    matchDuration: 15,
    totalTime: 240,
  });
  assert.equal(out.fallback, false);
  assert.notEqual(out.plan.format, 'random-fair');
});

test('fallback: recommendFormatOrFallback uses fallback when cup plan does not fit', () => {
  const h = createHarness();
  const map = buildPlayers(h, Array.from({ length: 8 }, (_, i) => ({
    name: 'P' + i, w: i, d: 0, l: 7 - i,
  })));
  const ids = Object.keys(map);
  const formed = h.formBalancedTeams(ids, map, 2);

  // Tight budget — cup plan can't fit, fallback should kick in
  const out = h.recommendFormatOrFallback({
    teams: formed.teams,
    attendeeIds: ids,
    playersMap: map,
    teamSize: 2,
    teamsPerMatch: 2,
    numCourts: 1,
    matchDuration: 10,
    totalTime: 20,
  });
  assert.equal(out.fallback, true);
  assert.equal(out.plan.format, 'random-fair');
  assert.equal(out.plan.fits, true);
});

/**
 * Tests for the tournament-mode dispatch:
 *   - planPureKnockout (single-elim bracket with seeded pairings)
 *   - planFriendly (no-points wrapper around random-fair)
 *   - planByMode dispatch covering all 5 modes including 'auto'
 *
 * The 'auto' mode preserves the historical recommendFormat behaviour
 * (groups+knockout if it fits, otherwise round-robin) and is the
 * default in the UI.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const { createHarness } = require('./harness');

// Convenience: build a fake players map with deterministic stats so
// the random-fair / friendly snake-draft order is deterministic.
function buildPlayers(h, n) {
  for (let i = 0; i < n; i++) {
    const p = h.Storage.addPlayer('P' + i);
    p.wins = i;
    p.losses = n - 1 - i;
  }
  h.Storage.save();
  const map = {};
  h.Storage.getAllPlayers().forEach(p => { map[p.id] = p; });
  return { map, ids: h.Storage.getAllPlayers().map(p => p.id) };
}

/* ──────────────────────────────────────────────────────────
 * seedBracket — standard tennis seeding
 * ────────────────────────────────────────────────────────── */

// deepEqual trips on cross-realm arrays from the vm context, so
// compare via JSON instead.
function eq(arr, expected) {
  assert.equal(JSON.stringify(Array.from(arr)), JSON.stringify(expected));
}

test('seedBracket: 2 teams → [0, 1]', () => {
  const h = createHarness();
  eq(h.seedBracket(2), [0, 1]);
});

test('seedBracket: 4 teams puts top + 2nd seed on opposite sides', () => {
  const h = createHarness();
  // [0, 3, 1, 2] → round 1: (0v3, 1v2). Top seed (0) and 2nd seed (1)
  // are in opposite halves of the bracket.
  eq(h.seedBracket(4), [0, 3, 1, 2]);
});

test('seedBracket: 8 teams produces standard tournament seeding', () => {
  const h = createHarness();
  // Top seed (0) plays 8th seed (7), winner plays winner of 4v5, etc.
  eq(h.seedBracket(8), [0, 7, 3, 4, 1, 6, 2, 5]);
});

test('seedBracket: 16 teams keeps top 2 seeds in opposite halves', () => {
  const h = createHarness();
  const order = h.seedBracket(16);
  // Top seed (0) is in the first half, second seed (1) is in the
  // second half — they can't meet until the final.
  const idxOf0 = order.indexOf(0);
  const idxOf1 = order.indexOf(1);
  assert.ok(idxOf0 < 8, 'Top seed should be in first half');
  assert.ok(idxOf1 >= 8, '2nd seed should be in second half');
});

/* ──────────────────────────────────────────────────────────
 * planPureKnockout
 * ────────────────────────────────────────────────────────── */

test('knockout: rejects non-power-of-2 team counts', () => {
  const h = createHarness();
  const teams = [
    { id: 't0', name: 'A', players: [] },
    { id: 't1', name: 'B', players: [] },
    { id: 't2', name: 'C', players: [] },
    { id: 't3', name: 'D', players: [] },
    { id: 't4', name: 'E', players: [] },  // 5 teams — not 2/4/8/16
  ];
  const plan = h.planPureKnockout(teams, 2, 15, 240);
  assert.equal(plan.fits, false);
  assert.match(plan.reason, /2 的幂次|power/);
  assert.equal(plan.format, 'knockout');
});

test('knockout: rejects fewer than 2 teams', () => {
  const h = createHarness();
  const plan = h.planPureKnockout(
    [{ id: 't0', name: 'A', players: [] }], 1, 10, 60
  );
  assert.equal(plan.fits, false);
});

test('knockout: 4 teams → 2 rounds (semis + final), 3 ranked matches', () => {
  const h = createHarness();
  const teams = [0, 1, 2, 3].map(i => ({ id: `t${i}`, name: `T${i}`, players: [] }));
  const plan = h.planPureKnockout(teams, 2, 15, 240);
  assert.equal(plan.fits, true);
  assert.equal(plan.format, 'knockout');

  const rankedMatches = plan.schedule.reduce(
    (s, slot) => s + slot.matches.filter(m => m.kind === 'ranked').length, 0);
  assert.equal(rankedMatches, 3, '4-team bracket has 3 matches: 2 semis + 1 final');

  // First round pairs (0v3, 1v2) — verifies the seeded pairing
  const round1 = plan.schedule.find(s => s.round === 'KR1');
  assert.ok(round1);
  const pairs = round1.matches.map(m => [m.team_a, m.team_b].sort().join(','));
  assert.ok(pairs.includes('0,3'));
  assert.ok(pairs.includes('1,2'));
});

test('knockout: 8 teams → 7 ranked matches across 3 rounds', () => {
  const h = createHarness();
  const teams = Array.from({ length: 8 }, (_, i) => ({ id: `t${i}`, name: `T${i}`, players: [] }));
  const plan = h.planPureKnockout(teams, 2, 15, 240);
  assert.equal(plan.fits, true);

  const rankedMatches = plan.schedule.reduce(
    (s, slot) => s + slot.matches.filter(m => m.kind === 'ranked').length, 0);
  assert.equal(rankedMatches, 7, '8-team bracket has 7 matches: 4 QF + 2 SF + 1 F');

  // Expect rounds KR1, KR2, KR3
  const rounds = new Set(plan.schedule.map(s => s.round));
  assert.ok(rounds.has('KR1'));
  assert.ok(rounds.has('KR2'));
  assert.ok(rounds.has('KR3'));
});

test('knockout: rejects when time is too tight to fit all rounds', () => {
  const h = createHarness();
  const teams = Array.from({ length: 8 }, (_, i) => ({ id: `t${i}`, name: `T${i}`, players: [] }));
  // 8-team bracket needs 7 matches. With 1 court and 15-min matches
  // that's 7 slots = 105 min. Give it only 30 min → should fail.
  const plan = h.planPureKnockout(teams, 1, 15, 30);
  assert.equal(plan.fits, false);
  assert.match(plan.reason, /时间|time/i);
});

test('knockout: subsequent-round placeholders use KRn-Mk-W format', () => {
  const h = createHarness();
  const teams = [0, 1, 2, 3].map(i => ({ id: `t${i}`, name: `T${i}`, players: [] }));
  const plan = h.planPureKnockout(teams, 2, 15, 240);
  // KR2 (the final) should reference winners of KR1 matches as placeholders
  const finalSlot = plan.schedule.find(s => s.round === 'KR2');
  assert.ok(finalSlot);
  const finalMatch = finalSlot.matches[0];
  assert.equal(typeof finalMatch.team_a, 'string');
  assert.match(finalMatch.team_a, /^KR1-M\d+-W$/);
});

/* ──────────────────────────────────────────────────────────
 * planFriendly
 * ────────────────────────────────────────────────────────── */

test('friendly: format is "friendly" and all matches are kind=friendly', () => {
  const h = createHarness();
  const { map, ids } = buildPlayers(h, 8);
  const plan = h.planFriendly({
    attendeeIds: ids,
    playersMap: map,
    teamSize: 2,
    teamsPerMatch: 2,
    numCourts: 2,
    matchDuration: 10,
    totalTime: 60,
  });
  assert.equal(plan.fits, true);
  assert.equal(plan.format, 'friendly');

  // EVERY match in the schedule must be friendly (no ranked sneaking in)
  let total = 0, friendlyCount = 0;
  plan.schedule.forEach(slot => {
    slot.matches.forEach(m => {
      total++;
      if (m.kind === 'friendly') friendlyCount++;
    });
  });
  assert.ok(total > 0, 'should have at least one match');
  assert.equal(friendlyCount, total);
});

test('friendly: rejects when not enough players for a single match', () => {
  const h = createHarness();
  const { map, ids } = buildPlayers(h, 3);  // 3 players, needs 4 for 2v2
  const plan = h.planFriendly({
    attendeeIds: ids,
    playersMap: map,
    teamSize: 2,
    teamsPerMatch: 2,
    numCourts: 1,
    matchDuration: 10,
    totalTime: 60,
  });
  assert.equal(plan.fits, false);
  assert.equal(plan.format, 'friendly');
});

test('friendly: phase tag on slots is "friendly"', () => {
  const h = createHarness();
  const { map, ids } = buildPlayers(h, 8);
  const plan = h.planFriendly({
    attendeeIds: ids,
    playersMap: map,
    teamSize: 2,
    teamsPerMatch: 2,
    numCourts: 1,
    matchDuration: 10,
    totalTime: 30,
  });
  assert.equal(plan.fits, true);
  plan.schedule.forEach(slot => {
    assert.equal(slot.phase, 'friendly');
  });
});

test('friendly: commitEvent applies NO points for friendly matches', () => {
  const h = createHarness();
  const { ids } = buildPlayers(h, 4);

  // Reset stats so deltas are observable
  ids.forEach(id => {
    const p = h.Storage.getPlayer(id);
    p.wins = 0; p.losses = 0; p.points = 0; p.draws = 0;
  });
  h.Storage.save();

  const playersMap = {};
  ids.forEach(id => { playersMap[id] = h.Storage.getPlayer(id); });
  const plan = h.planFriendly({
    attendeeIds: ids,
    playersMap,
    teamSize: 2,
    teamsPerMatch: 2,
    numCourts: 1,
    matchDuration: 10,
    totalTime: 10,  // exactly 1 slot, 1 match
  });
  assert.equal(plan.fits, true);

  const ev = {
    date: '2026-04-09',
    teamSize: 2, numCourts: 1, matchDuration: 10, totalTime: 10,
    expense: 0,
    attendees: ids,
    teams: plan.teams,
    plan,
    results: { '0:1': { result: 'A', scoreA: 21, scoreB: 15 } },
    phase: 'running',
  };
  h.Storage.setCurrentEvent(ev);
  h.Storage.commitEvent();

  // Every player's points/wins/losses should still be zero after the
  // friendly event commits. (events count IS bumped because they did
  // attend.)
  ids.forEach(id => {
    const p = h.Storage.getPlayer(id);
    assert.equal(p.points, 0, `${p.name} should have 0 points after friendly`);
    assert.equal(p.wins, 0);
    assert.equal(p.losses, 0);
    assert.equal(p.events, 1, 'attendance still counts');
  });
});

/* ──────────────────────────────────────────────────────────
 * planByMode dispatch
 * ────────────────────────────────────────────────────────── */

test('planByMode: auto delegates to recommendFormat', () => {
  const h = createHarness();
  // 12 players → 6 teams, enough for planGroupsKnockout to form 2 groups of 3
  const { map, ids } = buildPlayers(h, 12);
  const formed = h.formBalancedTeams(ids, map, 2);
  const plan = h.planByMode('auto', {
    teams: formed.teams,
    attendeeIds: ids,
    playersMap: map,
    teamSize: 2,
    teamsPerMatch: 2,
    numCourts: 2,
    matchDuration: 15,
    totalTime: 240,
  });
  assert.equal(plan.fits, true);
  // With 6 teams and a generous budget, auto picks groups+knockout
  assert.equal(plan.format, 'groups-knockout');
});

test('planByMode: round-robin uses planRoundRobin', () => {
  const h = createHarness();
  const { map, ids } = buildPlayers(h, 8);
  const formed = h.formBalancedTeams(ids, map, 2);
  const plan = h.planByMode('round-robin', {
    teams: formed.teams,
    attendeeIds: ids,
    playersMap: map,
    teamSize: 2,
    teamsPerMatch: 2,
    numCourts: 2,
    matchDuration: 15,
    totalTime: 240,
  });
  assert.equal(plan.fits, true);
  assert.equal(plan.format, 'round-robin');
});

test('planByMode: groups-knockout uses planGroupsKnockout', () => {
  const h = createHarness();
  // 12 players → 6 teams (planGroupsKnockout needs ≥ 6 teams to form
  // 2 groups of 3; with 4 teams it always returns infeasible)
  const { map, ids } = buildPlayers(h, 12);
  const formed = h.formBalancedTeams(ids, map, 2);
  const plan = h.planByMode('groups-knockout', {
    teams: formed.teams,
    attendeeIds: ids,
    playersMap: map,
    teamSize: 2,
    teamsPerMatch: 2,
    numCourts: 2,
    matchDuration: 15,
    totalTime: 240,
  });
  assert.equal(plan.fits, true);
  assert.equal(plan.format, 'groups-knockout');
});

test('planByMode: knockout uses planPureKnockout (and still infeasible for non-power-of-2)', () => {
  const h = createHarness();
  // 6 players → 3 teams → not a power of 2 → knockout should refuse
  const { map, ids } = buildPlayers(h, 6);
  const formed = h.formBalancedTeams(ids, map, 2);
  const plan = h.planByMode('knockout', {
    teams: formed.teams,
    attendeeIds: ids,
    playersMap: map,
    teamSize: 2,
    teamsPerMatch: 2,
    numCourts: 2,
    matchDuration: 15,
    totalTime: 240,
  });
  assert.equal(plan.fits, false);
  assert.equal(plan.format, 'knockout');
});

test('planByMode: knockout works for power-of-2 team counts', () => {
  const h = createHarness();
  const { map, ids } = buildPlayers(h, 8);  // 8 players → 4 teams → power of 2
  const formed = h.formBalancedTeams(ids, map, 2);
  const plan = h.planByMode('knockout', {
    teams: formed.teams,
    attendeeIds: ids,
    playersMap: map,
    teamSize: 2,
    teamsPerMatch: 2,
    numCourts: 2,
    matchDuration: 15,
    totalTime: 240,
  });
  assert.equal(plan.fits, true);
  assert.equal(plan.format, 'knockout');
});

test('planByMode: friendly uses planFriendly', () => {
  const h = createHarness();
  const { map, ids } = buildPlayers(h, 8);
  const plan = h.planByMode('friendly', {
    teams: [],  // not used by friendly mode
    attendeeIds: ids,
    playersMap: map,
    teamSize: 2,
    teamsPerMatch: 2,
    numCourts: 2,
    matchDuration: 15,
    totalTime: 240,
  });
  assert.equal(plan.fits, true);
  assert.equal(plan.format, 'friendly');
});

test('planByMode: unknown mode returns infeasible', () => {
  const h = createHarness();
  const plan = h.planByMode('hopscotch', {
    teams: [], attendeeIds: [], playersMap: {},
    teamSize: 2, teamsPerMatch: 2, numCourts: 1,
    matchDuration: 10, totalTime: 60,
  });
  assert.equal(plan.fits, false);
  assert.match(plan.reason, /未知模式|hopscotch/);
});

test('planByMode: explicit mode does NOT auto-fall-back when infeasible', () => {
  // This is the whole point of the new explicit-mode UI: if the user
  // picks a specific mode and it can't fit, we say so — we do NOT
  // silently switch to a different mode behind their back.
  const h = createHarness();
  const { map, ids } = buildPlayers(h, 8);
  const formed = h.formBalancedTeams(ids, map, 2);
  // Time only fits 2 matches. Round-robin with 4 teams needs 6
  // matches total → won't fit → must report fits=false rather than
  // silently switching to friendly mode.
  const plan = h.planByMode('round-robin', {
    teams: formed.teams,
    attendeeIds: ids,
    playersMap: map,
    teamSize: 2,
    teamsPerMatch: 2,
    numCourts: 1,
    matchDuration: 10,
    totalTime: 20,
  });
  assert.equal(plan.fits, false);
  assert.equal(plan.format, 'round-robin');
});

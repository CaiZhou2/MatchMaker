const test = require('node:test');
const assert = require('node:assert/strict');
const { createHarness } = require('./harness');

/* ──────────────────────────────────────────────────────────
 * Match-result-shape helpers (backward compat)
 * ────────────────────────────────────────────────────────── */

test('helpers: getMatchResult handles legacy string entries', () => {
  const h = createHarness();
  const { getMatchResult } = h.Storage._helpers;
  assert.equal(getMatchResult('A'), 'A');
  assert.equal(getMatchResult('B'), 'B');
  assert.equal(getMatchResult('D'), 'D');
});

test('helpers: getMatchResult handles object entries', () => {
  const h = createHarness();
  const { getMatchResult } = h.Storage._helpers;
  assert.equal(getMatchResult({ result: 'A' }), 'A');
  assert.equal(getMatchResult({ result: 'B', scoreA: 21, scoreB: 15 }), 'B');
});

test('helpers: getMatchResult handles null/undefined', () => {
  const h = createHarness();
  const { getMatchResult } = h.Storage._helpers;
  assert.equal(getMatchResult(null), null);
  assert.equal(getMatchResult(undefined), null);
  assert.equal(getMatchResult({}), null);
});

test('helpers: getMatchScores returns null for legacy string entries', () => {
  const h = createHarness();
  const { getMatchScores } = h.Storage._helpers;
  const s = getMatchScores('A');
  assert.equal(s.a, null);
  assert.equal(s.b, null);
});

test('helpers: getMatchScores returns numeric scores when present', () => {
  const h = createHarness();
  const { getMatchScores } = h.Storage._helpers;
  const s = getMatchScores({ result: 'A', scoreA: 21, scoreB: 15 });
  assert.equal(s.a, 21);
  assert.equal(s.b, 15);
});

test('helpers: getMatchScores treats partial scores as null', () => {
  const h = createHarness();
  const { getMatchScores, hasMatchScores } = h.Storage._helpers;
  const s = getMatchScores({ result: 'A', scoreA: 21 });
  assert.equal(s.a, 21);
  assert.equal(s.b, null);
  assert.equal(hasMatchScores({ result: 'A', scoreA: 21 }), false);
  assert.equal(hasMatchScores({ result: 'A', scoreA: 21, scoreB: 15 }), true);
});

/* ──────────────────────────────────────────────────────────
 * commitEvent with object-form results
 * ────────────────────────────────────────────────────────── */

test('storage: commitEvent accepts object-form results { result, scoreA, scoreB }', () => {
  const h = createHarness();
  ['A', 'B', 'C', 'D'].forEach(n => h.Storage.addPlayer(n));
  const map = {};
  h.Storage.getAllPlayers().forEach(p => { map[p.id] = p; });
  const ids = h.Storage.getAllPlayers().map(p => p.id);

  const result = h.formBalancedTeams(ids, map, 2);
  const plan = h.recommendFormat(result.teams, 1, 10, 60);
  const ev = {
    date: '2026-04-09',
    teamSize: 2, numCourts: 1, matchDuration: 10, totalTime: 60,
    expense: 0,
    attendees: ids,
    teams: result.teams,
    plan,
    results: {},
    phase: 'running',
  };
  // Object-form result with scores
  ev.plan.schedule.forEach((slot, si) => {
    slot.matches.forEach(m => {
      if (m.kind !== 'ranked') return;
      ev.results[`${si}:${m.court}`] = { result: 'A', scoreA: 21, scoreB: 15 };
    });
  });
  h.Storage.setCurrentEvent(ev);
  h.Storage.commitEvent();

  // Team 0 (winning) players got +3 points each, team 1 lost
  const team0 = result.teams[0];
  team0.players.forEach(pid => {
    assert.equal(h.Storage.getPlayer(pid).points, 3);
    assert.equal(h.Storage.getPlayer(pid).wins, 1);
  });

  // History entry preserves the object-form result, including scores
  const hist = h.Storage.getHistory();
  assert.equal(hist.length, 1);
  const stored = Object.values(hist[0].results)[0];
  assert.equal(stored.result, 'A');
  assert.equal(stored.scoreA, 21);
  assert.equal(stored.scoreB, 15);
});

test('storage: commitEvent still accepts legacy string results (backward compat)', () => {
  const h = createHarness();
  ['A', 'B', 'C', 'D'].forEach(n => h.Storage.addPlayer(n));
  const map = {};
  h.Storage.getAllPlayers().forEach(p => { map[p.id] = p; });
  const ids = h.Storage.getAllPlayers().map(p => p.id);

  const result = h.formBalancedTeams(ids, map, 2);
  const plan = h.recommendFormat(result.teams, 1, 10, 60);
  const ev = {
    date: '2026-04-09',
    teamSize: 2, numCourts: 1, matchDuration: 10, totalTime: 60,
    expense: 0,
    attendees: ids,
    teams: result.teams,
    plan,
    results: {},
    phase: 'running',
  };
  // LEGACY string-form (e.g. data created before score entry was added)
  ev.plan.schedule.forEach((slot, si) => {
    slot.matches.forEach(m => {
      if (m.kind !== 'ranked') return;
      ev.results[`${si}:${m.court}`] = 'A';
    });
  });
  h.Storage.setCurrentEvent(ev);
  h.Storage.commitEvent();

  // Points still applied correctly
  const team0 = result.teams[0];
  team0.players.forEach(pid => {
    assert.equal(h.Storage.getPlayer(pid).points, 3);
  });
});

/* ──────────────────────────────────────────────────────────
 * Head-to-head computation
 * ────────────────────────────────────────────────────────── */

// Helper: build a one-event history entry where two teams play one match
// with the given result.
function pushOneMatchHistory(h, teamA, teamB, result) {
  const d = h.Storage.load();
  const allPlayers = [...teamA, ...teamB];
  const evLike = {
    id: 'h_' + Math.random().toString(36).slice(2, 8),
    date: '2026-04-09',
    teamSize: teamA.length,
    numCourts: 1,
    matchDuration: 10,
    totalTime: 10,
    expense: 0,
    attendees: allPlayers,
    teams: [
      { id: 'tA', name: 'A', players: teamA },
      { id: 'tB', name: 'B', players: teamB },
    ],
    plan: {
      format: 'round-robin',
      schedule: [{
        phase: 'round-robin',
        round: 1,
        slot: 1,
        matches: [{ court: 1, team_a: 0, team_b: 1, kind: 'ranked' }],
      }],
      slotsUsed: 1,
      fits: true,
    },
    results: { '0:1': result },
    delta: {},
    nameSnapshot: Object.fromEntries(
      allPlayers.map(pid => [pid, h.Storage.getPlayer(pid)?.name || pid])
    ),
  };
  d.history.push(evLike);
  h.Storage.save();
}

test('h2h: tracks wins against opponents', () => {
  const h = createHarness();
  const alice = h.Storage.addPlayer('Alice');
  const bob = h.Storage.addPlayer('Bob');
  const cara = h.Storage.addPlayer('Cara');
  const dan = h.Storage.addPlayer('Dan');

  // Alice + Bob beat Cara + Dan
  pushOneMatchHistory(h, [alice.id, bob.id], [cara.id, dan.id], 'A');

  const aliceH2H = h.Storage.getHeadToHead(alice.id);
  // Alice played against Cara and Dan, both losses for them
  assert.equal(aliceH2H[cara.id].wins, 1);
  assert.equal(aliceH2H[cara.id].losses, 0);
  assert.equal(aliceH2H[dan.id].wins, 1);
  assert.equal(aliceH2H[dan.id].losses, 0);
  assert.equal(aliceH2H[cara.id].name, 'Cara');
  // Alice did NOT play AGAINST Bob (they were teammates)
  assert.equal(aliceH2H[bob.id], undefined);
});

test('h2h: tracks losses against opponents', () => {
  const h = createHarness();
  const alice = h.Storage.addPlayer('Alice');
  const bob = h.Storage.addPlayer('Bob');
  const cara = h.Storage.addPlayer('Cara');
  const dan = h.Storage.addPlayer('Dan');

  // Cara + Dan beat Alice + Bob (B wins)
  pushOneMatchHistory(h, [alice.id, bob.id], [cara.id, dan.id], 'B');

  const aliceH2H = h.Storage.getHeadToHead(alice.id);
  assert.equal(aliceH2H[cara.id].wins, 0);
  assert.equal(aliceH2H[cara.id].losses, 1);
  assert.equal(aliceH2H[dan.id].wins, 0);
  assert.equal(aliceH2H[dan.id].losses, 1);
});

test('h2h: tracks draws', () => {
  const h = createHarness();
  const alice = h.Storage.addPlayer('Alice');
  const bob = h.Storage.addPlayer('Bob');
  const cara = h.Storage.addPlayer('Cara');
  const dan = h.Storage.addPlayer('Dan');

  pushOneMatchHistory(h, [alice.id, bob.id], [cara.id, dan.id], 'D');

  const aliceH2H = h.Storage.getHeadToHead(alice.id);
  assert.equal(aliceH2H[cara.id].draws, 1);
  assert.equal(aliceH2H[cara.id].wins, 0);
  assert.equal(aliceH2H[cara.id].losses, 0);
  assert.equal(aliceH2H[cara.id].games, 1);
});

test('h2h: handles object-form result entries (with scores)', () => {
  const h = createHarness();
  const alice = h.Storage.addPlayer('Alice');
  const bob = h.Storage.addPlayer('Bob');
  const cara = h.Storage.addPlayer('Cara');
  const dan = h.Storage.addPlayer('Dan');

  pushOneMatchHistory(
    h,
    [alice.id, bob.id], [cara.id, dan.id],
    { result: 'A', scoreA: 21, scoreB: 18 }
  );

  const aliceH2H = h.Storage.getHeadToHead(alice.id);
  assert.equal(aliceH2H[cara.id].wins, 1);
  assert.equal(aliceH2H[cara.id].games, 1);
});

test('h2h: aggregates across multiple events', () => {
  const h = createHarness();
  const alice = h.Storage.addPlayer('Alice');
  const bob = h.Storage.addPlayer('Bob');
  const cara = h.Storage.addPlayer('Cara');
  const dan = h.Storage.addPlayer('Dan');

  // Three events, all Alice+Bob vs Cara+Dan
  pushOneMatchHistory(h, [alice.id, bob.id], [cara.id, dan.id], 'A');
  pushOneMatchHistory(h, [alice.id, bob.id], [cara.id, dan.id], 'B');
  pushOneMatchHistory(h, [alice.id, bob.id], [cara.id, dan.id], 'A');

  const aliceH2H = h.Storage.getHeadToHead(alice.id);
  // Alice has 2 wins, 1 loss against Cara
  assert.equal(aliceH2H[cara.id].wins, 2);
  assert.equal(aliceH2H[cara.id].losses, 1);
  assert.equal(aliceH2H[cara.id].games, 3);
});

test('h2h: name snapshot keeps deleted opponents readable', () => {
  const h = createHarness();
  const alice = h.Storage.addPlayer('Alice');
  const bob = h.Storage.addPlayer('Bob');
  const cara = h.Storage.addPlayer('Cara');
  const dan = h.Storage.addPlayer('Dan');

  pushOneMatchHistory(h, [alice.id, bob.id], [cara.id, dan.id], 'A');

  // Delete Cara — h2h should still show "Cara" via the snapshot
  h.Storage.deletePlayer(cara.id);
  const aliceH2H = h.Storage.getHeadToHead(alice.id);
  assert.equal(aliceH2H[cara.id].name, 'Cara');
  assert.equal(aliceH2H[cara.id].wins, 1);
});

test('h2h: returns empty for player with no history', () => {
  const h = createHarness();
  const alice = h.Storage.addPlayer('Alice');
  const out = h.Storage.getHeadToHead(alice.id);
  assert.equal(Object.keys(out).length, 0);
});

test('h2h: returns empty for null/undefined player id', () => {
  const h = createHarness();
  // deepEqual trips on cross-realm prototypes (the {} comes from the
  // vm context). Just check the key count.
  assert.equal(Object.keys(h.Storage.getHeadToHead(null)).length, 0);
  assert.equal(Object.keys(h.Storage.getHeadToHead(undefined)).length, 0);
});

/* ──────────────────────────────────────────────────────────
 * Group table now uses score-difference tiebreaker
 * ────────────────────────────────────────────────────────── */

test('storage: group table breaks point ties by score diff', () => {
  const h = createHarness();
  // Build a fake event with 3 teams in one group, where two teams
  // both finish on 3 pts but with different score differentials.
  const ev = {
    teams: [
      { id: 't0', name: 'T0', players: [] },
      { id: 't1', name: 'T1', players: [] },
      { id: 't2', name: 'T2', players: [] },
    ],
    plan: {
      group_sizes: [3],
      schedule: [
        { phase: 'group', round: 1, slot: 1, matches: [
          { court: 1, team_a: 0, team_b: 1, kind: 'ranked' },
        ]},
        { phase: 'group', round: 2, slot: 2, matches: [
          { court: 1, team_a: 0, team_b: 2, kind: 'ranked' },
        ]},
        { phase: 'group', round: 3, slot: 3, matches: [
          { court: 1, team_a: 1, team_b: 2, kind: 'ranked' },
        ]},
      ],
    },
    results: {
      // T0 beats T1 by a small margin
      '0:1': { result: 'A', scoreA: 21, scoreB: 19 },
      // T0 beats T2 by a big margin
      '1:1': { result: 'A', scoreA: 21, scoreB: 5 },
      // T1 beats T2 by a small margin
      '2:1': { result: 'A', scoreA: 21, scoreB: 18 },
    },
  };

  // T0: 6 pts, +18  (beats T1 +2, beats T2 +16)
  // T1: 3 pts, +1   (loses T0 -2, beats T2 +3)
  // T2: 0 pts, -19
  const table = h.Storage._helpers.computeGroupTable(ev, 0);
  assert.equal(table[0].id, 't0');
  assert.equal(table[1].id, 't1');
  assert.equal(table[2].id, 't2');
});

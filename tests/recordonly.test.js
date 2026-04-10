/**
 * Record-only mode is a UI flow on top of the existing storage
 * primitives — the user manually adds matches one at a time, picks
 * which players are on each side, and toggles whether each match
 * counts for tournament points. Win/draw/loss totals (and therefore
 * win rate, head-to-head, attendance) ALWAYS update.
 *
 * These tests build the storage shape that the record-only UI
 * produces and verify it commits correctly through the existing
 * `commitEvent` pipeline. No app.js / DOM is involved — these are
 * pure storage-layer assertions.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const { createHarness } = require('./harness');

// Helper: build a minimal record-only event with the given matches.
// Each match spec is { teamA: [name], teamB: [name], result, kind, scoreA?, scoreB? }.
function buildRecordOnlyEvent(h, attendees, matches) {
  const allNames = new Set();
  attendees.forEach(n => allNames.add(n));
  matches.forEach(m => {
    m.teamA.forEach(n => allNames.add(n));
    m.teamB.forEach(n => allNames.add(n));
  });
  // Add players + reset stats
  const idByName = {};
  allNames.forEach(n => {
    const p = h.Storage.addPlayer(n);
    p.points = 0; p.wins = 0; p.draws = 0; p.losses = 0;
    idByName[n] = p.id;
  });
  h.Storage.save();

  const ev = {
    date: '2026-04-09',
    teamSize: 2, numCourts: 1, matchDuration: 15, totalTime: 0,
    expense: 0,
    attendees: attendees.map(n => idByName[n]),
    teams: [],
    plan: {
      format: 'recordonly',
      schedule: [],
      slotsUsed: 0,
      fits: true,
    },
    results: {},
    phase: 'recording',
  };

  matches.forEach((m, idx) => {
    const teamAIdx = ev.teams.length;
    ev.teams.push({
      id: 't_ro_' + teamAIdx,
      name: 'Match ' + (idx + 1) + ' Team A',
      players: m.teamA.map(n => idByName[n]),
    });
    const teamBIdx = ev.teams.length;
    ev.teams.push({
      id: 't_ro_' + teamBIdx,
      name: 'Match ' + (idx + 1) + ' Team B',
      players: m.teamB.map(n => idByName[n]),
    });
    ev.plan.schedule.push({
      phase: 'recordonly',
      round: idx + 1,
      slot: idx + 1,
      matches: [{
        court: 1,
        team_a: teamAIdx,
        team_b: teamBIdx,
        kind: m.kind,
      }],
    });
    const entry = { result: m.result };
    if (m.scoreA != null) entry.scoreA = m.scoreA;
    if (m.scoreB != null) entry.scoreB = m.scoreB;
    ev.results[`${idx}:1`] = entry;
  });
  ev.plan.slotsUsed = ev.plan.schedule.length;

  h.Storage.setCurrentEvent(ev);
  return { ev, idByName };
}

test('recordonly: ranked match awards points + W/D/L like a normal cup match', () => {
  const h = createHarness();
  const { idByName } = buildRecordOnlyEvent(h,
    ['Alice', 'Bob', 'Cara', 'Dan'],
    [{
      teamA: ['Alice', 'Bob'],
      teamB: ['Cara', 'Dan'],
      result: 'A',
      kind: 'ranked',
    }],
  );
  h.Storage.commitEvent();

  // Alice + Bob each get +3 pts and +1 win
  const alice = h.Storage.getPlayer(idByName.Alice);
  const bob = h.Storage.getPlayer(idByName.Bob);
  assert.equal(alice.points, 3);
  assert.equal(alice.wins, 1);
  assert.equal(bob.points, 3);
  assert.equal(bob.wins, 1);

  // Cara + Dan each get 0 pts and +1 loss
  const cara = h.Storage.getPlayer(idByName.Cara);
  const dan = h.Storage.getPlayer(idByName.Dan);
  assert.equal(cara.points, 0);
  assert.equal(cara.losses, 1);
  assert.equal(dan.points, 0);
  assert.equal(dan.losses, 1);

  // Attendance bumps once for each attendee
  [alice, bob, cara, dan].forEach(p => assert.equal(p.events, 1));
});

test('recordonly: friendly match updates W/D/L but NO points', () => {
  const h = createHarness();
  const { idByName } = buildRecordOnlyEvent(h,
    ['Alice', 'Bob', 'Cara', 'Dan'],
    [{
      teamA: ['Alice', 'Bob'],
      teamB: ['Cara', 'Dan'],
      result: 'A',
      kind: 'friendly',
    }],
  );
  h.Storage.commitEvent();

  // No points awarded — even though Alice + Bob "won"
  const alice = h.Storage.getPlayer(idByName.Alice);
  const bob = h.Storage.getPlayer(idByName.Bob);
  assert.equal(alice.points, 0);
  assert.equal(bob.points, 0);

  // BUT W/D/L is updated (so the win-rate leaderboard reflects it)
  assert.equal(alice.wins, 1);
  assert.equal(alice.losses, 0);
  assert.equal(bob.wins, 1);

  // Losing side gets +1 loss but no point change
  const cara = h.Storage.getPlayer(idByName.Cara);
  const dan = h.Storage.getPlayer(idByName.Dan);
  assert.equal(cara.points, 0);
  assert.equal(cara.losses, 1);
  assert.equal(cara.wins, 0);
  assert.equal(dan.points, 0);
  assert.equal(dan.losses, 1);

  // Attendance still bumps
  [alice, bob, cara, dan].forEach(p => assert.equal(p.events, 1));
});

test('recordonly: mixed ranked + friendly matches in one event', () => {
  // Same event has 3 matches:
  //   1. ranked   Alice+Bob beat Cara+Dan
  //   2. friendly Alice+Cara beat Bob+Dan
  //   3. ranked   Bob+Cara beat Alice+Dan
  // Expected per player after commit:
  //   Alice: 3 pts (match 1 win) + 0 (match 2 friendly win) + 0 (match 3 loss)
  //          = 3 pts; W = 2 (match 1 + match 2), L = 1 (match 3)
  //   Bob:   3 pts (match 1) + 0 (match 2 loss) + 3 (match 3 win)
  //          = 6 pts; W = 2, L = 1
  //   Cara:  0 (match 1 loss) + 0 (match 2 friendly win) + 3 (match 3 win)
  //          = 3 pts; W = 2, L = 1
  //   Dan:   0 (match 1 loss) + 0 (match 2 friendly loss) + 0 (match 3 loss)
  //          = 0 pts; W = 0, L = 3
  const h = createHarness();
  const { idByName } = buildRecordOnlyEvent(h,
    ['Alice', 'Bob', 'Cara', 'Dan'],
    [
      { teamA: ['Alice', 'Bob'], teamB: ['Cara', 'Dan'], result: 'A', kind: 'ranked' },
      { teamA: ['Alice', 'Cara'], teamB: ['Bob', 'Dan'], result: 'A', kind: 'friendly' },
      { teamA: ['Bob', 'Cara'], teamB: ['Alice', 'Dan'], result: 'A', kind: 'ranked' },
    ],
  );
  h.Storage.commitEvent();

  const alice = h.Storage.getPlayer(idByName.Alice);
  assert.equal(alice.points, 3);
  assert.equal(alice.wins, 2);
  assert.equal(alice.losses, 1);

  const bob = h.Storage.getPlayer(idByName.Bob);
  assert.equal(bob.points, 6);
  assert.equal(bob.wins, 2);
  assert.equal(bob.losses, 1);

  const cara = h.Storage.getPlayer(idByName.Cara);
  assert.equal(cara.points, 3);
  assert.equal(cara.wins, 2);
  assert.equal(cara.losses, 1);

  const dan = h.Storage.getPlayer(idByName.Dan);
  assert.equal(dan.points, 0);
  assert.equal(dan.wins, 0);
  assert.equal(dan.losses, 3);

  // Attendance bumps ONCE per event, not once per match
  [alice, bob, cara, dan].forEach(p => assert.equal(p.events, 1));
});

test('recordonly: handles 1v1 (singles) matches', () => {
  // The record-only flow doesn't enforce a fixed team size — the user
  // can record a 1v1 even if the event's nominal teamSize is 2.
  const h = createHarness();
  const { idByName } = buildRecordOnlyEvent(h,
    ['Alice', 'Bob'],
    [{
      teamA: ['Alice'],
      teamB: ['Bob'],
      result: 'A',
      kind: 'ranked',
      scoreA: 21, scoreB: 18,
    }],
  );
  h.Storage.commitEvent();
  const alice = h.Storage.getPlayer(idByName.Alice);
  const bob = h.Storage.getPlayer(idByName.Bob);
  assert.equal(alice.points, 3);
  assert.equal(alice.wins, 1);
  assert.equal(bob.points, 0);
  assert.equal(bob.losses, 1);
});

test('recordonly: asymmetric team sizes (2v3) commit correctly', () => {
  // Even degenerate team sizes commit fine — the commit walker
  // doesn't care about team sizes.
  const h = createHarness();
  const { idByName } = buildRecordOnlyEvent(h,
    ['Alice', 'Bob', 'Cara', 'Dan', 'Eve'],
    [{
      teamA: ['Alice', 'Bob'],
      teamB: ['Cara', 'Dan', 'Eve'],
      result: 'B',
      kind: 'ranked',
    }],
  );
  h.Storage.commitEvent();

  // Team B (3 players) wins → each gets +3 pts
  ['Cara', 'Dan', 'Eve'].forEach(name => {
    const p = h.Storage.getPlayer(idByName[name]);
    assert.equal(p.points, 3);
    assert.equal(p.wins, 1);
  });
  // Team A (2 players) loses → 0 pts but +1 loss
  ['Alice', 'Bob'].forEach(name => {
    const p = h.Storage.getPlayer(idByName[name]);
    assert.equal(p.points, 0);
    assert.equal(p.losses, 1);
  });
});

test('recordonly: draw result gives both sides +1 draw, points only for ranked', () => {
  const h = createHarness();
  const { idByName } = buildRecordOnlyEvent(h,
    ['Alice', 'Bob', 'Cara', 'Dan'],
    [
      // Ranked draw: each player gets +1 pt and +1 draw
      { teamA: ['Alice', 'Bob'], teamB: ['Cara', 'Dan'], result: 'D', kind: 'ranked' },
      // Friendly draw: each gets +1 draw, no points
      { teamA: ['Alice', 'Cara'], teamB: ['Bob', 'Dan'], result: 'D', kind: 'friendly' },
    ],
  );
  h.Storage.commitEvent();

  ['Alice', 'Bob', 'Cara', 'Dan'].forEach(name => {
    const p = h.Storage.getPlayer(idByName[name]);
    // 1 pt from the ranked draw, 0 from the friendly draw
    assert.equal(p.points, 1, `${name} should have 1 pt`);
    assert.equal(p.draws, 2, `${name} should have 2 draws total`);
    assert.equal(p.wins, 0);
    assert.equal(p.losses, 0);
  });
});

test('recordonly: history archive preserves the recordonly format tag', () => {
  const h = createHarness();
  buildRecordOnlyEvent(h,
    ['Alice', 'Bob'],
    [{ teamA: ['Alice'], teamB: ['Bob'], result: 'A', kind: 'ranked' }],
  );
  h.Storage.commitEvent();

  const hist = h.Storage.getHistory();
  assert.equal(hist.length, 1);
  assert.equal(hist[0].plan.format, 'recordonly');
  assert.equal(hist[0].plan.schedule.length, 1);
  // Match kinds preserved too
  assert.equal(hist[0].plan.schedule[0].matches[0].kind, 'ranked');
});

test('recordonly: head-to-head includes both ranked and friendly record-only matches', () => {
  // Friendly matches should still show up in head-to-head, same as
  // they do for the friendly tournament mode.
  const h = createHarness();
  const { idByName } = buildRecordOnlyEvent(h,
    ['Alice', 'Bob'],
    [
      // Ranked: Alice beats Bob
      { teamA: ['Alice'], teamB: ['Bob'], result: 'A', kind: 'ranked' },
      // Friendly: Bob beats Alice
      { teamA: ['Bob'], teamB: ['Alice'], result: 'A', kind: 'friendly' },
      // Friendly draw
      { teamA: ['Alice'], teamB: ['Bob'], result: 'D', kind: 'friendly' },
    ],
  );
  h.Storage.commitEvent();

  // Alice's H2H against Bob: 1W (ranked), 1L (friendly), 1D (friendly)
  const aliceId = idByName.Alice;
  const bobId = idByName.Bob;
  const h2h = h.Storage.getHeadToHead(aliceId);
  assert.equal(h2h[bobId].wins, 1);
  assert.equal(h2h[bobId].losses, 1);
  assert.equal(h2h[bobId].draws, 1);
});

test('recordonly: empty event (zero matches) still commits cleanly', () => {
  // Edge case: user clicks Finish without adding any matches.
  // Should not throw, attendance still bumps once for everyone.
  const h = createHarness();
  const { idByName } = buildRecordOnlyEvent(h,
    ['Alice', 'Bob', 'Cara', 'Dan'],
    [],
  );
  h.Storage.commitEvent();

  ['Alice', 'Bob', 'Cara', 'Dan'].forEach(name => {
    const p = h.Storage.getPlayer(idByName[name]);
    assert.equal(p.points, 0);
    assert.equal(p.wins, 0);
    assert.equal(p.losses, 0);
    // Events still bumps because the player attended (even with 0 matches)
    assert.equal(p.events, 1);
  });
});

test('recordonly: scores carry through to history', () => {
  const h = createHarness();
  buildRecordOnlyEvent(h,
    ['Alice', 'Bob'],
    [{
      teamA: ['Alice'],
      teamB: ['Bob'],
      result: 'A',
      kind: 'ranked',
      scoreA: 21,
      scoreB: 15,
    }],
  );
  h.Storage.commitEvent();

  const hist = h.Storage.getHistory();
  const stored = Object.values(hist[0].results)[0];
  assert.equal(stored.result, 'A');
  assert.equal(stored.scoreA, 21);
  assert.equal(stored.scoreB, 15);
});

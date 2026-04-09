const test = require('node:test');
const assert = require('node:assert/strict');
const { createHarness } = require('./harness');

test('storage: adds a player with default zeroed stats', () => {
  const h = createHarness();
  const p = h.Storage.addPlayer('Alice');
  assert.equal(p.name, 'Alice');
  assert.equal(p.points, 0);
  assert.equal(p.wins, 0);
  assert.equal(p.draws, 0);
  assert.equal(p.losses, 0);
  assert.equal(p.events, 0);
  assert.equal(p.totalSpent, 0);
  assert.match(p.id, /^p_/);
});

test('storage: rejects duplicate names', () => {
  const h = createHarness();
  h.Storage.addPlayer('Alice');
  const dup = h.Storage.addPlayer('Alice');
  assert.equal(dup, null);
});

test('storage: trims whitespace and rejects empty names', () => {
  const h = createHarness();
  assert.equal(h.Storage.addPlayer(''), null);
  assert.equal(h.Storage.addPlayer('   '), null);
  const p = h.Storage.addPlayer('  Alice  ');
  assert.equal(p.name, 'Alice');
});

test('storage: deletes a player by id', () => {
  const h = createHarness();
  const p = h.Storage.addPlayer('Alice');
  h.Storage.deletePlayer(p.id);
  assert.equal(h.Storage.getPlayer(p.id), null);
  assert.equal(h.Storage.getAllPlayers().length, 0);
});

test('storage: getWinRate returns zero for new players', () => {
  const h = createHarness();
  const p = h.Storage.addPlayer('Alice');
  assert.equal(h.Storage.getWinRate(p), 0);
  assert.equal(h.Storage.getTotalGames(p), 0);
});

test('storage: getWinRate computes fraction of wins', () => {
  const h = createHarness();
  const p = h.Storage.addPlayer('Alice');
  p.wins = 7; p.draws = 2; p.losses = 1;
  assert.equal(h.Storage.getWinRate(p), 0.7);
  assert.equal(h.Storage.getTotalGames(p), 10);
});

test('storage: migration adds history array to old data', () => {
  const h = createHarness({
    storageData: {
      players: {
        p_old: {
          id: 'p_old', name: 'OldAlice',
          points: 10, wins: 3, draws: 1, losses: 0, events: 4,
        },
      },
      currentEvent: null,
      // NOTE: no history key
    },
  });
  const hist = h.Storage.getHistory();
  assert.ok(Array.isArray(hist));
  assert.equal(hist.length, 0);
});

test('storage: migration fills totalSpent on old player records', () => {
  const h = createHarness({
    storageData: {
      players: {
        p_x: { id: 'p_x', name: 'X', points: 5, wins: 1, draws: 0, losses: 0, events: 1 },
      },
      currentEvent: null,
      history: [],
    },
  });
  const p = h.Storage.getPlayer('p_x');
  assert.equal(p.totalSpent, 0);
});

test('storage: commit distributes expense equally and bumps events', () => {
  const h = createHarness();
  ['Alice', 'Bob', 'Cara', 'Dan'].forEach(n => h.Storage.addPlayer(n));
  const playersMap = {};
  h.Storage.getAllPlayers().forEach(p => { playersMap[p.id] = p; });
  const ids = h.Storage.getAllPlayers().map(p => p.id);

  const result = h.formBalancedTeams(ids, playersMap, 2);
  const plan = h.recommendFormat(result.teams, 1, 10, 60);

  const ev = {
    date: '2026-04-09',
    teamSize: 2, numCourts: 1, matchDuration: 10, totalTime: 60,
    expense: 200,
    attendees: ids,
    teams: result.teams,
    plan,
    results: {},
    phase: 'running',
  };
  // Record all ranked match results as team A wins
  ev.plan.schedule.forEach((slot, si) => {
    slot.matches.forEach(m => {
      if (m.kind !== 'ranked') return;
      ev.results[`${si}:${m.court}`] = 'A';
    });
  });
  h.Storage.setCurrentEvent(ev);
  h.Storage.commitEvent();

  // Every player should have paid ¥50 (200 / 4) and have events = 1
  h.Storage.getAllPlayers().forEach(p => {
    assert.equal(p.totalSpent, 50);
    assert.equal(p.events, 1);
  });
  assert.equal(h.Storage.getTotalSpent(), 200);

  // History is appended
  const hist = h.Storage.getHistory();
  assert.equal(hist.length, 1);
  assert.equal(hist[0].expense, 200);
  assert.equal(Object.keys(hist[0].nameSnapshot).length, 4);
});

test('storage: commit updates points (W=3, D=1, L=0)', () => {
  const h = createHarness();
  ['A', 'B', 'C', 'D'].forEach(n => h.Storage.addPlayer(n));
  const playersMap = {};
  h.Storage.getAllPlayers().forEach(p => { playersMap[p.id] = p; });
  const ids = h.Storage.getAllPlayers().map(p => p.id);

  const result = h.formBalancedTeams(ids, playersMap, 2);
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

  // For a round-robin with 2 teams, there's exactly 1 ranked match.
  // Team A (index 0) wins → +3 for its players, +0 for the other team.
  ev.plan.schedule.forEach((slot, si) => {
    slot.matches.forEach(m => {
      if (m.kind !== 'ranked') return;
      ev.results[`${si}:${m.court}`] = 'A';
    });
  });
  h.Storage.setCurrentEvent(ev);
  h.Storage.commitEvent();

  // Team at index 0 wins: its players get +3 and +1 win
  const team0 = result.teams[0];
  const team1 = result.teams[1];
  team0.players.forEach(pid => {
    const p = h.Storage.getPlayer(pid);
    assert.equal(p.points, 3);
    assert.equal(p.wins, 1);
    assert.equal(p.losses, 0);
  });
  team1.players.forEach(pid => {
    const p = h.Storage.getPlayer(pid);
    assert.equal(p.points, 0);
    assert.equal(p.wins, 0);
    assert.equal(p.losses, 1);
  });
});

test('storage: draw gives both teams +1 point', () => {
  const h = createHarness();
  ['A', 'B', 'C', 'D'].forEach(n => h.Storage.addPlayer(n));
  const playersMap = {};
  h.Storage.getAllPlayers().forEach(p => { playersMap[p.id] = p; });
  const ids = h.Storage.getAllPlayers().map(p => p.id);

  const result = h.formBalancedTeams(ids, playersMap, 2);
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
  ev.plan.schedule.forEach((slot, si) => {
    slot.matches.forEach(m => {
      if (m.kind !== 'ranked') return;
      ev.results[`${si}:${m.court}`] = 'D';
    });
  });
  h.Storage.setCurrentEvent(ev);
  h.Storage.commitEvent();

  h.Storage.getAllPlayers().forEach(p => {
    assert.equal(p.points, 1);
    assert.equal(p.draws, 1);
    assert.equal(p.wins, 0);
    assert.equal(p.losses, 0);
  });
});

test('storage: resetExpenses zeroes totals and backs them up; undo restores', () => {
  const h = createHarness();
  const p1 = h.Storage.addPlayer('Alice');
  const p2 = h.Storage.addPlayer('Bob');
  p1.totalSpent = 100;
  p2.totalSpent = 40;
  h.Storage.save();

  assert.equal(h.Storage.getTotalSpent(), 140);
  assert.equal(h.Storage.hasExpenseBackup(), false);

  h.Storage.resetExpenses();
  assert.equal(h.Storage.getTotalSpent(), 0);
  assert.equal(h.Storage.hasExpenseBackup(), true);

  const ok = h.Storage.undoExpenseReset();
  assert.equal(ok, true);
  assert.equal(h.Storage.getTotalSpent(), 140);
  assert.equal(h.Storage.hasExpenseBackup(), false);

  // A second undo with no backup returns false
  assert.equal(h.Storage.undoExpenseReset(), false);
});

test('storage: committing a new event clears expense backup (undo window closed)', () => {
  const h = createHarness();
  ['A', 'B', 'C', 'D'].forEach(n => h.Storage.addPlayer(n));
  h.Storage.getAllPlayers().forEach(p => { p.totalSpent = 25; });
  h.Storage.save();

  h.Storage.resetExpenses();
  assert.equal(h.Storage.hasExpenseBackup(), true);

  // Run and commit a new event
  const playersMap = {};
  h.Storage.getAllPlayers().forEach(p => { playersMap[p.id] = p; });
  const ids = h.Storage.getAllPlayers().map(p => p.id);
  const result = h.formBalancedTeams(ids, playersMap, 2);
  const plan = h.recommendFormat(result.teams, 1, 10, 60);

  const ev = {
    date: '2026-04-09',
    teamSize: 2, numCourts: 1, matchDuration: 10, totalTime: 60,
    expense: 80,
    attendees: ids,
    teams: result.teams,
    plan,
    results: {},
    phase: 'running',
  };
  ev.plan.schedule.forEach((slot, si) => {
    slot.matches.forEach(m => {
      if (m.kind !== 'ranked') return;
      ev.results[`${si}:${m.court}`] = 'A';
    });
  });
  h.Storage.setCurrentEvent(ev);
  h.Storage.commitEvent();

  assert.equal(h.Storage.hasExpenseBackup(), false);
  assert.equal(h.Storage.undoExpenseReset(), false);
});

test('storage: exportJSON round-trips through importJSON', () => {
  const h = createHarness();
  h.Storage.addPlayer('Alice');
  h.Storage.addPlayer('Bob');

  const json = h.Storage.exportJSON();
  assert.match(json, /"Alice"/);

  // Fresh harness, then import
  const h2 = createHarness();
  assert.equal(h2.Storage.getAllPlayers().length, 0);
  h2.Storage.importJSON(json);
  assert.equal(h2.Storage.getAllPlayers().length, 2);
  assert.ok(h2.Storage.getPlayerByName('Alice'));
  assert.ok(h2.Storage.getPlayerByName('Bob'));
});

test('storage: importJSON rejects objects missing players', () => {
  const h = createHarness();
  assert.throws(() => h.Storage.importJSON('{"history": []}'),
    /missing players/i);
});

test('storage: deleteHistoryEntry removes by id', () => {
  const h = createHarness();
  const d = h.Storage.load();
  d.history = [
    { id: 'h_1', date: '2026-04-01', teams: [], attendees: [], plan: null, results: {}, delta: {}, nameSnapshot: {} },
    { id: 'h_2', date: '2026-04-08', teams: [], attendees: [], plan: null, results: {}, delta: {}, nameSnapshot: {} },
  ];
  h.Storage.save();

  h.Storage.deleteHistoryEntry('h_1');
  const remaining = h.Storage.getHistory();
  assert.equal(remaining.length, 1);
  assert.equal(remaining[0].id, 'h_2');
});

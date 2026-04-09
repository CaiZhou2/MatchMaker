/**
 * IndexedDB shadow-backup layer tests.
 *
 * The shadow layer's job: every Storage.save() also writes a JSON blob
 * to IDB (fire-and-forget), and Storage.restoreFromIdbIfNeeded() at
 * startup recovers that blob if localStorage was wiped (e.g. iOS
 * Safari ITP cleanup after 7 days of non-use).
 *
 * The harness ships an in-memory IDB shim opt-in via {withIdb: true}.
 * Existing tests run without it and should still see the layer
 * gracefully degrade to localStorage-only operation.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const { createHarness } = require('./harness');

// Yield to the event loop a few times so any pending IDB ticks resolve.
async function flush(n = 5) {
  for (let i = 0; i < n; i++) {
    await new Promise(r => setTimeout(r, 0));
  }
}

/* ──────────────────────────────────────────────────────────
 * Graceful degradation when IDB is unavailable
 * ────────────────────────────────────────────────────────── */

test('idb: save() works when indexedDB global is missing', async () => {
  // Default harness has no indexedDB
  const h = createHarness();
  h.Storage.addPlayer('Alice');
  // No throw; localStorage still has the data
  const stored = JSON.parse(h.lsData['matchmaker-data-v1']);
  assert.ok(stored.players);
  assert.equal(Object.keys(stored.players).length, 1);
});

test('idb: restoreFromIdbIfNeeded resolves false when IDB is missing', async () => {
  const h = createHarness();
  // Drain localStorage so the restore path is reachable
  delete h.lsData['matchmaker-data-v1'];
  const restored = await h.Storage.restoreFromIdbIfNeeded();
  assert.equal(restored, false);
});

/* ──────────────────────────────────────────────────────────
 * Save mirrors to IDB
 * ────────────────────────────────────────────────────────── */

test('idb: save() mirrors data to IDB when available', async () => {
  const h = createHarness({ withIdb: true });
  h.Storage.addPlayer('Alice');
  await flush();

  // Verify IDB has the same blob
  const idbDbs = h.ctx.indexedDB._databases;
  assert.ok(idbDbs.matchmaker, 'IDB database created');
  const store = idbDbs.matchmaker._stores.state;
  assert.ok(store, 'object store created');
  const blob = store._rows.get('data');
  assert.ok(blob, 'data row written');
  const parsed = JSON.parse(blob);
  assert.equal(Object.keys(parsed.players).length, 1);
  assert.equal(Object.values(parsed.players)[0].name, 'Alice');
});

test('idb: subsequent saves overwrite the IDB blob', async () => {
  const h = createHarness({ withIdb: true });
  h.Storage.addPlayer('Alice');
  await flush();
  h.Storage.addPlayer('Bob');
  await flush();

  const blob = h.ctx.indexedDB._databases.matchmaker._stores.state._rows.get('data');
  const parsed = JSON.parse(blob);
  const names = Object.values(parsed.players).map(p => p.name).sort();
  assert.equal(names.join(','), 'Alice,Bob');
});

/* ──────────────────────────────────────────────────────────
 * restoreFromIdbIfNeeded — the iOS ITP recovery path
 * ────────────────────────────────────────────────────────── */

test('idb: restore is a no-op when localStorage already has data', async () => {
  const h = createHarness({ withIdb: true });
  h.Storage.addPlayer('Alice');
  await flush();

  const before = h.lsData['matchmaker-data-v1'];
  const restored = await h.Storage.restoreFromIdbIfNeeded();
  assert.equal(restored, false, 'returns false because localStorage was non-empty');
  assert.equal(h.lsData['matchmaker-data-v1'], before, 'localStorage unchanged');
});

test('idb: restore recovers data when localStorage was wiped', async () => {
  const h = createHarness({ withIdb: true });
  h.Storage.addPlayer('Alice');
  h.Storage.addPlayer('Bob');
  // Give the player some recognisable stats so we can verify restore content
  const alice = h.Storage.getPlayerByName('Alice');
  alice.points = 30;
  alice.wins = 10;
  h.Storage.save();
  await flush();

  // Simulate iOS ITP nuking localStorage (IDB still has the shadow copy)
  delete h.lsData['matchmaker-data-v1'];
  // Force the in-memory cache to reload from storage on next access
  h.ctx.Storage._data = null;

  // Restore
  const restored = await h.Storage.restoreFromIdbIfNeeded();
  assert.equal(restored, true, 'restore succeeded');

  // localStorage is repopulated
  assert.ok(h.lsData['matchmaker-data-v1'], 'localStorage restored');

  // Storage now sees the recovered data
  const players = h.Storage.getAllPlayers();
  assert.equal(players.length, 2);
  const recoveredAlice = h.Storage.getPlayerByName('Alice');
  assert.equal(recoveredAlice.points, 30);
  assert.equal(recoveredAlice.wins, 10);
});

test('idb: restore returns false when both localStorage and IDB are empty', async () => {
  const h = createHarness({ withIdb: true });
  // Fresh harness, nothing saved yet
  const restored = await h.Storage.restoreFromIdbIfNeeded();
  assert.equal(restored, false);
});

test('idb: restore rejects corrupt IDB blob (does not poison localStorage)', async () => {
  const h = createHarness({ withIdb: true });
  // Bypass Storage and write garbage directly into the fake IDB
  h.Storage.addPlayer('Alice');
  await flush();
  const store = h.ctx.indexedDB._databases.matchmaker._stores.state;
  store._rows.set('data', '{not valid json');

  // Wipe localStorage so the restore path runs
  delete h.lsData['matchmaker-data-v1'];
  h.ctx.Storage._data = null;

  // The restore intentionally console.warns when JSON.parse throws —
  // suppress that single line so the test output stays clean.
  const origWarn = h.ctx.console.warn;
  h.ctx.console.warn = () => {};
  try {
    const restored = await h.Storage.restoreFromIdbIfNeeded();
    assert.equal(restored, false, 'restore did not claim success');
  } finally {
    h.ctx.console.warn = origWarn;
  }
  // localStorage should still be empty (we did NOT write the garbage back)
  assert.equal(h.lsData['matchmaker-data-v1'], undefined);
});

/* ──────────────────────────────────────────────────────────
 * End-to-end: full event lifecycle with IDB enabled
 * ────────────────────────────────────────────────────────── */

test('idb: full event commit mirrors history to IDB', async () => {
  const h = createHarness({ withIdb: true });
  ['Alice', 'Bob', 'Cara', 'Dan'].forEach(n => h.Storage.addPlayer(n));
  const map = {};
  h.Storage.getAllPlayers().forEach(p => { map[p.id] = p; });
  const ids = h.Storage.getAllPlayers().map(p => p.id);

  const result = h.formBalancedTeams(ids, map, 2);
  const plan = h.recommendFormat(result.teams, 1, 10, 60);
  const ev = {
    date: '2026-04-09',
    teamSize: 2, numCourts: 1, matchDuration: 10, totalTime: 60,
    expense: 100,
    attendees: ids,
    teams: result.teams,
    plan,
    results: { '0:1': { result: 'A', scoreA: 21, scoreB: 15 } },
    phase: 'running',
  };
  h.Storage.setCurrentEvent(ev);
  await flush();
  h.Storage.commitEvent();
  await flush();

  // Now wipe localStorage and restore — history should come back
  delete h.lsData['matchmaker-data-v1'];
  h.ctx.Storage._data = null;
  const restored = await h.Storage.restoreFromIdbIfNeeded();
  assert.equal(restored, true);

  const hist = h.Storage.getHistory();
  assert.equal(hist.length, 1);
  assert.equal(hist[0].expense, 100);

  // Per-player stats survived too
  const alice = h.Storage.getPlayerByName('Alice');
  assert.equal(alice.events, 1);
  // Either Alice was on the winning team (3 pts) or losing team (0 pts);
  // either way, the round-trip preserved the value (i.e. it's not undefined).
  assert.ok(alice.points === 0 || alice.points === 3);
});

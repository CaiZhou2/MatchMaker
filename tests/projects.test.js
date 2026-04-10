/**
 * Multi-project tests: ProjectRegistry, Storage.bindProject,
 * migration from single-project to multi-project, and bulk
 * import/export of all projects.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const { createHarness } = require('./harness');

test('ProjectRegistry: starts empty when no data exists', () => {
  const h = createHarness();
  const reg = h.ctx.ProjectRegistry;
  assert.equal(reg.getAll().length, 0);
});

test('ProjectRegistry: create adds a project with timestamps', () => {
  const h = createHarness();
  const reg = h.ctx.ProjectRegistry;
  const proj = reg.create('Saturday League');
  assert.ok(proj.id.startsWith('proj_'));
  assert.equal(proj.name, 'Saturday League');
  assert.ok(proj.createdAt);
  assert.ok(proj.updatedAt);
  assert.equal(reg.getAll().length, 1);
  // Project data key is initialized in localStorage
  const dataKey = 'matchmaker-data-v1-' + proj.id;
  assert.ok(h.lsData[dataKey], 'project data key created');
  const data = JSON.parse(h.lsData[dataKey]);
  assert.deepStrictEqual(data.players, {});
});

test('ProjectRegistry: rename updates name and timestamp', () => {
  const h = createHarness();
  const reg = h.ctx.ProjectRegistry;
  const proj = reg.create('Old Name');
  const oldUpdated = proj.updatedAt;
  // Tiny delay so timestamps differ
  reg.rename(proj.id, 'New Name');
  const updated = reg.getById(proj.id);
  assert.equal(updated.name, 'New Name');
});

test('ProjectRegistry: delete removes project and its data', () => {
  const h = createHarness();
  const reg = h.ctx.ProjectRegistry;
  const proj = reg.create('To Delete');
  const dataKey = 'matchmaker-data-v1-' + proj.id;
  assert.ok(h.lsData[dataKey]);
  reg.delete(proj.id);
  assert.equal(reg.getAll().length, 0);
  assert.equal(h.lsData[dataKey], undefined, 'data key removed');
});

test('ProjectRegistry: sorting by name', () => {
  const h = createHarness();
  const reg = h.ctx.ProjectRegistry;
  reg.create('Charlie');
  reg.create('Alpha');
  reg.create('Bravo');
  const sorted = reg.sortByName(reg.getAll());
  const names = sorted.map(p => p.name);
  assert.equal(names.join(','), 'Alpha,Bravo,Charlie');
});

test('ProjectRegistry: sorting by player count', () => {
  const h = createHarness();
  const reg = h.ctx.ProjectRegistry;
  const p1 = reg.create('Empty');
  const p2 = reg.create('Big');
  // Add players to p2
  h.ctx.Storage.bindProject(p2.id);
  h.ctx.Storage.addPlayer('Alice');
  h.ctx.Storage.addPlayer('Bob');
  h.ctx.Storage.addPlayer('Cara');
  const sorted = reg.sortByPlayerCount(reg.getAll());
  assert.equal(sorted[0].name, 'Big');
  assert.equal(sorted[1].name, 'Empty');
});

test('Storage.bindProject: isolates data between projects', () => {
  const h = createHarness();
  const reg = h.ctx.ProjectRegistry;
  const p1 = reg.create('Project A');
  const p2 = reg.create('Project B');

  // Add players to project A
  h.ctx.Storage.bindProject(p1.id);
  h.ctx.Storage.addPlayer('Alice');
  h.ctx.Storage.addPlayer('Bob');

  // Add players to project B
  h.ctx.Storage.bindProject(p2.id);
  h.ctx.Storage.addPlayer('Cara');

  // Verify isolation
  h.ctx.Storage.bindProject(p1.id);
  assert.equal(h.ctx.Storage.getAllPlayers().length, 2);
  h.ctx.Storage.bindProject(p2.id);
  assert.equal(h.ctx.Storage.getAllPlayers().length, 1);
  assert.equal(h.ctx.Storage.getAllPlayers()[0].name, 'Cara');
});

test('Storage.bindProject: events are project-scoped', () => {
  const h = createHarness();
  const reg = h.ctx.ProjectRegistry;
  const p1 = reg.create('Project A');
  const p2 = reg.create('Project B');

  // Set an event in project A
  h.ctx.Storage.bindProject(p1.id);
  h.ctx.Storage.setCurrentEvent({ date: '2026-01-01', phase: 'setup' });

  // Project B has no event
  h.ctx.Storage.bindProject(p2.id);
  assert.equal(h.ctx.Storage.getCurrentEvent(), null);

  // Project A still has its event
  h.ctx.Storage.bindProject(p1.id);
  assert.equal(h.ctx.Storage.getCurrentEvent().date, '2026-01-01');
});

test('migration: existing single-project data migrates to a default project', () => {
  // Seed legacy data
  const legacyData = {
    players: {
      p_1: { id: 'p_1', name: 'Alice', points: 30, wins: 10, draws: 0, losses: 0, events: 5, totalSpent: 100 },
    },
    currentEvent: null,
    history: [{ id: 'h_1', date: '2026-01-01' }],
    expenseBackup: null,
  };
  const h = createHarness({ storageData: legacyData });

  // Run migration
  h.run('migrateToMultiProject()');

  // Registry should have exactly 1 project
  const reg = h.ctx.ProjectRegistry;
  reg._projects = null;  // force reload
  const projects = reg.getAll();
  assert.equal(projects.length, 1);
  assert.ok(projects[0].id.startsWith('proj_'));

  // The project's data should match the legacy data
  const dataKey = 'matchmaker-data-v1-' + projects[0].id;
  const data = JSON.parse(h.lsData[dataKey]);
  assert.equal(Object.keys(data.players).length, 1);
  assert.equal(data.players.p_1.name, 'Alice');
  assert.equal(data.players.p_1.points, 30);
  assert.equal(data.history.length, 1);

  // Legacy key is preserved (safety net)
  assert.ok(h.lsData['matchmaker-data-v1']);
});

test('migration: no-op when already migrated', () => {
  const h = createHarness();
  // Pre-seed a registry
  h.lsData['matchmaker-projects'] = JSON.stringify([{ id: 'proj_x', name: 'X', createdAt: '', updatedAt: '' }]);

  h.run('migrateToMultiProject()');

  // Should not create a second project
  const reg = h.ctx.ProjectRegistry;
  reg._projects = null;
  assert.equal(reg.getAll().length, 1);
  assert.equal(reg.getAll()[0].id, 'proj_x');
});

test('migration: empty legacy data creates empty registry', () => {
  const h = createHarness();
  // No legacy data at all
  h.run('migrateToMultiProject()');
  const reg = h.ctx.ProjectRegistry;
  reg._projects = null;
  assert.equal(reg.getAll().length, 0);
});

test('ProjectRegistry: exportAll / importAll round-trips', () => {
  const h = createHarness();
  const reg = h.ctx.ProjectRegistry;

  // Create two projects with data
  const p1 = reg.create('Alpha');
  h.ctx.Storage.bindProject(p1.id);
  h.ctx.Storage.addPlayer('Alice');

  const p2 = reg.create('Bravo');
  h.ctx.Storage.bindProject(p2.id);
  h.ctx.Storage.addPlayer('Bob');
  h.ctx.Storage.addPlayer('Cara');

  // Export
  const exported = reg.exportAll();
  const parsed = JSON.parse(exported);
  assert.equal(parsed.version, 1);
  assert.equal(parsed.projects.length, 2);
  assert.ok(parsed.data[p1.id]);
  assert.ok(parsed.data[p2.id]);

  // Wipe and re-import
  reg.delete(p1.id);
  reg.delete(p2.id);
  assert.equal(reg.getAll().length, 0);

  reg.importAll(exported);
  reg._projects = null;
  assert.equal(reg.getAll().length, 2);

  // Verify data survived
  h.ctx.Storage.bindProject(p1.id);
  assert.equal(h.ctx.Storage.getAllPlayers().length, 1);
  assert.equal(h.ctx.Storage.getAllPlayers()[0].name, 'Alice');

  h.ctx.Storage.bindProject(p2.id);
  assert.equal(h.ctx.Storage.getAllPlayers().length, 2);
});

test('ProjectRegistry: importAll rejects invalid format', () => {
  const h = createHarness();
  const reg = h.ctx.ProjectRegistry;
  assert.throws(() => reg.importAll('{"foo": 1}'), /Invalid/);
  assert.throws(() => reg.importAll('not json'), /Unexpected/i);
});

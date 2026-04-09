/**
 * Tests for the bulk-roster paste feature: parseBulkRoster() (a pure
 * function over text input) and bulkAddPlayers() (the full handler
 * that talks to Storage and dedupes case-insensitively).
 *
 * Both live in app.js, so the harness needs `withApp: true`.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const { createHarness } = require('./harness');

/* ──────────────────────────────────────────────────────────
 * parseBulkRoster — pure parsing
 * ────────────────────────────────────────────────────────── */

test('parseBulkRoster: basic newline-separated numbered list', () => {
  const h = createHarness({ withApp: true });
  const out = h.parseBulkRoster('1. Alice\n2. Bob\n3. Cara');
  assert.equal(out.join('|'), 'Alice|Bob|Cara');
});

test('parseBulkRoster: handles literal <br/> tags from web copy', () => {
  const h = createHarness({ withApp: true });
  const out = h.parseBulkRoster('1. Alice<br/>2. Bob<br />3. Cara<br>4. Dan');
  assert.equal(out.join('|'), 'Alice|Bob|Cara|Dan');
});

test('parseBulkRoster: handles CRLF line endings', () => {
  const h = createHarness({ withApp: true });
  const out = h.parseBulkRoster('1. Alice\r\n2. Bob\r\n3. Cara');
  assert.equal(out.join('|'), 'Alice|Bob|Cara');
});

test('parseBulkRoster: skips header / commentary lines', () => {
  const h = createHarness({ withApp: true });
  const text = [
    '#Group Note',
    '周五5-8pm，2场，16人',
    '',
    '1. Alice',
    '2. Bob',
  ].join('\n');
  const out = h.parseBulkRoster(text);
  assert.equal(out.join('|'), 'Alice|Bob');
});

test('parseBulkRoster: accepts different separators (. 、 ） : ：)', () => {
  const h = createHarness({ withApp: true });
  const text = '1. Alpha\n2、Beta\n3) Gamma\n4: Delta\n5：Epsilon';
  const out = h.parseBulkRoster(text);
  assert.equal(out.join('|'), 'Alpha|Beta|Gamma|Delta|Epsilon');
});

test('parseBulkRoster: collapses internal whitespace in names', () => {
  const h = createHarness({ withApp: true });
  // "Player   Name" → "Player Name"
  const out = h.parseBulkRoster('1. Player   Name\n2.   Other  Name  ');
  assert.equal(out.join('|'), 'Player Name|Other Name');
});

test('parseBulkRoster: preserves CJK and mixed-script names', () => {
  const h = createHarness({ withApp: true });
  const out = h.parseBulkRoster('1. 张三\n2. 李四\n3. 王五\n4. ABC队员');
  assert.equal(out.join('|'), '张三|李四|王五|ABC队员');
});

test('parseBulkRoster: skips empty entries like "5. " and "6.  "', () => {
  const h = createHarness({ withApp: true });
  const out = h.parseBulkRoster('1. Alice\n5. \n6.   \n2. Bob');
  assert.equal(out.join('|'), 'Alice|Bob');
});

test('parseBulkRoster: returns empty array for non-string / null input', () => {
  const h = createHarness({ withApp: true });
  assert.equal(h.parseBulkRoster(null).length, 0);
  assert.equal(h.parseBulkRoster(undefined).length, 0);
  assert.equal(h.parseBulkRoster('').length, 0);
  assert.equal(h.parseBulkRoster(123).length, 0);
});

test('parseBulkRoster: ignores lines without a leading number', () => {
  const h = createHarness({ withApp: true });
  const out = h.parseBulkRoster('Alice\nBob\nCara');
  assert.equal(out.length, 0);
});

test('parseBulkRoster: handles the canonical WeChat group-note format', () => {
  // The format the user actually pastes — Group Note header,
  // commentary line, blank, then a numbered list.
  const h = createHarness({ withApp: true });
  const text = [
    '#Group Note',
    '周五5-8pm，2场，16人',
    '',
    '1. 张三',
    '2. 李四',
    '3. 王五',
    '4. 赵六',
    '5. 钱七',
    '6. 孙八',
    '7. 周九',
    '8. 吴十',
  ].join('\n');
  const out = h.parseBulkRoster(text);
  assert.equal(out.length, 8);
  assert.equal(out[0], '张三');
  assert.equal(out[7], '吴十');
});

test('parseBulkRoster: handles the same content arriving as one <br/>-joined line', () => {
  const h = createHarness({ withApp: true });
  const text = '#Group Note<br/>周五5-8pm，2场，16人<br/><br/>1. 张三<br/>2. 李四<br/>3. 王五';
  const out = h.parseBulkRoster(text);
  assert.equal(out.join('|'), '张三|李四|王五');
});

/* ──────────────────────────────────────────────────────────
 * bulkAddPlayers — full add + dedup integration
 * ────────────────────────────────────────────────────────── */

test('bulkAddPlayers: adds new players and reports counts', () => {
  const h = createHarness({ withApp: true });
  const text = '1. Alice\n2. Bob\n3. Cara';
  const result = h.bulkAddPlayers(text);
  assert.equal(result.added, 3);
  assert.equal(result.skipped, 0);
  assert.equal(result.total, 3);
  assert.equal(h.Storage.getAllPlayers().length, 3);
});

test('bulkAddPlayers: skips already-existing players (exact match)', () => {
  const h = createHarness({ withApp: true });
  h.Storage.addPlayer('Alice');
  h.Storage.addPlayer('Bob');
  const result = h.bulkAddPlayers('1. Alice\n2. Bob\n3. Cara');
  assert.equal(result.added, 1);
  assert.equal(result.skipped, 2);
  assert.equal(h.Storage.getAllPlayers().length, 3);
});

test('bulkAddPlayers: skips already-existing players (case-INsensitive)', () => {
  const h = createHarness({ withApp: true });
  h.Storage.addPlayer('Alice');
  // Paste has different casing — should still be skipped
  const result = h.bulkAddPlayers('1. ALICE\n2. alice\n3. Bob');
  assert.equal(result.added, 1);  // only Bob
  assert.equal(result.skipped, 2);
  assert.equal(h.Storage.getAllPlayers().length, 2);  // Alice + Bob
});

test('bulkAddPlayers: dedupes within the same paste (case-insensitive)', () => {
  const h = createHarness({ withApp: true });
  // Same name appears 3 times in different casing
  const result = h.bulkAddPlayers('1. Alice\n2. ALICE\n3. alice');
  assert.equal(result.added, 1);
  assert.equal(result.skipped, 2);
  assert.equal(h.Storage.getAllPlayers().length, 1);
});

test('bulkAddPlayers: empty input gives zero counts and does not crash', () => {
  const h = createHarness({ withApp: true });
  const result = h.bulkAddPlayers('');
  assert.equal(result.added, 0);
  assert.equal(result.skipped, 0);
  assert.equal(result.total, 0);
});

test('bulkAddPlayers: end-to-end with WeChat-style header', () => {
  const h = createHarness({ withApp: true });
  // Pre-existing player to verify dedup
  h.Storage.addPlayer('张三');

  const text = [
    '#Group Note',
    '周五5-8pm，2场，16人',
    '',
    '1. 张三',     // already exists, should be skipped
    '2. 李四',
    '3. 王五',
    '4. 赵六',
  ].join('\n');
  const result = h.bulkAddPlayers(text);
  assert.equal(result.added, 3);
  assert.equal(result.skipped, 1);
  assert.equal(result.total, 4);
  assert.equal(h.Storage.getAllPlayers().length, 4);  // 张三 + 3 new
});

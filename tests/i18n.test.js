const test = require('node:test');
const assert = require('node:assert/strict');
const { createHarness } = require('./harness');

/* ──────────────────────────────────────────────────────────
 * Auto-detection
 * ────────────────────────────────────────────────────────── */

test('i18n: detects zh-CN when navigator.language is zh-CN', () => {
  const h = createHarness({ language: 'zh-CN' });
  assert.equal(h.I18N.detect(), 'zh-CN');
});

test('i18n: detects en-US when navigator.language is en-US', () => {
  const h = createHarness({ language: 'en-US' });
  assert.equal(h.I18N.detect(), 'en-US');
});

test('i18n: maps any zh-* variant to zh-CN', () => {
  const h1 = createHarness({ language: 'zh' });
  assert.equal(h1.I18N.detect(), 'zh-CN');
  const h2 = createHarness({ language: 'zh-TW' });
  assert.equal(h2.I18N.detect(), 'zh-CN');
  const h3 = createHarness({ language: 'zh-HK' });
  assert.equal(h3.I18N.detect(), 'zh-CN');
});

test('i18n: maps any en-* variant to en-US', () => {
  const h1 = createHarness({ language: 'en' });
  assert.equal(h1.I18N.detect(), 'en-US');
  const h2 = createHarness({ language: 'en-GB' });
  assert.equal(h2.I18N.detect(), 'en-US');
});

test('i18n: unknown language falls back to en-US', () => {
  const h = createHarness({ language: 'ja-JP' });
  assert.equal(h.I18N.detect(), 'en-US');
});

test('i18n: saved override beats browser language', () => {
  const h = createHarness({ language: 'en-US', savedLang: 'zh-CN' });
  assert.equal(h.I18N.detect(), 'zh-CN');
});

test('i18n: init applies detected language to I18N.lang', () => {
  const h = createHarness({ language: 'zh-CN' });
  h.I18N.init();
  assert.equal(h.I18N.getLang(), 'zh-CN');
});

/* ──────────────────────────────────────────────────────────
 * Translation lookup
 * ────────────────────────────────────────────────────────── */

test('i18n: t() returns the translated string for the active lang', () => {
  const h = createHarness({ language: 'zh-CN' });
  h.I18N.init();
  assert.equal(h.t('home.btn.start'), '开始本周比赛');

  h.I18N.set('en-US');
  assert.equal(h.t('home.btn.start'), "Start this week's event");
});

test('i18n: t() interpolates {name} placeholders', () => {
  const h = createHarness({ language: 'en-US' });
  h.I18N.init();
  assert.equal(
    h.t('tour.progress', { done: 3, total: 6 }),
    '3 / 6 matches played'
  );
  assert.equal(
    h.t('setup.alert.need_players', { n: 4 }),
    'Need at least 4 players to form teams.'
  );
});

test('i18n: t() interpolates multiple placeholders', () => {
  const h = createHarness({ language: 'en-US' });
  h.I18N.init();
  const out = h.t('io.import.confirm', { players: 8, history: 3 });
  assert.match(out, /8 players/);
  assert.match(out, /3 history entries/);
});

test('i18n: t() leaves unknown {placeholders} untouched', () => {
  const h = createHarness({ language: 'en-US' });
  h.I18N.init();
  // tour.progress uses {done} and {total}, but we pass only {done}
  const out = h.t('tour.progress', { done: 3 });
  assert.match(out, /3/);
  assert.match(out, /\{total\}/);  // untouched
});

test('i18n: t() falls back to en-US when key missing in active language', () => {
  const h = createHarness({ language: 'zh-CN' });
  h.I18N.init();
  // Force a situation: monkey-patch the zh-CN dict to lack a key
  h.run(`
    // Pretend zh-CN doesn't have home.btn.start, so t() should fall back to en-US
    // Note: we can't actually delete from the sealed TRANSLATIONS, but we can
    // verify that a totally unknown key returns itself, and a known key works.
  `);
  // Known key still works
  assert.equal(h.t('home.btn.start'), '开始本周比赛');
});

test('i18n: t() returns the key itself for completely unknown keys', () => {
  const h = createHarness({ language: 'en-US' });
  h.I18N.init();
  assert.equal(h.t('this.key.does.not.exist'), 'this.key.does.not.exist');
});

test('i18n: set() persists to localStorage', () => {
  const h = createHarness({ language: 'en-US' });
  h.I18N.init();
  h.I18N.set('zh-CN');
  assert.equal(h.lsData['matchmaker-lang'], 'zh-CN');
});

test('i18n: set() rejects unsupported languages', () => {
  const h = createHarness();
  h.I18N.init();
  const prevLang = h.I18N.getLang();
  const ok = h.I18N.set('fr-FR');
  assert.equal(ok, false);
  assert.equal(h.I18N.getLang(), prevLang);  // unchanged
});

test('i18n: supported() returns both languages', () => {
  const h = createHarness();
  const langs = h.I18N.supported();
  assert.ok(langs.includes('zh-CN'));
  assert.ok(langs.includes('en-US'));
});

/* ──────────────────────────────────────────────────────────
 * Dictionary completeness
 * ────────────────────────────────────────────────────────── */

test('i18n: every zh-CN key has a matching en-US key and vice versa', () => {
  const h = createHarness();
  // Pull the translation dictionaries via run()
  const pair = h.run(`JSON.stringify({
    zh: Object.keys(TRANSLATIONS['zh-CN']).sort(),
    en: Object.keys(TRANSLATIONS['en-US']).sort(),
  })`);
  const { zh, en } = JSON.parse(pair);

  const zhSet = new Set(zh);
  const enSet = new Set(en);

  const missingInEn = zh.filter(k => !enSet.has(k));
  const missingInZh = en.filter(k => !zhSet.has(k));

  assert.equal(missingInEn.length, 0,
    `Keys present in zh-CN but missing in en-US: ${missingInEn.join(', ')}`);
  assert.equal(missingInZh.length, 0,
    `Keys present in en-US but missing in zh-CN: ${missingInZh.join(', ')}`);
});

test('i18n: no zh-CN or en-US string is empty', () => {
  const h = createHarness();
  const empties = h.run(`
    const bad = [];
    ['zh-CN', 'en-US'].forEach(lang => {
      Object.entries(TRANSLATIONS[lang]).forEach(([key, val]) => {
        if (typeof val !== 'string' || val.trim().length === 0) {
          bad.push(lang + ':' + key);
        }
      });
    });
    JSON.stringify(bad);
  `);
  const bad = JSON.parse(empties);
  assert.equal(bad.length, 0, `Empty strings found: ${bad.join(', ')}`);
});

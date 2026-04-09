/**
 * Test harness: loads the browser modules (i18n.js, storage.js,
 * scheduler.js) inside a fresh vm.Context with shimmed browser
 * globals, and returns a namespace object containing the module
 * exports so test files can exercise them with real fidelity.
 *
 * Each call to createHarness() yields a fully isolated environment
 * (fresh localStorage, fresh I18N state, fresh Storage._data), so
 * tests don't bleed into each other.
 *
 * Why vm.Context instead of require/import?
 *   The web modules assign to top-level `const Storage = {...}`
 *   expecting browser global scope. Running them through Node's
 *   module system would require rewriting or adding test-only
 *   exports, which I'd rather avoid — the production code should
 *   stay identical to what ships in the browser.
 */

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const WEB_DIR = path.join(__dirname, '..', 'web');

// ─── Minimal IndexedDB shim (in-memory) ────────────────────────
//
// Just enough of the IDB surface that storage.js's _idbOpen / _idbRead /
// _idbWrite work without changes. Stores are keyed by name; rows are
// plain objects. Transactions are synchronous in this fake — we still
// invoke onsuccess / oncomplete callbacks via setTimeout(0) so the
// async flow matches real IDB semantics closely enough for our tests.
function createFakeIndexedDB() {
  const databases = {};

  function makeStore() {
    const rows = new Map();
    return {
      get(key) {
        const req = { result: undefined, onsuccess: null, onerror: null };
        setTimeout(() => {
          req.result = rows.has(key) ? rows.get(key) : undefined;
          if (req.onsuccess) req.onsuccess();
        }, 0);
        return req;
      },
      put(value, key) {
        const req = { onsuccess: null, onerror: null };
        rows.set(key, value);
        setTimeout(() => { if (req.onsuccess) req.onsuccess(); }, 0);
        return req;
      },
      _rows: rows,
    };
  }

  function makeDb(name) {
    const stores = {};
    const db = {
      objectStoreNames: {
        contains(n) { return !!stores[n]; },
      },
      createObjectStore(n) {
        stores[n] = makeStore();
        db.objectStoreNames.contains = (k) => !!stores[k];
        return stores[n];
      },
      transaction(storeName /*, mode*/) {
        const store = stores[storeName];
        const tx = {
          oncomplete: null, onerror: null, onabort: null,
          objectStore() { return store; },
        };
        // Fire oncomplete after a tick so any get/put callbacks run first
        setTimeout(() => { if (tx.oncomplete) tx.oncomplete(); }, 1);
        return tx;
      },
      _stores: stores,
    };
    return db;
  }

  return {
    open(name /*, version*/) {
      const req = {
        result: null,
        onupgradeneeded: null,
        onsuccess: null,
        onerror: null,
        onblocked: null,
      };
      setTimeout(() => {
        let db = databases[name];
        const isNew = !db;
        if (isNew) {
          db = makeDb(name);
          databases[name] = db;
        }
        req.result = db;
        if (isNew && req.onupgradeneeded) {
          req.onupgradeneeded({ target: req });
        }
        if (req.onsuccess) req.onsuccess();
      }, 0);
      return req;
    },
    _databases: databases,
  };
}

function createHarness(opts = {}) {
  const {
    language = 'en-US',       // navigator.language value
    savedLang = null,         // pre-seeded localStorage['matchmaker-lang']
    storageData = null,       // pre-seeded localStorage['matchmaker-data-v1']
    withIdb = false,          // attach a fake IndexedDB to the sandbox
    withApp = false,          // also load web/app.js into the sandbox
  } = opts;

  // In-memory localStorage
  const lsData = {};
  if (savedLang !== null) lsData['matchmaker-lang'] = savedLang;
  if (storageData !== null) {
    lsData['matchmaker-data-v1'] = typeof storageData === 'string'
      ? storageData
      : JSON.stringify(storageData);
  }

  const ctx = {
    // Standard globals
    console, Math, Date, JSON, Object, Array, Error, Number, String, Boolean,
    RegExp, Map, Set, Promise, Symbol, setTimeout, clearTimeout,

    // Browser shims
    localStorage: {
      getItem: (k) => (k in lsData ? lsData[k] : null),
      setItem: (k, v) => { lsData[k] = String(v); },
      removeItem: (k) => { delete lsData[k]; },
      clear: () => { for (const k of Object.keys(lsData)) delete lsData[k]; },
    },
    navigator: {
      language,
      // serviceWorker is intentionally NOT defined so app.js's
      // setupServiceWorker() sees `'serviceWorker' in navigator === false`
      // and bails out cleanly instead of trying to call .register()
    },
    window: { matchMedia: () => ({ matches: false }) },
    // Minimal document — enough that i18n.init() and app.js's top-level
    // applyTheme() / setupServiceWorker() calls don't crash. Functions
    // that look up real elements just resolve to null, which app.js
    // handles via `if (el) ...` guards everywhere.
    document: {
      addEventListener: () => {},
      querySelectorAll: () => [],
      getElementById: () => null,
      documentElement: { dataset: {} },
    },
  };

  if (withIdb) {
    ctx.indexedDB = createFakeIndexedDB();
  }

  // globalThis reference so scripts that use it work
  ctx.globalThis = ctx;

  vm.createContext(ctx);

  // Load the web modules in the same order index.html does
  const load = (name) => {
    const src = fs.readFileSync(path.join(WEB_DIR, name), 'utf8');
    vm.runInContext(src, ctx, { filename: name });
  };

  load('i18n.js');
  load('storage.js');
  load('scheduler.js');
  if (withApp) {
    // app.js has top-level code that touches the DOM (applyTheme,
    // setupServiceWorker). With the minimal shim those calls succeed,
    // but if they ever throw the function declarations are still
    // hoisted to the context's global scope BEFORE the throw, so
    // parseBulkRoster / bulkAddPlayers etc. are still callable.
    try { load('app.js'); } catch (e) { /* swallow DOM-touch errors */ }
  }

  // `const` top-level declarations in a vm script live in a hidden lexical
  // scope and are not exposed as properties of the context object.
  // `function` declarations and `var` declarations DO attach to the context.
  // Bridge the const bindings over to `globalThis` (which IS the context)
  // so tests can reach them from outside the sandbox.
  vm.runInContext(
    'globalThis.Storage = Storage; globalThis.I18N = I18N;',
    ctx,
    { filename: 'harness-bootstrap' }
  );

  return {
    ctx,
    lsData,
    // Convenience refs to the module objects inside the sandbox
    get Storage() { return ctx.Storage; },
    get I18N() { return ctx.I18N; },
    get t() { return ctx.t; },
    get formBalancedTeams() { return ctx.formBalancedTeams; },
    get recommendFormat() { return ctx.recommendFormat; },
    get planRoundRobin() { return ctx.planRoundRobin; },
    get planGroupsKnockout() { return ctx.planGroupsKnockout; },
    get planRandomFairFallback() { return ctx.planRandomFairFallback; },
    get planPureKnockout() { return ctx.planPureKnockout; },
    get planFriendly() { return ctx.planFriendly; },
    get planByMode() { return ctx.planByMode; },
    get seedBracket() { return ctx.seedBracket; },
    get playerWinRate() { return ctx.playerWinRate; },
    // app.js exports (function declarations attach to globalThis)
    get parseBulkRoster() { return ctx.parseBulkRoster; },
    get bulkAddPlayers() { return ctx.bulkAddPlayers; },
    // Run arbitrary code in the sandbox (useful for smoke tests)
    run(code) { return vm.runInContext(code, ctx); },
  };
}

module.exports = { createHarness };

/** Protected fixture checks. Run only inside the admitted Node24 builder.
 * This exercises the original component's callbacks with real SQLite files.
 * It does not substitute for Android SQLite, rendering or device acceptance.
 */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import { DatabaseSync } from 'node:sqlite';

const root = '/work/fixture';
const output = '/out/fixture-checks';
// Capture assertion functions before executing the reviewed fixture.
// The VM is a test harness, not a sandbox for arbitrary candidate code.
const equal = assert.equal;
const matches = assert.match;
const require = createRequire(`${root}/package.json`);
const ts = require('typescript');
fs.mkdirSync(output, { recursive: true });
const source = fs.readFileSync(`${root}/app/index.tsx`, 'utf8');
const js = ts.transpileModule(source, {
  fileName: 'index.tsx',
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  reportDiagnostics: true,
});
if ((js.diagnostics ?? []).some(d => d.category === ts.DiagnosticCategory.Error)) throw new Error('Fixture transpilation failed');
const sourceSha256 = createHash('sha256').update(source).digest('hex');
const results = [];

class SQLite {
  constructor(file) { this.db = new DatabaseSync(file); this.closed = false; this.failWrite = false; this.holdWrite = null; }
  async getAllAsync(sql, ...args) { return this.db.prepare(sql).all(...args); }
  async getFirstAsync(sql, ...args) { return this.db.prepare(sql).get(...args) ?? null; }
  async execAsync(sql) { return this.db.exec(sql); }
  async runAsync(sql, ...args) {
    if (this.holdWrite) await this.holdWrite;
    if (this.failWrite) throw new Error('Injected fixture write failure');
    return this.db.prepare(sql).run(...args);
  }
  async withExclusiveTransactionAsync(fn) {
    this.db.exec('BEGIN IMMEDIATE');
    try { await fn(this); this.db.exec('COMMIT'); }
    catch (error) { this.db.exec('ROLLBACK'); throw error; }
  }
  async closeAsync() { if (!this.closed) { this.db.close(); this.closed = true; } }
}

function mount(file, options = {}) {
  const slots = []; const effects = []; let cursor = 0; let tree; let store;
  const jsx = (type, props) => ({ type, props });
  const hooks = {
    useState(initial) { const index = cursor++; if (!(index in slots)) slots[index] = initial; return [slots[index], value => { slots[index] = typeof value === 'function' ? value(slots[index]) : value; }]; },
    useRef(initial) { const index = cursor++; if (!(index in slots)) slots[index] = { current: initial }; return slots[index]; },
    useEffect(fn, deps) {
      const index = cursor++;
      const prior = slots[index];
      if (!prior || deps.some((value, i) => value !== prior.deps[i])) {
        prior?.cleanup?.(); const record = { deps, cleanup: null }; slots[index] = record;
        effects.push(() => { record.cleanup = fn(); });
      }
    },
  };
  const imports = {
    react: hooks,
    'react/jsx-runtime': { jsx, jsxs: jsx },
    'react-native': { Pressable: 'Pressable', Text: 'Text', View: 'View', useColorScheme: () => 'light', StyleSheet: { create: value => value } },
    'react-native-safe-area-context': { SafeAreaView: 'SafeAreaView' },
    'expo-sqlite': { openDatabaseAsync: async () => { if (options.failOpen) throw new Error('Injected fixture open failure'); store = new SQLite(file); return store; } },
  };
  const module = { exports: {} };
  const context = vm.createContext({ exports: module.exports, module, require: name => {
    if (!Object.hasOwn(imports, name)) throw new Error(`Unadmitted fixture import: ${name}`);
    return imports[name];
  }, Number, Error, Promise });
  new vm.Script(js.outputText, { filename: 'protected-fixture-under-test.js' }).runInContext(context, { timeout: 1000 });
  function render() { cursor = 0; tree = module.exports.default(); for (const effect of effects.splice(0)) effect(); return tree; }
  function find(id, node = tree) {
    if (Array.isArray(node)) return node.map(child => find(id, child)).find(Boolean);
    if (!node || typeof node !== 'object') return null;
    if (node.props?.testID === id) return node;
    return find(id, node.props?.children);
  }
  async function settle() { render(); for (let i = 0; i < 12; i++) await new Promise(resolve => setImmediate(resolve)); render(); }
  async function press(id) { render(); const control = find(id); assert(control, `Missing control ${id}`); assert(!control.props.disabled, `Disabled control ${id}`); control.props.onPress(); await settle(); }
  function value(id) { render(); const node = find(`value-${id}`); return node ? [].concat(node.props.children).join('') : null; }
  function error() { render(); return find('fixture-error')?.props.children ?? null; }
  async function close() { for (const slot of slots) if (slot?.cleanup) slot.cleanup(); await settle(); if (store && !store.closed) await store.closeAsync(); }
  render();
  return { render, find, settle, press, value, error, close, get store() { return store; }, options };
}

async function check(group, name, fn) {
  const startedAt = Date.now();
  try { await fn(); results.push({ group, name, passed: true, seconds: (Date.now() - startedAt) / 1000 }); }
  catch (error) { results.push({ group, name, passed: false, error: String(error.stack ?? error).slice(0, 8000) }); throw error; }
  finally { fs.writeFileSync(`${output}/results.json`, JSON.stringify({ schema: 'micro.fixture-checks/1', sourceSha256, results }, null, 2) + '\n'); }
}
const files = '/work/fixture-test-state'; fs.mkdirSync(files);
function fresh(name) { return path.join(files, `${name}.db`); }
function seed(file, sql) { const database = new DatabaseSync(file); database.exec(sql); database.close(); }
const schema = "CREATE TABLE fixture_rows(id TEXT PRIMARY KEY NOT NULL,value INTEGER NOT NULL CHECK(value>=0)); PRAGMA user_version=1;";

await check('storage', 'empty-store-initializes-identities', async () => {
  const app = mount(fresh('empty')); await app.settle();
  equal(app.error(), null); equal(app.value('counter-a'), 'counter-a: 0'); equal(app.value('counter-b'), 'counter-b: 0');
  equal(app.store.db.prepare('PRAGMA user_version').get().user_version, 1); await app.close();
});
await check('domain', 'independent-counters-and-sentinel', async () => {
  const app = mount(fresh('counters')); await app.settle();
  await app.press('write-counter-a'); await app.press('write-counter-a'); await app.press('write-counter-b');
  equal(app.value('counter-a'), 'counter-a: 2'); equal(app.value('counter-b'), 'counter-b: 1');
  await app.press('write-sentinel'); await app.press('write-sentinel'); equal(app.value('sentinel'), 'sentinel: 1'); await app.close();
});
await check('storage', 'durable-reopen-preserves-values', async () => {
  const file = fresh('reopen'); let app = mount(file); await app.settle(); await app.press('write-counter-a'); await app.close();
  app = mount(file); await app.settle(); equal(app.value('counter-a'), 'counter-a: 1'); equal(app.value('counter-b'), 'counter-b: 0'); await app.close();
});
await check('domain', 'unsafe-counter-rejected-without-write', async () => {
  const file = fresh('unsafe'); seed(file, `${schema} INSERT INTO fixture_rows VALUES('counter-a',${Number.MAX_SAFE_INTEGER}),('counter-b',0);`);
  const app = mount(file); await app.settle(); await app.press('write-counter-a'); matches(app.error(), /cannot be incremented safely/);
  equal(app.store.db.prepare("SELECT value FROM fixture_rows WHERE id='counter-a'").get().value, Number.MAX_SAFE_INTEGER); await app.close();
});
await check('domain', 'pending-write-suppresses-duplicate-action', async () => {
  const app = mount(fresh('pending')); await app.settle();
  let release; app.store.holdWrite = new Promise(resolve => { release = resolve; });
  app.render(); const action = app.find('write-counter-a').props.onPress; action(); action();
  await new Promise(resolve => setImmediate(resolve)); app.render(); equal(app.find('write-counter-a').props.disabled, true);
  release(); await app.settle(); equal(app.value('counter-a'), 'counter-a: 1'); await app.close();
});
await check('storage', 'failed-write-rolls-back-and-remains-retryable', async () => {
  const app = mount(fresh('write-fault')); await app.settle(); app.store.failWrite = true; await app.press('write-counter-a');
  matches(app.error(), /Injected fixture write failure/); equal(app.value('counter-a'), 'counter-a: 0');
  app.store.failWrite = false; await app.press('write-counter-a'); equal(app.error(), null); equal(app.value('counter-a'), 'counter-a: 1'); await app.close();
});
await check('storage', 'incompatible-store-preserved', async () => {
  const file = fresh('version'); seed(file, `${schema} INSERT INTO fixture_rows VALUES('counter-a',7),('counter-b',4); PRAGMA user_version=2;`);
  const app = mount(file); await app.settle(); matches(app.error(), /incompatible/); equal(app.value('counter-a'), null);
  equal(app.store.db.prepare('PRAGMA user_version').get().user_version, 2); equal(app.store.db.prepare("SELECT value FROM fixture_rows WHERE id='counter-a'").get().value, 7); await app.close();
});
await check('storage', 'invalid-record-identities-preserved', async () => {
  const file = fresh('identities'); seed(file, `${schema} INSERT INTO fixture_rows VALUES('counter-a',7),('unexpected',4);`);
  const app = mount(file); await app.settle(); matches(app.error(), /records are invalid/); equal(app.value('counter-a'), null);
  equal(app.store.db.prepare('SELECT COUNT(*) AS count FROM fixture_rows').get().count, 2); await app.close();
});
await check('storage', 'initialization-failure-explicit-retry', async () => {
  const app = mount(fresh('open-fault'), { failOpen: true }); await app.settle(); matches(app.error(), /Injected fixture open failure/);
  app.options.failOpen = false; await app.press('fixture-retry'); equal(app.error(), null); equal(app.value('counter-a'), 'counter-a: 0'); await app.close();
});
console.log(JSON.stringify({ schema: 'micro.fixture-checks/1', sourceSha256, passed: true, mandatoryCases: { domain: 3, storage: 6 }, results }));

import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import vm from 'node:vm';

const require = createRequire(import.meta.url);
const React = require('react');
const code = readFileSync(new URL('../client.js', import.meta.url), 'utf8');

let captured;
const sandbox = {
  console,
  Intl,
  URLSearchParams,
  window: {
    __ModuleLoader__: {
      load(options) {
        captured = options;
      },
    },
  },
  document: {
    createElement() {
      return {
        dataset: {},
        textContent: '',
        remove() {},
      };
    },
    head: { appendChild() {} },
  },
};
sandbox.globalThis = sandbox;
vm.createContext(sandbox);
vm.runInContext(code, sandbox);

if (!captured) throw new Error('module loader was not called');
if (captured.id !== 'dsh-plugin-shared-context') throw new Error(`unexpected module id ${captured.id}`);

const mod = captured.factory((id) => {
  if (id === 'react') return React;
  throw new Error(`unexpected require(${id})`);
});

const registrations = [];
const dictionaries = {};
const ctx = {
  effect(fn) {
    return fn();
  },
  locale: {
    register(ns, value) {
      dictionaries[ns] = value;
    },
    bind(ns) {
      return (key) => `${ns}:${key}`;
    },
  },
  slots: {
    inject(owner, fn) {
      fn();
    },
    register(options, component) {
      registrations.push({ options, component });
      return () => {};
    },
  },
};

mod.apply(ctx);

const main = registrations.find((entry) => entry.options.name === 'main');
const sidebar = registrations.find((entry) => entry.options.name === 'sidebar.panellist');
const en = Object.keys(dictionaries.sharedContext.en).sort();
const zh = Object.keys(dictionaries.sharedContext.zh).sort();
const missingZh = en.filter((key) => !zh.includes(key));
const missingEn = zh.filter((key) => !en.includes(key));

const failures = [];

/**
 * Collect a failure instead of throwing, so one run reports every problem.
 *
 * @param {boolean} condition - the expectation.
 * @param {string} message - what broke.
 */
function check(condition, message) {
  if (!condition) failures.push(message);
}

check(captured.id === 'dsh-plugin-shared-context', `module id is ${captured.id}`);
check(main !== undefined, 'the "main" slot is not registered');
check(sidebar !== undefined, 'the "sidebar.panellist" slot is not registered');
check(
  main !== undefined && typeof main.component === 'function',
  'the "main" entry has no component',
);
check(
  sidebar !== undefined && typeof sidebar.component === 'function',
  'the "sidebar.panellist" entry has no icon component',
);
// The layout renders `main` keyed by the sidebar's active panel id, so these
// two literals must match or the entry opens an empty panel.
check(
  main !== undefined && sidebar !== undefined && main.options.key === sidebar.options.id,
  `main.key (${main?.options.key}) must equal sidebar.panellist.id (${sidebar?.options.id})`,
);
check(main?.options.locale === 'sharedContext', 'the "main" entry has no locale namespace');
check(
  sidebar?.options.locale === 'sharedContext',
  'the "sidebar.panellist" entry has no locale namespace',
);
check(typeof sidebar?.options.label === 'function', 'the sidebar label is not a function');
check(missingZh.length === 0, `keys missing in zh: ${missingZh.join(', ')}`);
check(missingEn.length === 0, `keys missing in en: ${missingEn.join(', ')}`);

console.log('module id:', captured.id);
console.log('registrations:', registrations.map((entry) => `${entry.options.name}${entry.options.key ? ` key=${entry.options.key}` : ''}${entry.options.id ? ` id=${entry.options.id}` : ''}`).join(' | '));
console.log('main.key:', main?.options.key ?? 'missing', '| sidebar.id:', sidebar?.options.id ?? 'missing');
console.log('dictionary keys:', en.length, '/', zh.length);
console.log('missing in zh:', missingZh.length === 0 ? 'none' : missingZh);
console.log('missing in en:', missingEn.length === 0 ? 'none' : missingEn);
console.log('page component:', typeof main?.component);
console.log('icon component:', typeof sidebar?.component);

if (failures.length > 0) {
  for (const failure of failures) console.error(`FAIL ${failure}`);
  process.exitCode = 1;
} else {
  console.log(`ok   ${registrations.length} registrations, ${en.length} dictionary keys`);
}

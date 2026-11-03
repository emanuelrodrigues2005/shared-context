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

const en = Object.keys(dictionaries.sharedContext.en).sort();
const zh = Object.keys(dictionaries.sharedContext.zh).sort();
const missingZh = en.filter((key) => !zh.includes(key));
const missingEn = zh.filter((key) => !en.includes(key));

console.log('module id:', captured.id);
console.log('registrations:', registrations.map((entry) => `${entry.options.name}${entry.options.key ? ` key=${entry.options.key}` : ''}${entry.options.id ? ` id=${entry.options.id}` : ''}`).join(' | '));
console.log('dictionary keys:', en.length, '/', zh.length);
console.log('missing in zh:', missingZh.length === 0 ? 'none' : missingZh);
console.log('missing in en:', missingEn.length === 0 ? 'none' : missingEn);
console.log('page component:', typeof registrations.find((entry) => entry.options.name === 'main')?.component);
console.log('icon component:', typeof registrations.find((entry) => entry.options.name === 'sidebar.panellist')?.component);

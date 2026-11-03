import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import vm from 'node:vm';

const require = createRequire(import.meta.url);
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');

const source = readFileSync(new URL('../client.js', import.meta.url), 'utf8').replace(
  /return \{\r?\n\s+inject: \['slots', 'locale'\],/,
  "globalThis.__SC_INTERNALS__ = { Page, DetailDrawer, CreateIssueDialog, BoardColumnView, IssueCardView, computeDropPosition, moveIssueInBoard, readStoredClosed, storeClosed, normalizeModuleColor };\n    return {\n      inject: ['slots', 'locale'],",
);

if (!source.includes('__SC_INTERNALS__')) throw new Error('could not expose internals');

let captured;
const localStore = new Map();
const sandbox = {
  console,
  Intl,
  URLSearchParams,
  setTimeout,
  clearTimeout,
  window: {
    __ModuleLoader__: { load: (options) => { captured = options; } },
    localStorage: {
      getItem: (key) => (localStore.has(key) ? localStore.get(key) : null),
      setItem: (key, value) => { localStore.set(key, String(value)); },
    },
    addEventListener: () => {},
    removeEventListener: () => {},
  },
  document: {
    visibilityState: 'visible',
    createElement: () => ({ dataset: {}, textContent: '', remove() {} }),
    head: { appendChild() {} },
  },
};
sandbox.globalThis = sandbox;
vm.createContext(sandbox);
vm.runInContext(source, sandbox);

const mod = captured.factory((id) => {
  if (id === 'react') return React;
  throw new Error(`unexpected require(${id})`);
});
mod.apply({
  effect: (fn) => fn(),
  locale: { register() {}, bind: () => (key) => key },
  slots: { inject: (_owner, fn) => fn(), register: () => () => {} },
});

const t = (key) => key;
const issueCard = {
  id: 'i1', key: 'LLM-1', title: 'Remoção de secrets expostos e variáveis hardcoded',
  stage: 'review', priority: 'urgent', blocked: true, blocked_reason: 'Feature não implementada',
  assignee: { id: 'a1', name: 'Zauns', kind: 'human', can_read_images: true, color: '#247bbf' },
  module: { id: 'm1', name: 'code-review-fix', slug: 'code-review-fix', color: '#247bbf' },
  attachment_count: 2, comment_count: 3,
  child_progress: { done: 1, active: 2, cancelled: 0, total: 3 },
  position: 1, rev: 3, updated_at: new Date(Date.now() - 3_600_000).toISOString(),
};
const detail = {
  ...issueCard,
  project: { id: 'p1', key: 'LLM', name: 'ia-soberana' },
  number: 1,
  description: 'Corrigir as chaves expostas no repositório.\n\n- remover .env\n- rotacionar tokens',
  parent: { id: 'i0', key: 'LLM-18', title: 'Mãe' },
  children: [{ ...issueCard, key: 'LLM-2', title: 'Filho', blocked: false, child_progress: { done: 0, active: 0, cancelled: 0, total: 0 } }],
  links: [{ id: 'l1', url: 'https://example.test/doc', label: 'Doc', created_by: issueCard.assignee, created_at: issueCard.updated_at }],
  attachments: [{ id: 'at1', original_name: 'captura.png', mime_type: 'image/png', size_bytes: 2048, sha256: 'x', created_by: issueCard.assignee, created_at: issueCard.updated_at, has_text: false, is_image: true }],
  comments: [{ id: 'c1', body: 'Primeira linha\nSegunda linha', author: issueCard.assignee, rev: 1, created_at: issueCard.updated_at, updated_at: issueCard.updated_at }],
  activity: [
    { id: 2, type: 'issue.blocked', project_id: 'p1', issue_id: 'i1', issue_key: 'LLM-1', actor: issueCard.assignee, actor_name: 'Zauns', at: issueCard.updated_at, changes: [{ field: 'blocked', from: false, to: true }] },
  ],
  created_by: issueCard.assignee,
  created_at: issueCard.updated_at,
  completed_at: null, cancelled_at: null, blocked_at: issueCard.updated_at, blocked_by: issueCard.assignee,
  latest_activity_id: 2,
};

const { Page, DetailDrawer, CreateIssueDialog, BoardColumnView, IssueCardView, computeDropPosition, moveIssueInBoard, readStoredClosed, storeClosed, normalizeModuleColor } =
  sandbox.__SC_INTERNALS__;

const renders = {
  card: renderToStaticMarkup(
    React.createElement(IssueCardView, {
      issue: issueCard,
      t,
      onOpen: () => {},
      onDragStart: () => {},
      onDragEnd: () => {},
    }),
  ),
  invalidColorCard: renderToStaticMarkup(
    React.createElement(IssueCardView, {
      issue: { ...issueCard, module: { ...issueCard.module, color: 'url(https://example.test/color)' } },
      t,
      onOpen: () => {},
    }),
  ),
  column: renderToStaticMarkup(
    React.createElement(BoardColumnView, {
      column: { stage: 'review', count: 1, has_more: false, issues: [issueCard] },
      t,
      onOpen: () => {},
      dragTarget: { stage: 'review', issueId: null },
      draggingKey: null,
      movingKeys: [],
      onCardDragStart: () => {},
      onCardDragEnd: () => {},
      onCardDragOver: () => {},
      onCardDrop: () => {},
      onColumnDragOver: () => {},
      onColumnDrop: () => {},
      onColumnDragLeave: () => {},
    }),
  ),
  columnBefore: renderToStaticMarkup(
    React.createElement(BoardColumnView, {
      column: { stage: 'review', count: 1, has_more: false, issues: [issueCard] },
      t,
      onOpen: () => {},
      dragTarget: { stage: 'review', issueId: issueCard.id },
      draggingKey: 'other-card',
      movingKeys: [],
      onCardDragStart: () => {},
      onCardDragEnd: () => {},
      onCardDragOver: () => {},
      onCardDrop: () => {},
      onColumnDragOver: () => {},
      onColumnDrop: () => {},
      onColumnDragLeave: () => {},
    }),
  ),
  drawer: renderToStaticMarkup(
    React.createElement(DetailDrawer, {
      t,
      state: { phase: 'ready', issue: detail, error: null },
      onClose: () => {},
      onMove: () => {},
      onComment: async () => true,
      busy: false,
      error: 'conflict',
    }),
  ),
  dialog: renderToStaticMarkup(
    React.createElement(CreateIssueDialog, {
      t,
      projectName: 'ia-soberana',
      busy: false,
      error: null,
      onClose: () => {},
      onSubmit: () => {},
    }),
  ),
  page: renderToStaticMarkup(React.createElement(Page, { t })),
};

for (const [name, html] of Object.entries(renders)) {
  const ok = typeof html === 'string' && html.length > 40;
  console.log(`${name}: ${ok ? 'rendered' : 'FAILED'} (${html.length} bytes)`);
  if (!ok) throw new Error(`${name} did not render`);
}

const drawerChecks = [
  ['drawer shows key', renders.drawer.includes('LLM-1')],
  ['drawer shows description', renders.drawer.includes('rotacionar tokens')],
  ['drawer shows comment', renders.drawer.includes('Primeira linha')],
  ['drawer shows stage select', renders.drawer.includes('<select')],
  ['drawer shows conflict error', renders.drawer.includes('conflict')],
  ['column shows card', renders.column.includes('LLM-1')],
  ['card is draggable', renders.card.includes('draggable="true"')],
  ['card shows its Module color', renders.card.includes('has-module-color') && renders.card.includes('--sc-module-color:#247bbf')],
  ['invalid Module color is ignored', !renders.invalidColorCard.includes('has-module-color')],
  ['column marks the drop target', renders.column.includes('is-dropTarget')],
  ['column marks an end drop', renders.column.includes('is-dropEnd')],
  ['card marks a before drop', renders.columnBefore.includes('is-dropBefore')],
  ['dialog shows form', renders.dialog.includes('<form')],
  ['page shows title', renders.page.includes('sc-title')],
];
for (const [label, pass] of drawerChecks) {
  console.log(`${pass ? 'ok' : 'FAIL'} - ${label}`);
  if (!pass) process.exitCode = 1;
}

const positions = [
  ['empty column', computeDropPosition([], 0), 1024],
  ['before the first card', computeDropPosition([{ position: 1024 }], 0), 0],
  ['between cards', computeDropPosition([{ position: 1024 }, { position: 2048 }], 1), 1536],
  ['after the last card', computeDropPosition([{ position: 1024 }, { position: 2048 }], 2), 3072],
];
for (const [label, actual, expected] of positions) {
  const pass = actual === expected;
  console.log(`${pass ? 'ok' : 'FAIL'} - drop position ${label}`);
  if (!pass) process.exitCode = 1;
}

const board = {
  project: { key: 'LLM' },
  columns: [
    { stage: 'todo', count: 2, has_more: false, issues: [{ ...issueCard, id: 'a', position: 1024 }, { ...issueCard, id: 'b', position: 2048 }] },
    { stage: 'review', count: 0, has_more: false, issues: [] },
  ],
};
const movedBoard = moveIssueInBoard(board, board.columns[0].issues[0], 'review', 1024);
const optimisticChecks = [
  ['move removes the card from its source column', movedBoard.columns[0].issues.length === 1 && movedBoard.columns[0].count === 1],
  ['move adds the card to the target column', movedBoard.columns[1].issues.length === 1 && movedBoard.columns[1].issues[0].id === 'a'],
  ['move records the new Stage', movedBoard.columns[1].issues[0].stage === 'review'],
];
for (const [label, pass] of optimisticChecks) {
  console.log(`${pass ? 'ok' : 'FAIL'} - ${label}`);
  if (!pass) process.exitCode = 1;
}

const closedChecks = [
  ['closed toggle defaults to hidden', readStoredClosed() === false],
];
storeClosed(true);
closedChecks.push(['closed toggle persists on', readStoredClosed() === true]);
storeClosed(false);
closedChecks.push(['closed toggle persists off', readStoredClosed() === false]);
for (const [label, pass] of closedChecks) {
  console.log(`${pass ? 'ok' : 'FAIL'} - ${label}`);
  if (!pass) process.exitCode = 1;
}

const colorChecks = [
  ['six-digit hex is accepted', normalizeModuleColor('#247bbf') === '#247bbf'],
  ['three-digit hex is accepted', normalizeModuleColor('#abc') === '#abc'],
  ['four-digit hex is accepted', normalizeModuleColor('#abcd') === '#abcd'],
  ['eight-digit hex is accepted', normalizeModuleColor('#247bbfcc') === '#247bbfcc'],
  ['named colors are rejected', normalizeModuleColor('red') === null],
  ['CSS functions are rejected', normalizeModuleColor('url(https://example.test/x)') === null],
  ['missing colors are rejected', normalizeModuleColor(null) === null],
];
for (const [label, pass] of colorChecks) {
  console.log(`${pass ? 'ok' : 'FAIL'} - ${label}`);
  if (!pass) process.exitCode = 1;
}

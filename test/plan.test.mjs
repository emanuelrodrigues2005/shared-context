import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const planDir = path.join(root, 'plan');
const indexPath = path.join(planDir, 'README.md');

test('plan index links every spec and milestone', () => {
  const index = fs.readFileSync(indexPath, 'utf8');
  assert.match(index, /^# Shared Context/);

  const specs = [
    '00-overview.md',
    '01-repository-layout.md',
    '02-data-model.md',
    '03-concurrency.md',
    '04-mcp-tools.md',
    '05-http-api.md',
    '06-ui.md',
    '07-attachments.md',
    '08-security.md',
    '09-operations.md',
    '10-build-order.md',
    '11-test-plan.md',
    '12-risks.md',
  ];

  for (const spec of specs) {
    const file = path.join(planDir, spec);
    assert.ok(fs.existsSync(file), `missing spec: ${spec}`);
    const body = fs.readFileSync(file, 'utf8');
    assert.match(body, /^# /, `spec lacks a title: ${spec}`);
    assert.ok(index.includes(`(${spec})`), `plan index does not link ${spec}`);
  }

  for (let i = 0; i <= 7; i += 1) {
    assert.ok(index.includes(`**M${i}`), `plan tracker is missing M${i}`);
  }
});

test('plan ADR links resolve', () => {
  const index = fs.readFileSync(indexPath, 'utf8');
  const links = [...index.matchAll(/\]\((\.\.\/docs\/adr\/[^)]+)\)/g)].map((m) => m[1]);
  assert.ok(links.length >= 9, 'expected at least nine ADR links');
  for (const link of links) {
    assert.ok(fs.existsSync(path.resolve(planDir, link)), `broken ADR link: ${link}`);
  }
});

test('all relative Markdown links in the plan and README resolve', () => {
  const files = [
    path.join(root, 'README.md'),
    ...fs
      .readdirSync(planDir)
      .filter((name) => name.endsWith('.md'))
      .map((name) => path.join(planDir, name)),
  ];

  for (const file of files) {
    const body = fs.readFileSync(file, 'utf8');
    for (const match of body.matchAll(/\]\(([^)\s]+)\)/g)) {
      const target = match[1];
      if (/^(https?:|mailto:|#)/.test(target)) continue;
      const relativeTarget = target.split('#')[0];
      if (!relativeTarget) continue;
      const resolved = path.resolve(path.dirname(file), relativeTarget);
      assert.ok(
        fs.existsSync(resolved),
        `broken link in ${path.relative(root, file)}: ${target}`,
      );
    }
  }
});


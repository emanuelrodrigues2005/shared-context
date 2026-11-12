import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');

test('glossary and ADRs exist and are well formed', () => {
  const context = fs.readFileSync(path.join(root, 'CONTEXT.md'), 'utf8');
  assert.match(context, /^# Shared Context/);
  assert.match(context, /\*\*Comment\*\*/);

  const terms = [
    'Project', 'Issue', 'Stage', 'Blocked', 'Priority', 'Module', 'Actor',
    'Assignee', 'Parent Issue', 'Child Issue', 'Attachment', 'Link',
    'Activity', 'Comment', 'Claim', 'Revision', 'Context Snapshot',
  ];
  for (const term of terms) {
    assert.ok(context.includes(`**${term}**`), `missing glossary term: ${term}`);
  }

  const adrDir = path.join(root, 'docs', 'adr');
  const adrs = fs.readdirSync(adrDir).filter((name) => name.endsWith('.md'));
  assert.equal(adrs.length, 9);
  for (const name of adrs) {
    const body = fs.readFileSync(path.join(adrDir, name), 'utf8');
    assert.match(body, /^# /, `ADR lacks a title: ${name}`);
  }
});

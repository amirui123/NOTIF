#!/usr/bin/env node
/**
 * Dependency-free workflow validator.
 *
 * A full YAML parser is overkill here: GitHub only needs the handful of keys we
 * use, and a typo in them fails the whole pipeline. This checks indentation of
 * block keys, that every `uses:`/`run:` lives under a step, and that each job
 * declares `runs-on` — the mistakes that actually happen.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const DIR = '.github/workflows';
const REQUIRED_TOP = ['name', 'on', 'jobs'];

/** Strip comments and blank lines while keeping the original line numbers. */
function significant(text) {
  return text
    .split('\n')
    .map((line, index) => ({ index: index + 1, text: line, indent: line.match(/^ */)[0].length }))
    .filter(({ text }) => text.trim() && !text.trim().startsWith('#'));
}

function validate(file) {
  const text = readFileSync(file, 'utf8');
  const errors = [];
  const lines = significant(text);

  if (text.includes('\t')) errors.push('tabs are not allowed in YAML');

  for (const key of REQUIRED_TOP) {
    if (!new RegExp(`^${key}:`, 'm').test(text)) errors.push(`missing top-level "${key}:"`);
  }

  const jobsAt = lines.find((l) => /^jobs:/.test(l.text));
  if (!jobsAt) return [...errors, 'no jobs: block'];

  const jobLines = lines.filter(
    (l) => l.index > jobsAt.index && l.indent === 2 && /^\s{2}\S+:\s*$/.test(l.text),
  );
  if (jobLines.length === 0) errors.push('no jobs defined');

  for (const job of jobLines) {
    const name = job.text.trim().replace(/:$/, '');
    const nextJob = jobLines.find((l) => l.index > job.index)?.index ?? Infinity;
    const body = lines.filter((l) => l.index > job.index && l.index < nextJob);
    if (!body.some((l) => /^\s{4}runs-on:/.test(l.text))) errors.push(`job "${name}" has no runs-on`);

    const stepIndents = new Set(body.filter((l) => /^\s*- /.test(l.text)).map((l) => l.indent));
    const hasStep = body.some((l) => /^\s*- (name|uses|run):/.test(l.text));
    if (stepIndents.size > 1) errors.push(`job "${name}" has misaligned step items`);

    for (const line of body) {
      if (/^\s*(uses|with|run|env):/.test(line.text) && !hasStep) {
        errors.push(`job "${name}" has "${line.text.trim().split(':')[0]}:" outside a step`);
      }
    }
  }

  // Every `uses: actions/...` must carry a version tag.
  for (const line of lines) {
    const match = line.text.match(/uses:\s*(\S+)/);
    if (match && /^(actions|github)\//.test(match[1]) && !match[1].includes('@')) {
      errors.push(`line ${line.index}: "${match[1]}" is unpinned`);
    }
  }

  return errors;
}

let failed = 0;
for (const file of readdirSync(DIR).filter((f) => f.endsWith('.yml') || f.endsWith('.yaml'))) {
  const path = join(DIR, file);
  const errors = validate(path);
  if (errors.length) {
    failed++;
    console.error(`✗ ${path}`);
    for (const error of errors) console.error(`    ${error}`);
  } else {
    console.log(`✓ ${path}`);
  }
}

if (failed) {
  console.error(`\n${failed} workflow file(s) invalid`);
  process.exit(1);
}

#!/usr/bin/env bun
import { execFileSync } from 'node:child_process';

import { compareEnglishSurfaces } from '../src/lib/zh-objective-guard';

interface Options {
  readonly chineseOnly: boolean;
  readonly base: string;
  readonly head: string;
}

function optionValue(args: readonly string[], name: string): string | undefined {
  const index = args.indexOf(name);
  return index === -1 ? undefined : args[index + 1];
}

function parseOptions(args: readonly string[]): Options {
  const chineseOnly = args.includes('--chinese-only');
  const base = optionValue(args, '--base') ?? process.env.ZH_GUARD_BASE_SHA ?? '';
  const head = optionValue(args, '--head') ?? process.env.ZH_GUARD_HEAD_SHA ?? '';
  if (!chineseOnly || !base || !head) {
    throw new Error(
      'Usage: check-zh-chinese-only.ts --chinese-only --base <base-sha> --head <head-sha>',
    );
  }
  return { chineseOnly, base, head };
}

function git(args: readonly string[]): string {
  return execFileSync('git', args, { encoding: 'utf8' }).trim();
}

function sourceAt(revision: string, file: string): string {
  try {
    return execFileSync('git', ['show', `${revision}:${file}`], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });
  } catch {
    return '';
  }
}

function changedFiles(base: string, head: string): string[] {
  return git([
    'diff',
    '--name-only',
    '--diff-filter=ACMRD',
    `${base}...${head}`,
    '--',
    'packages/app',
  ])
    .split('\n')
    .filter(Boolean);
}

const options = parseOptions(process.argv.slice(2));
const mergeBase = git(['merge-base', options.base, options.head]);
const files = changedFiles(mergeBase, options.head);
const violations = files.flatMap((file) =>
  compareEnglishSurfaces(file, sourceAt(mergeBase, file), sourceAt(options.head, file)),
);

if (violations.length > 0) {
  console.error(
    [
      'Chinese-only mode found changed English bytes:',
      ...violations.map((violation) => `  ${violation.file}: ${violation.detail}`),
      '',
      'Remove the chinese-copy-only label when the PR intentionally changes English copy.',
    ].join('\n'),
  );
  process.exitCode = 1;
} else {
  console.log(
    `Chinese-only English-byte guard passed for ${files.length} changed app file(s) against merge base ${mergeBase}.`,
  );
}

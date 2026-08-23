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
  if (!file) return '';
  try {
    return execFileSync('git', ['show', `${revision}:${file}`], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });
  } catch {
    return '';
  }
}

interface ChangedFile {
  readonly baseFile: string;
  readonly headFile: string;
}

function changedFiles(base: string, head: string): ChangedFile[] {
  const raw = execFileSync(
    'git',
    [
      'diff',
      '--name-status',
      '-z',
      '--find-renames',
      '--diff-filter=ACMRTD',
      `${base}...${head}`,
      '--',
      ':(top)packages/app',
    ],
    { encoding: 'utf8' },
  );
  const fields = raw.split('\0');
  if (fields.at(-1) === '') fields.pop();
  const changed: ChangedFile[] = [];
  for (let index = 0; index < fields.length;) {
    const status = fields[index++];
    if (status.startsWith('R') || status.startsWith('C')) {
      changed.push({ baseFile: fields[index++], headFile: fields[index++] });
      continue;
    }
    const file = fields[index++];
    changed.push({
      baseFile: status === 'A' ? '' : file,
      headFile: status === 'D' ? '' : file,
    });
  }
  return changed;
}

const options = parseOptions(process.argv.slice(2));
const mergeBase = git(['merge-base', options.base, options.head]);
const files = changedFiles(mergeBase, options.head);
const violations = files.flatMap(({ baseFile, headFile }) => {
  const baseSource = sourceAt(mergeBase, baseFile);
  const headSource = sourceAt(options.head, headFile);
  const preferredFile = headFile || baseFile;
  const preferred = compareEnglishSurfaces(preferredFile, baseSource, headSource);
  if (preferred.length > 0 || baseFile === headFile || !baseFile) return preferred;
  return compareEnglishSurfaces(baseFile, baseSource, headSource);
});

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

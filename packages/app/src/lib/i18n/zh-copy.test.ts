import fs from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { findDictionaryParityViolations } from './zh-objective-guard';

const APP_DIR = path.resolve(import.meta.dirname, '..', '..', '..');
const SCAN_ROOTS = [path.join(APP_DIR, 'src'), path.join(APP_DIR, 'content')];
const SCAN_EXTENSIONS = new Set(['.ts', '.tsx', '.mdx', '.json']);

const HAN = String.raw`\p{Script=Han}`;
const hasHan = new RegExp(HAN, 'u');

const SELF = 'src/lib/i18n/zh-copy.test.ts';
const GUARD_SOURCES = new Set([
  SELF,
  'src/lib/i18n/zh-objective-guard.ts',
  'src/lib/i18n/zh-objective-guard.test.ts',
]);

interface Line {
  file: string;
  line: number;
  text: string;
}

interface Violation {
  file: string;
  line: number;
  span: string;
  fix: string;
}

interface Rule {
  id: string;
  fix: string;
  corpus: 'chinese' | 'bilingual-file';
  find: (text: string) => string[];
}

function matcher(pattern: RegExp, ignore?: RegExp): (text: string) => string[] {
  return (text) => {
    const probe = ignore ? text.replaceAll(ignore, '') : text;
    return [...probe.matchAll(pattern)].map((match) => match[0].trim());
  };
}

const STRING_LITERAL = /'(?:[^'\\\n]|\\.)*'|"(?:[^"\\\n]|\\.)*"|`(?:[^`\\]|\\.)*`/gsu;

function segment(raw: string, isProse: boolean): string[] {
  if (!hasHan.test(raw)) return [];
  if (isProse) return [raw];
  const literals = (raw.match(STRING_LITERAL) ?? []).filter((text) => hasHan.test(text));
  return literals.length > 0 ? literals : [raw];
}

const CHIP_UNITS = /(?:tok|tokens?)\/s\/chip|\$\/chip[/-](?:hr|hour)|[A-Za-z]Chip\b|\bChip[A-Z]/giu;

const URL_LIKE = /https?:\/\/\S+/giu;

const ignoring = (...patterns: RegExp[]) =>
  new RegExp(patterns.map((pattern) => pattern.source).join('|'), 'giu');

const RULES: Rule[] = [
  {
    id: 'chip-untranslated',
    corpus: 'chinese',
    fix: '写作「芯片」（单位 tok/s/chip 等除外）',
    find: matcher(/\b[Cc]hip\b/gu, ignoring(URL_LIKE, CHIP_UNITS)),
  },
  {
    id: 'hardcoded-english-label',
    corpus: 'bilingual-file',
    fix: '把标签接入本地化字典，勿硬编码英文',
    find: (text) =>
      [...text.matchAll(/<strong>(?<label>[A-Za-z][^<${}]{2,45}):<\/strong>/gu)]
        .filter(({ groups }) => {
          const label = groups?.label ?? '';
          return !/\//u.test(label) && !/^[A-Z0-9]+$/u.test(label);
        })
        .map((match) => match[0]),
  },
  {
    id: 'duplicated-technical-loanword',
    corpus: 'chinese',
    fix: '保留技术借词，删除紧随其后的重复中文翻译',
    find: matcher(
      /\b(?:warmup(?:\s+预热|\s*[（(]\s*预热\s*[）)])|seed(?:\s+随机种子|\s*[（(]\s*随机种子\s*[）)])|offload(?:\s+卸载|\s*[（(]\s*卸载\s*[）)]))/giu,
    ),
  },
];

function walk(directory: string): string[] {
  return fs
    .readdirSync(directory, { withFileTypes: true })
    .flatMap((entry) => {
      const full = path.join(directory, entry.name);
      if (entry.isDirectory()) return entry.name === 'node_modules' ? [] : walk(full);
      return SCAN_EXTENSIONS.has(path.extname(entry.name)) ? [full] : [];
    })
    .sort();
}

const sourceFiles: string[] = SCAN_ROOTS.filter((root) => fs.existsSync(root)).flatMap(walk);

function chineseLinesFromSource(relative: string, source: string): Line[] {
  const isProse = path.extname(relative) === '.mdx';
  let inJsonLd = false;
  return source.split('\n').flatMap((raw, index) => {
    if (isProse) {
      const trimmed = raw.trim();
      if (trimmed.startsWith('<JsonLd') || trimmed.startsWith('{{')) inJsonLd = true;
      const skip = inJsonLd;
      if (inJsonLd && (trimmed.endsWith('/>') || trimmed.endsWith('</JsonLd>') || trimmed === '}}'))
        inJsonLd = false;
      if (skip) return [];
    }
    return segment(raw, isProse).map((text) => ({ file: relative, line: index + 1, text }));
  });
}

const chineseLines: Line[] = sourceFiles.flatMap((file) => {
  const relative = path.relative(APP_DIR, file);
  if (GUARD_SOURCES.has(relative)) return [];
  return chineseLinesFromSource(relative, fs.readFileSync(file, 'utf8'));
});

function report(violations: Violation[]): string {
  return violations
    .slice(0, 40)
    .map((v) => `  ${v.file}:${v.line}  «${v.span}»  → ${v.fix}`)
    .join('\n');
}

function expectClean(violations: Violation[]): void {
  expect(violations.length, `\n${report(violations)}\n`).toBe(0);
}

describe('zh copy — the tree obeys every mechanical rule', () => {
  const bilingualLines: Line[] = sourceFiles.flatMap((file) => {
    const relative = path.relative(APP_DIR, file);
    if (GUARD_SOURCES.has(relative) || relative.includes('.test.')) return [];
    const source = fs.readFileSync(file, 'utf8');
    if (!/\bzh:\s*\{/u.test(source)) return [];
    return source.split('\n').map((text, index) => ({ file: relative, line: index + 1, text }));
  });

  it.each(RULES.map((rule) => [rule.id, rule] as const))('%s', (_id, rule) => {
    const corpus = rule.corpus === 'bilingual-file' ? bilingualLines : chineseLines;
    expectClean(
      corpus.flatMap(({ file, line, text }) =>
        rule.find(text).map((span) => ({ file, line, span, fix: rule.fix })),
      ),
    );
  });
});

describe('zh copy — every rule still catches what it was written for', () => {
  interface Fixture {
    rule: string;
    kind: 'regression' | 'exemption';
    before?: string;
    after?: string;
    text?: string;
    note: string;
  }

  const fixtures: Fixture[] = fs
    .readFileSync(path.join(APP_DIR, 'src/lib/i18n/zh-copy-mechanical-regressions.jsonl'), 'utf8')
    .split('\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line) as Fixture);

  const byId = new Map(RULES.map((rule) => [rule.id, rule]));
  const run = (rule: Rule, text: string) =>
    rule.corpus === 'bilingual-file' ? rule.find(text) : segment(text, false).flatMap(rule.find);

  it('covers every rule', () => {
    const covered = new Set(fixtures.filter((f) => f.kind === 'regression').map((f) => f.rule));
    expect([...byId.keys()].filter((id) => !covered.has(id))).toEqual([]);
  });

  it.each(fixtures.map((f) => [`${f.rule} — ${f.kind} — ${f.note}`, f] as const))(
    '%s',
    (_name, fixture) => {
      const rule = byId.get(fixture.rule);
      expect(rule, `unknown rule id "${fixture.rule}"`).toBeDefined();
      if (!rule) return;

      if (fixture.kind === 'exemption') {
        expect(run(rule, fixture.text ?? '')).toEqual([]);
        return;
      }
      expect(run(rule, fixture.before ?? '').length).toBeGreaterThan(0);
      expect(run(rule, fixture.after ?? '')).toEqual([]);
    },
  );
});

describe('zh copy — coverage', () => {
  it('resumes scanning Chinese prose after an MDX JsonLd block', () => {
    const lines = chineseLinesFromSource(
      'content/blog/zh/example.mdx',
      [
        'JSON-LD 之前的中文。',
        '<JsonLd>{`{',
        '  "description": "结构化数据中的 Chip 不应扫描"',
        '}`}</JsonLd>',
        'JSON-LD 之后的中文 Chip 应继续扫描。',
      ].join('\n'),
    );

    expect(lines.map(({ line, text }) => ({ line, text }))).toEqual([
      { line: 1, text: 'JSON-LD 之前的中文。' },
      { line: 5, text: 'JSON-LD 之后的中文 Chip 应继续扫描。' },
    ]);
  });

  it('scans a plausible amount of Chinese copy', () => {
    expect(chineseLines.length).toBeGreaterThan(1000);
  });
});

describe('zh copy — generic bilingual dictionary parity', () => {
  const dictionaryFiles = sourceFiles.filter((file) => {
    const relative = path.relative(APP_DIR, file);
    return /\.tsx?$/u.test(relative) && !relative.includes('.test.');
  });

  it('keeps every explicit en/zh object key shape aligned', () => {
    const violations = dictionaryFiles.flatMap((file) =>
      findDictionaryParityViolations(path.relative(APP_DIR, file), fs.readFileSync(file, 'utf8')),
    );
    expect(violations).toEqual([]);
  });
});

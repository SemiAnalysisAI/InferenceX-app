export interface TypographyViolation {
  rule: string;
  line: number;
  match: string;
  suggestion: string;
}

interface Rule {
  name: string;
  pattern: RegExp;
  appliesTo: (relPath: string) => boolean;
  suggest: (match: string) => string;
}

const SIZE_SUGGESTIONS: Record<string, string> = {
  'text-[11px]': 'use text-2xs (11px)',
  'text-[0.6875rem]': 'use text-2xs (11px)',
  'text-[10px]': 'use text-3xs (10px)',
  'text-[0.625rem]': 'use text-3xs (10px)',
  'text-[0.65rem]': 'use text-3xs (10px)',
};

const TRACKING_SUGGESTION =
  'use tracking-eyebrow (0.16em), tracking-eyebrow-wide (0.2em), tracking-heading (-0.04em), or a built-in tracking-* class';

const EXEMPT_PATH =
  /(?:opengraph-image|og-image-render|compare-og|typography-gate|check-typography)\.tsx?$|\.test\.tsx?$/u;

const RULES: Rule[] = [
  {
    name: 'arbitrary-text-size',
    pattern: /\btext-\[[\d.][^\]]*\]/gu,
    appliesTo: () => true,
    suggest: (match) =>
      SIZE_SUGGESTIONS[match] ??
      'use text-2xs (11px) / text-3xs (10px) or the standard text-* scale',
  },
  {
    name: 'arbitrary-tracking',
    pattern: /\btracking-\[[^\]]+\]/gu,
    appliesTo: () => true,
    suggest: () => TRACKING_SUGGESTION,
  },
  {
    name: 'chart-font-literal',
    pattern: /\.(?:attr|style)\(\s*['"]font-size['"],\s*['"][^'"]*['"]/gu,
    appliesTo: (relPath) => relPath.startsWith('src/lib/d3-chart/'),
    suggest: () => "size chart text via CHART_TYPE from '@/lib/d3-chart/typography'",
  },
];

export const RULE_NAMES = RULES.map((rule) => rule.name);

export function isExemptPath(relPath: string): boolean {
  return EXEMPT_PATH.test(relPath);
}

export function scanSource(relPath: string, source: string): TypographyViolation[] {
  if (isExemptPath(relPath)) return [];
  const violations: TypographyViolation[] = [];
  const lines = source.split('\n');
  for (const rule of RULES) {
    if (!rule.appliesTo(relPath)) continue;
    for (const [index, line] of lines.entries()) {
      for (const match of line.matchAll(rule.pattern)) {
        violations.push({
          rule: rule.name,
          line: index + 1,
          match: match[0],
          suggestion: rule.suggest(match[0]),
        });
      }
    }
  }
  return violations;
}

export type ViolationCounts = Record<string, Record<string, number>>;

export function countViolations(
  files: Iterable<{ relPath: string; source: string }>,
): ViolationCounts {
  const counts: ViolationCounts = {};
  for (const { relPath, source } of files) {
    for (const violation of scanSource(relPath, source)) {
      counts[relPath] ??= {};
      counts[relPath][violation.rule] = (counts[relPath][violation.rule] ?? 0) + 1;
    }
  }
  return counts;
}

export interface GateResult {
  errors: string[];
  stale: string[];
}

export function compareToAllowlist(
  counts: ViolationCounts,
  allowlist: ViolationCounts,
): GateResult {
  const errors: string[] = [];
  const stale: string[] = [];

  const files = new Set([...Object.keys(counts), ...Object.keys(allowlist)]);
  for (const file of [...files].sort()) {
    for (const rule of RULE_NAMES) {
      const actual = counts[file]?.[rule] ?? 0;
      const allowed = allowlist[file]?.[rule] ?? 0;
      if (actual > allowed) {
        errors.push(`${file}: ${actual} ${rule} violation(s), allowlist permits ${allowed}`);
      } else if (actual < allowed) {
        stale.push(`${file}: ${rule} dropped to ${actual} (allowlist says ${allowed})`);
      }
    }
  }
  return { errors, stale };
}

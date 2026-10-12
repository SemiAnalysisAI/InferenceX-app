/**
 * Typography ratchet gate — core matching and allowlist logic.
 *
 * The repo's typography is governed by a small token set (see
 * docs/typography.md): arbitrary font sizes / letter-spacings in class
 * strings and quoted font-size literals in the shared D3 chart library are
 * blocked for NEW code, while the offenders that existed when the gate landed
 * are frozen in scripts/typography-allowlist.json and burn down as their
 * files get touched.
 *
 * This module is pure (no fs) so the rules are unit-testable; the CLI entry
 * point is scripts/check-typography.ts.
 */

export interface TypographyViolation {
  rule: string;
  /** 1-based line number. */
  line: number;
  /** The offending token, e.g. "text-[11px]". */
  match: string;
  suggestion: string;
}

interface Rule {
  name: string;
  /** Must be a global regex; matched per line. */
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

/**
 * Files the rules never apply to. OG-image renderers draw on a fixed-size
 * Satori canvas where hardcoded display sizes are correct; this module and
 * its CLI contain the offending strings by definition.
 */
const EXEMPT_PATH =
  /(?:opengraph-image|og-image-render|compare-og|typography-gate|check-typography)\.tsx?$|\.test\.tsx?$/u;

const RULES: Rule[] = [
  {
    name: 'arbitrary-text-size',
    // Leading digit/dot keeps hex colors (text-[#…]) and var() refs out of scope.
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
    // Quoted px literals only: computed values and CHART_TYPE identifiers pass.
    pattern: /\.(?:attr|style)\(\s*['"]font-size['"],\s*['"][^'"]*['"]/gu,
    appliesTo: (relPath) => relPath.startsWith('src/lib/d3-chart/'),
    suggest: () => "size chart text via CHART_TYPE from '@/lib/d3-chart/typography'",
  },
];

export const RULE_NAMES = RULES.map((rule) => rule.name);

export function isExemptPath(relPath: string): boolean {
  return EXEMPT_PATH.test(relPath);
}

/** Scan one file's source; relPath is POSIX-style, relative to packages/app. */
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

/** file → rule → count. Only files with at least one violation appear. */
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
  /** New or grown offenders — always a failure. */
  errors: string[];
  /** Counts that dropped below the allowlist — fix by re-running with --update. */
  stale: string[];
}

/**
 * Ratchet comparison: fail on any count above the allowlist (or any offender
 * in a file the allowlist doesn't know), and report counts that dropped so
 * the allowlist can only ever shrink.
 */
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

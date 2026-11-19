export const HARNESSES = ['claude-code', 'codex', 'pi', 'omp', 'other'] as const;

export type Harness = (typeof HARNESSES)[number];

export const HARNESS_LABELS: Record<Harness, string> = {
  'claude-code': 'Claude Code',
  codex: 'Codex',
  pi: 'Pi',
  omp: 'Oh My Pi',
  other: 'Other',
};

export function isHarness(value: string | null): value is Harness {
  return (HARNESSES as readonly (string | null)[]).includes(value);
}

export function harnessFromUserAgent(userAgent: unknown): Harness {
  if (typeof userAgent !== 'string') return 'other';
  if (userAgent.startsWith('claude-cli/')) return 'claude-code';
  if (/^codex/iu.test(userAgent)) return 'codex';
  if (userAgent.startsWith('pi (')) return 'pi';
  if (/^(?:omp|pi)\//u.test(userAgent)) return 'omp';
  return 'other';
}

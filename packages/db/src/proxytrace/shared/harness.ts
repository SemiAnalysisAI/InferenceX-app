/**
 * Coding-agent harness behind a session, derived from its recorded user agent.
 * `metadata.client` only names the proxy route, and Pi / Oh My Pi send
 * traffic through the Anthropic, OpenAI and Codex routes alike, so the user
 * agent is the signal that identifies the harness. `operations.ts` mirrors
 * this classification in SQL.
 */
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
  // CLI, IDE extensions, desktop, and the Agent SDK all send `claude-cli/<version>`.
  if (userAgent.startsWith('claude-cli/')) return 'claude-code';
  // `codex-tui/`, `codex_exec/`, `codex_vscode/`, `Codex Desktop/`.
  if (/^codex/iu.test(userAgent)) return 'codex';
  if (userAgent.startsWith('pi (')) return 'pi';
  // Oh My Pi sent `pi/<version>` (its 17.x line) before renaming it to `omp/<version>`.
  if (/^(?:omp|pi)\//u.test(userAgent)) return 'omp';
  return 'other';
}

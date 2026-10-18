/**
 * Subagent detection via system prompt pattern matching.
 * Runs at the proxy level before anonymization so even anon traces get labeled.
 *
 * Order matters: more specific patterns must come before broad ones.
 * "General Agent" is intentionally last — it matches any Claude Code subagent.
 */

export const SUBAGENT_STATS_WINDOW_DAYS = 7;

export const SUBAGENT_INDICATORS = [
  // Explore Agent — Haiku, read-only codebase search
  { pattern: 'file search specialist', label: 'Explore Agent' },
  { pattern: 'READ-ONLY exploration task', label: 'Explore Agent' },
  // Plan Agent — read-only architecture/design
  { pattern: 'software architect', label: 'Plan Agent' },
  // Code Review Agent
  { pattern: 'code-reviewer', label: 'Code Review Agent' },
  // Verification Agent — post-implementation checks
  { pattern: 'You are a verification orchestrator', label: 'Verification Agent' },
  { pattern: 'verification specialist', label: 'Verification Agent' },
  // Web Search Agent — Haiku, high-volume
  { pattern: 'assistant for performing a web search', label: 'Web Search Agent' },
  // Security Monitor — Sonnet, autonomous mode safety checks
  { pattern: 'security monitor for autonomous', label: 'Security Monitor' },
  // Guide Agent — answers questions about Claude Code/SDK/API
  { pattern: 'Claude guide agent', label: 'Guide Agent' },
  // Statusline Agent — configures the status line UI
  { pattern: 'status line setup agent', label: 'Statusline Agent' },
  // Agent SDK — external agents built on Anthropic's Agent SDK
  { pattern: "Claude agent, built on Anthropic's Claude Agent SDK", label: 'Agent SDK' },
  // General Agent — Opus/Sonnet subagent workhorse (broad match, must be near last)
  { pattern: 'You are an agent for Claude Code', label: 'General Agent' },
  { pattern: 'general-purpose agent', label: 'General Agent' },
  // Title/Name generation — Haiku utility calls
  { pattern: 'Generate a concise, sentence-case title', label: 'Title Generation' },
  { pattern: 'Generate a short kebab-case name', label: 'Name Generation' },
] as const;

/**
 * Extract subagent label from a parsed Anthropic Messages request body.
 * Matches against `requestBody.system` (array of content blocks with `.text`).
 */
export function getSubagentLabel(requestBody: Record<string, unknown>): string | null {
  const system = requestBody.system;
  if (!Array.isArray(system)) return null;
  for (const block of system) {
    const text =
      typeof block === 'object' &&
      block !== null &&
      typeof (block as { text?: unknown }).text === 'string'
        ? (block as { text: string }).text
        : null;
    if (!text) continue;
    for (const ind of SUBAGENT_INDICATORS) {
      if (text.includes(ind.pattern)) return ind.label;
    }
  }
  return null;
}

/**
 * Claude Code 2.1.139 introduced the `x-claude-code-agent-id` header. From that
 * version on, the header is the authoritative sub-agent marker — utility calls
 * like Title Generation and Anthropic.ping() deliberately don't carry it, and
 * should NOT be classified as sub-agents regardless of what their system prompt
 * looks like. Older CLI versions never had the header, so we still fall back to
 * the legacy heuristic for them.
 */
export function isClaudeCodeWithAgentIdSupport(userAgent: string | null): boolean {
  if (!userAgent) return false;
  const version = /^claude-cli\/(?<major>\d+)\.(?<minor>\d+)\.(?<patch>\d+)/u.exec(
    userAgent,
  )?.groups;
  if (!version) return false;
  const major = Number(version.major);
  const minor = Number(version.minor);
  const patch = Number(version.patch);
  if (major !== 2) return major > 2;
  if (minor !== 1) return minor > 1;
  return patch >= 139;
}

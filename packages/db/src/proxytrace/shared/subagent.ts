export const SUBAGENT_STATS_WINDOW_DAYS = 7;

export const SUBAGENT_INDICATORS = [
  { pattern: 'file search specialist', label: 'Explore Agent' },
  { pattern: 'READ-ONLY exploration task', label: 'Explore Agent' },
  { pattern: 'software architect', label: 'Plan Agent' },
  { pattern: 'code-reviewer', label: 'Code Review Agent' },
  { pattern: 'You are a verification orchestrator', label: 'Verification Agent' },
  { pattern: 'verification specialist', label: 'Verification Agent' },
  { pattern: 'assistant for performing a web search', label: 'Web Search Agent' },
  { pattern: 'security monitor for autonomous', label: 'Security Monitor' },
  { pattern: 'Claude guide agent', label: 'Guide Agent' },
  { pattern: 'status line setup agent', label: 'Statusline Agent' },
  { pattern: "Claude agent, built on Anthropic's Claude Agent SDK", label: 'Agent SDK' },
  { pattern: 'You are an agent for Claude Code', label: 'General Agent' },
  { pattern: 'general-purpose agent', label: 'General Agent' },
  { pattern: 'Generate a concise, sentence-case title', label: 'Title Generation' },
  { pattern: 'Generate a short kebab-case name', label: 'Name Generation' },
] as const;

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

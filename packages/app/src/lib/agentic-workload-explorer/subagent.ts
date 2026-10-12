export interface ContentBlock {
  type: string;
  text?: string;
  id?: string;
  name?: string;
  input?: Record<string, unknown>;
  content?: string | ContentBlock[];
  is_error?: boolean;
  thinking?: string;
}

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
  // Web Search Agent — Haiku, highest-volume subagent (~4K/day)
  { pattern: 'assistant for performing a web search', label: 'Web Search Agent' },
  // Security Monitor — Sonnet, autonomous mode safety checks
  { pattern: 'security monitor for autonomous', label: 'Security Monitor' },
  // Claude Code Guide Agent — answers questions about Claude Code/SDK/API
  { pattern: 'Claude guide agent', label: 'Guide Agent' },
  // General Agent — Opus/Sonnet, the main subagent workhorse (~6K/day)
  // Must be LAST: "You are an agent for Claude Code" is broad; more specific patterns above take priority
  { pattern: 'You are an agent for Claude Code', label: 'General Agent' },
  // Legacy pattern (older Claude Code versions)
  { pattern: 'general-purpose agent', label: 'General Agent' },
  // Title/name generation — Haiku utility calls for session management
  { pattern: 'Generate a concise, sentence-case title', label: 'Title Generation' },
  { pattern: 'Generate a short kebab-case name', label: 'Name Generation' },
];

/**
 * Detect sub-agent from Anthropic system content blocks.
 */
export function getSubagentLabel(system?: ContentBlock[] | null): string | null {
  if (!system || !Array.isArray(system)) return null;
  for (const block of system) {
    if (typeof block.text !== 'string') continue;
    for (const ind of SUBAGENT_INDICATORS) {
      if (block.text.includes(ind.pattern)) return ind.label;
    }
  }
  return null;
}

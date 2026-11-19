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
  { pattern: 'file search specialist', label: 'Explore Agent' },
  { pattern: 'READ-ONLY exploration task', label: 'Explore Agent' },
  { pattern: 'software architect', label: 'Plan Agent' },
  { pattern: 'code-reviewer', label: 'Code Review Agent' },
  { pattern: 'You are a verification orchestrator', label: 'Verification Agent' },
  { pattern: 'verification specialist', label: 'Verification Agent' },
  { pattern: 'assistant for performing a web search', label: 'Web Search Agent' },
  { pattern: 'security monitor for autonomous', label: 'Security Monitor' },
  { pattern: 'Claude guide agent', label: 'Guide Agent' },
  { pattern: 'You are an agent for Claude Code', label: 'General Agent' },
  { pattern: 'general-purpose agent', label: 'General Agent' },
  { pattern: 'Generate a concise, sentence-case title', label: 'Title Generation' },
  { pattern: 'Generate a short kebab-case name', label: 'Name Generation' },
];

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

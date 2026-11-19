import { describe, it, expect } from 'vitest';
import {
  type ContentBlock,
  getSubagentLabel,
  SUBAGENT_INDICATORS,
} from '@/lib/agentic-workload-explorer/subagent';

describe('getSubagentLabel', () => {
  it('returns null for null input', () => {
    expect(getSubagentLabel(null)).toBeNull();
  });

  it('returns null for undefined input', () => {
    expect(getSubagentLabel(undefined)).toBeNull();
  });

  it('returns null for empty array', () => {
    expect(getSubagentLabel([])).toBeNull();
  });

  it('returns null for non-array input', () => {
    expect(getSubagentLabel('not an array' as unknown as ContentBlock[])).toBeNull();
  });

  it('returns null for blocks without text', () => {
    expect(getSubagentLabel([{ type: 'image' }])).toBeNull();
  });

  it('returns null for blocks with non-matching text', () => {
    expect(getSubagentLabel([{ type: 'text', text: 'You are a helpful assistant' }])).toBeNull();
  });

  it('detects Explore Agent via "file search specialist"', () => {
    expect(
      getSubagentLabel([{ type: 'text', text: 'You are a file search specialist for codebases' }]),
    ).toBe('Explore Agent');
  });

  it('detects Explore Agent via "READ-ONLY exploration task"', () => {
    expect(getSubagentLabel([{ type: 'text', text: 'This is a READ-ONLY exploration task' }])).toBe(
      'Explore Agent',
    );
  });

  it('detects Code Review Agent', () => {
    expect(getSubagentLabel([{ type: 'text', text: 'You are a code-reviewer agent' }])).toBe(
      'Code Review Agent',
    );
  });

  it('detects Plan Agent', () => {
    expect(
      getSubagentLabel([{ type: 'text', text: 'You are a software architect designing systems' }]),
    ).toBe('Plan Agent');
  });

  it('detects Verification Agent', () => {
    expect(
      getSubagentLabel([{ type: 'text', text: 'You are a verification orchestrator for tests' }]),
    ).toBe('Verification Agent');
  });

  it('detects General Agent via actual subagent prompt', () => {
    expect(
      getSubagentLabel([
        { type: 'text', text: "You are an agent for Claude Code, Anthropic's official CLI" },
      ]),
    ).toBe('General Agent');
  });

  it('detects General Agent via legacy pattern', () => {
    expect(getSubagentLabel([{ type: 'text', text: 'You are a general-purpose agent' }])).toBe(
      'General Agent',
    );
  });

  it('detects Web Search Agent', () => {
    expect(
      getSubagentLabel([
        { type: 'text', text: 'You are an assistant for performing a web search tool use' },
      ]),
    ).toBe('Web Search Agent');
  });

  it('detects Security Monitor', () => {
    expect(
      getSubagentLabel([
        { type: 'text', text: 'You are a security monitor for autonomous AI coding agents' },
      ]),
    ).toBe('Security Monitor');
  });

  it('detects Verification Agent via "verification specialist"', () => {
    expect(getSubagentLabel([{ type: 'text', text: 'You are a verification specialist' }])).toBe(
      'Verification Agent',
    );
  });

  it('detects Title Generation', () => {
    expect(
      getSubagentLabel([
        { type: 'text', text: 'Generate a concise, sentence-case title (3-7 words)' },
      ]),
    ).toBe('Title Generation');
  });

  it('detects Name Generation', () => {
    expect(
      getSubagentLabel([{ type: 'text', text: 'Generate a short kebab-case name (2-4 words)' }]),
    ).toBe('Name Generation');
  });

  it('matches pattern embedded in longer text', () => {
    expect(
      getSubagentLabel([
        {
          type: 'text',
          text: 'Some preamble. You are a file search specialist and should find files. More text.',
        },
      ]),
    ).toBe('Explore Agent');
  });

  it('returns first match when multiple blocks match', () => {
    expect(
      getSubagentLabel([
        { type: 'text', text: 'You are a software architect' },
        { type: 'text', text: 'You are a general-purpose agent' },
      ]),
    ).toBe('Plan Agent');
  });

  it('skips blocks without text and matches later blocks', () => {
    expect(
      getSubagentLabel([{ type: 'image' }, { type: 'text', text: 'You are a code-reviewer' }]),
    ).toBe('Code Review Agent');
  });

  it('has the expected number of indicators', () => {
    expect(SUBAGENT_INDICATORS.length).toBe(13);
  });
});

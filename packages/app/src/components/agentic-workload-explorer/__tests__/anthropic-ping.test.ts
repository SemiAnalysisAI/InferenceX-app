import { describe, it, expect } from 'vitest';
import { isAnthropicHealthPing } from '@/lib/agentic-workload-explorer/anthropic-ping';

const CANONICAL_PING = {
  model: 'claude-haiku-4-5-20251001',
  messages: [{ role: 'user', content: null }],
  max_tokens: 1,
  temperature: 1,
};

describe('isAnthropicHealthPing (dashboard mirror)', () => {
  it('matches the canonical ping body', () => {
    expect(isAnthropicHealthPing(CANONICAL_PING)).toBe(true);
  });

  it('matches across haiku versions', () => {
    expect(isAnthropicHealthPing({ ...CANONICAL_PING, model: 'claude-3-5-haiku-20241022' })).toBe(
      true,
    );
  });

  it('rejects non-haiku models', () => {
    expect(isAnthropicHealthPing({ ...CANONICAL_PING, model: 'claude-opus-4-7' })).toBe(false);
  });

  it('rejects when max_tokens !== 1', () => {
    expect(isAnthropicHealthPing({ ...CANONICAL_PING, max_tokens: 2 })).toBe(false);
  });

  it('matches across content variants (null, empty string, "test")', () => {
    expect(
      isAnthropicHealthPing({
        ...CANONICAL_PING,
        messages: [{ role: 'user', content: 'test' }],
      }),
    ).toBe(true);
    expect(
      isAnthropicHealthPing({
        ...CANONICAL_PING,
        messages: [{ role: 'user', content: '' }],
      }),
    ).toBe(true);
  });

  it('rejects when tools or system are present', () => {
    expect(isAnthropicHealthPing({ ...CANONICAL_PING, tools: [{ name: 't' }] })).toBe(false);
    expect(
      isAnthropicHealthPing({ ...CANONICAL_PING, system: [{ type: 'text', text: 'x' }] }),
    ).toBe(false);
  });

  it('rejects non-object inputs', () => {
    expect(isAnthropicHealthPing(null)).toBe(false);
    expect(isAnthropicHealthPing(undefined)).toBe(false);
    expect(isAnthropicHealthPing([])).toBe(false);
    expect(isAnthropicHealthPing('a string')).toBe(false);
  });
});

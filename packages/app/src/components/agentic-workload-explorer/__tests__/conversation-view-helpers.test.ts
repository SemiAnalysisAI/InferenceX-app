import { describe, it, expect } from 'vitest';
import {
  extractTextFromContent,
  stripSystemReminders,
} from '@/components/agentic-workload-explorer/conversation-view';

// ---------------------------------------------------------------------------
// extractTextFromContent
// ---------------------------------------------------------------------------

describe('extractTextFromContent', () => {
  it('returns empty string for undefined', () => {
    expect(extractTextFromContent(undefined)).toBe('');
  });

  it('returns empty string for empty string', () => {
    expect(extractTextFromContent('')).toBe('');
  });

  it('returns string input as-is', () => {
    expect(extractTextFromContent('hello world')).toBe('hello world');
  });

  it('returns JSON for non-array non-string truthy input', () => {
    expect(extractTextFromContent({ key: 'val' } as never)).toBe('{"key":"val"}');
  });

  it('extracts text from single text block', () => {
    const content = [{ type: 'text' as const, text: 'hello' }];
    expect(extractTextFromContent(content)).toBe('hello');
  });

  it('joins multiple text blocks with newline', () => {
    const content = [
      { type: 'text' as const, text: 'line 1' },
      { type: 'text' as const, text: 'line 2' },
    ];
    expect(extractTextFromContent(content)).toBe('line 1\nline 2');
  });

  it('returns [content stripped] when all text blocks have null text', () => {
    const content = [
      { type: 'text' as const, text: null },
      { type: 'text' as const, text: null },
    ];
    expect(extractTextFromContent(content as never)).toBe('[content stripped]');
  });

  it('filters out null text blocks when mixed with non-null', () => {
    const content = [
      { type: 'text' as const, text: 'visible' },
      { type: 'text' as const, text: null },
    ];
    expect(extractTextFromContent(content as never)).toBe('visible');
  });

  it('skips non-text blocks', () => {
    const content = [
      { type: 'tool_use' as const, name: 'bash' },
      { type: 'text' as const, text: 'hello' },
    ];
    expect(extractTextFromContent(content as never)).toBe('hello');
  });

  it('returns empty string for empty array', () => {
    expect(extractTextFromContent([])).toBe('');
  });

  it('returns empty string for array with only non-text blocks', () => {
    const content = [{ type: 'tool_use' as const, name: 'read' }];
    expect(extractTextFromContent(content as never)).toBe('');
  });

  it('JSON-stringifies non-string non-null text values', () => {
    const content = [{ type: 'text' as const, text: { nested: true } }];
    expect(extractTextFromContent(content as never)).toBe('{"nested":true}');
  });
});

// ---------------------------------------------------------------------------
// stripSystemReminders
// ---------------------------------------------------------------------------

describe('stripSystemReminders', () => {
  it('returns text unchanged when no system-reminder tags', () => {
    expect(stripSystemReminders('Hello world')).toBe('Hello world');
  });

  it('strips a single system-reminder block', () => {
    expect(stripSystemReminders('Before <system-reminder>secret</system-reminder> After')).toBe(
      'Before  After',
    );
  });

  it('strips multiple system-reminder blocks', () => {
    const text = '<system-reminder>a</system-reminder>Hi<system-reminder>b</system-reminder>';
    expect(stripSystemReminders(text)).toBe('Hi');
  });

  it('handles multiline system-reminder content', () => {
    const text = 'Start\n<system-reminder>\nline1\nline2\n</system-reminder>\nEnd';
    expect(stripSystemReminders(text)).toBe('Start\n\nEnd');
  });

  it('returns empty string when entire text is a system-reminder', () => {
    expect(stripSystemReminders('<system-reminder>everything</system-reminder>')).toBe('');
  });

  it('trims result', () => {
    expect(stripSystemReminders('  hello  ')).toBe('hello');
  });
});

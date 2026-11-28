import { describe, it, expect } from 'bun:test';
import { SEQUENCE_KEYS, islOslToSequence, rowToSequence, sequenceToIslOsl } from './sequences';

describe('sequenceToIslOsl', () => {
  it('parses 1k/1k to 1024/1024', () => {
    expect(sequenceToIslOsl('1k/1k')).toEqual({ isl: 1024, osl: 1024 });
  });

  it('parses 1k/8k to 1024/8192', () => {
    expect(sequenceToIslOsl('1k/8k')).toEqual({ isl: 1024, osl: 8192 });
  });

  it('parses 8k/1k to 8192/1024', () => {
    expect(sequenceToIslOsl('8k/1k')).toEqual({ isl: 8192, osl: 1024 });
  });

  it('returns null for sequences without fixed lengths', () => {
    expect(sequenceToIslOsl('agentic-traces')).toBeNull();
    expect(sequenceToIslOsl('2k/2k')).toBeNull();
    expect(sequenceToIslOsl('')).toBeNull();
    expect(sequenceToIslOsl('invalid')).toBeNull();
  });
});

describe('islOslToSequence', () => {
  it('converts 1024/1024 to 1k/1k', () => {
    expect(islOslToSequence(1024, 1024)).toBe('1k/1k');
  });

  it('converts 1024/8192 to 1k/8k', () => {
    expect(islOslToSequence(1024, 8192)).toBe('1k/8k');
  });

  it('returns null for unmapped ISL/OSL pairs', () => {
    expect(islOslToSequence(2048, 2048)).toBeNull();
    expect(islOslToSequence(0, 0)).toBeNull();
  });

  it('round-trips with sequenceToIslOsl for every fixed-length sequence', () => {
    const fixed = SEQUENCE_KEYS.filter((seq) => sequenceToIslOsl(seq));
    expect(fixed).toEqual(['1k/1k', '1k/8k', '8k/1k']);
    for (const seq of fixed) {
      const parsed = sequenceToIslOsl(seq)!;
      expect(islOslToSequence(parsed.isl, parsed.osl)).toBe(seq);
    }
  });
});

describe('rowToSequence', () => {
  it('classifies agentic rows by benchmark type and fixed rows by length', () => {
    expect(rowToSequence({ isl: null, osl: null, benchmark_type: 'agentic_traces' })).toBe(
      'agentic-traces',
    );
    expect(rowToSequence({ isl: 8192, osl: 1024, benchmark_type: 'single_turn' })).toBe('8k/1k');
    expect(rowToSequence({ isl: null, osl: 1024, benchmark_type: 'single_turn' })).toBeNull();
  });
});

import { describe, it, expect } from 'vitest';
import {
  DB_MODEL_TO_DISPLAY,
  DISPLAY_MODEL_TO_DB,
  sequenceToIslOsl,
  islOslToSequence,
} from './models';

describe('DB_MODEL_TO_DISPLAY / DISPLAY_MODEL_TO_DB consistency', () => {
  it('DISPLAY_MODEL_TO_DB is the complete inverse of DB_MODEL_TO_DISPLAY (many-to-one)', () => {
    for (const [dbKey, displayName] of Object.entries(DB_MODEL_TO_DISPLAY)) {
      expect(DISPLAY_MODEL_TO_DB[displayName]).toContain(dbKey);
    }
    const totalDbKeys = Object.values(DISPLAY_MODEL_TO_DB).flat().length;
    expect(totalDbKeys).toBe(Object.keys(DB_MODEL_TO_DISPLAY).length);
  });

  it('groups point-release DB keys under the same display name', () => {
    expect(DISPLAY_MODEL_TO_DB['GLM-5']).toEqual(expect.arrayContaining(['glm5', 'glm5.1']));
    expect(DISPLAY_MODEL_TO_DB['Kimi-K2.5']).toEqual(
      expect.arrayContaining(['kimik2.5', 'kimik2.6']),
    );
    expect(DISPLAY_MODEL_TO_DB['MiniMax-M2.5']).toEqual(
      expect.arrayContaining(['minimaxm2.5', 'minimaxm2.7']),
    );
  });
});

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

  it('returns null for unknown sequences', () => {
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

  it('round-trips with sequenceToIslOsl for all known sequences', () => {
    for (const seq of ['1k/1k', '1k/8k', '8k/1k']) {
      const parsed = sequenceToIslOsl(seq)!;
      expect(islOslToSequence(parsed.isl, parsed.osl)).toBe(seq);
    }
  });
});

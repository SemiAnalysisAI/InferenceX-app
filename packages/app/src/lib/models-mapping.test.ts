import { describe, it, expect } from 'vitest';

import {
  DB_MODEL_TO_DISPLAY,
  DISPLAY_MODEL_TO_DB,
  sequenceToIslOsl,
  islOslToSequence,
} from '@semianalysisai/inferencex-constants';

describe('DB_MODEL_TO_DISPLAY', () => {
  it('maps all known DB keys to display names', () => {
    expect(DB_MODEL_TO_DISPLAY['dsr1']).toBe('DeepSeek-R1-0528');
    expect(DB_MODEL_TO_DISPLAY['gptoss120b']).toBe('gpt-oss-120b');
    expect(DB_MODEL_TO_DISPLAY['llama70b']).toBe('Llama-3.3-70B-Instruct-FP8');
    expect(DB_MODEL_TO_DISPLAY['qwen3.5']).toBe('Qwen-3.5-397B-A17B');
    expect(DB_MODEL_TO_DISPLAY['kimik2.5']).toBe('Kimi-K2.5');
    expect(DB_MODEL_TO_DISPLAY['minimaxm2.5']).toBe('MiniMax-M2.5');
  });
});

describe('DISPLAY_MODEL_TO_DB', () => {
  it('is the exact inverse of DB_MODEL_TO_DISPLAY', () => {
    for (const [dbKey, displayName] of Object.entries(DB_MODEL_TO_DISPLAY)) {
      expect(DISPLAY_MODEL_TO_DB[displayName]).toBe(dbKey);
    }
  });

  it('maps display names back to DB keys', () => {
    expect(DISPLAY_MODEL_TO_DB['DeepSeek-R1-0528']).toBe('dsr1');
    expect(DISPLAY_MODEL_TO_DB['gpt-oss-120b']).toBe('gptoss120b');
  });
});

describe('sequenceToIslOsl', () => {
  it('converts 1k/1k to 1024/1024', () => {
    expect(sequenceToIslOsl('1k/1k')).toEqual({ isl: 1024, osl: 1024 });
  });

  it('converts 1k/8k to 1024/8192', () => {
    expect(sequenceToIslOsl('1k/8k')).toEqual({ isl: 1024, osl: 8192 });
  });

  it('converts 8k/1k to 8192/1024', () => {
    expect(sequenceToIslOsl('8k/1k')).toEqual({ isl: 8192, osl: 1024 });
  });

  it('returns null for unknown sequences', () => {
    expect(sequenceToIslOsl('4k/4k')).toBeNull();
    expect(sequenceToIslOsl('')).toBeNull();
  });
});

describe('islOslToSequence', () => {
  it('converts 1024/1024 to 1k/1k', () => {
    expect(islOslToSequence(1024, 1024)).toBe('1k/1k');
  });

  it('converts 1024/8192 to 1k/8k', () => {
    expect(islOslToSequence(1024, 8192)).toBe('1k/8k');
  });

  it('converts 8192/1024 to 8k/1k', () => {
    expect(islOslToSequence(8192, 1024)).toBe('8k/1k');
  });

  it('returns null for unknown ISL/OSL combos', () => {
    expect(islOslToSequence(4096, 4096)).toBeNull();
    expect(islOslToSequence(0, 0)).toBeNull();
  });

  it('round-trips with sequenceToIslOsl', () => {
    for (const seq of ['1k/1k', '1k/8k', '8k/1k']) {
      const islOsl = sequenceToIslOsl(seq)!;
      expect(islOslToSequence(islOsl.isl, islOsl.osl)).toBe(seq);
    }
  });
});

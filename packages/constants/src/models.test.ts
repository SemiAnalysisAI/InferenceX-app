import { describe, it, expect } from 'bun:test';
import {
  DB_MODEL_RELEASE_NAMES,
  DB_MODEL_TO_DISPLAY,
  DISPLAY_MODEL_TO_DB,
  MODEL_REGISTRY,
  getModelReleaseDate,
} from './models';

describe('DB_MODEL_TO_DISPLAY / DISPLAY_MODEL_TO_DB consistency', () => {
  it('preserves the legacy database and display identities', () => {
    expect(DB_MODEL_TO_DISPLAY).toMatchObject({
      dsr1: 'DeepSeek-R1-0528',
      gptoss120b: 'gpt-oss-120b',
      llama70b: 'Llama-3.3-70B-Instruct-FP8',
      'qwen3.5': 'Qwen-3.5-397B-A17B',
      'kimik2.5': 'Kimi-K2.5',
      'minimaxm2.5': 'MiniMax-M2.5',
    });
    expect(DISPLAY_MODEL_TO_DB['DeepSeek-R1-0528']).toEqual(['dsr1']);
    expect(DISPLAY_MODEL_TO_DB['gpt-oss-120b']).toEqual(['gptoss120b']);
  });

  it('DISPLAY_MODEL_TO_DB is the complete inverse of DB_MODEL_TO_DISPLAY (many-to-one)', () => {
    for (const [dbKey, displayName] of Object.entries(DB_MODEL_TO_DISPLAY)) {
      expect(DISPLAY_MODEL_TO_DB[displayName]).toContain(dbKey);
    }
    const totalDbKeys = Object.values(DISPLAY_MODEL_TO_DB).flat().length;
    expect(totalDbKeys).toBe(Object.keys(DB_MODEL_TO_DISPLAY).length);
  });

  it('keeps GLM-5.2 separate from the GLM-5/5.1 display bucket', () => {
    expect(DISPLAY_MODEL_TO_DB['GLM-5']).toEqual(['glm5', 'glm5.1']);
    expect(DISPLAY_MODEL_TO_DB['GLM-5.2']).toEqual(['glm5.2', 'glm5.3']);
    expect(DISPLAY_MODEL_TO_DB['Kimi-K2.5']).toEqual(
      expect.arrayContaining(['kimik2.5', 'kimik2.6', 'kimik2.7-code']),
    );
    expect(DISPLAY_MODEL_TO_DB['MiniMax-M2.5']).toEqual(
      expect.arrayContaining(['minimaxm2.5', 'minimaxm2.7']),
    );
  });

  it('maps minimaxm3 to its own MiniMax-M3 display name', () => {
    expect(DISPLAY_MODEL_TO_DB['MiniMax-M3']).toEqual(['minimaxm3']);
  });

  it('keeps GLM-5.3-Flash separate from both historical GLM buckets', () => {
    expect(DISPLAY_MODEL_TO_DB['GLM-5.3-Flash']).toEqual(['glm5.3flash']);
    expect(DISPLAY_MODEL_TO_DB['GLM-5.2']).toEqual(['glm5.2', 'glm5.3']);
    expect(DISPLAY_MODEL_TO_DB['GLM-5']).toEqual(['glm5', 'glm5.1']);
    expect(getModelReleaseDate('GLM-5.3-Flash')).toBeNull();
  });

  it('keeps minimaxm31flash in its own MiniMax-M3.1-Flash display bucket', () => {
    expect(DISPLAY_MODEL_TO_DB['MiniMax-M3.1-Flash']).toEqual(['minimaxm31flash']);
    expect(DISPLAY_MODEL_TO_DB['MiniMax-M3']).not.toContain('minimaxm31flash');
  });

  it('keeps kimik3.1 in its own Kimi-K3.1-Pro display bucket', () => {
    expect(DISPLAY_MODEL_TO_DB['Kimi-K3.1-Pro']).toEqual(['kimik3.1']);
    expect(DISPLAY_MODEL_TO_DB['Kimi-K3']).toEqual(['kimik3']);
  });

  it('keeps kimik3 out of the grouped Kimi-K2.5 display bucket', () => {
    expect(DISPLAY_MODEL_TO_DB['Kimi-K3']).toEqual(['kimik3']);
    expect(DISPLAY_MODEL_TO_DB['Kimi-K2.5']).not.toContain('kimik3');
  });
});

describe('MODEL_REGISTRY', () => {
  const releaseDates = Object.entries(MODEL_REGISTRY).flatMap(([model, entry]) =>
    entry.releaseDate ? [[model, entry.releaseDate] as const] : [],
  );

  it('stores every date as a real calendar day in YYYY-MM-DD', () => {
    for (const [model, date] of releaseDates) {
      expect(date, model).toMatch(/^\d{4}-\d{2}-\d{2}$/u);
      expect(new Date(`${date}T00:00:00Z`).toISOString().slice(0, 10), model).toBe(date);
    }
  });

  it('has no model releasing in the future', () => {
    const today = new Date().toISOString().slice(0, 10);
    for (const [model, date] of releaseDates) {
      expect(
        date.localeCompare(today),
        `${model} released ${date}, after today`,
      ).toBeLessThanOrEqual(0);
    }
  });

  it('gives every model a slug no other model or slug alias uses', () => {
    const slugs = Object.values(MODEL_REGISTRY).flatMap((entry) => [
      entry.slug,
      ...(entry.slugAliases ?? []),
    ]);
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  it('stores each DB key under exactly one model', () => {
    const dbKeys = Object.values(MODEL_REGISTRY).flatMap((entry) => entry.dbKeys);
    expect(new Set(dbKeys).size).toBe(dbKeys.length);
  });

  it('names a point-release bucket by its own release and other buckets by their model', () => {
    expect(DB_MODEL_RELEASE_NAMES['kimik2.6']).toBe('Kimi-K2.6');
    expect(DB_MODEL_RELEASE_NAMES['glm5.3']).toBe('GLM-5.3');
    expect(DB_MODEL_RELEASE_NAMES['kimik2.5']).toBe('Kimi-K2.5');
    expect(DB_MODEL_RELEASE_NAMES.dsv4).toBe('DeepSeek-V4-Pro');
  });

  it('returns null rather than throwing for a model with no sourced date', () => {
    expect(getModelReleaseDate('not-a-model')).toBeNull();
    expect(getModelReleaseDate('')).toBeNull();
  });
});

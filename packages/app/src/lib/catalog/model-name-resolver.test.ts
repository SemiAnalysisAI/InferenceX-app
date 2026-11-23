import { describe, expect, it } from 'bun:test';

import { DB_MODEL_TO_DISPLAY, DISPLAY_MODEL_TO_DB } from '@semianalysisai/inferencex-constants';

import { COMPARE_MODEL_ALIASES, COMPARE_MODEL_SLUGS } from '@/lib/compare/compare-slug';

import { LEGACY_MODEL_NAMES, MODEL_DISPLAY_NAMES, resolveModelName } from './model-name-resolver';

const displayOf = (value: string) => resolveModelName(value)?.displayName ?? null;
const slugDisplay = (slug: string) =>
  COMPARE_MODEL_SLUGS.find((entry) => entry.slug === slug)!.displayName;

describe('resolveModelName', () => {
  it('resolves every display name, case-insensitively, to its whole DB bucket', () => {
    for (const name of MODEL_DISPLAY_NAMES) {
      expect(resolveModelName(name)).toEqual({
        displayName: name,
        dbModelKeys: DISPLAY_MODEL_TO_DB[name],
      });
      expect(displayOf(name.toUpperCase())).toBe(name);
    }
    expect(displayOf('  DeepSeek-V4-Pro  ')).toBe('DeepSeek-V4-Pro');
  });

  it('resolves every DB model key to the display model that contains it', () => {
    for (const [dbKey, displayName] of Object.entries(DB_MODEL_TO_DISPLAY)) {
      expect(displayOf(dbKey)).toBe(displayName);
    }
    // A point-release key selects its whole display bucket, as the dashboard groups it.
    expect(resolveModelName('kimik2.6')?.dbModelKeys).toEqual(DISPLAY_MODEL_TO_DB['Kimi-K2.5']);
    expect(displayOf('DSV4')).toBe('DeepSeek-V4-Pro');
  });

  it('resolves every dashboard slug, and slug aliases that name one model', () => {
    for (const { slug, displayName } of COMPARE_MODEL_SLUGS) {
      expect(displayOf(slug)).toBe(displayName);
    }
    for (const alias of ['llama', 'gptoss', 'kimi-k25', 'minimax-m25', 'glm-5-2']) {
      expect(displayOf(alias)).toBe(slugDisplay(COMPARE_MODEL_ALIASES[alias]!));
    }
    // The views API keeps every compare-page alias, family names included.
    for (const [alias, slug] of Object.entries(COMPARE_MODEL_ALIASES)) {
      expect(resolveModelName(alias, { familyAliases: true })?.displayName).toBe(slugDisplay(slug));
    }
  });

  // Values seen in 400 responses from outside API clients (Vercel logs, Nov 2026).
  it.each([
    ['Qwen3.5-397B-A17B', 'Qwen-3.5-397B-A17B'],
    ['qwen3.5-397b-a17b', 'Qwen-3.5-397B-A17B'],
    ['DeepSeek-V4-Pro-0813', 'DeepSeek-V4-Pro'],
    ['Kimi-K2.6', 'Kimi-K2.5'],
    ['Kimi-K3.1', 'Kimi-K3.1-Pro'],
    ['GLM-5.3', 'GLM-5.2'],
    ['GLM-5.1', 'GLM-5'],
    ['MiniMax-M2.7', 'MiniMax-M2.5'],
    ['DeepSeek-V4', 'DeepSeek-V4-Pro'],
    ['DeepSeek-R1', 'DeepSeek-R1-0528'],
    ['kimi-k3', 'Kimi-K3'],
    ['kimi-k31-pro', 'Kimi-K3.1-Pro'],
  ])('resolves the legacy or slug form %s to %s', (value, displayName) => {
    expect(displayOf(value)).toBe(displayName);
  });

  it('maps each legacy name to a current display model without shadowing another form', () => {
    const otherForms = new Set(
      [
        ...MODEL_DISPLAY_NAMES,
        ...Object.keys(DB_MODEL_TO_DISPLAY),
        ...COMPARE_MODEL_SLUGS.map((entry) => entry.slug),
        ...Object.keys(COMPARE_MODEL_ALIASES),
      ].map((name) => name.toLowerCase()),
    );
    for (const [legacy, displayName] of Object.entries(LEGACY_MODEL_NAMES)) {
      expect(MODEL_DISPLAY_NAMES).toContain(displayName);
      expect(otherForms.has(legacy.toLowerCase())).toBe(false);
    }
  });

  it('keeps DB keys distinct from slugs, so no form resolves two ways', () => {
    const slugs = new Set([
      ...COMPARE_MODEL_SLUGS.map((entry) => entry.slug),
      ...Object.keys(COMPARE_MODEL_ALIASES),
    ]);
    for (const dbKey of Object.keys(DB_MODEL_TO_DISPLAY)) expect(slugs.has(dbKey)).toBe(false);
  });

  it.each([
    // Could mean Qwen3.8-Flash-Next, Qwen3.8-27B, or Qwen3.8-27B-Eager.
    'Qwen3.8',
    // There is no V4 Flash; V4.1-Flash is a different architecture.
    'DeepSeek-V4-Flash',
    // A precision suffix is not part of a model name.
    'DeepSeek-V4.1-Flash-FP4',
    // Family aliases name several current models.
    'deepseek',
    'kimi',
    'qwen',
    'glm',
    'minimax',
    'not-a-model',
    '',
    '__proto__',
    'constructor',
    'toString',
  ])('rejects the unknown or ambiguous value %p', (value) => {
    expect(resolveModelName(value)).toBeNull();
  });
});

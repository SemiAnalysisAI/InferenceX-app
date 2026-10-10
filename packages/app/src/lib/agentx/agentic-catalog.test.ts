import type { AgenticCatalogEntry } from '@semianalysisai/inferencex-db/queries/agentic-catalog';
import { HW_REGISTRY } from '@semianalysisai/inferencex-constants';
import { describe, expect, it } from 'vitest';

import { groupAgenticCatalog } from './agentic-catalog';

function entry(overrides: Partial<AgenticCatalogEntry> = {}): AgenticCatalogEntry {
  return {
    id: 1,
    model: 'dsv4',
    hardware: 'b200',
    framework: 'vllm',
    precision: 'fp4',
    points: 10,
    minConc: 1,
    maxConc: 64,
    latestDate: '2026-08-19',
    ...overrides,
  };
}

describe('groupAgenticCatalog', () => {
  it('groups configs under their model and resolves registry labels', () => {
    const groups = groupAgenticCatalog([
      entry({ id: 1, hardware: 'b200', framework: 'vllm' }),
      entry({ id: 2, hardware: 'h200', framework: 'sglang', points: 5 }),
    ]);

    expect(groups).toHaveLength(1);
    const [group] = groups;
    expect(group.key).toBe('dsv4');
    // Same label the AgentX ledger uses, so the two catalogs agree.
    expect(group.label).toBe('DeepSeekv4 Pro 0813 1.6T');
    expect(group.totalPoints).toBe(15);
    expect(group.cards.map((card) => card.label)).toEqual(['B200 · vLLM', 'H200 · SGLang']);
    expect(group.cards[0]).toMatchObject({
      id: 1,
      hardwareKey: 'b200',
      precisionLabel: 'FP4',
      vendor: 'NVIDIA',
      arch: 'Blackwell',
    });
  });

  it('orders cards by the chart hardware sort, not insertion order', () => {
    const groups = groupAgenticCatalog([
      entry({ id: 1, hardware: 'h100' }),
      entry({ id: 2, hardware: 'b200' }),
      entry({ id: 3, hardware: 'h200' }),
    ]);

    const keys = groups[0].cards.map((card) => card.hardwareKey);
    const sorts = keys.map((key) => HW_REGISTRY[key].sort);
    expect(sorts).toEqual([...sorts].sort((a, b) => a - b));
  });

  it('leads with the model carrying the most telemetry points', () => {
    const groups = groupAgenticCatalog([
      entry({ id: 1, model: 'dsv4', points: 3 }),
      entry({ id: 2, model: 'kimik3', points: 40 }),
      entry({ id: 3, model: 'glm5.2', points: 12 }),
    ]);

    expect(groups.map((group) => group.key)).toEqual(['kimik3', 'glm5.2', 'dsv4']);
  });

  it('drops rows whose model or hardware is unknown to the registries', () => {
    // A card we cannot label is a card the reader cannot act on. Dropping beats
    // rendering "undefined · vLLM" or a raw DB key.
    const groups = groupAgenticCatalog([
      entry({ id: 1, model: 'not-a-model' }),
      entry({ id: 2, hardware: 'not-a-gpu' }),
      entry({ id: 3 }),
    ]);

    expect(groups).toHaveLength(1);
    expect(groups[0].cards.map((card) => card.id)).toEqual([3]);
  });

  it('keeps a model/SKU/engine pair with two precisions as two cards', () => {
    const groups = groupAgenticCatalog([
      entry({ id: 1, model: 'qwen3.5', precision: 'fp4' }),
      entry({ id: 2, model: 'qwen3.5', precision: 'fp8' }),
    ]);

    expect(groups[0].cards.map((card) => card.precisionLabel)).toEqual(['FP4', 'FP8']);
  });
});

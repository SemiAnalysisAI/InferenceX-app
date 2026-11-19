import { describe, expect, it } from 'vitest';
import { Model } from '@/lib/catalog/data-mappings';
import { defaultInferenceHardware, defaultInferenceXAxisMode } from './model-defaults';

describe('model chart defaults', () => {
  it('defaults only Qwen3.5 to E2EL', () => {
    expect(defaultInferenceXAxisMode(Model.Qwen3_5)).toBe('e2e');
    for (const model of Object.values(Model).filter((value) => value !== Model.Qwen3_5)) {
      expect(defaultInferenceXAxisMode(model)).toBe('interactivity');
    }
  });

  it('hides all configurations of the four older GPU families without changing the universe', () => {
    const hardware = new Set([
      'mi300x',
      'mi300x_vllm',
      'mi325x_sglang',
      'h100_trt',
      'h200_sglang_disagg',
      'mi355x_sglang',
      'b200_trt',
      'b300_vllm',
      'gb200_trt',
      'gb300_trt',
    ]);
    expect([...defaultInferenceHardware(Model.Qwen3_5, hardware)]).toEqual([
      'mi355x_sglang',
      'b200_trt',
      'b300_vllm',
      'gb200_trt',
      'gb300_trt',
    ]);
    expect(hardware.size).toBe(10);
    expect(defaultInferenceHardware(Model.DeepSeek_R1, hardware)).toBe(hardware);
  });
});

import { hardwareKeyMatchesAnyBase } from '@/lib/catalog/constants';
import { Model } from '@/lib/catalog/data-mappings';

const QWEN_DEFAULT_OFF_GPUS = ['mi300x', 'mi325x', 'h100', 'h200'] as const;

export function defaultInferenceXAxisMode(model: string): 'e2e' | 'interactivity' {
  return model === Model.Qwen3_5 ? 'e2e' : 'interactivity';
}

/** Filter automatic selections only; keep the full universe available to the legend. */
export function defaultInferenceHardware(model: string, hardware: Set<string>): Set<string> {
  if (model !== Model.Qwen3_5) return hardware;
  return new Set(
    [...hardware].filter((key) => !hardwareKeyMatchesAnyBase(key, QWEN_DEFAULT_OFF_GPUS)),
  );
}

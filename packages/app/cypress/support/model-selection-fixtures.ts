import { agenticMetrics } from './agentic-fixtures';

export const MODEL_SELECTION_DATE = '2026-10-12';
export const MODEL_SELECTION_MODELS = ['dsv4', 'dsv41flash'];
export const MODEL_SELECTION_DB_KEYS: Record<string, string> = {
  'DeepSeek-V4-Pro': 'dsv4',
  'DeepSeek-V4.1-Flash': 'dsv41flash',
};
const configs = [
  { hardware: 'gb300', framework: 'dynamo-sglang', disagg: true },
  { hardware: 'gb300', framework: 'vllm', disagg: false },
  { hardware: 'b200', framework: 'vllm', disagg: false },
];

export const modelSelectionAvailability = MODEL_SELECTION_MODELS.flatMap((model) =>
  configs.map((config) => ({
    ...config,
    model,
    isl: null,
    osl: null,
    precision: 'fp4',
    spec_method: 'none',
    benchmark_type: 'agentic_traces',
    date: MODEL_SELECTION_DATE,
  })),
);

export const modelSelectionBenchmarks = MODEL_SELECTION_MODELS.flatMap((model, modelIndex) =>
  configs.flatMap((config, configIndex) =>
    [16, 64, 128].map((conc, pointIndex) => {
      const winner =
        model === 'dsv4' ? config.framework === 'dynamo-sglang' : config.framework === 'vllm';
      const multiplier = winner ? 2 : 1;
      const metrics = agenticMetrics(conc);
      const throughput = multiplier * 500 * Math.sqrt(conc / 16);
      return {
        id: 990000 + modelIndex * 100 + configIndex * 10 + pointIndex,
        ...config,
        model,
        precision: 'fp4',
        spec_method: 'none',
        is_multinode: false,
        prefill_tp: 8,
        decode_tp: 8,
        num_prefill_gpu: 8,
        num_decode_gpu: 8,
        isl: null,
        osl: null,
        conc,
        offload_mode: 'off',
        benchmark_type: 'agentic_traces',
        image: `${config.framework}/server:test`,
        metrics: {
          ...metrics,
          tput_per_gpu: throughput,
          output_tput_per_gpu: throughput * 0.2,
          input_tput_per_gpu: throughput * 0.8,
          total_tput_tps: throughput * (config.disagg ? 16 : 8),
        },
        workers: null,
        date: MODEL_SELECTION_DATE,
        run_url: null,
      };
    }),
  ),
);

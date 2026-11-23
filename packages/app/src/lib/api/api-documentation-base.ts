import { DISPLAY_MODEL_TO_DB } from '@semianalysisai/inferencex-constants';

export const API_BASE_URL = 'https://inferencex.semianalysis.com' as const;

export const SUPPORTED_BENCHMARK_MODELS = Object.freeze(
  Object.keys(DISPLAY_MODEL_TO_DB).toSorted(),
);

/** The `model=` forms the benchmark reads and the views API accept (`resolveModelName`). */
export const MODEL_PARAM_FORMS = {
  en: 'Accepts the display name, a DB model key (dsv4, kimik3.1), a dashboard slug (kimi-k31-pro, deepseek-v4) or a retired name (Qwen3.5-397B-A17B, DeepSeek-V4-Pro-0813, Kimi-K2.6, Kimi-K3.1, GLM-5.1, GLM-5.3, MiniMax-M2.7, Llama-3.3-70B-Instruct), case-insensitively; each resolves to the display model that contains it.',
  zh: '接受展示名称、DB 模型键（如 dsv4、kimik3.1）、仪表板 slug（如 kimi-k31-pro、deepseek-v4）或旧名称（Qwen3.5-397B-A17B、DeepSeek-V4-Pro-0813、Kimi-K2.6、Kimi-K3.1、GLM-5.1、GLM-5.3、MiniMax-M2.7、Llama-3.3-70B-Instruct），不区分大小写，均解析为其所属的展示模型。',
} as const;

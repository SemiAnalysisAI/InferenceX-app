import type { Locale } from '@/lib/i18n/i18n';

const TAG_LABELS: Record<string, string> = {
  agentic: 'Agentic',
  agents: 'Agents',
  agentx: 'AgentX',
  amd: 'AMD',
  asic: 'ASIC',
  b200: 'B200',
  b300: 'B300',
  deepseek: 'DeepSeek',
  disagg: 'Disaggregated serving',
  fp4: 'FP4',
  fp8: 'FP8',
  gb200: 'GB200',
  gb300: 'GB300',
  glm5: 'GLM-5',
  gpu: 'GPU',
  h100: 'H100',
  h200: 'H200',
  'kv-cache': 'KV cache',
  minimax: 'MiniMax',
  mi355x: 'MI355X',
  nvfp4: 'NVFP4',
  nvidia: 'NVIDIA',
  nvl72: 'NVL72',
  openai: 'OpenAI',
  rocm: 'ROCm',
  sglang: 'SGLang',
  tilert: 'TileRT',
  tpu: 'TPU',
  trtllm: 'TRT-LLM',
  vllm: 'vLLM',
  'wide-ep': 'Wide EP',
};

const TAG_LABELS_ZH: Record<string, string> = {
  agentic: '智能体',
  agents: '智能体应用',
  announcement: '公告',
  benchmark: '基准测试',
  disagg: '分离式推理',
  engram: 'Engram',
  google: 'Google',
  huawei: '华为',
  inference: '推理',
  'kv-cache': 'KV 缓存',
  latency: '延迟',
  memory: '内存',
  offloading: '卸载',
  'sparse-attention': '稀疏注意力',
  throughput: '吞吐量',
};

export function blogTagLabel(tag: string, locale: Locale): string {
  const zh = locale === 'zh' ? TAG_LABELS_ZH[tag] : undefined;
  if (zh) return zh;
  const known = TAG_LABELS[tag];
  if (known) return known;
  const words = tag.replaceAll('-', ' ');
  return words.charAt(0).toUpperCase() + words.slice(1);
}

import type { Locale } from '@/lib/i18n/i18n';

import { QUOTES, type Quote } from './quotes-data';

/** One logo tile in the grouped supporter wall. */
export interface WallLogo {
  /** Accessible name shown as the image alt text. */
  label: string;
  /** File name under `public/logos/`. */
  logo: string;
  /** `Quote.org` this tile jumps to. Omit for logos without a quote on the page. */
  quoteOrg?: string;
}

export interface SupporterGroup {
  id: string;
  label: Record<Locale, string>;
  logos: WallLogo[];
  desktopColumns?: number;
}

/**
 * Curated groups, in display order. Any quote org with a logo that is not
 * referenced here lands in the derived "Other" group, so new quotes always
 * show up on the wall without editing this list.
 */
export const CURATED_SUPPORTER_GROUPS: SupporterGroup[] = [
  {
    id: 'ai-accelerators',
    label: { en: 'AI Accelerators', zh: 'AI 加速器' },
    logos: [
      { label: 'Google', logo: 'google-color.svg' },
      { label: 'AMD', logo: 'amd.svg', quoteOrg: 'AMD' },
      { label: 'NVIDIA', logo: 'nvidia-color.svg', quoteOrg: 'NVIDIA' },
      { label: 'OpenAI Jalapeño', logo: 'openai.svg', quoteOrg: 'OpenAI' },
      { label: 'SambaNova', logo: 'sambanova.webp', quoteOrg: 'SambaNova' },
    ],
  },
  {
    id: 'chinese-frontier-labs',
    label: { en: 'Chinese Frontier Labs', zh: '中国前沿实验室' },
    logos: [
      { label: 'Kimi', logo: 'kimi-color.svg' },
      { label: 'Moonshot AI', logo: 'moonshot-ai.svg', quoteOrg: 'Moonshot AI' },
      { label: 'Alibaba Qwen', logo: 'qwen-color.svg', quoteOrg: 'Alibaba Qwen' },
      { label: 'Zhipu GLM', logo: 'zai-color.svg', quoteOrg: 'Zhipu GLM' },
      { label: 'MiniMax', logo: 'minimax-color.svg', quoteOrg: 'MiniMax' },
    ],
  },
  {
    id: 'us-frontier-labs',
    label: { en: 'US Frontier Labs & NeoLabs', zh: '美国前沿实验室与 NeoLabs' },
    logos: [
      { label: 'OpenAI', logo: 'openai.svg', quoteOrg: 'OpenAI' },
      {
        label: 'Meta Superintelligence Labs',
        logo: 'meta.svg',
        quoteOrg: 'Meta Superintelligence Labs',
      },
      { label: 'Google', logo: 'google-color.svg', quoteOrg: 'Google' },
      { label: 'Prime Intellect', logo: 'prime-intellect.svg', quoteOrg: 'Prime Intellect' },
      { label: 'Adaptive ML', logo: 'adaptive-ml.svg', quoteOrg: 'Adaptive ML' },
      { label: 'Periodic Labs', logo: 'periodic-labs.png', quoteOrg: 'Periodic Labs' },
    ],
  },
  {
    id: 'hyperscalers-neoclouds',
    label: { en: 'Hyperscalers & Neoclouds', zh: '超大规模云厂商与 Neocloud' },
    desktopColumns: 8,
    logos: [
      { label: 'Microsoft', logo: 'microsoft.svg', quoteOrg: 'Microsoft' },
      { label: 'Google Cloud', logo: 'google-color.svg' },
      { label: 'Oracle', logo: 'oracle.svg', quoteOrg: 'Oracle' },
      { label: 'CoreWeave', logo: 'coreweave.svg', quoteOrg: 'CoreWeave' },
      { label: 'Nebius', logo: 'nebius.svg', quoteOrg: 'Nebius' },
      { label: 'Together AI', logo: 'together-ai.svg', quoteOrg: 'Together AI' },
      { label: 'Lambda', logo: 'lambda.svg', quoteOrg: 'Lambda' },
      { label: 'Crusoe', logo: 'crusoe.svg', quoteOrg: 'Crusoe' },
      { label: 'GMI Cloud', logo: 'gmi-cloud.svg', quoteOrg: 'GMI Cloud' },
      { label: 'TensorWave', logo: 'tensorwave.svg', quoteOrg: 'TensorWave' },
      { label: 'Voltage Park', logo: 'voltage-park.svg', quoteOrg: 'Voltage Park' },
      { label: 'Firmus', logo: 'firmus.svg', quoteOrg: 'Firmus' },
      { label: 'Core42', logo: 'core42.webp', quoteOrg: 'Core42' },
      { label: 'Verda', logo: 'verda.svg', quoteOrg: 'Verda' },
      { label: 'Vultr', logo: 'vultr.svg', quoteOrg: 'Vultr' },
    ],
  },
  {
    id: 'managed-inference-providers',
    label: { en: 'Managed Inference Providers', zh: '托管推理服务商' },
    logos: [
      { label: 'Together AI', logo: 'together-ai.svg', quoteOrg: 'Together AI' },
      { label: 'GMI Cloud', logo: 'gmi-cloud.svg', quoteOrg: 'GMI Cloud' },
      { label: 'Nebius', logo: 'nebius.svg', quoteOrg: 'Nebius' },
      { label: 'Baseten', logo: 'baseten.svg', quoteOrg: 'Baseten' },
      { label: 'Crusoe', logo: 'crusoe.svg', quoteOrg: 'Crusoe' },
      { label: 'Tensormesh', logo: 'tensormesh.svg', quoteOrg: 'Tensormesh' },
      { label: 'Morph LLM', logo: 'morph.svg', quoteOrg: 'Morph LLM' },
    ],
  },
  {
    id: 'open-source',
    label: { en: 'Open Source', zh: '开源项目' },
    desktopColumns: 6,
    logos: [
      { label: 'SGLang', logo: 'sglang.webp', quoteOrg: 'SGLang' },
      { label: 'vLLM', logo: 'vllm.svg', quoteOrg: 'vLLM' },
      { label: 'PyTorch Foundation', logo: 'pytorch.svg', quoteOrg: 'PyTorch Foundation' },
      { label: 'Hugging Face', logo: 'huggingface.svg', quoteOrg: 'Hugging Face' },
      { label: 'KVCache.AI', logo: 'kvcache-ai.svg', quoteOrg: 'Mooncake' },
      { label: 'LMCache', logo: 'lmcache.webp', quoteOrg: 'LMCache' },
      { label: 'GPU Mode', logo: 'gpu-mode.png', quoteOrg: 'GPU Mode' },
      { label: 'TileRT', logo: 'tilert.webp', quoteOrg: 'TileRT' },
      { label: 'Anyscale', logo: 'anyscale.svg', quoteOrg: 'Anyscale' },
      { label: 'Red Hat', logo: 'redhat.svg', quoteOrg: 'Red Hat' },
      { label: 'EmbeddedLLM', logo: 'embeddedllm.webp', quoteOrg: 'EmbeddedLLM' },
    ],
  },
];

export const OTHER_GROUP_LABEL: Record<Locale, string> = { en: 'Other', zh: '其他' };

/** Curated groups followed by an "Other" group holding every remaining quote org with a logo. */
export function buildSupporterGroups(
  quotes: readonly Quote[] = QUOTES,
  curated: readonly SupporterGroup[] = CURATED_SUPPORTER_GROUPS,
): SupporterGroup[] {
  const placed = new Set(curated.flatMap((g) => g.logos.flatMap((l) => l.quoteOrg ?? [])));
  const other: WallLogo[] = [];
  for (const q of quotes) {
    if (!q.logo || placed.has(q.org)) continue;
    placed.add(q.org);
    other.push({ label: q.org, logo: q.logo, quoteOrg: q.org });
  }
  return other.length > 0
    ? [...curated, { id: 'other', label: OTHER_GROUP_LABEL, logos: other }]
    : [...curated];
}

export const SUPPORTER_GROUPS = buildSupporterGroups();

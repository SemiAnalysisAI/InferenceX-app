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
    id: 'chinese-frontier-labs',
    label: { en: 'Chinese frontier labs', zh: '中国前沿实验室' },
    logos: [
      { label: 'DeepSeek', logo: 'deepseek-color.svg' },
      { label: 'Kimi', logo: 'kimi-color.svg' },
      { label: 'Moonshot AI', logo: 'moonshot-ai.svg', quoteOrg: 'Moonshot AI' },
      { label: 'Alibaba Qwen', logo: 'qwen-color.svg', quoteOrg: 'Alibaba Qwen' },
      { label: 'Zhipu GLM', logo: 'zai-color.svg', quoteOrg: 'Zhipu GLM' },
      { label: 'MiniMax', logo: 'minimax-color.svg', quoteOrg: 'MiniMax' },
    ],
  },
  {
    id: 'us-frontier-labs',
    label: { en: 'US frontier labs', zh: '美国前沿实验室' },
    logos: [
      { label: 'OpenAI', logo: 'openai.svg', quoteOrg: 'OpenAI' },
      {
        label: 'Meta Superintelligence Labs',
        logo: 'meta.svg',
        quoteOrg: 'Meta Superintelligence Labs',
      },
      { label: 'Google', logo: 'google-color.svg', quoteOrg: 'Google' },
    ],
  },
  {
    id: 'hyperscalers-neoclouds',
    label: { en: 'Hyperscalers & Neoclouds', zh: '超大规模云厂商与 Neocloud' },
    desktopColumns: 6,
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
    ],
  },
  {
    id: 'open-source',
    label: { en: 'Open source', zh: '开源项目' },
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
    ],
  },
  {
    id: 'ai-accelerators',
    label: { en: 'AI accelerators', zh: 'AI 加速器' },
    logos: [
      { label: 'NVIDIA', logo: 'nvidia-color.svg', quoteOrg: 'NVIDIA' },
      { label: 'AMD', logo: 'amd.svg', quoteOrg: 'AMD' },
      { label: 'SambaNova', logo: 'sambanova.webp', quoteOrg: 'SambaNova' },
      { label: 'Google', logo: 'google-color.svg' },
    ],
  },
  {
    id: 'other',
    label: { en: 'Other', zh: '其他' },
    logos: [{ label: 'TokenSpeed', logo: 'tokenspeed.webp' }],
  },
];

export const OTHER_GROUP_LABEL: Record<Locale, string> = { en: 'Other', zh: '其他' };

/** Curated groups followed by an "Other" group holding every remaining quote org with a logo. */
export function buildSupporterGroups(
  quotes: readonly Quote[] = QUOTES,
  curated: readonly SupporterGroup[] = CURATED_SUPPORTER_GROUPS,
): SupporterGroup[] {
  const placed = new Set(curated.flatMap((g) => g.logos.flatMap((l) => l.quoteOrg ?? [])));
  const groups = curated.filter((g) => g.id !== 'other');
  const other: WallLogo[] = [...(curated.find((g) => g.id === 'other')?.logos ?? [])];
  for (const q of quotes) {
    if (!q.logo || placed.has(q.org)) continue;
    placed.add(q.org);
    other.push({ label: q.org, logo: q.logo, quoteOrg: q.org });
  }
  return other.length > 0
    ? [...groups, { id: 'other', label: OTHER_GROUP_LABEL, logos: other }]
    : [...groups];
}

export const SUPPORTER_GROUPS = buildSupporterGroups();

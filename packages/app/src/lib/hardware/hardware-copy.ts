import { SITE_NAME } from '@semianalysisai/inferencex-constants';

import type { Locale } from '@/lib/i18n/i18n';

export const HARDWARE_COPY = {
  en: {
    indexEyebrow: 'InferenceX Research',
    indexTitle: 'Hardware Results',
    indexIntro:
      'Head-to-head AgentX results for new accelerator systems: tokens per dollar of TCO, per megawatt and per chip at matched interactivity.',
    indexDescription: `Head-to-head ${SITE_NAME} AgentX results for new accelerator systems, comparing tokens per dollar of TCO, per megawatt and per chip at matched interactivity.`,
    indexEmpty: 'Coming soon.',
    readResults: 'Read the results',
  },
  zh: {
    indexEyebrow: 'InferenceX 研究',
    indexTitle: '硬件结果',
    indexIntro:
      '新一代加速器系统的 AgentX 对比结果：在相同交互性下，比较每美元 TCO、每 MW 和每颗芯片分别产出的 token 数。',
    indexDescription: `${SITE_NAME} 发布的新一代加速器系统 AgentX 对比结果，在相同交互性下比较每美元 TCO、每 MW 和每颗芯片分别产出的 token 数。`,
    indexEmpty: '即将上线。',
    readResults: '查看结果',
  },
} satisfies Record<Locale, unknown>;

import { AUTHOR_NAME, SITE_NAME } from '@semianalysisai/inferencex-constants';

import { clampMetaDescription, fitMetaTitle } from '@/lib/seo/meta-text';

const SOURCE_ZH = `数据来自 ${AUTHOR_NAME} 的 ${SITE_NAME} 开源基准测试，经过验证且可复现。`;

export function perDollarMetaTitleZh(gpuLabel: string, modelLabel: string): string {
  return fitMetaTitle([`${gpuLabel}：${modelLabel} 每美元性能`, `${gpuLabel}：${modelLabel}`]);
}

export function perDollarMetaDescriptionZh(gpuLabel: string, modelLabel: string): string {
  return clampMetaDescription(
    `${gpuLabel} 在 ${modelLabel} 上的每美元性能对比：各交互性水平下的每百万 token 成本，采用 Hyperscaler 自有设备 TCO 口径。${SOURCE_ZH}`,
    'zh',
  );
}

export function precisionMetaTitleZh(
  modelLabel: string,
  gpuLabel: string,
  aLabel: string,
  bLabel: string,
): string {
  return fitMetaTitle([
    `${modelLabel} ${gpuLabel}：${aLabel} 与 ${bLabel} 精度对比`,
    `${modelLabel}：${aLabel} 与 ${bLabel} 精度对比`,
    `${modelLabel}：${aLabel} 与 ${bLabel}`,
  ]);
}

export function precisionMetaDescriptionZh(
  modelLabel: string,
  gpuLabel: string,
  aLabel: string,
  bLabel: string,
): string {
  return clampMetaDescription(
    `在 ${gpuLabel} 上比较 ${aLabel} 与 ${bLabel} 两种量化精度对 ${modelLabel} 推理吞吐量和成本的影响，覆盖各交互性水平。${SOURCE_ZH}`,
    'zh',
  );
}

export function specDecodeMetaTitleZh(
  modelLabel: string,
  gpuLabel: string,
  precLabel: string,
  methodLabel: string,
): string {
  return fitMetaTitle([
    `${modelLabel} ${gpuLabel} ${precLabel}：${methodLabel} 投机解码对比`,
    `${modelLabel} ${gpuLabel}：${methodLabel} 投机解码对比`,
    `${modelLabel}：${methodLabel} 投机解码对比`,
  ]);
}

export function specDecodeMetaDescriptionZh(
  modelLabel: string,
  gpuLabel: string,
  precLabel: string,
  methodLabel: string,
): string {
  return clampMetaDescription(
    `在 ${gpuLabel} ${precLabel} 上运行 ${modelLabel} 时，对比启用 ${methodLabel} 与关闭投机解码在各交互性水平下的吞吐量和成本。${SOURCE_ZH}`,
    'zh',
  );
}

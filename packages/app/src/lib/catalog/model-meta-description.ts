import { HW_REGISTRY } from '@semianalysisai/inferencex-constants';

import {
  formatContextWindow,
  formatParamCount,
  type ModelArchitecture,
} from '@/lib/catalog/model-architectures';
import { META_DESCRIPTION_MAX } from '@/lib/seo/meta-text';

type Locale = 'en' | 'zh';

/** Registry labels for the measured hardware keys, newest first (HW_REGISTRY sort order). */
export function measuredChipLabels(hardwareKeys: Iterable<string>): string[] {
  return [...new Set(hardwareKeys)]
    .filter((key) => HW_REGISTRY[key])
    .toSorted((a, b) => HW_REGISTRY[a].sort - HW_REGISTRY[b].sort)
    .map((key) => HW_REGISTRY[key].label);
}

function specFacts(arch: ModelArchitecture | undefined, locale: Locale): string | null {
  if (!arch) return null;
  const total = formatParamCount(arch.totalParams);
  const active = formatParamCount(arch.activeParams);
  const context = arch.contextWindow ? formatContextWindow(arch.contextWindow) : null;
  let params: string;
  if (arch.architectureType === 'dense') {
    params = locale === 'zh' ? `${total} 稠密模型` : `${total} dense`;
  } else if (arch.activeParamsPrefill === undefined) {
    params = locale === 'zh' ? `总参数 ${total}、激活 ${active}` : `${total} / ${active} active`;
  } else {
    const prefill = formatParamCount(arch.activeParamsPrefill);
    params =
      locale === 'zh'
        ? `总参数 ${total}、prefill 激活 ${prefill}、decode 激活 ${active}`
        : `${total} total, ${prefill} prefill / ${active} decode active`;
  }
  if (!context) return params;
  return locale === 'zh' ? `${params}，${context} 上下文` : `${params}, ${context} context`;
}

function listChips(labels: readonly string[], shown: number, locale: Locale): string {
  const head = labels.slice(0, shown);
  const rest = labels.length - shown;
  if (locale === 'zh') {
    return rest > 0 ? `${head.join('、')} 等 ${labels.length} 款芯片` : head.join('、');
  }
  if (rest > 0) return `${head.join(', ')} and ${rest} more ${rest === 1 ? 'chip' : 'chips'}`;
  if (head.length === 1) return head[0];
  return `${head.slice(0, -1).join(', ')} and ${head.at(-1)}`;
}

function measuredClause(chips: string | null, locale: Locale, withTail: boolean): string {
  if (locale === 'zh') {
    if (!chips) return '附架构与评估解析，以及实时推理基准测试。';
    const gap = /\p{Script=Han}$/u.test(chips) ? '' : ' ';
    const tail = withTail ? '，以及架构与评估解析' : '';
    return `附 ${chips}${gap}上实测的 tok/s 与 $/M tok${tail}。`;
  }
  if (!chips) return 'Architecture, evals and live inference benchmarks.';
  return `Measured tok/s and $/M tok on ${chips}${withTail ? ', plus architecture and evals' : ''}.`;
}

/**
 * Model page meta description built from MODEL_ARCHITECTURES and the hardware that has benchmark
 * rows for the model, e.g. "Kimi K3: 2.8T / 104B active, 1M context. Measured tok/s and $/M tok on
 * GB300 NVL72, B300 and MI355X, plus architecture and evals." Lists as many chips as fit within the
 * locale's description budget and summarizes the rest as a count, dropping the trailing
 * "plus architecture and evals" before it would drop the last chip.
 */
export function modelMetaDescription(
  name: string,
  arch: ModelArchitecture | undefined,
  hardwareKeys: Iterable<string>,
  locale: Locale,
): string {
  const facts = specFacts(arch, locale);
  let lead: string;
  if (locale === 'zh') lead = facts ? `${name}：${facts}。` : `${name}：`;
  else lead = facts ? `${name}: ${facts}. ` : `${name}: `;
  const labels = measuredChipLabels(hardwareKeys);
  const max = META_DESCRIPTION_MAX[locale];
  // Prefer keeping the architecture-and-evals tail, then drop it before dropping every chip.
  for (const withTail of [true, false]) {
    for (let shown = labels.length; shown >= 1; shown--) {
      const description = lead + measuredClause(listChips(labels, shown, locale), locale, withTail);
      if (description.length <= max) return description;
    }
  }
  return lead + measuredClause(null, locale, true);
}

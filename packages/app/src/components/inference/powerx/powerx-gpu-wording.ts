import type { Locale } from '@/lib/i18n/i18n';

/**
 * PowerX measures GPUs, so its metric titles, axis labels and table headers say "GPU"
 * where the shared inference strings say "Chip" ("Measured Avg Power per Chip (W)" reads
 * "Measured Avg Power per GPU (W)"; zh "每芯片实测平均功耗（W）" reads "每 GPU 实测平均功耗（W）").
 * Units follow, as elsewhere on PowerX: W/chip reads W/GPU. /infx keeps the shared strings.
 */
export function powerXGpuWording(text: string, locale: Locale): string {
  if (!text) return text;
  const latin = text.replaceAll(/(?<![A-Za-z])chip(?<plural>s?)(?![A-Za-z])/giu, 'GPU$<plural>');
  if (locale !== 'zh') return latin;
  return latin
    .replaceAll('芯片', 'GPU')
    .replaceAll(/(?<han>[\u3400-\u9FFF])GPU/gu, '$<han> GPU')
    .replaceAll(/GPU(?<han>[\u3400-\u9FFF])/gu, 'GPU $<han>');
}

/** The shared string on /infx, the GPU wording on PowerX. */
export function surfaceMetricText(text: string, powerX: boolean, locale: Locale): string {
  return powerX ? powerXGpuWording(text, locale) : text;
}

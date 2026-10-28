import {
  getChipHw,
  getChipSpec,
  type ChipPageEntry,
  type ChipVsPage,
} from '@/lib/catalog/chip-pages';
import { clampMetaDescription } from '@/lib/seo/meta-text';

function chipFacts(entry: ChipPageEntry) {
  const spec = getChipSpec(entry);
  const hw = getChipHw(entry);
  return {
    memory: `${spec.memory} ${spec.memoryType}`,
    bandwidth: spec.memoryBandwidth,
    tdp: `${hw.tdp.toLocaleString('en-US')} W`,
    power: `${hw.power} kW`,
    price: `$${hw.costh.toFixed(2)}/hr`,
  };
}

/** Spec-first chip description: memory, bandwidth, TDP, all-in power and cloud price. */
export function chipMetaDescription(entry: ChipPageEntry, locale: 'en' | 'zh'): string {
  const f = chipFacts(entry);
  return clampMetaDescription(
    locale === 'zh'
      ? `${entry.label} 规格：${f.memory}，带宽 ${f.bandwidth}，TDP ${f.tdp}，单芯片全口径功耗约 ${f.power}，云端价格约 ${f.price}。附实测 LLM 推理基准测试。`
      : `${entry.label} specs: ${f.memory}, ${f.bandwidth} bandwidth, ${f.tdp} TDP, ~${f.power} all-in power per chip, ~${f.price} cloud price, plus LLM inference benchmarks.`,
    locale,
  );
}

export function chipVsMetaDescription(page: ChipVsPage, locale: 'en' | 'zh'): string {
  const a = chipFacts(page.a);
  const b = chipFacts(page.b);
  const la = page.a.label;
  const lb = page.b.label;
  return clampMetaDescription(
    locale === 'zh'
      ? `${la} 对比 ${lb}：显存 ${a.memory} vs ${b.memory}，带宽 ${a.bandwidth} vs ${b.bandwidth}，TDP ${a.tdp} vs ${b.tdp}，云端价格 ${a.price} vs ${b.price}，附 LLM 推理基准测试。`
      : `${la} vs ${lb}: ${a.memory} vs ${b.memory}, ${a.bandwidth} vs ${b.bandwidth} bandwidth, ${a.tdp} vs ${b.tdp} TDP, ${a.price} vs ${b.price}, plus LLM inference benchmarks.`,
    locale,
  );
}

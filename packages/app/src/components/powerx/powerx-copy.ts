import { SYSTEM_POWER_MODEL_REVISION, SYSTEM_POWER_ASSUMPTIONS } from '@/lib/system-power-model';
import { AIR_COOLED_SYSTEM_PUE } from '@/lib/modeled-system-power';

export const POWERX_STRINGS = {
  en: {
    model: `Draft model (${SYSTEM_POWER_MODEL_REVISION}): GPU chassis AC plus PUE ${AIR_COOLED_SYSTEM_PUE}; CPU utilization ${SYSTEM_POWER_ASSUMPTIONS.u_cpu * 100}%, DRAM utilization ${SYSTEM_POWER_ASSUMPTIONS.u_ram * 100}%. Partial chassis assume a full chassis at the measured per-GPU power, then allocate the measured GPUs’ share. Excludes separate CPU-only router hosts. Unsupported hardware/workloads remain unavailable. This is not measured wall power.`,
    provisioned:
      'Registry power assumptions: GPU nameplate TDP or all-in facility allocation per GPU. These are separate from configured GPU power limits.',
  },
  zh: {
    model: `模型草案（${SYSTEM_POWER_MODEL_REVISION}）：GPU 机箱交流功率加 PUE ${AIR_COOLED_SYSTEM_PUE}；CPU 利用率为 ${SYSTEM_POWER_ASSUMPTIONS.u_cpu * 100}%，DRAM 利用率为 ${SYSTEM_POWER_ASSUMPTIONS.u_ram * 100}%。不足整机的配置先按实测每 GPU 功率推算整机，再分摊所用 GPU 的份额。不包含独立 CPU 路由节点。不支持的硬件或场景显示不可用。这不是墙插功率实测值。`,
    provisioned:
      '采用硬件注册表中的 GPU 额定 TDP 或每 GPU 全设施配置功率，与运行时设置的 GPU 功率上限分别记录。',
  },
} as const;

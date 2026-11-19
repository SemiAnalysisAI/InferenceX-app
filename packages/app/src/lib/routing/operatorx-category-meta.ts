import type { OperatorXCategory } from '@/lib/routing/operatorx-category';

export interface OperatorXCategoryMeta {
  title: string;
  description: string;
}

const META: Record<OperatorXCategory, OperatorXCategoryMeta> = {
  gemm: {
    title: 'OperatorX GEMM Benchmarks',
    description:
      'Measured GEMM TFLOPS per GPU and latency from OperatorX, compared across hardware by shape, precision and backend, with full case coverage.',
  },
  moe: {
    title: 'OperatorX MoE Benchmarks',
    description:
      'Measured routed MoE TFLOPS per GPU and latency from OperatorX, compared across hardware by workload, shape, precision and backend, with case coverage.',
  },
  attention: {
    title: 'OperatorX Attention Benchmarks',
    description:
      'Measured attention TFLOPS per GPU and latency from OperatorX, compared across hardware by workload, shape, precision and backend, with case coverage.',
  },
  model: {
    title: 'OperatorX Model View',
    description:
      'GEMM, attention and routed MoE operator timings from OperatorX for one model, laid out layer by layer and compared across hardware and device splits.',
  },
};

const META_ZH: Record<OperatorXCategory, OperatorXCategoryMeta> = {
  gemm: {
    title: 'OperatorX GEMM 基准测试',
    description:
      '查看 OperatorX 实测 GEMM 单卡 TFLOPS 与延迟，按形状、精度和后端跨硬件对比，并检查完整的用例覆盖情况。',
  },
  moe: {
    title: 'OperatorX MoE 基准测试',
    description:
      '查看 OperatorX 实测路由 MoE 单卡 TFLOPS 与延迟，按工作负载、形状、精度和后端跨硬件对比，并检查用例覆盖情况。',
  },
  attention: {
    title: 'OperatorX Attention 基准测试',
    description:
      '查看 OperatorX 实测 attention 单卡 TFLOPS 与延迟，按工作负载、形状、精度和后端跨硬件对比，并检查用例覆盖情况。',
  },
  model: {
    title: 'OperatorX 模型视图',
    description:
      '按模型逐层查看 OperatorX 中 GEMM、attention 与路由 MoE 算子的实测耗时，并跨硬件和设备切分方式对比。',
  },
};

export function operatorXCategoryMeta(category: OperatorXCategory): OperatorXCategoryMeta {
  return META[category];
}

export function operatorXCategoryMetaZh(category: OperatorXCategory): OperatorXCategoryMeta {
  return META_ZH[category];
}

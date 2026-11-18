import type { PowerXRole } from './powerx-role';
import type { EnergyPer, PowerXCount, PowerXView } from './powerx-views';

/**
 * The PowerX words more than one surface says: tab names, GPU roles and the control
 * names. The shell (tabs, context strip, phone sheet, pin line) and the toolbar both read
 * them from here, so a rename lands everywhere at once and en and zh stay paired.
 */
export const POWERX_VOCAB = {
  en: {
    tabs: {
      energy: 'Energy per token',
      draw: 'Power draw',
      where: 'Breakdown',
      time: 'Over time',
    } satisfies Record<PowerXView, string>,
    /** Tab names that fit four across at 390 px. */
    tabsShort: {
      energy: 'Energy',
      draw: 'Power',
      where: 'Breakdown',
      time: 'Over time',
    } satisfies Record<PowerXView, string>,
    role: 'GPU role',
    roles: {
      all: 'All GPUs',
      prefill: 'Prefill',
      decode: 'Decode',
      split: 'Prefill vs decode',
    } satisfies Record<PowerXRole, string>,
    rolesShort: {
      all: 'All GPUs',
      prefill: 'Prefill',
      decode: 'Decode',
      split: 'P vs D',
    } satisfies Record<PowerXRole, string>,
    boundary: 'Boundary',
    boundaries: { gpu: 'GPU', it: 'IT', system: 'Facility', both: 'All' } satisfies Record<
      PowerXCount,
      string
    >,
    energyPer: 'Energy per',
    pers: {
      total: 'All tokens',
      output: 'Output',
      input: 'Input',
      query: 'Query',
    } satisfies Record<EnergyPer, string>,
    wPerGpu: 'W per GPU',
    provisioned: 'Provisioned bound',
    compareAt: 'Compare at',
  },
  zh: {
    tabs: {
      energy: '每 Token 能耗',
      draw: '功耗',
      where: '功耗构成',
      time: '随时间变化',
    } satisfies Record<PowerXView, string>,
    tabsShort: {
      energy: '能耗',
      draw: '功耗',
      where: '构成',
      time: '随时间',
    } satisfies Record<PowerXView, string>,
    role: 'GPU 角色',
    roles: {
      all: '全部 GPU',
      prefill: '预填充',
      decode: '解码',
      split: '预填充 vs 解码',
    } satisfies Record<PowerXRole, string>,
    rolesShort: {
      all: '全部 GPU',
      prefill: '预填充',
      decode: '解码',
      split: 'P/D 对比',
    } satisfies Record<PowerXRole, string>,
    boundary: '功耗边界',
    boundaries: { gpu: 'GPU', it: 'IT', system: '数据中心', both: '全部' } satisfies Record<
      PowerXCount,
      string
    >,
    energyPer: '能耗计量',
    pers: {
      total: '全部 Token',
      output: '输出',
      input: '输入',
      query: '每次查询',
    } satisfies Record<EnergyPer, string>,
    wPerGpu: '每 GPU 瓦数',
    provisioned: '预配上限',
    compareAt: '对比点',
  },
} as const;

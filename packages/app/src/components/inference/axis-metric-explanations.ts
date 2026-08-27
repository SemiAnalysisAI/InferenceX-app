/**
 * @file axis-metric-explanations.ts
 * @description Bilingual plain-English explanations (and, for y-axis metrics,
 * structural formulas) backing the expandable axis-metric footer rendered
 * below each inference chart. Y-axis entries are keyed by `METRIC_REGISTRY`
 * keys; x-axis entries are keyed by the resolved x-axis kind. A unit test
 * asserts completeness against the registry, so adding a metric without an
 * explanation fails CI.
 *
 * Formulas are structural descriptions of the derived-field math in
 * `buildDerivedChartFields` (src/lib/chart-utils.ts) and the glossary
 * (src/lib/glossary.ts) — they describe how a value is computed, they do not
 * restate assumed constants.
 */
import { METRIC_REGISTRY, type MetricKey } from './metric-registry';

export interface LocalizedText {
  en: string;
  zh: string;
}

export interface MetricExplanation {
  /** 1–3 sentence plain-language explanation of the metric. */
  description: LocalizedText;
  /** Structural formula, rendered in monospace in the footer. */
  formula: LocalizedText;
}

/** Cost-basis flavor shared by the $/¥/cost metric families. */
type CostBasis = 'h' | 'n' | 'r';
type TokenType = 'total' | 'output' | 'input';

const COST_BASIS_EN: Record<CostBasis, string> = {
  h: 'all-in hourly ownership cost of a hyperscaler operator',
  n: 'all-in hourly ownership cost of a Neocloud Giant operator',
  r: 'all-in hourly cost of a 3-year rental contract',
};

const COST_BASIS_ZH: Record<CostBasis, string> = {
  h: '超大规模云厂商自有硬件的每小时全包成本',
  n: 'Neocloud Giant 自有硬件的每小时全包成本',
  r: '3 年期租赁合同的每小时全包成本',
};

const TOKEN_TYPE_EN: Record<TokenType, string> = {
  total: 'total tokens (input + output)',
  output: 'output tokens',
  input: 'input tokens',
};

const TOKEN_TYPE_ZH: Record<TokenType, string> = {
  total: '总 token（输入 + 输出）',
  output: '输出 token',
  input: '输入 token',
};

const TOKEN_RATE_EN: Record<TokenType, string> = {
  total: 'total tok/s/chip',
  output: 'output tok/s/chip',
  input: 'input tok/s/chip',
};

const TOKEN_RATE_ZH: Record<TokenType, string> = {
  total: '总 tok/s/chip',
  output: '输出 tok/s/chip',
  input: '输入 tok/s/chip',
};

function throughputPerChip(tokenType: TokenType): MetricExplanation {
  return {
    description: {
      en:
        `Rate of ${TOKEN_TYPE_EN[tokenType]} the serving replica handles each second, divided ` +
        'across every chip serving it. Normalizing per chip keeps different parallelism setups ' +
        'and replica sizes comparable.',
      zh:
        `服务副本每秒处理的${TOKEN_TYPE_ZH[tokenType]}速率，平均到服务该副本的每一块芯片上。` +
        '按芯片归一化后，不同并行配置和副本规模之间可以直接比较。',
    },
    formula: {
      en: `tok/s/chip = ${TOKEN_TYPE_EN[tokenType]} per second ÷ number of chips serving the replica`,
      zh: `tok/s/chip = 每秒${TOKEN_TYPE_ZH[tokenType]}数 ÷ 服务该副本的芯片数`,
    },
  };
}

function throughputPerMw(tokenType: TokenType): MetricExplanation {
  return {
    description: {
      en:
        `Rate of ${TOKEN_TYPE_EN[tokenType]} produced per megawatt of all-in utility power ` +
        'provisioned for the hardware — the full data-center power budget attributed to the ' +
        'chips, not just their own draw. It answers how much output a fixed power budget buys.',
      zh:
        `按硬件全电源配置（all-in utility）功率归一化的${TOKEN_TYPE_ZH[tokenType]}速率——` +
        '即分摊到芯片上的整个数据中心电力预算，而不仅是芯片自身功耗。' +
        '它回答的是固定电力预算能换来多少产出。',
    },
    formula: {
      en: `tok/s/MW = ${TOKEN_RATE_EN[tokenType]} ÷ all-in utility MW provisioned per chip`,
      zh: `tok/s/MW = ${TOKEN_RATE_ZH[tokenType]} ÷ 每芯片全电源配置功率（MW）`,
    },
  };
}

function tokenRevenuePerGpuHour(): MetricExplanation {
  return {
    description: {
      en:
        'Gross token revenue a GPU could earn per hour at this operating point. The normalized ' +
        'source prices every input and output token at $1 per million; the OpenRouter source uses ' +
        "the selected model's current public input and output prices. This turns the " +
        'throughput/interactivity tradeoff into a business-facing SLA curve.',
      zh:
        '表示该运行点下每块 GPU 每小时可获得的 token 毛收入。标准化模式将输入和输出 token 均按每百万 1 美元计价；' +
        'OpenRouter 模式采用所选模型当前公开的输入和输出价格。该指标把吞吐量与交互性的权衡转换为面向业务的 SLA 曲线。',
    },
    formula: {
      en: '$/GPU/hr = total tok/s/GPU × (input share × input $/M + output share × output $/M) × 3,600 ÷ 1,000,000',
      zh: '$/GPU/hr = 总 tok/s/GPU ×（输入占比 × 输入 $/百万 + 输出占比 × 输出 $/百万）× 3,600 ÷ 1,000,000',
    },
  };
}

function costPerMillion(basis: CostBasis, tokenType: TokenType): MetricExplanation {
  return {
    description: {
      en:
        `Estimated infrastructure cost of producing one million ${TOKEN_TYPE_EN[tokenType]} at ` +
        `this operating point, priced with the ${COST_BASIS_EN[basis]}. Lower is cheaper.`,
      zh:
        `在该运行点生产一百万${TOKEN_TYPE_ZH[tokenType]}的基础设施成本估算，` +
        `按${COST_BASIS_ZH[basis]}计价。数值越低越便宜。`,
    },
    formula: {
      en: `$/Mtok = all-in cost per chip-hour ($) × 1,000,000 ÷ (3,600 × ${TOKEN_RATE_EN[tokenType]})`,
      zh: `$/Mtok = 每芯片小时全包成本（$）× 1,000,000 ÷（3,600 × ${TOKEN_RATE_ZH[tokenType]}）`,
    },
  };
}

function tokensPerDollar(basis: CostBasis, tokenType: TokenType): MetricExplanation {
  return {
    description: {
      en:
        `How many ${TOKEN_TYPE_EN[tokenType]} one US dollar of infrastructure spend buys, ` +
        `priced with the ${COST_BASIS_EN[basis]}. It is the reciprocal of cost per token, so ` +
        'higher means cheaper.',
      zh:
        `1 美元基础设施开支能换来多少${TOKEN_TYPE_ZH[tokenType]}，` +
        `按${COST_BASIS_ZH[basis]}计价。它是单 token 成本的倒数，数值越高越便宜。`,
    },
    formula: {
      en: `tok/$ = (${TOKEN_RATE_EN[tokenType]} × 3,600) ÷ all-in cost per chip-hour ($)`,
      zh: `tok/$ =（${TOKEN_RATE_ZH[tokenType]} × 3,600）÷ 每芯片小时全包成本（$）`,
    },
  };
}

function tokensPerRmb(basis: CostBasis, tokenType: TokenType): MetricExplanation {
  return {
    description: {
      en:
        `How many ${TOKEN_TYPE_EN[tokenType]} one Chinese yuan of infrastructure spend buys, ` +
        `priced with the ${COST_BASIS_EN[basis]} converted at a fixed USD→CNY exchange rate. ` +
        'Higher means cheaper.',
      zh:
        `1 元人民币基础设施开支能换来多少${TOKEN_TYPE_ZH[tokenType]}，` +
        `按${COST_BASIS_ZH[basis]}以固定 USD→CNY 汇率折算计价。数值越高越便宜。`,
    },
    formula: {
      en:
        `tok/¥ = (${TOKEN_RATE_EN[tokenType]} × 3,600) ÷ ` +
        '(all-in cost per chip-hour ($) × USD→CNY exchange rate)',
      zh:
        `tok/¥ =（${TOKEN_RATE_ZH[tokenType]} × 3,600）÷` +
        '（每芯片小时全包成本（$）× USD→CNY 汇率）',
    },
  };
}

function provisionedJoules(tokenType: TokenType): MetricExplanation {
  return {
    description: {
      en:
        `Electrical energy attributed to each of the ${TOKEN_TYPE_EN[tokenType]}, assuming the ` +
        'full all-in utility power provisioned for the hardware is drawn. It is a provisioned ' +
        'upper bound, not a telemetry measurement.',
      zh:
        `平均到每个${TOKEN_TYPE_ZH[tokenType]}上的电能，假设硬件按全电源配置功率满额用电。` +
        '这是按配置功率计算的上限值，不是遥测实测值。',
    },
    formula: {
      en: `J/tok = all-in utility power per chip (W) ÷ ${TOKEN_RATE_EN[tokenType]}`,
      zh: `J/tok = 每芯片全电源配置功率（W）÷ ${TOKEN_RATE_ZH[tokenType]}`,
    },
  };
}

/**
 * Certification-tier note appended to every Measured Energy explanation:
 * pairs the dotted legacy-power point ring and the Quick Filters → Measured
 * Power pills with the footer text that explains them.
 */
const MEASURED_TIER_NOTE_EN =
  ' Points without a producer validation verdict are legacy measurements — marked with a ' +
  'dotted ring on the chart and filterable via Quick Filters → Measured Power.';
const MEASURED_TIER_NOTE_ZH =
  '没有生产端验证结论的数据点属于旧版测量——在图表上以虚线圆环标记，' +
  '并可通过快捷筛选中的“实测功耗”进行筛选。';

type MeasuredPhase = 'run' | 'prefill' | 'decode';

const MEASURED_PHASE_EN: Record<MeasuredPhase, string> = {
  run: 'the whole benchmark run',
  prefill: 'the prefill phase (prompt processing)',
  decode: 'the decode phase (token generation)',
};

const MEASURED_PHASE_ZH: Record<MeasuredPhase, string> = {
  run: '整个基准测试运行期间',
  prefill: 'prefill 阶段（处理提示词）',
  decode: 'decode 阶段（生成 token）',
};

function measuredPower(phase: MeasuredPhase): MetricExplanation {
  return {
    description: {
      en:
        `Average per-chip accelerator power actually drawn during ${MEASURED_PHASE_EN[phase]}, ` +
        `read from runner telemetry. Unlike the all-in provisioned metrics, this reflects real ` +
        `measured draw, not the provisioned budget.${MEASURED_TIER_NOTE_EN}`,
      zh:
        `${MEASURED_PHASE_ZH[phase]}每块加速器芯片的实际平均功耗，来自运行器遥测数据。` +
        `与全电源配置类指标不同，它反映的是真实实测功耗，而不是按配置计算的预算值。${
          MEASURED_TIER_NOTE_ZH
        }`,
    },
    formula: {
      en: `W = mean of sampled per-chip accelerator power draw over ${MEASURED_PHASE_EN[phase]}`,
      zh: `W = ${MEASURED_PHASE_ZH[phase]}每芯片加速器功耗采样值的平均`,
    },
  };
}

function measuredJoulesPerToken(tokenType: TokenType): MetricExplanation {
  return {
    description: {
      en:
        `Measured accelerator energy consumed per ${
          tokenType === 'total' ? 'token (including prompt tokens)' : `${tokenType} token`
        }, from runner power telemetry integrated over the run. Lower means the system converts ` +
        `electricity into tokens more efficiently.${MEASURED_TIER_NOTE_EN}`,
      zh:
        `每个${TOKEN_TYPE_ZH[tokenType]}消耗的加速器实测能耗，由运行器功耗遥测在整个运行期间积分得到。` +
        `数值越低，说明系统把电能转化为 token 的效率越高。${MEASURED_TIER_NOTE_ZH}`,
    },
    formula: {
      en: `J/tok = measured accelerator energy over the run ÷ ${TOKEN_TYPE_EN[tokenType]} processed`,
      zh: `J/tok = 运行期间加速器实测能耗 ÷ 处理的${TOKEN_TYPE_ZH[tokenType]}数`,
    },
  };
}

const MEASURED_ROLE_EN: Record<'prefill' | 'decode', { tokens: string; isolates: string }> = {
  prefill: { tokens: 'input (prompt)', isolates: 'prompt-processing' },
  decode: { tokens: 'output', isolates: 'token-generation' },
};

const MEASURED_ROLE_ZH: Record<'prefill' | 'decode', { tokens: string; isolates: string }> = {
  prefill: { tokens: '输入', isolates: '提示词处理' },
  decode: { tokens: '输出', isolates: 'token 生成' },
};

function measuredRoleJoulesPerToken(role: 'prefill' | 'decode'): MetricExplanation {
  return {
    description: {
      en:
        `Measured accelerator energy consumed by the ${role} workers per ` +
        `${MEASURED_ROLE_EN[role].tokens} token, from runner power telemetry integrated over ` +
        `the run. Unlike the whole-deployment J/tok metrics, only that role's energy is ` +
        `charged, so it isolates ${MEASURED_ROLE_EN[role].isolates} efficiency in ` +
        `disaggregated deployments.${MEASURED_TIER_NOTE_EN}`,
      zh:
        `每个${MEASURED_ROLE_ZH[role].tokens} token 由 ${MEASURED_PHASE_ZH[role]}工作进程消耗的` +
        `加速器实测能耗，由运行器功耗遥测在整个运行期间积分得到。与全部署 J/tok 指标不同，` +
        `它只计入该角色的能耗，因此可以在分离式部署中单独衡量${
          MEASURED_ROLE_ZH[role].isolates
        }效率。${MEASURED_TIER_NOTE_ZH}`,
    },
    formula: {
      en:
        `J/tok = measured ${role}-worker energy over the run ÷ ` +
        `${role === 'prefill' ? 'input' : 'output'} tokens processed`,
      zh: `J/tok = 运行期间 ${role} 工作进程实测能耗 ÷ 处理的${MEASURED_ROLE_ZH[role].tokens} token 数`,
    },
  };
}

/**
 * Every `METRIC_REGISTRY` key gets a bilingual explanation and a structural
 * formula. Grounded in `buildDerivedChartFields` (src/lib/chart-utils.ts) and
 * the glossary entries for throughput, cost per million tokens, tokens per
 * dollar, tokens per megawatt, and energy per token.
 */
export const METRIC_EXPLANATIONS: Record<MetricKey, MetricExplanation> = {
  tpPerGpu: throughputPerChip('total'),
  inputTputPerGpu: throughputPerChip('input'),
  outputTputPerGpu: throughputPerChip('output'),
  tokenRevenuePerGpuHour: tokenRevenuePerGpuHour(),
  tpPerMw: throughputPerMw('total'),
  inputTputPerMw: throughputPerMw('input'),
  outputTputPerMw: throughputPerMw('output'),
  costh: costPerMillion('h', 'total'),
  costn: costPerMillion('n', 'total'),
  costr: costPerMillion('r', 'total'),
  costhOutput: costPerMillion('h', 'output'),
  costnOutput: costPerMillion('n', 'output'),
  costrOutput: costPerMillion('r', 'output'),
  costhi: costPerMillion('h', 'input'),
  costni: costPerMillion('n', 'input'),
  costri: costPerMillion('r', 'input'),
  tokensPerDollarH: tokensPerDollar('h', 'total'),
  tokensPerDollarN: tokensPerDollar('n', 'total'),
  tokensPerDollarR: tokensPerDollar('r', 'total'),
  outputTokensPerDollarH: tokensPerDollar('h', 'output'),
  outputTokensPerDollarN: tokensPerDollar('n', 'output'),
  outputTokensPerDollarR: tokensPerDollar('r', 'output'),
  inputTokensPerDollarH: tokensPerDollar('h', 'input'),
  inputTokensPerDollarN: tokensPerDollar('n', 'input'),
  inputTokensPerDollarR: tokensPerDollar('r', 'input'),
  tokensPerRmbH: tokensPerRmb('h', 'total'),
  tokensPerRmbN: tokensPerRmb('n', 'total'),
  tokensPerRmbR: tokensPerRmb('r', 'total'),
  outputTokensPerRmbH: tokensPerRmb('h', 'output'),
  outputTokensPerRmbN: tokensPerRmb('n', 'output'),
  outputTokensPerRmbR: tokensPerRmb('r', 'output'),
  inputTokensPerRmbH: tokensPerRmb('h', 'input'),
  inputTokensPerRmbN: tokensPerRmb('n', 'input'),
  inputTokensPerRmbR: tokensPerRmb('r', 'input'),
  costUser: {
    description: {
      en:
        'Estimated infrastructure cost of producing one million total tokens, priced with the ' +
        'hourly cost you entered in the custom-values panel instead of a modeled cost basis.',
      zh:
        '生产一百万总 token 的基础设施成本估算，按你在自定义值面板中输入的每小时成本计价，' +
        '而不是按内置成本模型计价。',
    },
    formula: {
      en: '$/Mtok = user-entered cost per chip-hour ($) × 1,000,000 ÷ (3,600 × total tok/s/chip)',
      zh: '$/Mtok = 自定义每芯片小时成本（$）× 1,000,000 ÷（3,600 × 总 tok/s/chip）',
    },
  },
  tokensPerDollarUser: {
    description: {
      en:
        'How many total tokens one US dollar buys, priced with the hourly cost you entered in ' +
        'the custom-values panel. Higher means cheaper under your own cost assumptions.',
      zh:
        '1 美元能换来多少总 token，按你在自定义值面板中输入的每小时成本计价。' +
        '在你自己的成本假设下，数值越高越便宜。',
    },
    formula: {
      en: 'tok/$ = (total tok/s/chip × 3,600) ÷ user-entered cost per chip-hour ($)',
      zh: 'tok/$ =（总 tok/s/chip × 3,600）÷ 自定义每芯片小时成本（$）',
    },
  },
  powerUser: {
    description: {
      en:
        'Total token throughput normalized by the all-in utility power you entered in the ' +
        'custom-values panel, instead of the modeled per-chip power budget.',
      zh: '按你在自定义值面板中输入的全电源配置功率归一化的总 token 吞吐量，而不是按内置的每芯片电力预算。',
    },
    formula: {
      en: 'tok/s/MW = total tok/s/chip ÷ user-entered all-in utility MW per chip',
      zh: 'tok/s/MW = 总 tok/s/chip ÷ 自定义每芯片全电源配置功率（MW）',
    },
  },
  jTotal: provisionedJoules('total'),
  jOutput: provisionedJoules('output'),
  jInput: provisionedJoules('input'),
  measuredAvgPower: measuredPower('run'),
  measuredPrefillAvgPower: measuredPower('prefill'),
  measuredDecodeAvgPower: measuredPower('decode'),
  measuredJPerOutputToken: measuredJoulesPerToken('output'),
  measuredJPerInputToken: measuredJoulesPerToken('input'),
  measuredJPerTotalToken: measuredJoulesPerToken('total'),
  measuredPrefillJPerInputToken: measuredRoleJoulesPerToken('prefill'),
  measuredDecodeJPerOutputToken: measuredRoleJoulesPerToken('decode'),
  measuredJPerSuccessfulQuery: {
    description: {
      en:
        `Measured accelerator energy consumed per successfully completed request, from runner ` +
        `power telemetry. It charges the energy of the whole run only to requests that finished ` +
        `successfully.${MEASURED_TIER_NOTE_EN}`,
      zh:
        `每个成功完成的请求消耗的加速器实测能耗，来自运行器功耗遥测。` +
        `整个运行的能耗只计入成功完成的请求。${MEASURED_TIER_NOTE_ZH}`,
    },
    formula: {
      en: 'J/query = measured accelerator energy over the run ÷ successfully completed requests',
      zh: 'J/query = 运行期间加速器实测能耗 ÷ 成功完成的请求数',
    },
  },
  measuredWhPerSuccessfulQuery: {
    description: {
      en:
        `The same measured energy per successful request expressed in watt-hours, a more ` +
        `familiar household unit (1 Wh = 3,600 J).${MEASURED_TIER_NOTE_EN}`,
      zh: `与每次成功请求实测能耗相同的量，换算成更直观的瓦时单位（1 Wh = 3,600 J）。${MEASURED_TIER_NOTE_ZH}`,
    },
    formula: {
      en: 'Wh/query = measured J per successful query ÷ 3,600',
      zh: 'Wh/query = 每次成功请求实测能耗（J）÷ 3,600',
    },
  },
  measuredPowerPercentTdp: {
    description: {
      en:
        `Measured average per-chip power as a share of the accelerator’s rated TDP. Values well ` +
        `below 100% suggest the workload leaves thermal or power headroom on the table.${
          MEASURED_TIER_NOTE_EN
        }`,
      zh:
        `每芯片实测平均功耗占加速器额定 TDP 的百分比。` +
        `明显低于 100% 说明该工作负载没有用满散热或供电余量。${MEASURED_TIER_NOTE_ZH}`,
    },
    formula: {
      en: '% TDP = measured average power per chip (W) ÷ rated TDP (W) × 100',
      zh: '% TDP = 每芯片实测平均功耗（W）÷ 额定 TDP（W）× 100',
    },
  },
};

/**
 * The four logical x-axis metrics an inference chart can plot, independent of
 * the percentile prefix. Mirrors the branch logic in `resolveXAxisField` plus
 * the derived agentic x-axis mode handled in `ChartDisplay`.
 */
export type XAxisKind = 'interactivity' | 'e2eLatency' | 'ttft' | 'e2eNormalizedInteractivity';

export const X_AXIS_KINDS: readonly XAxisKind[] = [
  'interactivity',
  'e2eLatency',
  'ttft',
  'e2eNormalizedInteractivity',
];

export interface XAxisExplanation {
  /** Display name for the footer row; `pctl` is e.g. 'P90' | 'Median' | null. */
  name: {
    en: (pctl: string | null) => string;
    zh: (pctl: string | null) => string;
  };
  description: LocalizedText;
}

const zhPctl = (pctl: string | null): string =>
  pctl === null ? '' : pctl === 'Median' ? '中位' : `${pctl} `;

const enPctl = (pctl: string | null): string => (pctl === null ? '' : `${pctl} `);

export const X_AXIS_EXPLANATIONS: Record<XAxisKind, XAxisExplanation> = {
  interactivity: {
    name: {
      en: (pctl) => `${enPctl(pctl)}Interactivity (tok/s/user)`,
      zh: (pctl) => `${zhPctl(pctl)}交互性（tok/s/user）`,
    },
    description: {
      en:
        'Interactivity is the rate at which a single user receives generated tokens while the ' +
        'model streams its answer — how quickly new words appear on screen. Higher values feel ' +
        'snappier; operators trade it against batch throughput.',
      zh:
        '交互性（interactivity）指模型流式输出回答时，单个用户接收生成 token 的速率——' +
        '即新内容出现在屏幕上的快慢。数值越高体验越流畅；运营方需要在交互性与批量吞吐量之间权衡。',
    },
  },
  e2eLatency: {
    name: {
      en: (pctl) => `${enPctl(pctl)}End-to-end Latency (s)`,
      zh: (pctl) => `${zhPctl(pctl)}端到端延迟（s）`,
    },
    description: {
      en:
        'End-to-end latency is the total wall-clock time from submitting a request until the ' +
        'complete response finishes — the wait before the first token plus the entire ' +
        'generation. Lower is better.',
      zh:
        '端到端延迟指从提交请求到完整响应结束的总耗时——包括收到首个 token 之前的等待和之后的全部生成过程。' +
        '数值越低越好。',
    },
  },
  ttft: {
    name: {
      en: (pctl) => `${enPctl(pctl)}Time To First Token (s)`,
      zh: (pctl) => `${zhPctl(pctl)}首 token 延迟（TTFT，s）`,
    },
    description: {
      en:
        'Time to first token (TTFT) is the delay from submitting a request until the first ' +
        'generated token arrives — the “thinking…” pause before the answer starts. Percentile ' +
        'prefixes (Median, P90, P99) report that delay across all requests in the run.',
      zh:
        '首 token 延迟（TTFT，Time To First Token）指从提交请求到收到第一个生成 token 的等待时间——' +
        '也就是回答开始前的“思考”停顿。百分位前缀（Median、P90、P99）表示该延迟在整个运行的所有请求上的分布。',
    },
  },
  e2eNormalizedInteractivity: {
    name: {
      en: (pctl) => `${enPctl(pctl)}E2E Normalized Interactivity (tok/s/user)`,
      zh: (pctl) => `${zhPctl(pctl)}端到端归一化交互性（tok/s/user）`,
    },
    description: {
      en:
        'E2E normalized interactivity is the effective per-user token rate over a complete ' +
        'request: output tokens divided by end-to-end latency. Unlike plain interactivity it ' +
        'also counts the wait before the first token, so slow prefill lowers the score.',
      zh:
        '端到端归一化交互性是完整请求内的等效单用户 token 速率：输出 token 数除以端到端延迟。' +
        '与普通交互性不同，它把首个 token 之前的等待也计算在内，prefill 越慢得分越低。',
    },
  },
};

/**
 * Resolve which logical x-axis metric a chart is currently plotting.
 * Classifies off the x-axis data field that `resolveXAxisField` actually
 * resolved for the chart's current state, so the footer can never disagree
 * with the drawn axis — `resolveXAxisField` is the single source of truth for
 * the field, including the input-metric fallback where a metric without a
 * `*_x` config override keeps plotting the chart's natural x. Trace-derived
 * agentic x-axis modes bypass that resolver entirely, so they arrive as an
 * explicit flag. Applies to both the official pipeline and `?unofficialrun=`
 * overlays — the overlay path shares the chart's resolved x-axis, so one
 * footer row describes both.
 */
export function resolveXAxisKind(
  chartType: 'interactivity' | 'e2e',
  opts: {
    /** Resolved x-axis data field from `resolveXAxisField` (e.g. `p90_ttft`). */
    xAxisField: string;
    /** Agentic trace-derived normalized-interactivity x-axis mode. */
    isDerivedNormalizedInteractivity: boolean;
  },
): XAxisKind {
  if (opts.isDerivedNormalizedInteractivity) return 'e2eNormalizedInteractivity';
  if (opts.xAxisField.endsWith('ttft')) return 'ttft';
  return chartType === 'e2e' ? 'e2eLatency' : 'interactivity';
}

/**
 * Extract the percentile word from a resolved x-axis label (e.g.
 * "P90 Time To First Token (s)" → "P90"). The chart pipelines always render
 * the percentile prefix in this English form, including on /zh pages.
 */
export function xAxisPercentileFromLabel(xAxisLabel: string): string | null {
  const match = /^(?<pctl>Median|Mean|P\d+(?:\.\d+)?)\s/iu.exec(xAxisLabel);
  if (!match?.groups?.pctl) return null;
  const pctl = match.groups.pctl;
  return pctl.toLowerCase() === 'median'
    ? 'Median'
    : pctl.toLowerCase() === 'mean'
      ? 'Mean'
      : pctl.toUpperCase();
}

/** Locale-aware y-axis row label straight from the metric registry. */
export function metricRowLabel(metricKey: MetricKey, locale: 'en' | 'zh'): string {
  const metric = METRIC_REGISTRY[metricKey];
  return locale === 'zh' ? metric.titleZh : metric.title;
}

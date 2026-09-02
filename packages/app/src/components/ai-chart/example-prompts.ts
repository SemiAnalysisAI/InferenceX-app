export const EXAMPLE_PROMPTS = {
  en: [
    'Compare throughput per chip across all chips for DeepSeek R1 at 8k/1k',
    'Bar chart: H100 vs B200 vs GB200 cost per million tokens (hyperscaler) for DeepSeek R1',
    'Compare Kimi K2.5 vs DeepSeek R1 throughput per chip at 8k/1k',
    'Which chip has the best GSM8K accuracy score for DeepSeek R1?',
    'Compare reliability/success rate across all chips',
    'Show a scatter plot of all chip configs for DeepSeek R1 at 8k/1k with throughput per chip',
  ],
  zh: [
    '对比 DeepSeek R1 在 8k/1k 下各类芯片的单芯片吞吐量',
    '用条形图对比 DeepSeek R1 在 H100、B200 和 GB200 上每百万 token 的 hyperscaler 成本',
    '对比 Kimi K2.5 与 DeepSeek R1 在 8k/1k 下的单芯片吞吐量',
    'DeepSeek R1 在哪种芯片上的 GSM8K 准确率最高？',
    '对比各类芯片的可靠性和运行成功率',
    '绘制 DeepSeek R1 在 8k/1k 下所有芯片配置的散点图，纵轴为单芯片吞吐量',
  ],
} as const;

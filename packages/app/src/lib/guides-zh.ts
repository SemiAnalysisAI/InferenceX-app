import { GUIDE_CATEGORIES, type GuideCategory, type GuideEntry, getAllGuides } from './guides';

export const GUIDE_CATEGORY_LABELS_ZH: Readonly<Record<GuideCategory, string>> = {
  'Hardware selection': '硬件选型',
  'Cost and economics': '成本与经济性',
  'Serving engines': '推理引擎',
  'Capacity planning': '容量规划',
  'Benchmarking methodology': '基准测试方法',
};

type GuideTranslation = Pick<
  GuideEntry,
  'title' | 'description' | 'quickAnswer' | 'sections' | 'faq' | 'keywords'
>;

const translations: Readonly<Record<string, GuideTranslation>> = {
  'best-gpu-for-llm-inference': {
    title: '2026 年 LLM 推理最佳 GPU',
    description:
      '2026 年哪款 GPU 最适合 LLM 推理？从显存、算力、云端价格和实测吞吐量比较 H100、H200、B200、B300、GB200 NVL72、MI325X 与 MI355X。',
    quickAnswer:
      'LLM 推理没有唯一的最佳 GPU：答案取决于所服务的模型、向用户承诺的交互性，以及支付的小时费率。在 InferenceX 的持续基准测试中，NVIDIA Blackwell 系列（B200、B300、GB200 NVL72）凭借 NVFP4 在绝对吞吐量上领先，AMD MI355X 在 FP8 MoE 推理上经常是单 token 成本最低的选择，而 Hopper（H100、H200）仍是较小模型的性价比基准。',
    sections: [
      {
        heading: '推理 GPU 之间真正的差异在哪里',
        paragraphs: [
          '三项硬件指标可以解释大多数 LLM 推理结果：显存容量、显存带宽和低精度张量算力。H100 提供 80 GB HBM3，带宽 3.35 TB/s；H200 提升到 141 GB 和 4.8 TB/s；B200 达到 180 GB 和 8 TB/s，并配备 FP4 张量核心；AMD 的 MI355X 以 288 GB HBM3e 领跑单芯片容量，带宽同为 8 TB/s。以 decode 为主的推理通常受显存带宽限制，因此每美元带宽比峰值 TFLOP/s 更能预测 token 吞吐量。',
          '第四项指标是互连。大型 MoE 模型需要跨多颗芯片部署，所以 scale-up 域的规模非常关键：8 GPU 的 HGX 节点把张量并行和专家并行限制在 8 个 rank 以内，而 GB200 NVL72 机柜把 72 个 GPU 组成一个 NVLink 域，能实现单节点无法表达的宽专家并行（wide-EP）。',
        ],
      },
      {
        heading: '当前芯片在实测推理中的排名',
        paragraphs: [
          'InferenceX 每天在完全相同的模型、引擎和序列配置下测试所有现役数据中心 GPU。在 DeepSeek V4、Kimi K2.5 等前沿 MoE 模型上，运行 NVFP4 的 Blackwell 芯片保持最高的单芯片吞吐量；采用宽专家并行的机柜级 GB200 NVL72 在 Kimi K2.5 上实测单 GPU 吞吐量约为 B200 的 3 倍。AMD 的 MI355X 在 FP8 推理上一直有竞争力，在相同交互性下服务 GLM 5 的实测单 token 成本比 B200 低约 40%。',
          'Hopper 远未过时：H200 的 141 GB 显存让它在中等规模的稠密和 MoE 模型上具备很强的性价比；H100 依然是供应最广、价格最低的 NVIDIA 基准选择，按云端层级不同约为每 GPU 小时 1.17 至 1.78 美元。排名随每次软件发布而变化，这正是一次性评测很快过时、持续基准测试更有价值的原因。',
        ],
      },
      {
        heading: '按工作负载选择',
        paragraphs: [
          '如果在前沿 MoE 模型上运行高交互性对话和智能体编码，应优先选择支持 FP4、scale-up 域较大的芯片：GB200/GB300 NVL72、B300，或配备成熟 FP8 方案的 MI355X。如果面向吞吐量优先的批量和离线推理，决定因素是每百万 token 成本，MI355X、MI325X 和折价的 H200 容量经常胜出。对于约 120B 参数以下的模型，单节点 H100/H200 甚至 RTX PRO 6000 配置可能是成本最低的可行选择。',
        ],
      },
    ],
    faq: [
      {
        question: '2026 年 H100 还值得用于 LLM 推理吗？',
        answer:
          '对合适的工作负载来说值得。H100 不支持 FP4，单芯片显存上限 80 GB，在前沿 MoE 推理上比较吃力；但在超大规模云约每小时 1.17 美元的费率下，它对稠密模型和较小的 MoE 模型仍然是高性价比的基准，软件成熟度的优势在这些模型上也能体现出来。',
      },
      {
        question: 'LLM 推理显存最大的 GPU 是哪款？',
        answer:
          '在广泛部署的单芯片中，AMD MI355X 以 288 GB HBM3e 领先，其次是每 GPU 278 GB 的 GB300 NVL72 超级芯片和 268 GB 的 B300。单芯片显存越大，每个模型副本需要的芯片越少，长上下文推理可用的 KV cache 也越大。',
      },
      {
        question: '这些 GPU 之间的基准测试排名真的会随时间变化吗？',
        answer:
          '变化非常频繁。推理软件的迭代以周为单位而不是以年：InferenceX 实测 MI355X 上 DeepSeek V4 的吞吐量在 SGLang 26 天的开发中提升 110 倍，SGLang 0.5.6 也把 B200 上 DeepSeek R1 FP4 的吞吐量提升最高 1.8 倍。任何静态排名一个季度内就会过时。',
      },
      {
        question: '应该按 TFLOP/s 挑选 GPU 吗？',
        answer:
          '不应该。峰值 TFLOP/s 是营销上限，不能预测推理表现。decode 通常受显存带宽和 KV cache 行为限制，实际方案还受内核、并行策略和调度器质量制约。真正应该比较的是目标交互性下的实测吞吐量。',
      },
    ],
    keywords: [
      'LLM 推理最佳 GPU',
      '2026 AI 推理最佳 GPU',
      'LLM 推理 GPU 对比',
      '运行 LLM 最好的 GPU',
      'H100 vs B200 vs MI355X',
      '最佳数据中心 AI GPU',
      'LLM 服务 GPU 选型',
      'AI 推理硬件指南',
    ],
  },
  'cheapest-gpu-for-llm-inference': {
    title: 'LLM 推理最便宜的 GPU：单 token 成本对比',
    description:
      'LLM 推理最便宜的 GPU 不是小时价最低的那款，而是在你的延迟目标下每百万 token 成本最低的那款。H100、H200、B200、MI300X 与 MI355X 对比。',
    quickAnswer:
      '最便宜的 LLM 推理 GPU，是在目标交互性下每百万 token 成本最低的那款，而不是小时租金最低的那款。AMD MI300X 的租金约为每 GPU 小时 0.95 至 1.30 美元，H100 约从 1.17 美元起，但 MI355X、B200 等新款芯片每小时产出的 token 往往多得多，即使租金更高，单 token 成本反而更低。',
    sections: [
      {
        heading: '小时价格不是该最小化的指标',
        paragraphs: [
          'GPU 租金差距很大：在 SemiAnalysis AI Cloud TCO Model 跟踪的 neocloud 层级中，MI300X 约为每 GPU 小时 1.16 美元，H100 约 1.55 美元，H200 约 1.59 美元，MI325X 约 1.32 美元，B200 约 2.07 美元，MI355X 约 2.09 美元，GB300 NVL72 约 2.79 美元。用小时费率除以实测每秒 token 数就得到每百万 token 成本，而这份排名与租金排名截然不同。',
          '如果一颗芯片每小时贵 35%，但在相同交互性下每秒产出 2 倍的 token，它的单 token 成本会低得多。这正是 InferenceX 按美元比较所测量的内容：B200 以 NVFP4 运行 GLM 5，尽管小时费率更高，每美元性能最高达到 H200 FP8 的 3.6 倍。',
        ],
      },
      {
        heading: '各款低价芯片的优势场景',
        paragraphs: [
          'MI300X 和 MI325X 是性价比之选，适合能装进其 192 GB 和 256 GB 容量的模型，尤其是交互性要求宽松、以吞吐量为主的工作负载。H100 是供应最广的低价 NVIDIA 芯片，在 120B 参数以下的稠密模型上表现良好。H200 每小时只贵几美分就多出 76% 显存，通常是服务 KV cache 较大的中型 MoE 模型最便宜的方式。',
          '在前沿模型上，单 token 便宜通常意味着新硅片：MI355X 以 FP8 服务 GLM 5，在相同交互性下实测比 B200 便宜约 40%；而在 FP4 质量过关的模型上，B200 的 NVFP4 方案在每美元性能上胜过所有 Hopper 配置。哪款芯片对你最便宜，取决于你实际要服务的模型和延迟要求。',
        ],
      },
      {
        heading: '如何自己做这笔比较',
        paragraphs: [
          '先确定模型、以每用户每秒 token 数表示的目标交互性，以及符合实际的小时费率层级。然后在 InferenceX Pareto 前沿上读取该交互性下的每 GPU 每秒 token 数，用费率除以吞吐量即可。仪表板的按美元比较页面和 tco-feed API 会持续完成这套计算，软件改进后答案也随之更新。',
        ],
      },
    ],
    faq: [
      {
        question: 'AI 推理租用最便宜的 GPU 是哪款？',
        answer:
          '按小时费率计算，数据中心 GPU 中通常是 AMD MI300X 最便宜，约为每 GPU 小时 0.95 至 1.30 美元，H100 紧随其后。按当前前沿模型的单 token 成本计算，尽管租金约为每小时 2 美元，MI355X 和 B200 级芯片通常更划算。',
      },
      {
        question: '更便宜的旧款 GPU 有时是正确选择吗？',
        answer:
          '经常是。如果模型能宽裕地装下、用户能接受中等交互性，折价的 H100 或 MI300X 容量在单 token 成本上可以胜过新款芯片。分界点出现在大型 MoE 模型和严格延迟目标上，那时新芯片的带宽和 FP4 算力优势占主导。',
      },
      {
        question: '低交互性下推理能便宜多少？',
        answer:
          '便宜很多。放宽每用户速度目标后批处理会提高利用率，每百万 token 成本随之陡峭下降。同一颗芯片在每秒 100 token 与每秒 20 token 两个目标之间，单 token 成本可能相差数倍。',
      },
      {
        question: '这些价格包含电力和网络吗？',
        answer:
          'InferenceX 使用的小时费率层级来自 SemiAnalysis AI Cloud TCO Model，反映超大规模云、neocloud 和零售层级的全包租赁经济性。自建部署时，电力、散热、网络和利用率风险都转移到你自己身上，TCO 指南对此有详细说明。',
      },
    ],
    keywords: [
      'LLM 推理最便宜 GPU',
      '最便宜的 AI GPU',
      '单 token 成本最低的 GPU',
      'GPU 每百万 token 成本',
      '低成本 LLM 推理硬件',
      'MI300X 每小时价格',
      'H100 vs MI300X 成本',
      '低预算 AI 推理 GPU',
    ],
  },
  'amd-vs-nvidia-llm-inference': {
    title: '2026 年 LLM 推理：选 AMD 还是 NVIDIA',
    description:
      'AMD Instinct 与 NVIDIA GPU 的 LLM 推理对比：MI355X 与 B200 在 vLLM 和 SGLang 上每日实测，分析双方在吞吐量、单 token 成本和软件成熟度上的胜负。',
    quickAnswer:
      '2026 年 AMD 与 NVIDIA 的选择取决于工作负载，而不是立场。InferenceX 每日测量显示：AMD MI355X 在多个 FP8 MoE 方案上以单 token 成本取胜，在 GLM 5 上比 B200 便宜约 40%；NVIDIA Blackwell 则凭借 NVFP4 和机柜级 NVL72 系统在绝对吞吐量上领先。AMD 软件现在能在几周内补齐差距，但在模型 day-0 支持和超低延迟推理上 NVIDIA 仍占优势。',
    sections: [
      {
        heading: '硬件差距比口碑差距小',
        paragraphs: [
          '从纸面规格看，AMD 的 MI355X 在多个维度追平甚至超过 NVIDIA 的 B200：288 GB HBM3e 对 180 GB，带宽同为 8 TB/s，FP8 与 FP4 TFLOP/s 标称值相当。MI325X 当时在显存上同样超过 H200 的规格。两代产品以来，AMD 的问题从来不在规格表上。',
          'NVIDIA 的结构性优势在别处：GB200/GB300 NVL72 机柜的 NVLink scale-up 域包含 72 个 GPU，而当前 Instinct 节点只有 8 GPU；FP4 软件路径在各引擎上都达到生产级质量；还有面向分离式、延迟优化推理的 TensorRT-LLM 与 Dynamo。',
        ],
      },
      {
        heading: '持续测量给出的真实图景',
        paragraphs: [
          'InferenceX 每天在两家厂商上运行完全相同的模型和序列配置，结果确实互有胜负。MI355X 用 SGLang FP8 服务 GLM 5 的实测单 token 成本比 B200 低约 40%，AITER 内核优化让 Kimi K2.5 在 vLLM 上提速 7 倍。MI355X 上 DeepSeek V4 的吞吐量在 26 天内提升 110 倍，既说明 ROCm 迭代之快，也说明 day-0 支持的起点可以有多粗糙。',
          'NVIDIA 在顶端还击：GB200 NVL72 的宽专家并行在 Kimi K2.5 上实测单 GPU 吞吐量约为 B200 的 3 倍；在 FP4 质量过关的模型上，B200/B300 的 NVFP4 方案在每美元比较中领先。在 AgentX 智能体工作负载上，CUDA 软件栈的调度器成熟度在高交互性下依然明显。',
        ],
      },
      {
        heading: '如何为你的部署做决定',
        paragraphs: [
          '当目标模型有成熟的 ROCm 方案、延迟底线适中、且单 token 成本是首要因素时选 AMD：这份单 token 折扣真实且持续存在。当你需要模型 day-0 支持、高并发下亚秒级首 token 时间、FP4 推理，或为万亿参数 MoE 模型做机柜级专家并行时选 NVIDIA。现在许多集群按工作负载分开采购，持续基准测试让这种拆分有据可查。',
        ],
      },
    ],
    faq: [
      {
        question: '现在 AMD 真的能用于生产环境的 LLM 推理吗？',
        answer:
          '可以。MI300X、MI325X 和 MI355X 如今在多家主流 API 背后承载生产流量，vLLM 和 SGLang 都把 ROCm 作为一级支持目标。实际的注意点有两个：模型 day-0 支持仍比 NVIDIA 晚几天到几周，超低延迟方案上 CUDA 内核仍然领先。',
      },
      {
        question: 'CUDA 在推理上还构成护城河吗？',
        answer:
          '护城河在收窄。InferenceX 的 AgentX 跨厂商系列正是为验证这一点而设：在多个 MoE 模型上，AMD 能在发布后数周内追平甚至在每美元性能上胜出，但在最新模型、最严格的延迟目标，以及依赖 NVLink 域的机柜级推理上，NVIDIA 仍保有优势。',
      },
      {
        question: '对 DeepSeek、Kimi 这类 MoE 模型哪家更好？',
        answer:
          '两家都能服务好，只是方式不同。MI355X 单芯片 288 GB 意味着每个副本需要的 rank 更少，FP8 经济性也很强。NVIDIA 的 NVL72 机柜可以在 72 个 GPU 上做宽专家并行，在 Kimi K2.5 上实测单 GPU 吞吐量约为 8 GPU B200 节点的 3 倍。',
      },
    ],
    keywords: [
      'AMD vs NVIDIA LLM 推理',
      'MI355X vs B200',
      'AMD Instinct vs NVIDIA AI',
      'ROCm vs CUDA 推理',
      'AMD GPU LLM 服务',
      'MI300X vs H100 推理',
      '2026 AMD NVIDIA 基准测试',
      'AI GPU 厂商对比',
    ],
  },
  'rack-scale-vs-single-node-inference': {
    title: '机柜级与单节点 LLM 推理：NVL72 何时值回票价',
    description:
      'GB200/GB300 NVL72 机柜与 8 GPU HGX 节点的 LLM 推理对比：72 GPU NVLink 域什么时候值得溢价，什么时候单节点仍是更好的选择。',
    quickAnswer:
      '当模型和工作负载能吃满 72 GPU NVLink 域时，GB200、GB300 NVL72 这类机柜级系统才值回票价：典型场景是用宽专家并行和分离式 prefill 服务万亿参数 MoE 模型。InferenceX 实测 GB200 NVL72 以这种方式在 Kimi K2.5 上取得约 3 倍于 B200 的单 GPU 吞吐量。对于 8 个 GPU 就能装下的稠密或中型模型，单台 HGX 或 Instinct 节点的单 token 成本通常仍然更低。',
    sections: [
      {
        heading: '72 GPU scale-up 域改变了什么',
        paragraphs: [
          'HGX B200 节点用 NVLink 连接 8 个 GPU，超出节点的流量要走更慢的 scale-out 网络。NVL72 机柜把 72 个 GPU 组成一个 NVLink 域，专家并行、张量并行和分离式推理的 KV 传输都能以 NVLink 带宽在整个机柜内运行。对拥有数百个专家的 MoE 模型来说，这意味着每个 GPU 承载更少的专家并以更高利用率服务它们，也就是所谓的宽专家并行。',
          '机柜的溢价是实打实的：neocloud 层级下 GB200 NVL72 租金约为每 GPU 小时 2.26 美元，GB300 NVL72 约 2.79 美元，而 B200 节点约 2.07 美元。问题在于，机柜专属方案带来的额外单 GPU token 产出能否覆盖这个差价。',
        ],
      },
      {
        heading: '实测中机柜级的胜与负',
        paragraphs: [
          '在 Kimi K2.5 上，GB200 NVL72 的 vLLM 宽专家并行实测单 GPU 吞吐量约为 8 GPU B200 部署的 3 倍，足以轻松覆盖价格溢价。用 Dynamo 和 TensorRT-LLM 做分离式 DeepSeek R1 FP4 推理时，机柜在高交互性下也有类似优势；GB300 以更大显存（每 GPU 278 GB）和 FP4 算力，在 KV 密集的智能体流量上进一步拉开差距。',
          '一旦工作负载用不上这个域，优势就会消失。单节点能装下的模型收益甚微；AgentX 对 MiniMax M3 的比较发现，在那种负载形状下 B200/B300 节点部署与机柜级系统竞争力相当。填不满合适流量的机柜，只是一个昂贵的节点集群。',
        ],
      },
      {
        heading: '决策清单',
        paragraphs: [
          '当需要大规模服务万亿参数级 MoE 模型、延迟目标要求分离式 prefill 和 decode，或 KV 工作集需要跨多 GPU 的池化显存时，选择机柜级。当模型能装进 8 个 GPU、采购灵活性和多厂商议价能力重要，或流量太小无法让 72 个 GPU 保持忙碌时，选择单节点。利用率风险是机柜的隐性成本：闲置的 NVL72 容量烧钱比闲置节点快得多。',
        ],
      },
    ],
    faq: [
      {
        question: '相比 B200 节点，GB200 NVL72 值得吗？',
        answer:
          '对前沿 MoE 推理来说通常值得：实测 wide-EP 方案在 Kimi K2.5 上取得约 3 倍单 GPU 吞吐量，远超约 10% 的小时溢价。对单节点就能装下的模型通常不值得，因为机柜的核心能力用不上。',
      },
      {
        question: '什么是宽专家并行，为什么需要机柜？',
        answer:
          '宽专家并行把 MoE 模型的专家分散到远超单节点容量的 GPU 上，每个 GPU 存储的专家更少，token 批处理效率更高。rank 之间的 all-to-all 通信只有在 NVL72 这样的大型 NVLink scale-up 域内才能保持高速。',
      },
      {
        question: 'AMD 有机柜级方案吗？',
        answer:
          'AMD 当前 Instinct 部署的 scale-up 上限是每节点 8 个 GPU，面向 MI400 世代的机柜级 Helios 系统已经公布。眼下 MI355X 的竞争方式是给每颗芯片配 288 GB 显存，从源头减少大模型所需的 rank 数量。',
      },
    ],
    keywords: [
      'GB200 NVL72 vs B200',
      '机柜级推理',
      'NVL72 基准测试',
      '宽专家并行',
      '分离式推理硬件',
      'GB300 NVL72 性能',
      'scale-up 域 LLM 推理',
      '72 GPU NVLink 机柜',
    ],
  },
  'gpu-memory-requirements-for-llms': {
    title: 'LLM 的 GPU 显存需求：到底需要多少 VRAM？',
    description:
      '服务一个 LLM 需要多少 GPU 显存：按精度计算权重、估算 KV cache，以及哪些芯片能装下 DeepSeek V4、Kimi K2.5、GLM 5 和 70B 级模型。',
    quickAnswer:
      '估算 LLM 推理显存的方法是权重加 KV cache 再加开销。FP8 下权重约需每参数 1 字节，FP4 减半，因此一个 70B 模型在 FP8 下不算 KV cache 就需要约 70 GB；DeepSeek V4 这样 1.6 万亿参数的 MoE 即使用低精度，也需要约 1 TB 显存分布在多 GPU 副本上。生产部署还要为长上下文流量额外准备数十到数百 GB 的 KV cache。',
    sections: [
      {
        heading: '按精度计算权重',
        paragraphs: [
          '模型权重决定下限：字节数等于参数量乘以每参数字节数，BF16 约为 2，FP8 和 INT8 约为 1，FP4 和 INT4 约为 0.5。因此一个 70B 稠密模型在 BF16 下约需 140 GB，FP8 下 70 GB，FP4 下 35 GB，另加引擎开销。MoE 模型虽然每个 token 只激活一小部分参数，存储时却按总参数量计算：DeepSeek V4 Pro 存储 1.6T 参数，每 token 激活 49B。',
          '这就是单芯片容量决定部署形态的原因。8x MI355X 节点凭单卡 288 GB 拥有超过 2.3 TB 显存，可以在单节点用 FP8 或 FP4 装下前沿 MoE 模型；80 GB 的 H100 服务同一模型则需要多个节点或激进量化。',
        ],
      },
      {
        heading: 'KV cache 是预算中不断增长的那一半',
        paragraphs: [
          '每个活跃上下文中的每个 token 都要按层存储 key 和 value，所以 KV cache 随并发数乘以上下文长度增长。会话长达十万 token 的长上下文和智能体工作负载可能让 KV 工作集超过权重占用，这正是 InferenceX 的 AgentX 场景所测量的压力。模型架构也在用分组注意力和潜在注意力对抗这一趋势：DeepSeek V4 的混合稀疏注意力在 1M token 上下文下只需前代约 10% 的 KV cache。',
          '规划时要留出 KV 余量，而不是只算权重能否装下：一个勉强装载但没给 cache 留空间的模型只能跑极小的批次，单 token 成本会非常难看，或者被迫驱逐前缀、损失 cache 命中率。',
        ],
      },
      {
        heading: '按模型级别的快速估算表',
        paragraphs: [
          '以 FP8 加生产级 KV 余量为经验值：7B 到 13B 模型可用一块 24 到 48 GB 加速器；70B 级稠密模型需要 2x H100/H200 或一颗大显存芯片；gpt-oss-120b 这类 120B 级 MoE 模型可装进单颗 H200 或 MI325X；400B 级 MoE 模型需要 4 到 8 颗现代 GPU；DeepSeek V4、Kimi K3 这类万亿参数 MoE 旗舰至少需要一整台 8 GPU 大显存节点，做宽专家并行时更推荐机柜级域。',
        ],
      },
    ],
    faq: [
      {
        question: '跑一个 70B 模型需要多少 VRAM？',
        answer:
          '仅权重就需要 BF16 约 140 GB、FP8 约 70 GB 或 FP4 约 35 GB，还要再加 KV cache 和引擎开销。生产环境的 FP8 部署通常用两块 80 GB GPU，或一颗 141 GB 以上的芯片如 H200、MI325X 或 MI355X，让 KV cache 有空间做批处理。',
      },
      {
        question: '服务 DeepSeek V4 需要多少显存？',
        answer:
          'DeepSeek V4 Pro 存储 1.6T 参数，仅权重在 FP4 下就接近 800 GB，FP8 下达 1.6 TB。实际部署至少使用 8 GPU 大显存节点，面对长上下文的生产流量则采用 NVL72 机柜或多节点专家并行。',
      },
      {
        question: 'MoE 模型比稠密模型更省显存吗？',
        answer:
          '不省。MoE 省的是每 token 的计算量，不是存储量。即使每个 token 只激活少数专家，所有专家都必须常驻显存。MoE 实际上提高了每 FLOP 的显存压力，这正是大容量芯片和跨大型 scale-up 域的专家并行如此重要的原因。',
      },
      {
        question: '如果 KV cache 余量留得太少会怎样？',
        answer:
          '批大小会骤降，前缀缓存被驱逐，即使模型装得下，吞吐量也会下滑。引擎随后会把 KV offload 到主机内存或重算前缀，两者都要付出延迟代价。只按权重估容量是 LLM 推理容量规划中最常见的错误。',
      },
    ],
    keywords: [
      'LLM GPU 显存需求',
      '运行 LLM 需要多少 VRAM',
      '70B 模型显存需求',
      'LLM 显存计算',
      'DeepSeek V4 硬件要求',
      'KV cache 显存估算',
      'FP8 模型权重显存',
      'AI GPU 容量规划',
    ],
  },
  'best-hardware-for-agentic-coding': {
    title: '智能体编码推理的最佳硬件',
    description:
      '哪些 GPU 最适合服务编码智能体？AgentX 在 B200、B300、GB300 NVL72 和 MI355X 上实测长上下文、多轮智能体流量，并分析这种工作负载偏好什么。',
    quickAnswer:
      '智能体编码流量看重的硬件特性与聊天不同：十万 token 级会话带来巨大的 KV 工作集、跨轮次的前缀缓存复用，以及并行 subagent 造成的突发并发。在 AgentX 测量中，大显存 FP4 芯片领先：GB300 NVL72 和 B300 在高交互性下领跑，而 MI355X 凭单芯片 288 GB 在多个模型上成为每美元性能最强的挑战者。',
    sections: [
      {
        heading: '为什么智能体流量打破聊天时代的假设',
        paragraphs: [
          '一次编码智能体会话在模型请求与工具调用之间交替，在几十个轮次中不断累积上下文，还经常分叉出并行 subagent。后续请求携带此前会话的大部分内容，因此服务性能取决于 prefix caching，以及硬件能常驻多少 KV cache。固定 1024x1024 的基准测试完全测不到这些，这正是 InferenceX 基于匿名化编码智能体轨迹构建 AgentX 的原因。',
          'KV 工作集是决定性压力：AgentX 在 DeepSeek V4 上对比 B200 与 B300 显示，当会话组合把 KV 推到 180 GB 无法免驱逐容纳的程度时，268 GB 的芯片恰好开始拉开差距。',
        ],
      },
      {
        heading: 'AgentX 在各厂商上的测量结果',
        paragraphs: [
          '在 DeepSeek V4、Kimi K3、GLM 5.3、Qwen 3.5 和 MiniMax M3 上，AgentX 系列实测机柜级 GB300 NVL72 和节点级 B300 在高交互性下领先，分离式 GB200/GB300 方案在高负载下的首 token 时间表现最强。AMD 的 MI355X 搭配 Atom 引擎和 SGLang，在 Kimi K3 和 GLM 5.3 上取得有竞争力甚至领先的单会话成本，并在 GLM 5.3 上维持每用户约 150 token/s。',
          '交互性对智能体比对聊天更重要：一个以每秒 30 token 输出的编码智能体，在 50 轮会话中会让人觉得非常慢，所以运营者倾向于购买 Pareto 前沿的高交互性一端，FP4 算力和 NVLink 域正是在那里赚回溢价。',
        ],
      },
      {
        heading: '配置建议',
        paragraphs: [
          '优先为 KV 配置容量：选择 268 到 288 GB 的芯片（B300、MI355X、GB300 单 GPU）或池化的机柜显存，开启 prefix caching 和 KV 感知路由，并在生产中监控前缀缓存命中率。并发容量按 subagent 突发而非平均会话来定。还要每月重新做基准测试：智能体方案还很年轻，引擎发布对排名的影响快于硬件换代。',
        ],
      },
    ],
    faq: [
      {
        question: '编码智能体真的需要与聊天机器人不同的 GPU 吗？',
        answer:
          '芯片相同，优先级不同。智能体会话成倍放大上下文长度和复用率，显存容量和前缀缓存行为因此占主导，而聊天服务对较小的 KV 预算更宽容。固定序列基准测试得出的芯片排名，在智能体流量下可能重新洗牌。',
      },
      {
        question: '编码智能体应该瞄准什么交互性？',
        answer:
          '多数运营者为交互式编码智能体设定每用户每秒 50 到 150 token 的目标，是聊天惯例的数倍，因为用户要等待多轮循环完成。AgentX 发布相同交互性下的吞吐量数据，让你可以按会话计算这个选择的成本，而不是靠猜。',
      },
      {
        question: '服务智能体必须用机柜级硬件吗？',
        answer:
          '不是必须，但在前沿模型上有帮助：池化的 NVL72 显存能容纳单节点会驱逐的 KV 工作集，分离式部署能在 subagent 突发期间保持较低的首 token 时间。B300、MI355X 级的大显存单节点在多数模型上每美元表现仍然很有竞争力。',
      },
    ],
    keywords: [
      'AI 智能体最佳硬件',
      '智能体编码推理',
      '编码智能体 GPU',
      'AgentX 基准测试',
      '长上下文智能体服务',
      'KV cache 智能体工作负载',
      'B300 vs MI355X 智能体',
      '编码智能体基础设施',
    ],
  },
  'llm-inference-cost-per-million-tokens': {
    title: '一文讲清 LLM 推理每百万 token 成本',
    description:
      'LLM 推理每百万 token 的真实成本：由 GPU 小时费率和实测吞吐量构成的公式、交互性为何会改变结果，以及当前硬件的实际数字。',
    quickAnswer:
      '每百万 token 成本等于 GPU 小时费率除以每 GPU 小时生成的 token 数，再乘以一百万。一颗每小时 2 美元、单 GPU 持续输出每秒 5,000 token 的芯片，每百万输出 token 约 0.11 美元；在严格延迟目标下降到每秒 500 token 时，同一颗芯片就要 1.11 美元。真正的杠杆是目标交互性下的吞吐量，而不是租金。',
    sections: [
      {
        heading: '公式与一个算例',
        paragraphs: [
          '用每 GPU 小时的美元数，除以每 GPU 每秒 token 数乘 3,600 秒，再乘以一百万。按 neocloud 费率，B200 约为每 GPU 小时 2.07 美元：单 GPU 每秒 10,000 token 时每百万 token 为 0.058 美元，每秒 1,000 token 时为 0.58 美元。这个区间的两端是同一颗芯片、同一个模型，只是交互性目标不同。',
          '这就是 InferenceX 的每一个成本数字都标注交互性的原因：不带延迟条件的每百万 token 成本毫无意义，只报最佳批处理吞吐量的厂商利用的正是这种模糊。',
        ],
      },
      {
        heading: '实践中影响数字的因素',
        paragraphs: [
          '四个杠杆最重要。交互性：放宽每用户每秒 token 数可以让调度器合并更多请求，成本可能降低数倍。精度：FP4 方案在 Blackwell 和 MI355X 级芯片上几乎把有效算力翻倍，实测 NVFP4 在 GLM 5 上每美元性能最高达到 FP8 Hopper 的 3.6 倍。软件：引擎发布经常带来两位数百分比的吞吐量提升，MI355X 上的 DeepSeek V4 推理在 26 天内提升 110 倍。序列形状：长输入把工作转移到 prefill，经济性随之完全改变。',
          '输入 token、缓存 token 和输出 token 的成本也各不相同：prefill 受算力限制、单 token 便宜，decode 受带宽限制、单 token 昂贵，prefix cache 命中几乎免费。生产流量是三者的混合，这解释了 API 服务商为何对输入、缓存和输出 token 分别定价。',
        ],
      },
      {
        heading: '基准测试成本与 API 价格的关系',
        paragraphs: [
          '在现实利用率下的自建每百万 token 成本，是所有 API 价格的下限。InferenceX 的按美元页面和 tco-feed API 在固定交互性层级上跨芯片、模型和引擎持续发布这个下限，你可以据此判断 API 加价买到的是真实的效率、你自己达不到的延迟，还是纯粹的利润。',
        ],
      },
    ],
    faq: [
      {
        question: '用开源模型生成一百万 token 要花多少钱？',
        answer:
          '在当前硬件和中等交互性下，前沿 MoE 模型的实测成本从每百万输出 token 几美分到几美元不等，取决于芯片、引擎、精度和延迟目标。仪表板的按美元页面在固定交互性层级上发布实时数字。',
      },
      {
        question: '为什么我的成本和公开的基准数字不一样？',
        answer:
          '通常是利用率和流量形状的差异。基准测试报告的是标注交互性下的饱和服务；生产集群运行在饱和之下，要为闲置容量付费，序列组合也更杂乱。把基准成本乘以预期利用率的倒数，就能得到符合实际的预算。',
      },
      {
        question: '输入 token 比输出 token 便宜吗？',
        answer:
          '便宜，而且是结构性的。输入 token 在算力密集的 prefill 中并行处理，而每个输出 token 都需要一次受显存带宽限制的完整 decode。这就是 API 定价把两者分开的原因，也解释了跳过 prefill 的缓存输入 token 为什么最便宜。',
      },
      {
        question: '量化一定能降低单 token 成本吗？',
        answer:
          '只要质量不掉就能降低：FP4 把权重流量减半，并在支持它的芯片上把张量吞吐量大约翻倍。风险在于精度损失因模型而异，所以 InferenceX 在按美元比较旁边同时给出评估分数，而不是默认量化后效果不变。',
      },
    ],
    keywords: [
      'LLM 推理每百万 token 成本',
      '每百万 token 成本',
      'LLM 服务成本计算',
      'GPU token 生成成本',
      '推理成本公式',
      'LLM 单 token 成本',
      '自建 LLM 成本',
      'GPU 每美元 token 数',
    ],
  },
  'gpu-cloud-pricing-comparison': {
    title: '2026 年 GPU 云价格：H100 到 GB300 小时费率对比',
    description:
      '2026 年各 GPU 在超大规模云、neocloud 和零售层级的小时价格：H100、H200、B200、B300、GB200/GB300 NVL72、MI300X、MI325X 与 MI355X 费率对比。',
    quickAnswer:
      '2026 年，SemiAnalysis AI Cloud TCO Model 跟踪的数据中心 GPU 租金大致在每 GPU 小时 0.95 至 3.30 美元之间：H100 各层级约 1.17 至 1.78 美元，H200 为 1.22 至 2.05 美元，B200 为 1.73 至 2.60 美元，B300 为 2.26 至 3.00 美元，GB200 NVL72 为 1.86 至 2.60 美元，GB300 NVL72 为 2.31 至 3.30 美元；AMD 的 MI300X（0.95 至 1.30 美元）、MI325X（1.10 至 1.60 美元）和 MI355X（1.50 至 2.10 美元）价格低于对位的 NVIDIA 产品。',
    sections: [
      {
        heading: '三个价格层级',
        paragraphs: [
          'GPU 租赁分为三个层级。超大规模云费率反映大云上有承诺量的规模化合同，价格最低：H100 约 1.17 美元，B200 约 1.73 美元。GPU 专业服务商的 neocloud 费率承诺期更短，约高 15% 到 30%：H100 为 1.55 美元，B200 为 2.07 美元，MI355X 为 2.09 美元。零售按需费率是上限，B200 达 2.60 美元，GB300 NVL72 达 3.30 美元。',
          '这些层级是 InferenceX 所有单 token 成本和每美元性能数字的分母，从而保证跨厂商比较的公平：每颗芯片都按真实买家会支付的层级定价，而不是营销数字。',
        ],
      },
      {
        heading: '解读芯片之间的价差',
        paragraphs: [
          '新硅片的租金溢价通常小于其吞吐量优势：B200 每小时比 H100 贵约三分之一，但在前沿 MoE 推理上能力高出数倍，这就是尽管标价惊人、单 token 经济性仍偏向新芯片的原因。AMD 的小时定价很激进，而 MI355X 在 FP8 方案上经常追平 B200 级吞吐量，因此这份折扣在部分模型上叠加成实测约 40% 的单 token 节省。',
          '机柜级有自己的逻辑：GB200 NVL72 的单 GPU 租金与 B200 节点接近，因此任何机柜专属的吞吐量收益都会直接转化为单 token 成本节省，而 wide-EP 在 Kimi K2.5 上实测约 3 倍。GB300 更高的费率对应其每 GPU 278 GB 显存和 FP4 提升。',
        ],
      },
      {
        heading: '费率与你实际付出的单 token 成本',
        paragraphs: [
          '小时费率只是分子。除以目标交互性下实测的每 GPU 小时 token 数，才是应该写进预算的数字。一颗每小时 1 美元但服务模型很差的芯片，比一颗每小时 3 美元但服务很好的芯片更贵；按美元比较仪表板的意义就是让这笔算术持续更新，而不是每季度做一次表格。',
        ],
      },
    ],
    faq: [
      {
        question: '2026 年 H100 每小时多少钱？',
        answer:
          '超大规模云合同约为每 GPU 小时 1.17 美元，neocloud 为 1.55 美元，零售按需最高约 1.78 美元。随着 Blackwell 和 MI350 级供应增加、Hopper 集群进入性价比阶段，费率仍在缓慢下行。',
      },
      {
        question: '租一台 GB200 NVL72 机柜要多少钱？',
        answer:
          '按 GPU 计约为每小时 1.86 至 2.60 美元，因层级而异，整台 72 GPU 机柜约为每小时 134 至 187 美元。机柜租赁通常要求更长的承诺期，因为服务商难以转售部分机柜。',
      },
      {
        question: '为什么 AMD GPU 每小时比 NVIDIA 便宜？',
        answer:
          '供需和生态风险定价共同作用。AMD 在软件成熟期以价格换部署，云服务商把这部分让利传导给用户。由于当前 Instinct 芯片在成熟方案上经常追平 NVIDIA 的单芯片吞吐量，小时折扣往往能保留到单 token 成本上。',
      },
      {
        question: '应该优化最低小时费率吗？',
        answer:
          '不应该，应该优化你延迟目标下的每百万 token 成本。芯片便宜但服务模型慢，token 反而贵。这里的费率表是那笔计算的输入，按美元比较页面会基于实时基准测试持续运行这个计算。',
      },
    ],
    keywords: [
      '2026 GPU 云价格',
      'H100 每小时价格',
      'B200 租用价格',
      'GPU 小时费率对比',
      'MI355X 每小时价格',
      'GB200 NVL72 租金',
      '云 GPU 成本对比',
      'AI GPU 租赁价格',
    ],
  },
  'self-hosting-llm-vs-api': {
    title: '自建 LLM 与调用 API：盈亏平衡点在哪里',
    description:
      '自建开源权重 LLM 什么时候比按 token 付费的 API 更划算：利用率的算术、隐性成本，以及基准测试的每百万 token 成本如何设定下限。',
    quickAnswer:
      '当流量能让租用或自有的 GPU 保持忙碌时，自建开源权重模型就能胜过 API 定价。基准测试显示，良好利用率下自建的成本下限是每百万 token 几美分到几美元，往往比 API 标价低数倍；但一旦利用率低于约 30% 到 50%，算上闲置时间、工程投入和更难做好的延迟工程，这份折扣就消失了。',
    sections: [
      {
        heading: '决定胜负的利用率算术',
        paragraphs: [
          '自建集群无论有没有流量，每小时成本都一样，而 API 只按 token 计费。从饱和状态下基准测试的每百万 token 成本出发，除以预期利用率：每百万 0.20 美元的下限在 25% 利用率下变成 0.80 美元。突发、尖峰或集中在非高峰时段的流量，会让真实利用率远低于容量规划文档的假设。',
          'API 通过复用成千上万租户的流量替你摊平了这一切，这就是小而不规律的工作负载几乎从不适合自建、而稳定的大流量工作负载几乎总是适合的原因。',
        ],
      },
      {
        heading: 'GPU 小时费之外的成本',
        paragraphs: [
          '还要加上推理工程（引擎升级、方案调优、故障响应）、验证量化选择的评估工作、故障切换的容量冗余，以及 API 打包提供的延迟工程：分离式 prefill、前缀缓存路由和投机解码现在都得自己做。诚实记账的团队通常要在裸算力之上增加 20% 到 50%，才能得到生产级的自建栈。',
          '另一边的砝码是掌控力：开源权重让你可以锁定模型版本、按工作负载调整精度、把数据留在自己的边界内，并持续享受推理软件改进带来的成本下降。这些改进又快又大，引擎发布经常带来两位数百分比的吞吐量提升，在新硬件上偶尔还有数量级的跃升。',
        ],
      },
      {
        heading: '一条可操作的决策路径',
        paragraphs: [
          '估算稳态的每日 token 量，拆分为输入、缓存和输出。按公开价格计算 API 路径的成本。自建路径则用你的模型在你的交互性下的实时基准每百万 token 成本，除以诚实的利用率，再加上运维开销系数。多数团队的盈亏平衡点在每日数千万到数亿 token 之间；延迟控制和数据治理会把边缘案例推向自建一侧。',
        ],
      },
    ],
    faq: [
      {
        question: '自建 LLM 到什么规模才划算？',
        answer:
          '对前沿级 MoE 模型，通常在持续流量达到每日数千万到数亿 token 时；小模型配便宜 GPU 时门槛更低。确切分界线取决于交互性目标和可实现的利用率，两者都可以对照实时基准下限来衡量。',
      },
      {
        question: '自建每 token 能便宜多少？',
        answer:
          '高利用率下，同一开源模型的自建实测下限往往比 API 标价低 2 到 10 倍。利用率差时优势会反转。这种比较只有在延迟对齐时才有意义，这正是等交互性基准曲线的用途。',
      },
      {
        question: 'API 能给我什么自建给不了的？',
        answer:
          '弹性的突发容量、零闲置成本，以及别人家的推理工程师。此外，前沿闭源模型只能通过 API 使用。自建的优势在于规模化后的单位经济性、数据控制、版本锁定，以及按工作负载自由调整精度和引擎。',
      },
    ],
    keywords: [
      '自建 LLM vs API',
      '自建 LLM 成本',
      'LLM API 与自有 GPU 对比',
      '开源 LLM 部署成本',
      'LLM 自建盈亏平衡',
      'API 与自建推理对比',
      'LLM 部署成本对比',
      '开源权重模型服务',
    ],
  },
  'llm-inference-power-consumption': {
    title: 'LLM 推理功耗：瓦特、焦耳与每兆瓦 token 数',
    description:
      'LLM 推理耗电多少：GPU TDP 与整体功耗的差异、实测单 token 能耗，以及每兆瓦 token 数为何正成为 AI 建设的硬约束。',
    quickAnswer:
      '现代推理 GPU 的 TDP 在 700 到 1,400 瓦之间，但算上主机、网络和散热，整体功耗达到每 GPU 1.4 到 2.1 千瓦：一台 8 GPU 的 MI355X 或 GB300 级节点就是一台 15 到 17 千瓦的设备。经济上真正重要的是单 token 能耗，实测能效如今决定一座受电力限制的数据中心每兆瓦能卖出多少 token。',
    sections: [
      {
        heading: '从 TDP 到整体功耗',
        paragraphs: [
          '芯片 TDP 逐代攀升：H100 和 H200 为 700 W，B200 为 1,000 W，B300 和 GB300 级为 1,200 到 1,400 W，MI355X 为 1,400 W。SemiAnalysis AI Cloud TCO Model 跟踪的是每 GPU 整体功耗，把主机分摊、网卡和风扇都计入：H100 为 1.37 kW，B200 为 1.71 kW，B300 为 1.9 kW，GB300 为 2.12 kW，MI355X 为 2.09 kW。机房层面还要再乘以 PUE。',
          '单芯片功耗上升本身并不等于浪费：如果功耗翻倍换来 4 倍 token，单 token 能耗就减半了。该盯的是这个比值，而它需要实测推理吞吐量，规格表给不出来。',
        ],
      },
      {
        heading: '单 token 能耗与每兆瓦 token 数',
        paragraphs: [
          'InferenceX 在吞吐量之外同时发布单 token 能耗和每兆瓦 token 数，因为电力日益成为稀缺投入：运营者买的是兆瓦，卖的是 token。在相同交互性下，不同芯片在这项指标上可以相差数倍；低精度方案会直接改善它，因为每服务一个 token，FP4 搬运的比特只有 FP8 的一半。',
          '工作负载形状对单 token 能耗的影响不亚于硅片：批量为主的推理把静态功耗摊到大量并发 token 上，而低延迟、低并发的推理会让瓦特闲置。为严格交互性调优的集群不只要用美元买单，还要用焦耳买单。',
        ],
      },
      {
        heading: '这对规划意味着什么',
        paragraphs: [
          '做部署规划时，节点的千瓦预算应按整体功耗而不是 TDP 计算，然后按你延迟目标下实测的每兆瓦 token 数比较硬件。做选址和容量决策时，单 token 能耗可以把模型流量预测直接换算成兆瓦需求；而推理软件的改进无需任何施工许可就能提高集群产能。',
        ],
      },
    ],
    faq: [
      {
        question: '一块 LLM 推理 GPU 耗电多少？',
        answer:
          '芯片 TDP 因代际不同在 700 到 1,400 瓦之间，但算上主机分摊、网络和散热，整体为 1.4 到 2.1 千瓦。机房 PUE 还要在 IT 负载之上再加 10% 到 30%。',
      },
      {
        question: '生成一个 token 要耗多少能量？',
        answer:
          '随芯片、模型、精度和交互性不同可相差几个数量级，所以 InferenceX 按配置测量每 token 焦耳数，而不是给出单一数字。中等交互性下高效的 FP4 MoE 推理处于低端；严格延迟的稠密模型推理处于高端。',
      },
      {
        question: '新硬件推理更省电吗？',
        answer:
          '按 token 计算省得非常多，尽管瓦数更高。Blackwell 和 CDNA 4 芯片的功耗最高达到 Hopper 时代的两倍，但在前沿模型上产出数倍的 token，因此每 token 焦耳数逐代下降。这个收益只有在软件充分利用新硅片时才会兑现。',
      },
    ],
    keywords: [
      'LLM 推理功耗',
      'AI GPU 耗电量',
      '单 token 能耗',
      '每兆瓦 token 数',
      'AI 数据中心电力',
      'GPU TDP 对比',
      '推理能效',
      'AI 电力需求',
    ],
  },
  'ai-gpu-total-cost-of-ownership': {
    title: 'AI GPU 总拥有成本：从每小时美元到每百万 token 美元',
    description:
      'AI GPU TCO 的真实构成：把资本开支、电力、网络和利用率折算成每 GPU 小时美元，再通过实测吞吐量换算成每百万 token 成本。',
    quickAnswer:
      'AI GPU 总拥有成本把资本成本、电力、网络、机房和利用率风险折算成一个小时费率，再由实测吞吐量把该费率换算成每百万 token 成本。SemiAnalysis AI Cloud TCO Model 用分买家类型的每 GPU 小时美元层级表达这一点，H100 约 1.17 至 1.78 美元、B200 约 1.73 至 2.60 美元；InferenceX 把这些层级与实时基准测试相连，让 TCO 落到 token 上，而不是停留在抽象数字。',
    sections: [
      {
        heading: '一个 GPU 小时里有什么',
        paragraphs: [
          'GPU 的小时成本主要是摊销的资本开支：加速器本身、它分摊的服务器、网络设备和数据中心建设，按四到六年的使用寿命分摊。然后是运营成本：按整体功耗（每颗现代 GPU 1.4 到 2.1 kW）计的电费、按 PUE 计的散热、带宽和人力。最后是利用率：忙碌时间只有 60% 的集群，每个有效小时的成本是满负荷集群的 1.67 倍。',
          '云租赁层级把这一切压缩成一个可直接观察的数字，所以 InferenceX 按超大规模云、neocloud 和零售三档每 GPU 小时美元为每颗芯片定价，而不是替每位读者重新推导资本开支假设。',
        ],
      },
      {
        heading: '从小时成本到 token',
        paragraphs: [
          'TCO 只有除以产出才具备决策价值：每 GPU 小时的美元数除以目标交互性下每 GPU 小时的 token 数。这个分母持续变动，也是多数 TCO 表格失效的地方：推理软件在 26 天内把 MI355X 上 DeepSeek V4 的吞吐量提升 110 倍，一周前做的表格就漏掉了两个数量级的分母变化。',
          '同一套换算也把量化和并行策略变成 TCO 决策，而不只是工程决策：一个每美元性能达到 FP8 Hopper 3.6 倍的 NVFP4 方案，不用买任何新硬件就能改写集群规划。',
        ],
      },
      {
        heading: '结合 TCO 模型与实时基准测试',
        paragraphs: [
          'Accelerator & HBM Model 和 AI Cloud TCO Model 提供成本侧：组件价格、电力和分买家层级的每 GPU 小时美元。InferenceX 提供产出侧：固定交互性层级下持续实测的每 GPU 每秒 token 数，可通过 tco-feed API 导出到电子表格的 Power Query。两者相连，就得到随软件和价格变动自动更新的每百万 token 成本。',
        ],
      },
    ],
    faq: [
      {
        question: 'AI 推理 TCO 最大的驱动因素是什么？',
        answer:
          '是利用率和软件效率，而不是 GPU 的标价。闲置时间会放大所有其他成本，而推理软件一个季度对每 GPU 小时 token 数的提升，经常超过硬件价格一年的变动。',
      },
      {
        question: '推理 GPU 的经济寿命有多长？',
        answer:
          '比训练 GPU 长。推理可以让旧芯片服务更小的模型或更宽松的延迟层级，因此 Hopper 级芯片在退出前沿后仍能创造价值多年。本站的集群生命周期分析建模的正是芯片沿工作负载层级逐级下沉的过程。',
      },
      {
        question: '应该买 GPU 还是租？',
        answer:
          '在持续利用率和规划周期足以支撑自有之前先租。高利用率下购买胜过 neocloud 费率，但它集中了技术风险：更好的芯片或租用容量上 10 倍的软件收益到来时，租用者不用计提任何减值。小时层级让这种比较一目了然。',
      },
    ],
    keywords: [
      'AI GPU TCO',
      'GPU 总拥有成本',
      'AI 基础设施成本模型',
      'GPU 资本开支运营开支',
      '每 GPU 小时成本',
      'AI 数据中心经济性',
      '推理 TCO 计算',
      'GPU 集群经济性',
    ],
  },
  'vllm-vs-sglang': {
    title: 'vLLM 与 SGLang：哪个 LLM 推理引擎更快？',
    description:
      'vLLM 与 SGLang 在相同模型和 GPU 上每日实测：两个引擎各自在吞吐量、prefix caching、MoE 支持和 AMD 性能上的优势，附实时基准数据。',
    quickAnswer:
      'vLLM 和 SGLang 都不是全面更快的那个：InferenceX 每天在完全相同的模型、GPU 和序列配置上测量两者，领先位置随模型家族、硬件和版本切换。SGLang 的 RadixAttention 让它在前缀密集和结构化工作负载上占优，并在 AMD 上领跑多个 MoE 方案；vLLM 则拥有最广的硬件与模型覆盖，并在 NVL72 机柜上取得出色的宽专家并行成绩。',
    sections: [
      {
        heading: '两个引擎，两个设计重心',
        paragraphs: [
          'vLLM 让 PagedAttention 和连续批处理流行起来，已成为开源生态的默认推理引擎：它支持的模型和硬件后端最多，并提供分离式推理、宽专家并行等生产特性，InferenceX 的 GB200 NVL72 Kimi 方案就在使用这些能力。这种广度使它成为最稳妥的首选和最常见的基线。',
          'SGLang 源自结构化生成研究，核心是 RadixAttention，一种基于基数树的前缀缓存，让共享前缀工作负载、多轮会话和智能体流量极为高效。它在 AMD 上尤其是一个速度故事：SGLang 方案把 MI355X 上 DeepSeek V4 的推理在 26 天内提升 110 倍，并让 GLM 5 的单 token 成本比 B200 低约 40%。',
        ],
      },
      {
        heading: '每日测量的结果',
        paragraphs: [
          '在 NVIDIA Blackwell 上，SGLang 0.5.6 把 B200 上 DeepSeek R1 FP4 的吞吐量较前一版本提升最高 1.8 倍，而 B200 和 GB200 上的 vLLM NVFP4 方案在 GLM 5、MiniMax 和 Kimi 的每美元比较中领先。在 MI355X 上，SGLang 借助 AITER 内核经常给出最强的 MoE 数字，vLLM 紧随其后且持续改进。在 AgentX 智能体工作负载上两个引擎都有竞争力，排名随版本更迭变化。',
          '持续测量给出的诚实结论是：某一时刻的引擎选择会让吞吐量相差百分之几十，但引擎版本的影响更大。把任何一个引擎钉在旧版本上，损失的性能都超过选“错”引擎。',
        ],
      },
      {
        heading: '如何在两者之间选择',
        paragraphs: [
          '需要最广的模型和特性覆盖、day-0 支持，或机柜级 wide-EP 和分离式方案时选 vLLM。流量以前缀密集、智能体或结构化为主，或它当前的方案在你的目标模型和硬件上有可测的领先时选 SGLang。更好的做法是把这个选择当作可逆的：两者都提供 OpenAI 兼容 API，切换成本只是一次配置变更，仪表板会告诉你领先何时易主。',
        ],
      },
    ],
    faq: [
      {
        question: 'SGLang 比 vLLM 快吗？',
        answer:
          '有时快，取决于模型和硬件。SGLang 近期在 AMD MI355X 的 MoE 方案上领先，0.5.6 版本让 B200 上 DeepSeek R1 FP4 跃升 1.8 倍；vLLM 则在其他场景领先，尤其是 wide-EP 机柜推理。请查看你的具体模型和 GPU 的实时对比。',
      },
      {
        question: 'vLLM 和 SGLang 的输出质量一样吗？',
        answer:
          '推理引擎执行的是同一份权重，质量差异来自精度方案和采样默认值，而不是引擎本身。InferenceX 在吞吐量之外同时运行评估分数，让损害质量的量化或内核捷径显形，而不是被默认忽略。',
      },
      {
        question: '哪个引擎更适合智能体工作负载？',
        answer:
          '两者都能服务好智能体。SGLang 的 RadixAttention 正是为智能体会话共享前缀、多轮的形态而生，而 vLLM 的 prefix caching 和调度器已经追回大部分差距。AgentX 发布跨引擎的智能体测量数据，让答案始终以实测为准。',
      },
      {
        question: '部署之后还能换引擎吗？',
        answer:
          '能，而且代价很低。两者都提供 OpenAI 兼容端点、加载相同的 checkpoint，切换主要是在自己的流量上重新验证延迟、吞吐量和输出质量。越来越多的集群同时运行两者，按模型或工作负载路由。',
      },
    ],
    keywords: [
      'vLLM vs SGLang',
      'SGLang vs vLLM 基准测试',
      'vLLM vs SGLang 性能',
      '最佳 LLM 推理引擎',
      '2026 vLLM SGLang 对比',
      'RadixAttention vs PagedAttention',
      'LLM 推理引擎基准测试',
      'vLLM vs SGLang AMD',
    ],
  },
  'vllm-vs-tensorrt-llm': {
    title: 'vLLM 与 TensorRT-LLM 对比：通用灵活性与 NVIDIA 峰值性能',
    description:
      '基于实时基准测试对比 vLLM 与 TensorRT-LLM：NVIDIA 深度调优的引擎何时在 Blackwell 上领先，vLLM 的生态广度和迭代速度何时胜出，以及 Dynamo 如何改变格局。',
    quickAnswer:
      'TensorRT-LLM 是 NVIDIA 以性能为先的引擎，在 NVIDIA 硬件上经常领跑，尤其是延迟敏感场景和基于 Dynamo 的分离式推理；vLLM 则是开放生态的默认选择，可运行在各类硬件上，新模型通常最先获得支持，并且在相同 GPU 上的吞吐量常常追平甚至超过 TensorRT-LLM。InferenceX 持续测量两者的表现；领先者随模型和版本而变化，并非固定不变。',
    sections: [
      {
        heading: '目标不同，优势也不同',
        paragraphs: [
          'TensorRT-LLM 将模型编译为仅限 NVIDIA、深度优化的可执行文件，配备手工调优的内核、FP4 与 FP8 量化工具链，并与 Dynamo 深度集成以支持 prefill 和 decode 分离。当 NVIDIA 重点优化某个模型时，其结果往往是 Blackwell 上最快的配置方案，在严格延迟目标下尤其如此：InferenceX 的超高交互性工作和 GB200 上的 DeepSeek R1 FP4 分离式推理都基于它构建。',
          'vLLM 的优化则面向整个生态：新模型通常最先在 vLLM 落地，它支持 NVIDIA、AMD 及其他后端，其调度器、PagedAttention 和 wide-EP 实现足够强，经常在 B200 和 GB200 的每美元性能对比中领先，GLM 5 NVFP4 和 Kimi K2.5 wide-EP 配置方案就是例子。',
        ],
      },
      {
        heading: '测量结果怎么说',
        paragraphs: [
          '在相同的 B200 和 B300 硬件上，领先位置轮流交替：TensorRT-LLM 的 TP2 配置方案曾在 MiniMax M3 AgentX 推理中领先，Dynamo 分离式部署定义了 GB200 机架上的高交互性前沿；而 vLLM NVFP4 曾在 GLM 5 和 MiniMax 的每美元性能上领先，并保持着旗舰 wide-EP 机架配置方案。任一时刻两个引擎之间的差距，通常小于各自下一个版本带来的提升。',
          '运维差异则持续存在：TensorRT-LLM 需要为每个模型单独构建引擎并做 NVIDIA 专属调优，vLLM 则可以在几分钟内直接从 checkpoint 部署。只有当峰值性能或延迟表现确实值得时，团队才为 TensorRT-LLM 的集成成本买单，典型场景是高流量的旗舰部署。',
        ],
      },
      {
        heading: '为你的技术栈做选择',
        paragraphs: [
          '默认选 vLLM，获得模型覆盖广度、迭代速度和跨厂商自由；只在测量数据显示 TensorRT-LLM 在你的模型和延迟目标上确实领先时才选择性采用，尤其是分离式或超低延迟的 NVIDIA 部署。两者都提供 OpenAI 兼容 API，因此用 TensorRT-LLM 服务一两个旗舰模型、用 vLLM 服务长尾模型，是常见且合理的集群模式。',
        ],
      },
    ],
    faq: [
      {
        question: '在 NVIDIA GPU 上 TensorRT-LLM 比 vLLM 快吗？',
        answer:
          '在严格延迟目标下、以及 NVIDIA 重点调优的模型上经常更快，但并非普遍如此：在多个 Blackwell 部署中，vLLM NVFP4 配置方案测得了更好的每美元性能。实时对比页面展示每个模型、GPU 和交互性下的当前领先者。',
      },
      {
        question: 'TensorRT-LLM 支持 AMD GPU 吗？',
        answer:
          '不支持，它仅限 NVIDIA。跨厂商集群会统一使用 vLLM 或 SGLang，或者把 NVIDIA 旗舰流量交给 TensorRT-LLM，AMD 容量则由开放引擎承担。跨厂商基准测试正是用来校准这种分工的。',
      },
      {
        question: 'NVIDIA Dynamo 是什么，它与两者是什么关系？',
        answer:
          'Dynamo 是 NVIDIA 的数据中心级推理服务层，负责编排 prefill 和 decode 分离、KV 感知路由和多节点调度，底层通常运行 TensorRT-LLM worker。InferenceX 的 GB200 NVL72 分离式 DeepSeek R1 结果使用的正是这套技术栈。',
      },
    ],
    keywords: [
      'vLLM 与 TensorRT-LLM 对比',
      'TensorRT-LLM 基准测试',
      'TensorRT-LLM vLLM 性能对比',
      'NVIDIA 推理引擎',
      'Dynamo TensorRT-LLM',
      'NVIDIA 最快 LLM 引擎',
      '2026 vLLM TensorRT 对比',
      'NVIDIA GPU LLM 推理引擎',
    ],
  },
  'sglang-vs-tensorrt-llm': {
    title: 'SGLang 与 TensorRT-LLM 对比：开源迭代速度与 NVIDIA 深度调优',
    description:
      '基于实时基准测试对比 SGLang 与 TensorRT-LLM：prefix caching 和跨厂商速度，对阵 NVIDIA 调优内核与分离式部署，在完全相同的配置下每日测量。',
    quickAnswer:
      'SGLang 和 TensorRT-LLM 各自擅长推理服务光谱的两端：SGLang 带来 RadixAttention prefix caching、快速的开源迭代和一流的 AMD 支持；TensorRT-LLM 带来 NVIDIA 调优内核、FP4 工具链和 Dynamo 分离式部署。在 NVIDIA Blackwell 上，两者随模型和版本互有胜负；在 AMD 硬件上 SGLang 没有对手，因为 TensorRT-LLM 仅限 NVIDIA。',
    sections: [
      {
        heading: '两个引擎的出身',
        paragraphs: [
          'SGLang 是围绕 RadixAttention 构建的开源引擎，用 radix 树缓存并复用共享的提示词前缀：多轮会话、智能体流量以及使用公共模板的批处理工作负载都能大幅受益。开发速度是它的标志性特点，例如 0.5.6 版本把 B200 DeepSeek R1 FP4 吞吐量最高提升到 1.8 倍；其 AMD 后端也屡次刷新 MI355X 纪录，包括 GLM 5 推理的每 token 成本比 B200 低约 40%。',
          'TensorRT-LLM 是 NVIDIA 的自研引擎：模型被编译成调优后的可执行文件，针对每一代 NVIDIA 架构选用最优的内核、量化方案和通信模式，并可搭配 Dynamo 做分离式多节点推理。它在 NVIDIA 芯片上的性能上限最高，代价是构建复杂度和单一厂商的适用范围。',
        ],
      },
      {
        heading: '相同硬件上的基准测试格局',
        paragraphs: [
          '在 B200 和 B300 上，InferenceX 的测量结果交替领先：TensorRT-LLM TP2 曾在 MiniMax M3 智能体推理中领先，并支撑着超高交互性配置方案；SGLang 则在吞吐量导向的目标下保持 DeepSeek R1 和 V4 的领先数据。由于两个引擎每月都在进步，持久有效的观察是方向性的：TensorRT-LLM 往往赢在 Pareto 前沿的延迟敏感一端，SGLang 赢在前缀密集和高吞吐一端。',
          '在 MI300X、MI325X 和 MI355X 上，搭配 AITER 内核的 SGLang 是主要配置方案，TensorRT-LLM 不参与竞争。因此跨厂商买家在比较 AMD 最优与 NVIDIA 最优时，往往并没有显式选择，实际比的就是 SGLang 和 TensorRT-LLM。',
        ],
      },
      {
        heading: '实际选型',
        paragraphs: [
          '智能体和多轮流量、AMD 或混合集群、以及需要快速支持新开源模型时，选 SGLang。追求严格延迟下每 GPU 峰值 token 数的 NVIDIA 专属集群，或基于 Dynamo 的分离式架构，选 TensorRT-LLM。许多运营方大面积部署 SGLang，只为流量足以支撑单模型引擎构建的两三个旗舰模型保留 TensorRT-LLM。',
        ],
      },
    ],
    faq: [
      {
        question: '在 NVIDIA 硬件上 SGLang 能与 TensorRT-LLM 竞争吗？',
        answer:
          '能，有时还领先：SGLang 曾在吞吐量导向的交互性目标下保持 B200 DeepSeek FP4 的领先结果，TensorRT-LLM 则在严格延迟一端领先。每日更新的对比页面展示每个模型、GPU 和目标下的当前赢家。',
      },
      {
        question: '为什么 prefix caching 对智能体如此重要？',
        answer:
          '智能体会话每一轮都会重发大部分持续增长的上下文。RadixAttention 式的 prefix caching 把这些重复 token 变成 cache 命中，完全跳过 prefill 计算，同时降低首 token 延迟和每次会话的成本。其收益随会话长度和轮次数增长。',
      },
      {
        question: 'AMD 部署应该用哪个引擎？',
        answer:
          'Instinct GPU 上的生产选择是 SGLang 和 vLLM，SGLang 目前在 MI355X 上保持多个旗舰 MoE 纪录。TensorRT-LLM 在 AMD 上不可用，因此 SGLang 与 TensorRT-LLM 之争只存在于 NVIDIA 容量上。',
      },
    ],
    keywords: [
      'SGLang 与 TensorRT-LLM 对比',
      'TensorRT-LLM SGLang 基准测试',
      'SGLang NVIDIA 性能',
      'SGLang AMD MI355X',
      'RadixAttention prefix caching',
      '2026 LLM 引擎对比',
      '最快推理引擎',
      'SGLang TensorRT 对比',
    ],
  },
  'how-to-choose-an-llm-serving-engine': {
    title: '2026 年如何选择 LLM 推理引擎',
    description:
      '选择 vLLM、SGLang、TensorRT-LLM 或 Atom 的决策框架：硬件覆盖、模型支持、工作负载形态、延迟目标和实测性能。',
    quickAnswer:
      '用排除法选择 LLM 推理引擎：硬件先缩小范围（TensorRT-LLM 仅限 NVIDIA，Atom 面向 AMD），模型支持在发布首周进一步收窄，最后由工作负载形态和你的交互性目标下的实测性能决定。2026 年的实际选项是：vLLM 求广度，SGLang 适合前缀密集和 AMD 优先的部署，TensorRT-LLM 追求 NVIDIA 峰值推理，Atom 用于 AMD 机架级系统。',
    sections: [
      {
        heading: '2026 年的引擎格局',
        paragraphs: [
          '四个引擎几乎覆盖所有开源模型的生产推理。vLLM 是生态默认选择：模型覆盖最广、支持多厂商后端、提供宽专家并行和分离式部署。SGLang 把 RadixAttention prefix caching 与出色的版本迭代速度和一流的 ROCm 支持结合。TensorRT-LLM 编译 NVIDIA 调优的可执行文件，是 Dynamo 分离式推理的基础。Atom 是 AMD 生态的引擎，InferenceX 在 MI355X 旗舰配置方案上测量它，包括 Kimi K3 和 GLM 5.3 的 AgentX 推理对阵 GB300 NVL72。',
          '四者都提供 OpenAI 兼容 API，这让引擎选择远不如硬件选择那样有约束力：换引擎只是改配置，不是做迁移。',
        ],
      },
      {
        heading: '一套具体的决策顺序',
        paragraphs: [
          '第一步看硬件：AMD 集群在 vLLM、SGLang 和 Atom 中选择；NVIDIA 集群多一个 TensorRT-LLM 选项；混合集群至少需要一个跨厂商引擎。第二步看模型时间点：模型发布首周，哪个引擎有经过验证的配置方案就用哪个，通常 vLLM 或 SGLang 最先支持。第三步看工作负载：前缀密集的智能体流量偏好 RadixAttention 类缓存；严格延迟的对话偏好 TensorRT-LLM 和分离式部署；批处理吞吐量则看哪个引擎在 Pareto 前沿的宽松交互性一端领先。',
          '第四步是测量：引擎排名随版本翻转，选择应当对照持续更新的基准测试复核，而不是靠记忆里的某篇博客。InferenceX 每天在完全相同的模型、硬件和序列配置上运行每个引擎，正是为了让这种复核只花几分钟。',
        ],
      },
      {
        heading: '行之有效的集群模式',
        paragraphs: [
          '成熟的运营方很少只用一个引擎。常见模式是：vLLM 作为模型长尾的默认引擎，SGLang 或 Atom 负责 AMD 容量和智能体流量，TensorRT-LLM 用于流量足以支撑单模型调优的 NVIDIA 旗舰部署。版本纪律比引擎忠诚更重要：任何引擎落后两个版本造成的吞吐量损失，通常都超过换引擎能带来的收益。',
        ],
      },
    ],
    faq: [
      {
        question: '使用最广泛的 LLM 推理引擎是哪个？',
        answer:
          '按部署数量和模型覆盖计算是 vLLM。它是大多数开源权重模型发布时的默认配置方案，并能运行在所有主流加速器上。至于它在你的具体模型、硬件和延迟目标下是否最快，是另一个可以测量的问题。',
      },
      {
        question: 'Atom 是什么，什么时候应该考虑它？',
        answer:
          'Atom 是 AMD 生态中的推理引擎，InferenceX 在 MI355X 旗舰 MoE 配置方案上对它做基准测试；在 Kimi K3 和 GLM 5.3 上，它取得了可与 NVIDIA 机架级系统竞争的智能体推理结果。追求 MoE 峰值推理的 AMD 部署可以考虑它。',
      },
      {
        question: '应该多久重新评估一次引擎选择？',
        answer:
          '至少每季度一次，旗舰模型则在每个引擎大版本发布时评估。实测历史显示单个版本就能让吞吐量变化 1.8 倍，持续数周的内核优化带来的变化更大，因此一年一次的评比会留下大量未兑现的性能。',
      },
      {
        question: '不同引擎的输出质量有差异吗？',
        answer:
          '权重完全相同，差异来自精度方案、采样默认值和内核近似。任何引擎对比都应像仪表板那样同时查看评估分数，让以精度换吞吐量的情况在上生产前就暴露出来。',
      },
    ],
    keywords: [
      'LLM 推理引擎对比',
      '推理引擎选型',
      'vLLM SGLang TensorRT-LLM 对比',
      '2026 最佳 LLM 推理框架',
      'LLM 部署技术栈',
      '推理引擎决策指南',
      'Atom AMD 推理引擎',
      '生产环境 LLM 推理',
    ],
  },
  'fp8-vs-fp4-llm-inference': {
    title: 'FP8 与 FP4 在 LLM 推理中的对比：速度、质量与硬件支持',
    description:
      'LLM 推理中的 FP8 与 FP4 量化：在 Blackwell 和 MI355X 上实测的吞吐量与每美元收益、质量取舍，以及各模型该选哪种精度。',
    quickAnswer:
      '相比 FP8，FP4 大约把张量吞吐量翻倍、权重内存流量减半；在支持 FP4 的芯片（B200、B300、GB200/GB300、MI355X）上，其实测每美元性能最高可达旧硬件 FP8 的 3.6 倍。FP8 仍是稳妥的默认选择：对多数模型而言其质量与 BF16 几乎无差别；FP4 的质量则因模型而异，需要 NVFP4 或 MXFP4 这类格式，并在上生产前完成评估。',
    sections: [
      {
        heading: '这些格式究竟改变了什么',
        paragraphs: [
          '精度决定有多少比特参与传输和乘法。FP8 用 8 位存储权重和激活，在 Hopper、Blackwell 和 CDNA 3/4 上都已成熟；对校准良好的模型，其质量通常与 BF16 在噪声范围内一致。NVFP4、MXFP4 等 FP4 格式使用 4 位元素加块缩放：内存流量是 FP8 的一半，在配备原生 FP4 单元的芯片上张量吞吐量最高翻倍，B200 到 GB300 为 9,000 到 15,000 稠密 TFLOP/s，MI355X 为 10,066。',
          'decode 受内存带宽限制，因此权重字节减半会直接提高 token 速率，这还没算上算力优势。前沿模型也越来越多地原生支持 FP4：DeepSeek V4 的 MoE 专家权重就以 FP4 原生分发。',
        ],
      },
      {
        heading: '实测收益与质量现实',
        paragraphs: [
          '当质量保持时，经济效益非常可观：B200 GLM 5 NVFP4 实测每美元性能最高达 H200 FP8 的 3.6 倍，MiniMax 和 Kimi 的 NVFP4 配置方案胜过 Hopper 的 FP8 和 INT4 等价方案，SGLang 的 FP4 版本曾在一个版本内把 DeepSeek R1 吞吐量提升 1.8 倍。这就是为什么在支持 FP4 的芯片上，每美元性能对比的前沿总是 FP4 配置方案。',
          '质量是决定性问题，且因模型而异：有些 checkpoint 在 NVFP4 下没有可测的损失，有些则在推理密集的评估上退化。InferenceX 正因如此在吞吐量旁边同时发布评估分数；其精度对比页面固定模型、硬件和引擎，只改变精度，让这笔交换清晰可见。',
        ],
      },
      {
        heading: '按部署逐一选择',
        paragraphs: [
          '硬件没有 FP4 单元、模型的 FP4 评估出现退化、或没有余力做评估周期时，用 FP8。芯片原生支持、模型分数保持、且确实存在成本或延迟压力时，转向 FP4，因为这部分收益等于免费容量。KV cache 量化是另一个独立且互补的杠杆：FP8 KV 已是常规操作，可与任一种权重精度叠加。',
        ],
      },
    ],
    faq: [
      {
        question: 'FP4 量化会损害模型质量吗？',
        answer:
          '有时会，且因模型而异。NVFP4 这类现代块缩放格式能让许多前沿模型与 FP8 的差距保持在评估噪声内，但部分模型会在推理类任务上退化。切换前请在自己的评估集上验证，或查阅已发布的分精度分数。',
      },
      {
        question: '实际中 FP4 比 FP8 快多少？',
        answer:
          '在原生支持 FP4 的芯片上，相同交互性下吞吐量最高约 2 倍；当 FP4 让新芯片替代旧的 FP8 容量时，每美元收益更大：B200 上的 GLM 5 NVFP4 实测达到 H200 FP8 每美元性能的 3.6 倍。',
      },
      {
        question: '哪些 GPU 支持 FP4 推理？',
        answer:
          'NVIDIA Blackwell 系列（B200、B300、GB200 和 GB300 NVL72、RTX PRO 6000）以及 AMD 的 MI355X 具备原生 FP4 张量核心。Hopper（H100、H200）和 CDNA 3（MI300X、MI325X）没有，因此上限是 FP8 或仅权重的 INT4 方案。',
      },
      {
        question: 'NVFP4 和 MXFP4 有什么区别？',
        answer:
          '两者都是块缩放的 4 位格式：MXFP4 是 OCP 微缩放标准，每 32 元素块使用 2 的幂次缩放；NVFP4 是 NVIDIA 的变体，在 16 元素块上使用 FP8 缩放，在相同位宽下通常能更好地保持精度。',
      },
    ],
    keywords: [
      'FP8 与 FP4 对比',
      'FP4 量化 LLM',
      'NVFP4 基准测试',
      'FP4 推理质量',
      'FP8 量化精度',
      'MXFP4 与 NVFP4 对比',
      '低精度 LLM 推理',
      'Blackwell FP4 性能',
    ],
  },
  'speculative-decoding-in-production': {
    title: '生产环境中的投机解码：什么时候真正有用',
    description:
      '投机解码何时加速 LLM 推理、何时适得其反：接受长度、与 batch size 的相互作用、MTP 和 EAGLE 变体，以及实测结果。',
    quickAnswer:
      '投机解码先用低成本起草若干 token，再由完整模型一次性验证；草稿被接受时，单用户 token 速度成倍提升。它在低并发和严格延迟目标下表现突出，通常能把交互性提升 1.5 到 3 倍；但在高 batch size 下优势会缩小甚至反转，因为验证计算要与其他用户的请求争抢算力。它是否有用是你的流量的可测属性，不是一个可以盲目打开的开关。',
    sections: [
      {
        heading: '工作原理与胜负手',
        paragraphs: [
          '草稿机制可以是一个小模型、一个额外的预测头（如多 token 预测），或 EAGLE 这类树方法，它先提出接下来的若干 token；目标模型并行验证并保留最长的被接受前缀。经济账最终归结为接受长度：平均有多少草稿 token 通过验证。在可预测的文本上，长接受让 decode 速度成倍提升；短接受则浪费起草和验证的工作。',
          '前沿模型越来越多地原生自带草稿机制：DeepSeek V4 的生产 checkpoint 附带投机模块，MTP 层已是多个 MoE 旗舰的标配，这也是引擎如今把投机解码当作配置方案的一等组件而非附加功能的原因。',
        ],
      },
      {
        heading: 'batch size 的陷阱',
        paragraphs: [
          '投机解码把空闲算力换成延迟：batch size 为 1 时，验证搭乘未被充分利用的张量核心，几乎不花额外成本。推理饱和时没有空闲算力，草稿 token 会挤占其他请求的工作，单用户速度上升的同时总吞吐量可能下降。这就是为什么 InferenceX 的投机解码对比页面在匹配配置下、跨完整并发扫描测量开与关两种状态，而不是引用单一的加速数字。',
          '实际适用范围：低到中等并发的交互式流量、续写可预测的编码和结构化输出、以及把付费用户路由到投机配置方案的延迟分层集群都能受益；饱和的批量推理通常应关闭投机解码。',
        ],
      },
      {
        heading: '部署建议',
        paragraphs: [
          '优先使用模型原生的草稿机制（MTP、EAGLE 类预测头）而非通用的小模型起草：当草稿头与目标模型一起训练时，接受长度会显著更高。在生产中持续监控接受长度，因为它会随流量领域漂移。每代模型都要重新审视这个设置：投机质量是 checkpoint 的属性，每次发布都会改变这笔账。',
        ],
      },
    ],
    faq: [
      {
        question: '投机解码能带来多大加速？',
        answer:
          '低并发下单用户 token 速度通常提升 1.5 到 3 倍，随 batch size 增大逐渐趋近于无提升。实际数字取决于你的流量的接受长度，因此在匹配并发下实测开与关的对比，比引用最大值更可靠。',
      },
      {
        question: '投机解码会改变模型输出吗？',
        answer:
          '不会。验证只接受目标模型在相同采样方案下本来就会生成的 token，因此输出在分布上完全一致。这项技术用额外算力换取更快产出相同文本，也因此可以安全地按流量层级开关。',
      },
      {
        question: 'MTP 和 EAGLE 有什么区别？',
        answer:
          '多 token 预测在目标模型上加装训练过的预测头来起草后续 token；EAGLE 类方法在隐藏状态上运行轻量自回归草稿，并生成树状候选。两者都是自起草而非使用独立模型，现代引擎对两者都有支持。',
      },
    ],
    keywords: [
      '投机解码',
      '投机解码加速',
      '多 token 预测推理',
      'EAGLE 投机解码',
      'LLM draft 模型',
      '接受长度',
      '加速 LLM decode',
      '投机解码 batch size',
    ],
  },
  'how-many-gpus-to-run-deepseek': {
    title: '运行 DeepSeek V4 需要多少块 GPU？',
    description:
      '部署 DeepSeek V4 和 R1 所需的 GPU 数量：1.6T 参数 MoE 的权重显存计算、最小可行节点，以及生产流量的实际需求。',
    quickAnswer:
      'DeepSeek V4 Pro 有 1.6 万亿参数，仅权重就约占 800 GB（FP4）或 1.6 TB（FP8）。实际最低配置是一台 8 卡大显存节点：8x MI355X（2.3 TB）或 8x B300（2.1 TB）运行 FP4 或混合精度；8x H200（1.1 TB）则需要激进量化。要为 KV cache 留出真正余量的生产推理，通常使用多节点，或采用宽专家并行的 NVL72 机架。',
    sections: [
      {
        heading: '显存算术',
        paragraphs: [
          '从存储入手：1.6T 参数在 FP8 下每个约需 1 字节，FP4 减半；DeepSeek 发布的 V4 采用 FP4 专家权重加其余部分 FP8，checkpoint 在计入运行时开销之前就接近 1 TB。除以单 GPU 显存得到最少卡数：288 GB 的 MI355X 用 4 到 8 块即可容纳，180 GB 的 B200 需要 8 块以上，80 GB 的 H100 则需要 16 块以上并跨节点，通常并不经济。',
          '权重只是下限。DeepSeek V4 的 1M token 上下文会成倍放大 KV 压力，即便其高效的混合注意力已把 KV 降到前代的约 10%；在生产并发下，智能体会话仍会在单个副本上累积数十到数百 GB 的工作集。',
        ],
      },
      {
        heading: '实际在用的部署形态',
        paragraphs: [
          'InferenceX 以三种实测形态提供 DeepSeek V4 和 R1 服务。单台大显存节点：8x MI355X 或 8x B300 运行 FP4/FP8 配置方案并为 KV 留出空间，是最小的生产可信副本。多节点专家并行：2 到 4 个 B200 或 H200 节点把专家摊得更开，代价是横向扩展网络。机架级：GB200/GB300 NVL72 配合 wide-EP 和分离式 prefill，测量显示它在高交互性和大 KV 工作集下胜出。',
          '正确的数量取决于工作负载：吞吐量导向的批量流量能高效打满单节点，而带有数十万 token 会话的智能体流量更适合机架的池化显存和 NVLink 域，AgentX 的 GB200 对 GB300 分离式部署结果印证了这一点。',
        ],
      },
      {
        heading: '按流量定容量，而不是按最低配置',
        paragraphs: [
          '副本数量应由需求计算，而不是仅仅装得下：用峰值 token 每秒除以你的交互性目标下实测的单 GPU 吞吐量，再向上取整到整数副本。只是刚好装下权重的部署只能跑小批次，每 token 成本很差。实时仪表板发布每个实测 DeepSeek 配置的单 GPU 吞吐量，把容量规划从猜测变成算术。',
        ],
      },
    ],
    faq: [
      {
        question: '单块 GPU 能运行 DeepSeek V4 吗？',
        answer:
          '不能。1.6T 参数的 checkpoint 即便在 FP4 下也约有 800 GB，是任何单块 GPU 显存的数倍。最小的合理部署是一台 8 卡大显存节点；深度蒸馏版或 V4 Flash 这类更小的 V4 变体才适合单节点。',
      },
      {
        question: '提供 DeepSeek V4 服务最便宜的方式是什么？',
        answer:
          '关注每美元性能页面，因为答案在变化：SGLang 上的 MI355X FP8/FP4 配置方案在发布后 26 天内提升了 110 倍，B200 NVFP4 和 GB200 wide-EP 配置方案则在其他交互性目标下领先。最便宜取决于你的延迟层级和利用率。',
      },
      {
        question: '运行 DeepSeek R1 需要多少块 GPU？',
        answer:
          'R1 的 671B 参数在 FP8 下约需 671 GB，FP4 减半：一台 H200、B200、MI325X 或 MI355X 级别的 8 卡节点就能从容服务，实测的 GB200 NVL72 分离式配置方案定义了它的高交互性前沿。',
      },
      {
        question: '跑 DeepSeek 需要 NVL72 机架吗？',
        answer:
          '谈不上必需，但常常受益。当宽专家并行和池化 KV 显存能充分提高单 GPU 吞吐量时，机架的溢价才划算；测量证实这发生在高交互性和长上下文智能体流量下。中等目标下，大显存单节点才是性价比之选。',
      },
    ],
    keywords: [
      '运行 DeepSeek 需要多少 GPU',
      'DeepSeek V4 硬件要求',
      'DeepSeek 671B GPU 需求',
      'DeepSeek V4 部署',
      'DeepSeek R1 所需 GPU',
      'DeepSeek 推理硬件',
      '自建 DeepSeek 服务',
      'DeepSeek GPU 显存',
    ],
  },
  'kv-cache-memory-requirements': {
    title: 'KV cache 显存需求：按真实流量规划 GPU 显存',
    description:
      '如何为 LLM 推理规划 KV cache 显存：每 token 公式，GQA、MLA 和稀疏注意力带来的变化，以及智能体流量为何成倍放大需求。',
    quickAnswer:
      '每个 token 的 KV cache 显存等于 2 乘以层数乘以 KV 头数乘以头维度乘以每元素字节数，再对每个活跃上下文中的全部 token 求和。经典稠密模型约为每 token 1 到 2 MB；采用 GQA、潜在注意力或稀疏注意力的现代架构可降低 10 到 100 倍。用每 token 成本乘以并发数和平均上下文长度，再加上余量，因为在长上下文和智能体流量下，先耗尽的是 KV 而不是权重。',
    sections: [
      {
        heading: '公式，以及什么能缩小它',
        paragraphs: [
          '每个生成或缓存的 token 在每个注意力层都存一组 key 和 value 向量：2 x 层数 x kv_heads x head_dim x 字节数。架构对这个数字影响巨大：分组查询注意力（GQA）把 KV 头数除以分组因子，多头潜在注意力（MLA）把每个 token 的 KV 压缩成一个小的潜在向量，滑动窗口和混合线性注意力限制有多少 token 需要长期保留，DeepSeek V4 的压缩稀疏注意力在 1M token 上下文下 KV 仅为前代的约 10%。',
          '精度是另一个杠杆：FP8 KV 相比 BF16 减半，质量允许时 INT4 KV 量化再减半。引擎如今把 KV 精度当作配置方案参数，它可以和每一项架构层面的节省叠加。',
        ],
      },
      {
        heading: '从每 token 成本到集群需求',
        paragraphs: [
          '推理容量等于每 token 成本乘以驻留 token 数：并发数乘以平均活跃上下文，再加上值得保留的 prefix cache。一个中等规模的聊天服务，200 个并发用户、8K 上下文，驻留不到 200 万个 token；一个智能体编码服务，200 个会话平均 200K token 并带 subagent 分支，驻留超过 4000 万个 token，而且每一轮都要重读。这两个数量级的差距，正是智能体时代容量规划要从 KV 入手的原因，也是 AgentX 显式测量 KV 工作集压力的原因。',
          '当工作集超过 HBM 时，引擎会驱逐前缀（损失 cache 命中并重新支付 prefill）、把 KV offload 到主机内存（经 PCIe 或 NVLink C2C），或者缩小批次。三者最终都体现为每 token 成本，因此 KV 不足往往藏在经济数据里，而不是错误日志里。',
        ],
      },
      {
        heading: '容量规划建议',
        paragraphs: [
          '为每个副本显式编制 KV 预算：在模型权重加引擎开销之外，交互式集群应把剩余 HBM 的至少 20% 到 40% 留给 KV，智能体流量还要更多。优先选择去掉权重后剩余显存与你的上下文特征匹配的芯片，141 到 288 GB 的产品正因此改变了长上下文的经济性。然后在生产中监控 prefix cache 命中率和驱逐情况：这两个计数器会告诉你预算是否守住了。',
        ],
      },
    ],
    faq: [
      {
        question: '128K token 上下文占用多少 KV cache？',
        answer:
          '经典稠密架构按每 token 1 到 2 MB 计要几十 GB，激进的 MLA 或稀疏注意力模型则可低至约 1 GB。架构相关的每 token 数字比任何经验法则都重要，应根据模型配置计算。',
      },
      {
        question: '长上下文推理贵，主要原因是 KV cache 吗？',
        answer:
          '很大程度上是。长上下文让驻留 KV 线性膨胀，且每个 decode 出的 token 都要重读一遍，同时消耗显存和带宽。架构压缩（GQA、MLA、稀疏注意力）和 prefix caching 是百万 token 上下文得以可服务的原因。',
      },
      {
        question: '应该量化 KV cache 吗？',
        answer:
          'FP8 KV 已是常规默认，对多数模型质量影响可忽略，相比 BF16 等于把上下文容量翻倍。INT4 KV 能再翻一倍，但值得在你的模型和任务上做评估，因为质量敏感度随架构和工作负载而异。',
      },
      {
        question: 'KV cache 满了会发生什么？',
        answer:
          '引擎会驱逐已缓存的前缀、把 KV offload 到更慢的存储层级，或缩小有效 batch size。用户感受到的是首 token 变慢和尾延迟升高；运营方看到的是每 token 成本上升。持续的驱逐是需要加显存或加副本的信号。',
      },
    ],
    keywords: [
      'KV cache 显存需求',
      'KV cache 大小计算',
      'LLM KV cache 公式',
      'GPU 显存 KV cache',
      '长上下文显存占用',
      'KV cache 量化',
      'MLA KV cache 节省',
      'LLM 上下文显存规划',
    ],
  },
  'long-context-llm-serving': {
    title: '长上下文 LLM 推理：100K 到 1M token 的硬件与引擎',
    description:
      '服务 100K 到 1M token 上下文：长上下文对 prefill、KV cache 和成本的影响，以及哪些硬件和引擎选择能保住经济性。',
    quickAnswer:
      '长上下文推理是一种不同的工作负载：prefill 超线性增长，直到稀疏注意力将其驯服；KV cache 从每会话数 MB 膨胀到数 GB；每请求成本与生成 token 数脱钩。要让 100K 到 1M token 的服务经济可行，需要组合 KV 高效的架构、prefix caching、H200、B300 或 MI355X 这类大显存芯片，以及越来越常见的分离式 prefill，让长提示词不再阻塞交互式 decode。',
    sections: [
      {
        heading: '超过 100K token 后什么会出问题',
        paragraphs: [
          '三种压力同时到来。prefill 计算：长输入上的注意力代价高昂，除非架构是稀疏的或提示词已被缓存，否则首 token 延迟会从毫秒级拉长到分钟级。KV 驻留：每个会话的 cache 随上下文增长，且每个 decode 出的 token 都要重读，同时消耗容量和带宽。调度：一个百万 token 的 prefill 可能阻塞一整批交互式 decode，分块 prefill 和分离式部署正是为解决这个问题而生。',
          '模型架构是第一位的应对手段：混合与压缩注意力设计、滑动窗口和潜在 KV，让现代旗舰的长上下文开销比前代轻 10 到 100 倍，DeepSeek V4 在 1M token 下只需前代约 27% 的 FLOPs 和 10% 的 KV。',
        ],
      },
      {
        heading: '真正重要的硬件与引擎选择',
        paragraphs: [
          '单芯片显存容量是约束性指标：去掉权重后，141 GB 的 H200、268 GB 的 B300 和 288 GB 的 MI355X 上的空闲 HBM 决定能驻留多少会话；AgentX 的 B200 对 B300 对比显示，恰恰是随着 KV 工作集增长，大显存的一方开始胜出。机架级 NVL72 把 72 块 GPU 的显存池化，并为分离式推理提供 NVLink 速度的 KV 传输，是长上下文智能体流量高交互性下的实测赢家。',
          '引擎方面：prefix caching 对多轮长上下文不可或缺，分块 prefill 让长提示词处理期间交互性保持稳定，KV offload 以延迟为代价把容量扩展到主机内存，分离式 prefill/decode 把两个阶段分到各自适合的硬件上。这四项都是基准测试显式变化的配置方案参数。',
        ],
      },
      {
        heading: '长尾的经济账',
        paragraphs: [
          '长上下文流量应按处理的 token 而非生成的 token 定价：一个 500K token 输入、只产出 500 token 回答的请求本质上是 prefill 工作负载，其成本在第一个输出 token 之前的计算和缓存决策中就已确定。缓存输入定价之所以存在，是因为前缀命中能完全跳过这部分工作；未缓存的长提示词属于生产中最昂贵的请求之列，容量规划应把它们当作独立的流量类别。',
        ],
      },
    ],
    faq: [
      {
        question: '哪些 GPU 最适合长上下文推理？',
        answer:
          '去掉权重后剩余显存高的产品：中等规模模型用 H200，前沿 MoE 用 B300 和 MI355X，当池化机架显存和分离式部署划算时用 GB300 NVL72。带宽和容量同样重要，因为驻留的 KV 在每个 decode token 时都要重读。',
      },
      {
        question: '为什么长提示词的首 token 延迟这么慢？',
        answer:
          '整个提示词必须先跑完 prefill 才能有任何输出。没有 prefix cache 命中时，一个十万 token 的提示词意味着数十亿次注意力运算，TTFT 会拉长到数秒。分块 prefill、缓存前缀和分离式 prefill 硬件是标准的缓解手段。',
      },
      {
        question: '1M token 上下文在生产中真的可用吗？',
        answer:
          '在为此设计的架构上可用：DeepSeek V4 这类模型原生支持 1M 上下文，稀疏注意力让 FLOPs 和 KV 保持可控，引擎则用分块 prefill 和 offload 提供服务。但从经济性看，仍应让典型会话远低于最大值。',
      },
    ],
    keywords: [
      '长上下文 LLM 推理',
      '1M token 上下文推理',
      '长上下文硬件要求',
      '100K 上下文 LLM',
      '长提示词延迟',
      '分离式 prefill',
      '长上下文成本',
      '百万 token 上下文 GPU',
    ],
  },
  'llm-throughput-vs-latency': {
    title: 'LLM 吞吐量与延迟：如何选定交互性目标',
    description:
      '主导 LLM 推理经济性的吞吐量与延迟取舍：交互性目标如何决定每 token 成本，以及如何按产品选定目标。',
    quickAnswer:
      '每个 LLM 部署都位于吞吐量与延迟的前沿曲线上：把更多请求合并成批，每块 GPU 每秒产出的总 token 更多，但每个用户拿到自己的 token 更慢。因此选定交互性目标（每用户每秒 token 数）本质上是定价决策：同一套硬件在 20 和 100 token 每秒两个目标之间，每 token 成本可能相差数倍。选择产品真正需要的最低交互性，然后只在该目标下比较硬件。',
    sections: [
      {
        heading: '这种取舍为何存在',
        paragraphs: [
          'decode 受内存带宽限制：每一步都要为批内每个请求重读权重和 KV。大批次把这些读取摊到许多用户身上，总吞吐量上升，但每个用户的 token 间隔被拉长。由此得到的单 GPU 吞吐量对单用户交互性曲线，就是 InferenceX 为每个模型、芯片和引擎配置发布的 Pareto 前沿；曲线上任何单个点都不能单独代表这套系统的性能。',
          '这也是单一数字的基准宣传具有误导性的原因：一块芯片引用最大批次吞吐量，另一块引用低延迟运行状态，两者是在各自曲线的不同点上被测量的。同等交互性对比，即两边提供相同的用户体验，是唯一公平的框架。',
        ],
      },
      {
        heading: '按产品选定目标',
        paragraphs: [
          '交互式聊天在每用户 20 到 50 token 每秒时阅读体验就很好，已快于多数人的阅读速度。编码智能体和推理链值得 50 到 150 以上，因为用户等待的是多轮循环，每一秒都会累积；超出这个范围的超高交互性推理则是独立的工程领域，依赖分离式部署和投机解码。批处理和离线管线完全没有交互性下限，应该买曲线的远端，那里每 token 成本最低。',
          '按层级切分流量是成熟的做法：付费交互流量走低延迟配置方案，后台摘要走饱和的批量容量，各自按前沿曲线上自己的点定价，而不是用一个混合平均值。',
        ],
      },
      {
        heading: '诚实地比较硬件',
        paragraphs: [
          '先固定交互性，再在该固定目标下比较各芯片和引擎的每 GPU token 数和每百万 token 成本。排名确实会沿曲线变化：机架级分离式系统在严格目标下出色，而大显存单节点常在宽松目标一端赢得每美元性能。仪表板的固定层级读数（30、50、75、100 token 每秒）存在的意义，就是让这些对比保持匹配。',
        ],
      },
    ],
    faq: [
      {
        question: 'LLM 基准测试中的交互性是什么？',
        answer:
          '每用户每秒收到的 token 数，即单个请求体验到的稳态生成速度。它是推理 Pareto 前沿的横轴：纵轴的单 GPU 总吞吐量随单用户目标升高而下降，每个部署实际上都隐含地选择了曲线上的一个点。',
      },
      {
        question: '更严格的延迟要多付出多少成本？',
        answer:
          '数倍是常态：从宽松的批处理状态推进到每用户 100 token 每秒，同一硬件的单 GPU 吞吐量可能下降 3 到 10 倍，每 token 成本按比例上升。这个倍数就是高端响应速度的真实价格。',
      },
      {
        question: '聊天场景多少 token 每秒算合适？',
        answer:
          '每用户约 20 到 50 token 每秒：明显高于人类阅读速度，流式输出顺滑。为更高速度付费很少能改善聊天的感知质量，而智能体和推理类产品则有充分理由购买 100 以上。',
      },
    ],
    keywords: [
      'LLM 吞吐量与延迟',
      'LLM 交互性目标',
      '每用户每秒 token 数',
      'batch size 延迟取舍',
      'LLM 推理 Pareto 前沿',
      '同等交互性对比',
      'LLM 延迟优化',
      '推理批处理取舍',
    ],
  },
  'how-to-benchmark-llm-inference': {
    title: '如何做 LLM 推理基准测试：经得起推敲的方法',
    description:
      '如何做可信的 LLM 推理基准测试：完整并发扫描、同等交互性对比、warmup 后的缓存、匹配的精度，以及持续重测。',
    quickAnswer:
      '可信的 LLM 推理基准测试会固定模型、序列形状和精度，扫描并发以描绘完整的吞吐量对交互性前沿，测量前先完成 warmup，并把配置报告到足以复现的程度。单点结果是头号大忌：所有严肃的对比都发生在匹配的交互性下。而且由于引擎每周都在进步，基准测试是一条时间序列，不是一份报告。',
    sections: [
      {
        heading: '核心方法',
        paragraphs: [
          '保持工作负载恒定：每个被测系统使用相同的模型 checkpoint、相同的输入输出序列长度、相同的精度方案，否则比较的是工作负载而不是系统。然后把并发从单请求扫描到饱和，逐步记录单用户交互性和单 GPU 吞吐量：得到的 Pareto 前沿才是基准测试结果。先做 warmup，因为编译、缓存填充和内存分配器会扭曲冷启动测量。',
          '报告一切影响数字的因素：引擎版本、并行策略、KV 精度、投机解码设置和硬件拓扑。InferenceX 为每次运行发布精确配置和日志，因为无法复现的基准测试只是轶事。',
        ],
      },
      {
        heading: '让结果作废的错误',
        paragraphs: [
          '在不同交互性下比较是最经典的错误：一个系统引用批处理饱和值，另一个引用中等负载值，得到的比值毫无意义。其他会让结果作废的因素包括：精度不匹配（FP4 对 FP8 是精度对比，不是硬件对比）、未披露的 prefix cache 命中抬高 prefill 数字、永远打不满大芯片的固定小批次，以及只测快速演进软件的某一个瞬间：MI355X 的 DeepSeek 吞吐量在 26 天内提升了 110 倍，发布日的数字描述的是历史，不是现在。',
          '智能体流量再加一层：固定序列扫描完全测不到 KV 工作集压力、前缀复用和突发的工具调用时序，这正是 AgentX 用确定性合成 token 回放真实会话结构、而非发送独立请求的原因。',
        ],
      },
      {
        heading: '把基准测试当基础设施',
        paragraphs: [
          '应对软件快速演进的持久答案是持续测量：每个引擎版本发布就重跑完整矩阵，保留历史让回归浮现，公开方法让结果经得起审视。这正是 InferenceX 的设计：每天在各模型、芯片、引擎和精度上自动执行扫描，每条结论都能追溯到有日期的运行和配置。',
        ],
      },
    ],
    faq: [
      {
        question: 'LLM 推理基准测试应该报告哪些指标？',
        answer:
          '并发扫描下的单 GPU 吞吐量、单用户交互性、首 token 延迟、按声明费率计算的每百万 token 成本，以及可测时的每 token 能耗，每项都要对应完整配置。任何不带交互性条件的单一数字都无法使用。',
      },
      {
        question: '基准测试要跑多久？',
        answer:
          '要长到跨过 warmup 并在每个并发档位达到稳态，通常每个点需要数分钟而不是数秒。冷启动伪影、编译和缓存填充经常让短时运行的结果偏差数倍。',
      },
      {
        question: '为什么公开的基准测试经常互相矛盾？',
        answer:
          '交互性取点、精度、序列形状、引擎版本和缓存条件各不相同，而且通常不披露。对同一硬件的两次诚实测量，仅凭配置差异就可能相差数倍，这就是完整披露的测试方法和匹配对比比数字本身更重要的原因。',
      },
    ],
    keywords: [
      '如何做 LLM 推理基准测试',
      'LLM 基准测试方法',
      '推理基准测试指南',
      'GPU 基准测试最佳实践',
      'LLM 性能测试',
      '并发扫描基准测试',
      '可复现 AI 基准测试',
      '推理基准测试常见错误',
    ],
  },
  'what-is-a-good-tokens-per-second': {
    title: 'LLM 推理多少 token 每秒算好？',
    description:
      '什么样的 token 每秒算好：聊天、智能体和批处理的每用户速度目标，当前硬件的每 GPU 吞吐量范围，以及如何把两者放在一起解读。',
    quickAnswer:
      '先分清两个含义：每用户 token 每秒是体验目标，20 到 50 满足聊天，50 到 150 适合编码智能体，批处理则完全不需要；每 GPU token 每秒是经济指标，从数百到数万不等，取决于模型规模、芯片和每用户目标的严格程度。好的数字，是在你的模型、你的硬件和你的交互性下测出、并对照实时前沿的数字。',
    sections: [
      {
        heading: '每用户速度：多快才算快',
        paragraphs: [
          '人类阅读速度是每秒 5 到 15 个 token，因此每用户 20 到 50 token 每秒的聊天流式输出已稳稳快于阅读。推理模型和编码智能体改变了这笔账：用户等待的是完整的推理链和多轮循环，而不是边读边等，因此 InferenceX 观察到智能体产品的服务目标通常是每用户 50 到 150 以上；数百量级的超高交互性推理则面向愿意为延迟买单的产品。',
          '首 token 延迟与稳态速度同样重要：流式输出很快但十秒后才开始的回复，依然让人觉得坏了，这就是基准测试把 TTFT 和逐 token 节奏分开报告的原因。',
        ],
      },
      {
        heading: '每 GPU 吞吐量：硬件应该交付什么',
        paragraphs: [
          '每 GPU 产出跨越数个数量级是正常的。一个万亿参数级的前沿 MoE 在严格交互性下，每 GPU 每秒可能产出数百到几千个 token；同一块芯片跑小型稠密模型、目标宽松时则能产出数万。芯片、引擎、精度和并行策略都会移动这个数字：实测配置方案曾因一次引擎发布变化 1.8 倍，因机架级宽专家并行在匹配设置下变化 3 倍。',
          '所以不存在普适的好数字，但你的确切配置永远有一个当前最优数字，这正是实时 Pareto 前沿的价值：如果你的部署在自己的交互性下明显低于实测前沿，差距就是可以追回的性能。',
        ],
      },
      {
        heading: '把两个数字结合起来用',
        paragraphs: [
          '按产品需求设定每用户目标，从实时基准测试读出候选硬件在该目标下可达的每 GPU 吞吐量，再用需求除以它得到集群规模。之后持续跟踪生产比值与前沿的差距，因为引擎发布每月都在抬高上限；从不重新调优的集群，会悄悄跌到其硬件当前所能支持吞吐量的一小部分。',
        ],
      },
    ],
    faq: [
      {
        question: '对 LLM 来说 50 token 每秒算快吗？',
        answer:
          '按每用户计，对聊天来说算快：是人类阅读速度的数倍，流式输出顺滑。对编码智能体它只是合理的下限而谈不上快；按每 GPU 计，对任何现代芯片都非常差。这说明每用户和每 GPU 两个含义绝不能混用。',
      },
      {
        question: '一块现代 GPU 每秒能产出多少 token？',
        answer:
          '每 GPU 从数百到数万不等，取决于模型规模、精度、引擎和每用户延迟目标，同一块芯片上能跨两个数量级。实时仪表板按配置发布实测值，比任何静态答案都可靠。',
      },
      {
        question: '为什么我的部署 token 每秒比基准测试低？',
        answer:
          '通常是实际延迟要求更严、并发低于饱和、引擎版本偏旧或缓存未经 warmup。把你的配置和对应的基准测试配置方案逐行对照：前沿是可复现的，差距几乎总能追溯到某个具体设置。',
      },
    ],
    keywords: [
      'LLM 多少 token 每秒算好',
      'token 每秒基准测试',
      'LLM 速度对比',
      '每用户每秒 token 数',
      'GPU token 每秒',
      'LLM 生成速度',
      'LLM 应该多快',
      'token 吞吐量目标',
    ],
  },
};

const entries = getAllGuides().map((entry) => {
  const translation = translations[entry.slug];
  if (!translation) throw new Error(`Missing Chinese guide translation: ${entry.slug}`);
  return { ...entry, ...translation };
});
const entriesBySlug: Readonly<Record<string, GuideEntry>> = Object.fromEntries(
  entries.map((entry) => [entry.slug, entry]),
);

export function getAllZhGuides(): readonly GuideEntry[] {
  return entries;
}

export function getZhGuide(slug: string): GuideEntry | undefined {
  return entriesBySlug[slug];
}

export function getRelatedZhGuides(entry: GuideEntry): readonly GuideEntry[] {
  return entry.relatedGuideSlugs.flatMap((slug) => {
    const related = entriesBySlug[slug];
    return related ? [related] : [];
  });
}

export function getAdjacentZhGuides(slug: string): {
  previous: GuideEntry | undefined;
  next: GuideEntry | undefined;
} {
  const index = entries.findIndex((entry) => entry.slug === slug);
  if (index === -1) return { previous: undefined, next: undefined };
  return {
    previous: index > 0 ? entries[index - 1] : undefined,
    next: index < entries.length - 1 ? entries[index + 1] : undefined,
  };
}

export function getZhGuidesByCategory(): readonly {
  category: GuideCategory;
  guides: readonly GuideEntry[];
}[] {
  return GUIDE_CATEGORIES.map((category) => ({
    category,
    guides: entries.filter((entry) => entry.category === category),
  })).filter((group) => group.guides.length > 0);
}

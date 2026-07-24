import {
  GLOSSARY_CATEGORIES,
  type GlossaryCategory,
  type GlossaryEntry,
  getAllGlossaryEntries,
} from './glossary';

export const GLOSSARY_CATEGORY_LABELS_ZH: Readonly<Record<GlossaryCategory, string>> = {
  'Benchmark metrics': '基准指标',
  Serving: '推理服务',
  Parallelism: '并行策略',
  Hardware: '硬件',
  'Numerical precision': '数值精度',
  'Model architecture': '模型架构',
  Software: '软件栈',
};

type GlossaryTranslation = Pick<
  GlossaryEntry,
  | 'term'
  | 'aliases'
  | 'plainEnglish'
  | 'definition'
  | 'explanation'
  | 'significance'
  | 'benchmarkContext'
  | 'measurement'
>;

const translations: Readonly<Record<string, GlossaryTranslation>> = {
  'ai-inference': {
    term: 'AI 推理',
    aliases: ['AI inference', 'LLM 推理', '模型服务'],
    plainEnglish: '把提示词、图片或音频交给已经训练好的模型，它会利用学到的知识给出答案。',
    definition:
      'AI 推理是使用已经训练好的模型处理新输入并生成输出的过程；对大语言模型而言，通常就是处理提示词并生成 token。',
    explanation:
      '训练阶段会更新模型权重，推理阶段则使用这些权重。生产系统还需要推理引擎负责调度请求、管理内存、合并批次，并在一个或多个加速器上执行内核。相同模型在不同软硬件栈上的表现可能相差数倍。',
    significance:
      '推理既是模型问题，也是系统问题。用户体验取决于延迟和交互性，运营成本则取决于吞吐量、利用率、功耗与硬件成本；只优化其中一个维度，往往会牺牲另一个维度。',
    benchmarkContext:
      'InferenceX 测试完整的推理方案，因为芯片峰值规格无法代表实际服务性能。每条曲线都对应明确的模型、引擎、精度、并行策略、GPU 系统、序列长度和并发扫描。',
  },
  'inference-engine': {
    term: '推理引擎',
    aliases: ['inference engine', '服务引擎', 'LLM 服务框架'],
    plainEnglish:
      '推理引擎就像 AI 服务背后的交通调度员：它安排请求流转，并让 GPU 在正确时间执行正确任务。',
    definition: '推理引擎是将模型权重和用户请求转化为加速器上生成结果的软件运行时。',
    explanation:
      '它负责请求调度、连续批处理、KV 缓存分配、分布式执行、内核选择与 token 采样。vLLM、SGLang 和 TensorRT-LLM 即使运行同一模型和 GPU，也会因调度器、内核与分布式策略不同而产生不同曲线。',
    significance:
      '引擎版本和配置有时与 GPU 选择同样重要。一次调度器更新、融合注意力内核或模型专用路径修复，都可能在硬件不变时带来数倍性能变化。',
    benchmarkContext:
      'InferenceX 将引擎和容器镜像记录为可复现方案的一部分，因此历史视图能够区分软件进步与芯片代际进步。',
  },
  throughput: {
    term: '吞吐量',
    aliases: ['throughput', 'token 吞吐量', '总吞吐量'],
    plainEnglish: '吞吐量就是整个系统每秒一共能完成多少工作。',
    definition: '吞吐量是推理系统在所有活跃请求上生成 token 的总速率。',
    explanation:
      'InferenceX 通常使用每 GPU 每秒 token 数进行归一化，便于比较不同规模的系统。提高批大小或并发往往能摊薄权重读取和计算成本，从而提高总吞吐量，但单个用户收到 token 的速度可能下降。',
    significance:
      '最大吞吐量不是完整的性能结论。某个点即使拥有最高 tok/s，也可能因为交互性过低而不适合实时产品；有效比较应在符合业务需求的延迟或交互性目标下进行。',
    benchmarkContext:
      'InferenceX 将吞吐量与交互性放在完整并发扫描中共同展示，并用 Pareto 前沿剔除两个轴上都更差的运行点。',
    measurement: { label: '常用单位', value: 'token/秒/GPU（tok/s/GPU）' },
  },
  interactivity: {
    term: '交互性',
    aliases: ['interactivity', '生成速度', '每用户 token 速率'],
    plainEnglish: '交互性表示模型开始回答后，单个用户看到新文字出现得有多快。',
    definition: '交互性是解码阶段单个用户接收生成 token 的速率。',
    explanation:
      '在单位换算一致时，它是每输出 token 时间的倒数。50 tok/s/user 表示首个 token 之后大约每 20 毫秒输出一个新 token；它描述流式响应速度，不包含首 token 到达前的等待。',
    significance:
      '不同产品需要不同运行点。语音和交互式编程要求较高 token 速率，离线摘要则可以牺牲交互性换取更高总吞吐量；在交互性不一致时比较硬件很容易得出误导性结论。',
    benchmarkContext:
      'InferenceX 将 tok/s/user 与吞吐量或成本一起绘制，并在等交互性表格中沿各自 Pareto 前沿插值，以固定用户体验。',
    measurement: { label: '常用单位', value: 'token/秒/用户（tok/s/user）' },
  },
  latency: {
    term: '延迟',
    aliases: ['latency', '响应延迟', '推理延迟'],
    plainEnglish: '延迟就是需要等待多久；流式回答既有开始前的等待，也有后续文字之间的停顿。',
    definition:
      '延迟是请求经历的时间；在流式 LLM 服务中，应区分首 token 等待时间与后续 token 间隔。',
    explanation:
      '首 token 时间包含排队和预填充，单 token 输出时间反映解码节奏。端到端延迟还受输出长度影响，因此一个汇总数字可能掩盖用户真正感知到的环节。',
    significance:
      '降低延迟通常需要更小批次或更多并行资源，这可能降低硬件利用率并提高成本。好的服务设计会先确定延迟服务等级，再在该约束内最大化吞吐量。',
    benchmarkContext:
      'InferenceX 强调解码交互性，并公开工作负载形状与并发量，避免把高吞吐批处理点误读为低延迟服务点。',
  },
  'time-to-first-token': {
    term: '首 token 时间',
    aliases: ['time to first token', '首字延迟'],
    plainEnglish: 'TTFT 就是发送提示词后，到看到答案第一个片段前的“思考中……”时间。',
    definition: '首 token 时间（TTFT）是从提交请求到收到第一个生成 token 的时间。',
    explanation:
      'TTFT 包含排队、提示词处理，以及解码开始前的路由或 KV 缓存传输。更长提示词通常增加预填充工作，系统过载也会在模型计算不变时增加排队时间。',
    significance:
      '用户会把 TTFT 感知为系统开始回答的速度。即使后续 token 流很快，只要排队或预填充等待过长，整体体验仍会显得迟缓。',
    benchmarkContext:
      '应将 TTFT 与输入序列长度、并发量以及是否采用预填充/解码分离一起阅读，这些因素解释了为何解码速度相近的方案仍可能有不同启动时间。',
    measurement: { label: '常用单位', value: '毫秒或秒' },
  },
  'time-per-output-token': {
    term: '每输出 token 时间',
    aliases: ['time per output token', 'token 间延迟', 'ITL'],
    plainEnglish: 'TPOT 是流式回答每个新片段之间的间隔；间隔越短，回答看起来越快越顺畅。',
    definition: '每输出 token 时间（TPOT）是首 token 到达后，相邻生成 token 之间的平均时间。',
    explanation:
      'TPOT 描述流式响应的解码节奏。在忽略单位换算时，它是每用户 token 速率的倒数；20 毫秒/token 约等于 50 tok/s/user。',
    significance:
      'TPOT 单独刻画回答流是否顺畅。随着更多请求共享系统，TPOT 通常会变差，即便总吞吐量仍在上升。',
    benchmarkContext:
      'InferenceX 多使用其倒数 tok/s/user，便于让更高数值代表更好性能；在比较相同并发下的调度器或内核变化时，方案表也会直接列出 TPOT。',
    measurement: { label: '换算关系', value: '交互性 ≈ 1000 / TPOT（毫秒）' },
  },
  concurrency: {
    term: '并发量',
    aliases: ['concurrency', '并发请求数'],
    plainEnglish: '并发量就是系统同一时间正在服务多少个人或请求。',
    definition: '并发量是基准测试或部署中同时被服务的请求数量。',
    explanation:
      '提高并发能为调度器提供更多可批处理工作，通常提升加速器利用率和总吞吐量；代价是每个请求分到的计算与内存带宽减少，因此交互性往往下降。',
    significance:
      '单个并发值只代表一个运行点。生产流量持续变化，在低并发领先的方案，可能在大批次或通信占主导时被其他方案超越。',
    benchmarkContext:
      'InferenceX 扫描多个并发值以构建吞吐量与交互性曲线，曲线标签会标出每个点的请求数，并显示方案何时饱和或性能坍塌。',
  },
  batching: {
    term: '批处理',
    aliases: ['batching', '连续批处理', '动态批处理'],
    plainEnglish:
      '批处理就像让多名乘客坐同一辆巴士：GPU 一次处理多个请求，让每趟计算完成更多有效工作。',
    definition: '批处理将多个请求的工作组合起来，使加速器能够一起处理它们的 token。',
    explanation:
      '大型矩阵运算比大量微小运算更能发挥 GPU 效率。现代推理引擎采用连续批处理，请求到达和结束时动态加入或退出，无需等待固定批次全部完成。',
    significance:
      '批处理是吞吐量与延迟核心权衡的来源。更大的有效批次能摊薄权重读取和内核启动开销，但通常会增加每位用户的 token 间隔。',
    benchmarkContext:
      '并发量是批处理的输入，并不等同于某个固定内核批大小；并行策略、序列长度、请求完成时机和调度策略都会改变 GPU 实际看到的批形状。',
  },
  'pareto-frontier': {
    term: 'Pareto 前沿',
    aliases: ['Pareto frontier', '性能前沿', 'Pareto 最优曲线'],
    plainEnglish:
      'Pareto 前沿是一条“最佳权衡线”：线上的每个点都值得考虑，因为改善一项指标就必须牺牲另一项。',
    definition: 'Pareto 前沿由不存在另一个测量点能在两个比较维度上都更好的运行点组成。',
    explanation:
      '在吞吐量与交互性图中，如果另一个点既能处理更多总 token，又能让每个用户更快收到 token，那么原点就被支配；删除所有被支配点后得到有效边界。',
    significance:
      '前沿能避免噪声点或调优较差的点扭曲比较，并展示真正的权衡。沿曲线仍不存在普适赢家，最佳点取决于用户最低交互性或最高成本目标。',
    benchmarkContext:
      'InferenceX 连接并发与配置扫描中的 Pareto 最优点，等交互性比较也沿这些前沿插值，避免用随意选择的原始点直接比较。',
  },
  'iso-interactivity': {
    term: '等交互性',
    aliases: ['iso-interactivity', '匹配交互性', '相同 token 速率'],
    plainEnglish: '等交互性就是让不同系统以相同速度向用户显示文字，再比较背后的硬件效率。',
    definition: '等交互性是指在相同的每用户生成速度下比较不同系统。',
    explanation:
      '不同方案的并发点很少正好落在相同 tok/s/user。等交互性比较会在各自 Pareto 前沿上对共同目标插值，再比较该点的吞吐量、成本或效率。',
    significance:
      '固定用户体验可以避免常见基准错误：某系统只有在让每个请求更慢时才达到更高吞吐量，却被错误地称为更快。',
    benchmarkContext:
      'InferenceX 文章使用等交互性表格比较硬件、精度和软件；超出实测前沿的值会标记为不可达，而不会向观测区间之外外推。',
  },
  'input-output-sequence-length': {
    term: '输入与输出序列长度',
    aliases: ['input/output sequence length', '提示词长度', '生成长度', '8K/1K'],
    plainEnglish:
      '输入长度是模型要读多少内容，输出长度是模型要写多少内容；8K/1K 表示长提示词配较短回答。',
    definition:
      '输入序列长度（ISL）是提示词 token 数，输出序列长度（OSL）是响应中生成的 token 数。',
    explanation:
      '两者共同定义工作负载形状。8K/1K 表示约 8,192 个输入 token 和 1,024 个输出 token；长输入增加预填充与 KV 缓存压力，长输出则在自回归解码循环中停留更久。',
    significance:
      '不同序列长度的结果不能直接互换。短聊天提示词上的最佳配置，在长上下文摘要或推理中可能排名不同，因为计算、容量与带宽压力都会变化。',
    benchmarkContext:
      'InferenceX 在图表标签与方案描述中列出 ISL/OSL。只有先匹配工作负载形状，才能把差异归因于硬件或软件。',
  },
  'cost-per-million-tokens': {
    term: '每百万 token 成本',
    aliases: ['cost per million tokens', '$/M tokens', 'token 成本'],
    plainEnglish: '它估算 AI 读取和生成一百万个 token 需要支付多少基础设施成本。',
    definition: '每百万 token 成本估算系统在某个实测运行点生成一百万 token 所需的基础设施成本。',
    explanation:
      'InferenceX 根据每小时总体拥有成本和实测 token 吞吐量计算该指标。它可能按总 token 报告，也可能区分输入和输出 token，因此比较前必须确认分母。',
    significance:
      '该指标把系统性能转化为服务经济性，但仍受工作负载、交互性、利用率、缓存命中和成本假设影响；离线低交互点不能直接与实时端点比较。',
    benchmarkContext:
      '成本曲线使用与吞吐曲线相同的并发扫描。在等交互性下，更低的 $/M 表示以更少建模成本提供相同流式体验。',
    measurement: {
      label: 'InferenceX 计算式',
      value: '$/M = TCO（$/GPU 小时）× 1,000,000 /（3600 × tok/s/GPU）',
    },
  },
  'performance-per-dollar': {
    term: '每美元性能',
    aliases: ['performance per dollar', 'perf/$', '成本效率'],
    plainEnglish: '每美元性能表示每投入一美元运行系统，能够获得多少有效 AI 输出。',
    definition: '每美元性能表示系统每单位建模成本能够交付多少实测推理工作。',
    explanation:
      '在固定工作负载和交互性目标下，它是每 token 成本的倒数。2 倍 perf/$ 意味着在相同基础设施支出下，可生成约两倍可比 token。',
    significance:
      '芯片峰值 FLOPS 不能单独决定服务经济性；内存、网络、软件成熟度、数值精度和实际利用率都会影响最终比值。',
    benchmarkContext:
      'InferenceX 在匹配交互性时比较 perf/$，并明确使用的 TCO 输入。该比值不能跨模型、序列长度、精度或延迟区间直接套用。',
  },
  'total-cost-of-ownership': {
    term: '总体拥有成本',
    aliases: ['total cost of ownership', '全生命周期成本'],
    plainEnglish: 'TCO 包含硬件采购，以及后续供电、制冷、网络和运维成本。',
    definition: '总体拥有成本（TCO）是基础设施在使用寿命内采购、部署和运营的综合成本估算。',
    explanation:
      'GPU 采购价只是其中一项。TCO 模型还可包含主机、网络、供电、制冷、机房、融资、折旧、维护和预期利用率，并归一化为每 GPU 小时成本。',
    significance:
      'TCO 比标价更适合跨系统经济性比较，尤其是网络与电力基础设施不同的机架级产品；但它仍是模型，必须连同假设一起阅读。',
    benchmarkContext:
      'InferenceX 将 SemiAnalysis AI Cloud TCO 输入与实测 tok/s/GPU 结合，从而区分每小时系统成本和决定该小时 token 产出的软硬件行为。',
  },
  'tokens-per-megawatt': {
    term: '每兆瓦 token 吞吐量',
    aliases: ['tokens per megawatt', 'tokens/MW', '功率归一化吞吐量'],
    plainEnglish: '该指标衡量数据中心在固定电力额度下能产出多少 AI token。',
    definition: '每兆瓦 token 吞吐量衡量推理产出相对于数据中心电力预算的效率。',
    explanation:
      'InferenceX 使用全口径公用事业供电，而不只使用芯片 TDP。这个分母可包含为 IT 负载供电和制冷的开销，更适合设施级容量规划。',
    significance:
      '电力供应往往是新增 AI 部署的硬约束。每兆瓦生成更多 token 的系统，即使单个加速器功耗更高，也能在相同电力配额下服务更多需求。',
    benchmarkContext:
      '比较 tokens/MW 时必须匹配模型、工作负载、精度与交互性，否则高吞吐低交互点可能看似高效，却无法满足目标用户体验。',
    measurement: { label: '常用单位', value: '每单位配置市电兆瓦的 token/秒' },
  },
  prefill: {
    term: '预填充',
    aliases: ['prefill', '提示词处理', '上下文编码'],
    plainEnglish: '预填充就是模型先阅读并理解提示词，然后才开始写答案。',
    definition: '预填充是推理的第一阶段：模型处理输入提示词并填充 KV 缓存，然后才开始生成。',
    explanation:
      '提示词 token 可以并行处理，形成大型矩阵运算，因此通常偏计算密集。预填充成本随输入长度增长，并显著影响首 token 时间。',
    significance:
      '预填充与解码的资源特征不同。两者共享工作节点时，大型提示词任务会打断解码批次，使流式延迟更不稳定。',
    benchmarkContext:
      '分离式方案将预填充放在独立 GPU 池。阅读结果时应检查预填充 TP、GPU 数、输入长度，以及 KV 状态是否需要跨网络传输到解码池。',
  },
  decode: {
    term: '解码',
    aliases: ['decode', '自回归生成', 'token 生成'],
    plainEnglish: '解码就是模型读完提示词后，一个 token 接一个 token 地写出答案。',
    definition: '解码是自回归生成输出 token 的阶段，通常每个模型步为每条序列接受一个 token。',
    explanation:
      '每个新 token 都依赖此前 token，因此时间维度无法完全并行。模型会反复读取权重与该序列的 KV 缓存，使解码对内存带宽、批处理和通信尤其敏感。',
    significance:
      '解码决定流式交互性，也常主导长输出成本。推测解码、MTP、量化和宽专家并行都试图减少每个有效 token 的工作量或耗时。',
    benchmarkContext:
      'InferenceX 用 tok/s/user 与总 tok/s/GPU 展示不同并发下的解码性能。公平比较必须匹配输出长度、批形状、精度和并行策略。',
  },
  'kv-cache': {
    term: 'KV 缓存',
    aliases: ['KV cache', '键值缓存', '注意力缓存'],
    plainEnglish: 'KV 缓存是模型对当前对话的工作记忆，让它生成新 token 时不必每次从头重读。',
    definition:
      'KV 缓存保存已经处理过的 token 的注意力 key/value 状态，避免每个解码步重新计算它们。',
    explanation:
      '缓存大小随序列长度、批大小、层数以及注意力头数量和宽度增长；解码时会从加速器内存反复读取，因此容量与带宽都很重要。',
    significance:
      'KV 缓存压力限制并发与长上下文服务。缓存量化、分页分配、潜在注意力、前缀复用和分离式传输系统都在降低其容量或移动成本。',
    benchmarkContext:
      '除非方案另有说明，InferenceX 在随机数据比较中禁用前缀缓存，避免无关请求因偶然命中而获得不真实优势。',
  },
  'prefix-caching': {
    term: '前缀缓存',
    aliases: ['prefix caching', '提示词缓存', '自动前缀缓存'],
    plainEnglish:
      '前缀缓存会记住重复开头的处理结果，例如相同系统提示词，让模型下次可以跳过这部分工作。',
    definition: '当前多个请求以相同 token 序列开头时，前缀缓存会复用已有 KV 缓存状态。',
    explanation:
      '重复系统提示词、共享文档或共同对话前缀在缓存仍可用时无需再次预填充。命中缓存可显著减少提示词计算与首 token 时间。',
    significance:
      '具有重复前缀的生产工作负载可能明显快于随机 token 基准；收益取决于命中率、缓存容量、淘汰策略与请求能否路由到持有所需状态的节点。',
    benchmarkContext:
      'InferenceX 通常在随机数据集上禁用前缀缓存，避免把缓存策略混入完整提示词处理的测量。除非明确说明，应把结果视为无命中基线。',
  },
  'disaggregated-inference': {
    term: '分离式推理',
    aliases: ['disaggregated inference', 'PD 分离', '分离式预填充', 'disagg'],
    plainEnglish: '分离式推理把“读提示词”和“写答案”交给两组 GPU，让每组都能针对自己的任务优化。',
    definition: '分离式推理在不同工作池上运行预填充与解码，并在两者之间传输请求状态。',
    explanation:
      '预填充通常偏计算密集，解码则常受内存带宽和通信限制。分离后，两侧可以采用不同 GPU 数、并行度、批策略和扩缩容方式。',
    significance:
      '分离可隔离提示词峰值并提升吞吐量或 SLA 稳定性，但也增加路由与 KV 传输开销；网络薄弱或内核不成熟时，它可能反而慢于聚合式服务。',
    benchmarkContext:
      'InferenceX 中的 disagg 不是万能开关。应查看预填充/解码 world size、TP/EP 布局、框架、网络域，以及分离前沿真正领先的交互性区间。',
  },
  'speculative-decoding': {
    term: '推测解码',
    aliases: ['speculative decoding', '草稿与验证解码'],
    plainEnglish:
      '推测解码让一个便宜的助手先起草多个 token，再由完整模型一次性审核，省去部分逐个生成步骤。',
    definition:
      '推测解码先以低成本提出多个未来 token，再由目标模型批量验证，从而减少昂贵的串行解码步数。',
    explanation:
      '草稿模型或内置预测头生成候选，目标模型在一次批量验证中评估这些候选并接受有效前缀；严格实现时不会改变目标分布。',
    significance:
      '加速取决于草稿 token 的接受数量，以及草稿与验证成本。稠密模型和 MoE 的表现可能不同，因为验证多个位置可能激活更多专家权重。',
    benchmarkContext:
      '应在真实接受率下比较推测方案并验证模型质量。InferenceX 分开展示开启和关闭 MTP 的曲线，因为收益会随并发与交互性变化。',
  },
  'multi-token-prediction': {
    term: '多 token 预测',
    aliases: ['multi-token prediction', '多 token 预测头'],
    plainEnglish: 'MTP 让模型一次猜测多个后续 token 并一起验证，从而减少缓慢的逐 token 步骤。',
    definition:
      '多 token 预测（MTP）使用与主模型共同训练的辅助预测头，提出多个未来 token 供推测验证。',
    explanation:
      'MTP 不需要独立草稿模型，候选来自目标模型自身表示，因此分布更一致、部署也更简单；但它要求检查点包含兼容 MTP 模块，且推理引擎支持验证路径。',
    significance:
      'MTP 可用额外计算换取更少的内存受限解码步。草稿接受率高且验证能利用空闲计算时收益最大；大批次下额外工作可能减少优势。',
    benchmarkContext:
      'InferenceX 将 MTP 作为方案维度。把基准收益迁移到生产时，必须考虑接受率/长度、工作负载分布、数值质量检查与匹配交互性。',
  },
  eagle: {
    term: 'EAGLE',
    aliases: ['EAGLE 推测解码', 'EAGLE-3'],
    plainEnglish: 'EAGLE 是一种为主模型起草多个可能后续 token 的方法，可让答案流式输出得更快。',
    definition:
      'EAGLE 是一组推测解码方法：利用与目标语言模型相关的特征预测草稿序列，再由目标模型验证。',
    explanation:
      '推理框架通常通过推测步数、草稿 token 数和候选宽度等参数暴露 EAGLE。模型检查点、草稿组件与引擎实现必须匹配。',
    significance:
      'EAGLE 能提高每个目标模型步接受的 token 数，但结果依赖工作负载；接受行为、草稿开销、模型架构和批大小共同决定端到端收益。',
    benchmarkContext:
      '部分 InferenceX 曲线标注 MTP，是因为模型提供多 token 预测头，而引擎使用 EAGLE 风格管线。应查看方案参数与检查点细节，不能假设所有 MTP 曲线实现相同。',
  },
  'tensor-parallelism': {
    term: '张量并行',
    aliases: ['tensor parallelism', 'TP'],
    plainEnglish: '张量并行把一次大型计算拆给多张 GPU，让它们共同完成。',
    definition: '张量并行（TP）把单个张量运算和模型权重矩阵切分到多个加速器上。',
    explanation:
      '每一层由多个 rank 协同执行，部分结果需要通过集体通信合并，常见方式是在并行矩阵乘之后执行 all-reduce。',
    significance:
      'TP 能让模型跨设备容纳，并在小批次下汇聚算力与内存带宽以提高交互性；但通信发生频繁，扩展最终受互连带宽和延迟限制。',
    benchmarkContext:
      'InferenceX 方案中的 TP=4 或 TP=8 表示张量并行组的 rank 数。应与 EP、DP、节点数和网络域一起比较。',
  },
  'expert-parallelism': {
    term: '专家并行',
    aliases: ['expert parallelism', 'EP'],
    plainEnglish: '专家并行把模型中的不同“专家”分配给不同 GPU，再把每个 token 送到需要的专家。',
    definition:
      '专家并行（EP）把 MoE 模型的专家分布到不同加速器，并将 token 路由到持有所选专家的 rank。',
    explanation:
      'MoE 层对每个 token 只激活部分专家。EP 利用这种稀疏性，避免每张 GPU 存储和计算全部专家，但每个 MoE 层前后都要执行 dispatch 与 combine all-to-all。',
    significance:
      '更宽 EP 能减少每 GPU 专家权重占用，并改善解码批处理与容量；收益取决于路由均衡和互连能否足够快地移动 token。',
    benchmarkContext:
      'InferenceX 将 EP 宽度列为分布式方案的一部分。NVL72 可让远宽于传统八卡节点的专家组保持在 NVLink scale-up 域内。',
  },
  'data-parallelism': {
    term: '数据并行',
    aliases: ['data parallelism', 'DP'],
    plainEnglish: '数据并行复制多份相同模型并分摊请求，就像多开几条相同的收银通道。',
    definition:
      '数据并行（DP）在多个 rank 上运行复制的模型或层组，并把请求或 token 分配给这些副本。',
    explanation:
      '传统 DP 复制完整模型；LLM 服务也会使用 DP attention 等混合形式，让注意力复制而专家权重采用另一种分片。每个副本处理独立工作，逐层同步少于 TP。',
    significance:
      '权重能放入内存时，DP 可直接扩展总容量，但复制会消耗内存并重复权重读取；负载均衡与缓存局部性决定副本利用是否均匀。',
    benchmarkContext:
      'InferenceX 中的 DP 数必须结合 TP 和 EP 解读，因为现代 MoE 部署通常同时组合三种维度。',
  },
  'wide-expert-parallelism': {
    term: '宽专家并行',
    aliases: ['wide expert parallelism', 'Wide EP'],
    plainEnglish: '宽专家并行把模型专家铺到大量 GPU 上，让每张 GPU 需要保存和移动的专家数据更少。',
    definition: '宽专家并行使用大量加速器 rank 构成 MoE 模型的专家并行组。',
    explanation:
      '把数百个专家分散到更多 rank，可减少每张 GPU 需要存储和流式读取的专家权重；更大的同伴组也可形成更高效的专家批次，但 dispatch/combine 流量会扩展。',
    significance:
      'Wide EP 在高带宽 scale-up 网络中最有效。若流量跨越较慢的 scale-out 网络，同样的 all-to-all 可能成为瓶颈并抵消内存侧收益。',
    benchmarkContext:
      'InferenceX 在机架级分离式方案中使用 Wide EP。比较时必须同时查看 EP 宽度、解码池大小与网络，而不能只看图例中的 GPU 型号。',
  },
  'all-reduce': {
    term: 'All-reduce',
    aliases: ['全归约'],
    plainEnglish: 'All-reduce 让每张 GPU 完成一部分计算，再合并结果并把完整答案发回所有 GPU。',
    definition:
      'All-reduce 是一种集体通信操作：合并所有参与 rank 的值，并把归约结果返回给每个 rank。',
    explanation:
      '张量并行层使用 all-reduce 组合部分矩阵运算结果。集体操作可通过针对环、树或特定网络优化的算法完成求和等归约。',
    significance:
      'TP 可能在许多层、每个生成 token 上执行通信，因此 all-reduce 延迟和带宽会形成硬扩展上限；小解码批次对固定通信延迟尤其敏感。',
    benchmarkContext:
      '更高 TP 宽度增加计算与内存带宽，也扩大通信组。实测结果必须证明互连没有让更大的组得不偿失。',
  },
  'all-to-all': {
    term: 'All-to-all',
    aliases: ['全交换'],
    plainEnglish: 'All-to-all 是一次有组织的交换：每张 GPU 都向其他每张 GPU 发送不同的数据包。',
    definition: 'All-to-all 是每个参与 rank 向所有其他 rank 发送不同数据的集体通信模式。',
    explanation:
      '专家并行 MoE 层先用 all-to-all dispatch 把 token 发往所选专家，再用 combine 把专家输出送回；流量与不均衡程度取决于 token 路由。',
    significance:
      'All-to-all 比简单点对点传输更苛刻，EP 扩大后容易受网络限制。专用内核会重叠通信与计算并优化 token 打包。',
    benchmarkContext:
      '机架级 NVLink 可让 Wide EP 的 all-to-all 留在 scale-up 域内；跨节点 InfiniBand 或 RoCE 方案需要面对远低得多的每 GPU scale-out 带宽。',
  },
  'scale-up-vs-scale-out': {
    term: 'Scale-up 与 scale-out 网络',
    aliases: ['纵向扩展域', '横向扩展网络'],
    plainEnglish: 'Scale-up 是同一套 GPU 系统内部的超高速网络，scale-out 则连接不同服务器或机架。',
    definition:
      'Scale-up 网络连接同一紧耦合系统内的加速器，scale-out 网络则把多个系统或机架连接成更大集群。',
    explanation:
      'NVLink 等 scale-up 网络为细粒度集体通信提供极高每 GPU 带宽和低延迟；InfiniBand 或 RoCE 等 scale-out 网络覆盖更多机器，但每加速器带宽通常更低。',
    significance:
      '分布式推理会跨越两个域。高频 TP/EP 集体通信尤其适合留在 scale-up 内，较粗粒度请求路由和部分预填充/解码传输则更能容忍 scale-out。',
    benchmarkContext:
      'GPU 名称本身不能描述通信域。八卡节点中的 B200 与 GB200 NVL72 使用相关芯片，却拥有完全不同的 scale-up 组规模。',
  },
  'high-bandwidth-memory': {
    term: '高带宽内存',
    aliases: ['high-bandwidth memory', 'HBM'],
    plainEnglish: 'HBM 是紧挨 GPU 的一小池超高速内存，推理时模型权重和工作数据都要放在这里。',
    definition: '高带宽内存（HBM）是靠近加速器堆叠的内存，其带宽远高于传统服务器内存。',
    explanation:
      'HBM 存储模型权重、激活、工作区与 KV 缓存。容量决定哪些模型、批大小和并行布局能放入；带宽决定内存受限内核能多快读取这些状态。',
    significance:
      'LLM 解码中，每个 token 往往读取的数据远多于计算量，因此 HBM 带宽是主要性能上限；额外容量即使在峰值算力相近时也能支持更高效的方案。',
    benchmarkContext:
      'InferenceX 硬件比较会区分 HBM 容量与带宽。例如 GB300 的更大容量可容纳 GB200 无法放入的更宽预填充/解码布局。',
  },
  'memory-bandwidth': {
    term: '内存带宽',
    aliases: ['memory bandwidth', 'HBM 带宽'],
    plainEnglish: '内存带宽就像向 GPU 计算单元供给数据的管道宽度；管道越宽，计算单元越不容易空等。',
    definition: '内存带宽是数据在加速器内存与计算单元之间传输的速率。',
    explanation:
      '当移动所需字节比执行算术更耗时，内核就是内存带宽受限。LLM 解码经常处于该状态，因为每一步都要为较少的新 token 计算流式读取模型/专家权重和 KV 缓存。',
    significance:
      '已经在等待内存的内核不会因更多 tensor-core FLOPS 自动加速。量化、批处理、缓存压缩和专家分片可通过减少字节或摊薄权重读取改善性能。',
    benchmarkContext:
      '可谨慎结合并发曲线判断性能区间：小批次可能受启动或带宽限制，大批次则提高算术强度并接近计算饱和。',
  },
  nvlink: {
    term: 'NVLink',
    aliases: ['NVIDIA NVLink', 'GPU 高速互连'],
    plainEnglish: 'NVLink 是 NVIDIA GPU 之间的高速公路，让多张 GPU 的协作远快于普通服务器网络。',
    definition: 'NVLink 是 NVIDIA 用于 scale-up 域内 GPU 直接数据传输的高带宽加速器互连。',
    explanation:
      'NVSwitch 系统连接多个 NVLink 端点，使集体通信可覆盖八卡服务器，或在 NVL72 产品中覆盖 72 GPU 机架级域；该带宽不同于连接独立系统的 InfiniBand/Ethernet。',
    significance:
      '大型 TP，尤其是 Wide EP，会在每个生成 token 上交换数据。把通信留在 NVLink 上，可让机架级方案显著快于通过 scale-out 连接的相似 GPU 数量。',
    benchmarkContext:
      'InferenceX 同时比较节点级 GPU 与 NVL72。归因于单 GPU 算力前，应先理解系统拓扑与并行组宽度。',
  },
  quantization: {
    term: '量化',
    aliases: ['quantization', '低精度推理', '权重量化'],
    plainEnglish:
      '量化用更少 bit 保存模型数字，让模型更小、更容易搬运，通常会带来经过控制的精度损失。',
    definition: '量化使用比高精度基线更少的 bit 表示模型权重、激活或缓存值。',
    explanation:
      '更低精度减少内存占用与传输字节，并可使用更快的低精度 tensor-core 路径。完整方案必须说明量化对象、格式、缩放方式、内核支持和为稳定性保留的高精度运算。',
    significance:
      '标称格式不保证加速或质量不变；转换质量、校准、异常值、内核成熟度与硬件支持共同决定实际结果。',
    benchmarkContext:
      'InferenceX 把精度作为一级方案维度，并为代表性配置配套准确性检查。只有模型、工作负载、引擎和质量标准兼容时，FP8、FP4、NVFP4、MXFP4 与 INT4 才能公平比较。',
  },
  fp8: {
    term: 'FP8',
    aliases: ['8 位浮点'],
    plainEnglish: 'FP8 用紧凑的 8 位格式保存和计算模型数字，可减少内存占用并经常加快推理。',
    definition: 'FP8 是一组八位浮点格式，用于相对 FP16/BF16 降低模型存储、内存流量和计算成本。',
    explanation:
      '常见 FP8 编码在指数范围与尾数精度之间取舍。服务方案可能将 FP8 用于权重、激活、KV 缓存或部分内核，并配合缩放元数据和更高精度累加。',
    significance:
      'FP8 在新一代 NVIDIA 与 AMD 加速器上支持广泛，常作为稳定低精度基线；真实性能取决于端到端内核覆盖，回退操作会抹平理论收益。',
    benchmarkContext:
      'InferenceX 的 FP8 标签覆盖完整方案，检查点文件名只是其中一项。引擎、注意力后端、KV 缓存格式、GPU 代际和 MTP 设置都可能改变曲线。',
  },
  fp4: {
    term: 'FP4',
    aliases: ['4 位浮点'],
    plainEnglish: 'FP4 只用 4 bit 表示模型数字，能让推理更小更快，但可保留的数值细节也更少。',
    definition: 'FP4 指用于超低精度模型表示与矩阵运算加速的四位浮点格式。',
    explanation:
      '四位格式相对 FP8 再把权重存储与流量减半左右，但极小数值空间需要精心选择缩放和硬件专用内核；“FP4”可能指不同具体格式，而非统一编码。',
    significance:
      '对内存受限 LLM 推理，减少权重字节可带来巨大吞吐与容量收益；同时必须检查模型质量与不支持操作，避免精度损失或回退开销。',
    benchmarkContext:
      'InferenceX 尽可能标明 NVFP4、MXFP4 等具体格式，并验证代表性方案。不能把所有 FP4 曲线视为数值和运行方式完全相同。',
  },
  nvfp4: {
    term: 'NVFP4',
    aliases: ['NVIDIA FP4'],
    plainEnglish:
      'NVFP4 是针对 NVIDIA Blackwell 优化的 4 位模型数学格式，目标是少搬数据并利用最快的低精度硬件。',
    definition: 'NVFP4 是 NVIDIA 为 Blackwell tensor core 推理设计的块缩放四位浮点量化格式。',
    explanation:
      '权重和激活使用紧凑 FP4 值，并为小块附加缩放信息。具体检查点、缩放方案和内核路径共同决定模型质量与吞吐量。',
    significance:
      'NVFP4 可减少权重带宽并启用 Blackwell FP4 计算路径，对大型 MoE 解码尤其有价值；只有引擎端到端支持模型注意力、路由和专家内核时才能兑现收益。',
    benchmarkContext:
      'InferenceX 文章在匹配交互性时比较 NVFP4 与 FP8/INT4，并明确模型、工作负载和成本假设，因为单一精度标签并不是公平基准。',
  },
  mxfp4: {
    term: 'MXFP4',
    aliases: ['微缩放 FP4', 'OCP MX FP4'],
    plainEnglish: 'MXFP4 让每小组 4 位数字拥有自己的缩放值，使极紧凑的数字仍保留足够可用范围。',
    definition: 'MXFP4 是一种微缩放四位浮点格式，由小块数值共享缩放因子。',
    explanation:
      '块级缩放让四位值在局部保有可用动态范围，同时维持紧凑存储与传输；硬件和软件必须就块布局、缩放表示与矩阵内核达成一致。',
    significance:
      'MXFP4 用于 AMD 及跨厂商低精度路径。实际结果由检查点制备与内核覆盖决定，标称 bit 数无法完整描述。',
    benchmarkContext:
      'InferenceX 把 MXFP4 记录为完整引擎和硬件方案的一部分。与 NVFP4 或 FP8 比较时，应匹配模型、序列长度、质量要求和交互性目标。',
  },
  'mixture-of-experts': {
    term: '混合专家模型',
    aliases: ['mixture of experts', 'MoE', '稀疏 MoE'],
    plainEnglish:
      '混合专家模型像一支大型专家团队：每个 token 只调用最合适的少数专家，无需每次动用全员。',
    definition: '混合专家模型包含大量前馈专家网络，但每个 token 只会被路由到其中一小部分。',
    explanation:
      '路由器为每个 token 计算专家分数，top-k 路由激活所选专家及共享专家。这让模型总参数可远大于每个 token 实际使用的计算量。',
    significance:
      'MoE 用算术稀疏性换取系统复杂度：专家权重仍占内存，路由可能不均衡，分布式部署还需要 all-to-all 完成 dispatch 与 combine。',
    benchmarkContext:
      'InferenceX 覆盖拥有数百专家的模型，并在相关位置同时报告总参数与激活参数。TP、EP、DP、精度和网络拓扑决定 MoE 稀疏性是否真正转化为服务优势。',
  },
  'multi-head-latent-attention': {
    term: '多头潜在注意力',
    aliases: ['multi-head latent attention', 'MLA'],
    plainEnglish: 'MLA 会压缩模型对历史 token 的“笔记”，让长对话占用更少内存、继续生成的成本更低。',
    definition:
      '多头潜在注意力把 attention key/value 状态压缩到更低维潜在表示，以减少 KV 缓存大小与内存流量。',
    explanation:
      'MLA 不为每个历史 token 存储完整的逐头 key/value，而是保存压缩状态，并通过模型专用投影重建或消费所需表示；实现需要专用注意力内核。',
    significance:
      '减少 KV 缓存字节可提高可用上下文长度和并发，并缓解解码带宽压力；内核形状支持与张量并行布局仍会造成巨大性能差异。',
    benchmarkContext:
      'InferenceX 中多个 DeepSeek 衍生模型使用 MLA。文章会追踪某注意力后端在一种 heads-per-rank 形状高效、另一种形状失败或回退的修复。',
  },
  'sparse-attention': {
    term: '稀疏注意力',
    aliases: ['sparse attention', 'DeepSeek Sparse Attention', 'DSA'],
    plainEnglish: '稀疏注意力只回看长上下文中最有用的部分，无需重新检查每个历史 token。',
    definition: '稀疏注意力限制每个 query 可关注的历史 token，避免对全部上下文执行完整注意力。',
    explanation:
      '稀疏模式可选择局部、压缩、索引或学习得到的上下文子集，降低长序列计算与内存移动；模型架构与运行时必须有匹配的索引器和注意力内核。',
    significance:
      '稀疏注意力可让超长上下文变得可行，但理论稀疏不保证快速推理；索引构建、不规则访问、内核融合和精度支持决定实际收益。',
    benchmarkContext:
      'InferenceX 跟踪 GLM-5 与 DeepSeek-V4 等模型专用稀疏注意力栈。支持快速变化，因此引擎版本与后端选择是结果的一部分。',
  },
  cuda: {
    term: 'CUDA',
    aliases: ['NVIDIA CUDA'],
    plainEnglish: 'CUDA 是让程序在 NVIDIA GPU 上运行的软件工具箱。',
    definition: 'CUDA 是 NVIDIA 的 GPU 计算平台、编程模型、编译工具链与软件库生态。',
    explanation:
      'LLM 引擎使用 CUDA 内核和库执行矩阵乘、注意力、集体通信、图捕获、内存管理与融合操作；容器、驱动、CUDA 和 GPU 架构版本必须兼容。',
    significance:
      '服务性能取决于芯片之上的软件。新内核、CUDA Graph、编译器专用化和库版本都能在 GPU 不变时移动基准曲线。',
    benchmarkContext:
      'InferenceX 固定容器镜像，从而固定具体 CUDA 栈。历史比较可隔离仅更新引擎镜像对相同硬件与配置的影响。',
  },
  rocm: {
    term: 'ROCm',
    aliases: ['AMD ROCm'],
    plainEnglish: 'ROCm 是让 AI 和高性能程序在 AMD GPU 上运行的软件工具箱。',
    definition:
      'ROCm 是 AMD 的开放 GPU 计算软件平台，包含运行时、编译器、通信库及优化数学和 AI 内核。',
    explanation:
      'vLLM 与 SGLang 通过 ROCm、AMD 专用库和内核项目在 Instinct 加速器上运行。模型支持取决于兼容的注意力、MoE、量化、集体通信与图执行路径。',
    significance:
      '软件成熟度可主导跨厂商推理结果。快速内核与引擎开发已在相同 MI355X 硬件上带来数倍提升，而缺失路径会让强大理论硬件无法发挥。',
    benchmarkContext:
      'InferenceX 保存引擎版本与运行日期，因此能测量 ROCm 随时间的改进；某个时间点的比较不能直接推广到后续软件版本。',
  },
  vllm: {
    term: 'vLLM',
    aliases: ['开源 LLM 推理引擎'],
    plainEnglish: 'vLLM 是开源软件，通过组织请求和 GPU 内存，让语言模型高效服务大量用户。',
    definition:
      'vLLM 是开源 LLM 推理与服务引擎，重点提供高吞吐调度、高效 KV 缓存管理和广泛模型/硬件支持。',
    explanation:
      '其运行时协调连续批处理、分布式 worker、注意力后端、量化内核和 OpenAI 兼容服务；生产方案也可把 vLLM worker 运行在 NVIDIA Dynamo 等编排层之下。',
    significance:
      'vLLM 版本与后端变化可显著改变性能。模型专用 MoE 内核、注意力 dispatch、Wide EP 通信与调度路径都会影响最终曲线。',
    benchmarkContext:
      'InferenceX 把 vLLM 作为一种引擎选择，并固定每个方案的具体镜像。应在模型、精度、工作负载与拓扑一致时比较，而不能把引擎名称当作固定性能等级。',
  },
  sglang: {
    term: 'SGLang',
    aliases: ['开源 LLM 服务引擎'],
    plainEnglish:
      'SGLang 是用于快速服务语言模型的开源软件，提供面向复杂 AI 工作负载的调度和优化功能。',
    definition: 'SGLang 是面向高性能 LLM 与多模态推理的开源服务引擎和语言模型编程系统。',
    explanation:
      '服务运行时包含连续批处理、前缀感知调度、分布式并行、推测解码，以及面向 NVIDIA/AMD GPU 的多种注意力和 MoE 内核后端。',
    significance:
      'SGLang 快速迭代的版本和模型专用内核可在硬件不变时显著改变吞吐量；低并发受调度开销影响，其他区间则由注意力、MoE 与通信内核主导。',
    benchmarkContext:
      'InferenceX 持续重跑固定版本的 SGLang 方案。跨版本曲线会保留改动对完整性能区间的影响。',
  },
  'tensorrt-llm': {
    term: 'TensorRT-LLM',
    aliases: ['TRT-LLM', 'TRTLLM'],
    plainEnglish: 'TensorRT-LLM 是 NVIDIA 为自家 GPU 优化的 LLM 推理软件栈。',
    definition:
      'TensorRT-LLM 是 NVIDIA 用于在 NVIDIA GPU 上编译、优化和服务大语言模型的推理软件栈。',
    explanation:
      '它提供 NVIDIA 优化内核、量化路径、分布式执行和模型专用优化；既可作为服务后端，也可通过集成让其他引擎使用其衍生内核。',
    significance:
      '紧密硬件集成可快速支持 Blackwell 与 NVL72 功能，但模型支持和引擎兼容仍与版本相关，因此 TensorRT-LLM 标签必须对应具体容器与方案。',
    benchmarkContext:
      'InferenceX 同时包含直接 TensorRT-LLM、Dynamo TensorRT-LLM，以及 SGLang/vLLM 使用 TRT-LLM 衍生内核后端的配置。',
  },
  'nvidia-dynamo': {
    term: 'NVIDIA Dynamo',
    aliases: ['Dynamo', '分布式推理框架'],
    plainEnglish:
      'NVIDIA Dynamo 协调大量 GPU worker，负责路由请求、移动模型记忆，并把读提示词和写答案分配给合适的资源池。',
    definition:
      'NVIDIA Dynamo 是用于编排请求路由、worker 池、KV 缓存移动和分离式服务的分布式推理框架。',
    explanation:
      'Dynamo 可把预填充与解码放在独立扩展的池中，并使用 vLLM 或 TensorRT-LLM 作为 worker 运行时。内核仍由这些引擎执行，Dynamo 负责外围数据与控制路径。',
    significance:
      '机架级性能由单 GPU 运行时、路由、缓存传输、拓扑感知与池大小共同决定。这些因素决定 Wide EP 和分离式推理能否提升端到端性能。',
    benchmarkContext:
      'Dynamo vLLM、Dynamo TRT-LLM 标签同时标识编排层与执行引擎。InferenceX 文章还会明确预填充/解码拓扑，因为两种 Dynamo 配置可能表现完全不同。',
  },
};

const entries = getAllGlossaryEntries().map((entry) => {
  const translation = translations[entry.slug];
  if (!translation) throw new Error(`Missing Chinese glossary translation: ${entry.slug}`);
  return { ...entry, ...translation };
});
const entriesBySlug: Readonly<Record<string, GlossaryEntry>> = Object.fromEntries(
  entries.map((entry) => [entry.slug, entry]),
);

export function getAllZhGlossaryEntries(): readonly GlossaryEntry[] {
  return entries;
}

export function getZhGlossaryEntry(slug: string): GlossaryEntry | undefined {
  return entriesBySlug[slug];
}

export function getRelatedZhGlossaryEntries(entry: GlossaryEntry): GlossaryEntry[] {
  return entry.relatedTerms.flatMap((slug) => {
    const related = entriesBySlug[slug];
    return related ? [related] : [];
  });
}

export function compareZhGlossaryEntries(a: GlossaryEntry, b: GlossaryEntry): number {
  const categoryOrder =
    GLOSSARY_CATEGORIES.indexOf(a.category) - GLOSSARY_CATEGORIES.indexOf(b.category);
  return categoryOrder || a.term.localeCompare(b.term, 'zh-CN');
}

export function getAdjacentZhGlossaryEntries(slug: string): {
  previous: GlossaryEntry | null;
  next: GlossaryEntry | null;
} {
  const sorted = entries.toSorted(compareZhGlossaryEntries);
  const index = sorted.findIndex((entry) => entry.slug === slug);
  if (index === -1) return { previous: null, next: null };
  return {
    previous: sorted[index - 1] ?? null,
    next: sorted[index + 1] ?? null,
  };
}

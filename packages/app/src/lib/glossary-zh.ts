import {
  GLOSSARY_CATEGORIES,
  type GlossaryCategory,
  type GlossaryEntry,
  getAllGlossaryEntries,
} from './glossary';

export const GLOSSARY_CATEGORY_LABELS_ZH: Readonly<Record<GlossaryCategory, string>> = {
  'Benchmark metrics': '基准指标',
  Serving: '推理服务',
  'Agentic inference': '智能体推理',
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
      '训练阶段会更新模型权重，推理阶段则使用这些权重。生产系统还需要推理引擎负责调度请求、管理内存、合并批次，并在一个或多个加速器上执行内核。周边软硬件栈不同，性能也会随之变化。',
    significance:
      '推理既是模型问题，也是系统问题。用户体验取决于延迟和交互性，运营成本则取决于吞吐量、利用率、功耗与硬件成本；只优化其中一个维度，往往会牺牲另一个维度。',
    benchmarkContext:
      'InferenceX 测试完整的推理方案，因为芯片峰值规格无法代表实际服务性能。每条曲线都对应明确的模型、引擎、精度、并行策略、芯片系统、序列长度和并发扫描。',
  },
  'agentic-inference': {
    term: '智能体推理',
    aliases: ['agentic inference', 'AI 智能体推理', 'agent 推理'],
    plainEnglish:
      '智能体会通过多次模型请求完成一项任务，期间可能调用工具、保留会话状态，也可能把部分工作交给 subagent。',
    definition:
      '智能体推理是为 AI agent 提供模型服务的过程。此类 agent 会在多个轮次间保留状态、调用工具、复用不断增长的上下文，并可能并行运行 subagent。',
    explanation:
      '一次智能体会话会在模型请求、工具执行和等待之间交替。后续请求通常携带大部分历史对话，因此 prefix cache 和 KV cache 容量会直接影响速度与成本。并行 subagent 还会产生各自具有时间关系和上下文增长过程的请求分支。',
    significance:
      '固定 input 和 output 长度无法覆盖智能体带来的全部服务压力。长共享前缀会改变 cache 行为，工具等待会让流量呈现突发性，并行分支则会争用推理容量。同一组软硬件在这种请求模式下可能出现不同的性能排序。',
    benchmarkContext:
      'InferenceX 使用 AgentX 测量智能体推理。AgentX 与固定序列场景回答不同的容量问题，应分别比较。AgentX 采用闭环会话回放，同一会话中的后续请求会受前一轮完成时间影响。',
  },
  agentx: {
    term: 'AgentX',
    aliases: ['AgentX 基准测试', 'AgentX 场景'],
    plainEnglish: 'AgentX 是 InferenceX 用来测试完整长上下文、多轮编码智能体会话的工作负载。',
    definition:
      'AgentX 是 InferenceX 的智能体推理基准测试场景，其工作负载形状来自自愿提供的编码智能体轨迹，并在移除原始内容后构建。',
    explanation:
      'AgentX 使用确定性合成 token 重建会话结构。回放会保留请求长度、轮次间隔、共享前缀增长、工具等待以及主 agent 与 subagent 的依赖关系；原始提示词、生成代码和工具 payload 不会进入测试数据。推理栈只接收请求模式。',
    significance:
      '长上下文考验 KV cache 容量，重复前缀考验 cache 复用，分支时序则考验请求调度。这些影响在短小独立请求中较少出现。最终曲线反映推理系统在智能体流量下的整体表现。',
    benchmarkContext:
      '具备对应数据的模型默认显示 Agentic 场景。比较 AgentX 结果时，应使用兼容设置下的其他 AgentX 运行，并同时查看吞吐量、延迟与交互性。固定序列场景适合分析传统请求流。',
  },
  'agentic-coding-workload': {
    term: '智能体编码工作负载',
    aliases: ['agentic coding workload', '编码智能体工作负载', '软件工程智能体工作负载'],
    plainEnglish:
      '编码智能体读取代码仓库、修改代码并运行工具，随后继续请求模型，直到完成任务；这一连串请求就是智能体编码工作负载。',
    definition:
      '智能体编码工作负载由软件 agent 产生，包含多轮模型生成、代码仓库检查、工具调用、代码修改以及委派给 subagent 的子任务。',
    explanation:
      '随着 agent 累积指令、文件、工具结果和历史回答，请求长度会持续增长。许多轮次会复用较大的共享前缀。工具执行造成不均匀的停顿，subagent 则可能生成时间重叠的请求分支，因此其流量形状与固定长度提示词不同。',
    significance:
      '编码智能体可能通过一串相互依赖的调用让推理系统持续工作数分钟甚至数小时。Cache 策略、调度公平性、内存容量和尾延迟都会影响任务进度，仅看峰值 decode 吞吐量无法描述这种体验。',
    benchmarkContext:
      'AgentX 使用从轨迹提取的请求形状与确定性合成内容表示该工作负载。它测量推理系统性能。模型能否完成编码任务需要单独做质量评估，因此质量分数与 AgentX 服务结果应分别解读。',
  },
  'trace-replay': {
    term: '轨迹回放',
    aliases: ['trace replay', '工作负载回放', '会话回放'],
    plainEnglish:
      '轨迹回放重现已记录会话的请求大小、先后关系与时间间隔，让基准测试按照原始工作负载的节奏发送请求。',
    definition:
      '轨迹回放是一种基准测试方法，它把记录下来的请求关系、长度和时间信息转化为可重复运行的系统工作负载。',
    explanation:
      '回放可以保留由主 agent 轮次、并行 subagent 分支和辅助请求组成的有向图。确定性合成 token 会替换私有内容，同时保留 token 数量与前缀关系。轮次间记录的停顿则重现 agent 使用工具或等待依赖项的时间。',
    significance:
      '这种方法能够表达独立提示词列表缺少的流量特征，也能使用相同会话形状重复比较不同软硬件。AgentX 会在公开回放数据前移除源会话内容。',
    benchmarkContext:
      'AgentX 通过 AIPerf 回放由轨迹衍生的会话。固定 seed 决定会话采样、起点和合成内容。对外结果只统计 cache warmup 后的 profiling 窗口，使多次运行聚焦于稳态服务表现。',
  },
  'closed-loop-benchmark': {
    term: '闭环基准测试',
    aliases: ['closed-loop benchmark', '闭环负载测试', '闭环工作负载'],
    plainEnglish:
      '在闭环基准测试中，每个模拟用户会等待当前步骤完成，再按照该会话的依赖关系发送下一步请求。',
    definition:
      '闭环基准测试中的客户端会在前一个依赖请求完成后生成新工作，同时遵循工作负载记录的等待时间和分支结构。',
    explanation:
      '并发量表示活跃客户端或会话的数量，同时在途的请求数会随时间变化。系统越快，完成轮次越早，因此在同一个 profiling 窗口内发出的请求也越多。由于每条采样会话的推进取决于请求完成时间，实际请求组合可能略有变化。',
    significance:
      '这种负载模型符合交互式 agent 的运行方式，因为下一步动作依赖上一步结果。响应更快时，会话也会更快地产生后续工作，所以吞吐量与延迟相互关联。低并发运行的采样波动通常会比大型请求池更明显。',
    benchmarkContext:
      'AgentX 采用闭环并发。并发量表示同时运行的 agent 客户端数量；随着会话推进，请求批次大小会不断变化。解读结果时，应结合吞吐量、首 token 延迟和交互性。',
  },
  subagent: {
    term: '子智能体',
    aliases: ['subagent', 'child agent', '委派智能体'],
    plainEnglish: '子智能体由主 agent 启动，负责同一任务中的较小部分，并可能与其他工作同时运行。',
    definition:
      '子智能体是一次受委派的 agent 执行，拥有独立会话状态和模型请求，并通过任务关系与依赖关系连接到父会话。',
    explanation:
      '主 agent 可以启动一个或多个 subagent，稍后再使用它们的结果。Subagent 的请求可能与父会话或其他分支重叠，从而形成会话图中的分支。每个分支可以增长独立上下文，同时复用部分初始指令或代码仓库状态。',
    significance:
      'Subagent 会让智能体流量不再完全串行。一个用户任务可能在短时间内产生多条长上下文请求，调度策略会影响各分支的完成速度。系统总吞吐量上升时，单个分支仍可能等待更久。',
    benchmarkContext:
      'AgentX 会保留轨迹衍生工作负载中的 subagent 分支及其依赖关系。委派质量不在测试范围内。基准测试测量推理系统如何处理由此产生的并行请求、共享前缀和完成时序。',
  },
  'inference-engine': {
    term: '推理引擎',
    aliases: ['inference engine', '服务引擎', 'LLM 服务框架'],
    plainEnglish:
      '推理引擎就像 AI 服务背后的交通调度员：它安排请求流转，并让芯片在正确时间执行正确任务。',
    definition: '推理引擎是将模型权重和用户请求转化为加速器上生成结果的软件运行时。',
    explanation:
      '它负责请求调度、连续批处理、KV 缓存分配、分布式执行、内核选择与 token 采样。vLLM、SGLang 和 TensorRT-LLM 即使运行同一模型和芯片，也会因调度器、内核与分布式策略不同而产生不同曲线。',
    significance:
      '引擎版本和配置有时与芯片选择同样重要。一次调度器更新、融合注意力内核或模型专用路径修复，都可能在硬件不变时带来数倍性能变化。',
    benchmarkContext:
      'InferenceX 将引擎和容器镜像记录为可复现方案的一部分，因此历史视图能够区分软件进步与芯片代际进步。',
  },
  throughput: {
    term: '吞吐量',
    aliases: ['throughput', 'token 吞吐量', '总吞吐量'],
    plainEnglish: '吞吐量就是整个系统每秒一共能完成多少工作。',
    definition: '吞吐量是推理系统在所有活跃请求上生成 token 的总速率。',
    explanation:
      'InferenceX 通常使用每芯片每秒 token 数进行归一化，便于比较不同规模的系统。提高批大小或并发往往能摊薄权重读取和计算成本，从而提高总吞吐量，但单个用户收到 token 的速度可能下降。',
    significance:
      '最大吞吐量不是完整的性能结论。某个点即使拥有最高 tok/s，也可能因为交互性过低而不适合实时产品；有效比较应在符合业务需求的延迟或交互性目标下进行。',
    benchmarkContext:
      'InferenceX 将吞吐量与交互性放在完整并发扫描中共同展示，并用 Pareto 前沿剔除两个轴上都更差的运行点。',
    measurement: { label: '常用单位', value: 'tok/s/chip' },
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
      'InferenceX 将 tok/s/user 与吞吐量或成本一起绘制，并在等交互性表格中沿各自 Pareto 前沿插值，以固定用户体验。由于该坐标轴不计入首 token 之前的等待，agentic 图表还提供端到端归一化交互性，用同一单位把 TTFT 一并纳入。',
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
      '批处理就像让多名乘客坐同一辆巴士：芯片一次处理多个请求，让每趟计算完成更多有效工作。',
    definition: '批处理将多个请求的工作组合起来，使加速器能够一起处理它们的 token。',
    explanation:
      '大型矩阵运算比大量微小运算更能发挥芯片效率。现代推理引擎采用连续批处理，请求到达和结束时动态加入或退出，无需等待固定批次全部完成。由此形成的批次形状会在预填充和解码过程中不断变化。',
    significance:
      '批处理是吞吐量与延迟核心权衡的来源。更大的有效批次能摊薄权重读取和内核启动开销，但通常会增加每位用户的 token 间隔。',
    benchmarkContext:
      '并发量是批处理的输入，并不等同于某个固定内核批大小；并行策略、序列长度、请求完成时机和调度策略都会改变芯片实际看到的批形状。',
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
      'InferenceX 连接并发与配置扫描中的 Pareto 最优点，等交互性比较也沿这些前沿插值，避免用随意选择的原始点直接比较。每个 SKU 最佳配置视图现在会把允许启用的优化合并成一条曲线，按模型、芯片 SKU 和引擎各一条，因此同一条线上相邻的点可能在投机解码、分离式部署或 KV cache offload 上并不相同；每个点仍会展示产生它的具体配置。',
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
      'InferenceX 文章使用等交互性表格比较硬件、精度和软件；超出实测前沿的值会标记为不可达，而不会向观测区间之外外推。前沿始终建立在吞吐量与交互性之上，每百万 token 成本和每 token 焦耳则由插值得到的吞吐量推导，而不是各自单独做样条：它们都是每芯片常数除以吞吐量，单独插值会破坏两个 knot 之间的这一恒等关系。',
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
      'InferenceX 在图表标签与方案描述中列出 ISL/OSL。只有先匹配工作负载形状，才能把差异归因于硬件或软件。agentic 运行没有单一的 ISL/OSL 组合可供引用：长度近似服从对数正态分布，因此点详情视图会绘制拟合分布并给出分位数，p90 或 p99 输入长度可能是中位数的数倍。',
  },
  'cost-per-million-tokens': {
    term: '每百万 token 成本',
    aliases: ['cost per million tokens', '$/M tokens', 'token 成本'],
    plainEnglish: '它估算 AI 读取和生成一百万个 token 需要支付多少基础设施成本。',
    definition: '每百万 token 成本估算系统在某个实测运行点生成一百万 token 所需的基础设施成本。',
    explanation:
      'InferenceX 根据每小时总体拥有成本和实测 token 吞吐量计算该指标。它可能按总 token 报告，也可能区分输入和输出 token，因此比较前必须确认分母。',
    significance:
      '该指标把系统性能转化为服务经济性，但仍受工作负载、交互性、利用率、缓存命中和成本假设影响；低吞吐量的离线运行点与高交互性实时端点属于不同的运行区间，不能直接比较。',
    benchmarkContext:
      '成本曲线使用与吞吐曲线相同的并发扫描。在等交互性下，更低的 $/M 表示以更少建模成本提供相同流式体验。',
    measurement: {
      label: 'InferenceX 计算式',
      value: '$/M = TCO（$/chip-hour）× 1,000,000 /（3600 × tok/s/chip）',
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
      'InferenceX 在匹配交互性时比较 perf/$，并明确使用的 TCO 输入。该比值不能跨模型、序列长度、精度或延迟区间直接套用。图表用每美元 token 数表达同一套经济性，它数值越大越好，也是默认的 Y 轴。',
  },
  'total-cost-of-ownership': {
    term: '总体拥有成本',
    aliases: ['total cost of ownership', '全生命周期成本'],
    plainEnglish: 'TCO 包含硬件采购，以及后续供电、制冷、网络和运维成本。',
    definition: '总体拥有成本（TCO）是基础设施在使用寿命内采购、部署和运营的综合成本估算。',
    explanation:
      '芯片采购价只是其中一项。TCO 模型还可包含主机、网络、供电、制冷、机房、融资、折旧、维护和预期利用率，并归一化为每芯片小时成本。',
    significance:
      'TCO 比标价更适合跨系统经济性比较，尤其是网络与电力基础设施不同的机架级产品；但它仍是模型，必须连同假设一起阅读。',
    benchmarkContext:
      'InferenceX 将 SemiAnalysis AI Cloud 的 TCO 输入与实测 tok/s/chip 结合，从而把系统每小时成本与决定这一小时 token 产出的软件实现及工作负载特征分开考察。',
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
      '比较 tokens/MW 时必须匹配模型、工作负载、精度与交互性，否则高吞吐低交互点可能看似高效，却无法满足目标用户体验。每 token 能耗表达的是同一份供电预算折算到单位输出上的结果；在遥测可信的前提下，InferenceX 还会给出加速器的实测能耗。',
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
      '分离式方案将预填充放在独立芯片池。阅读结果时应检查预填充 TP、芯片数、输入长度，以及 KV 状态是否需要跨网络传输到解码池。',
  },
  decode: {
    term: '解码',
    aliases: ['decode', '自回归生成', 'token 生成'],
    plainEnglish: '解码就是模型读完提示词后，一个 token 接一个 token 地写出答案。',
    definition: '解码是自回归生成输出 token 的阶段，通常每个模型步为每条序列接受一个 token。',
    explanation:
      '每个新 token 都依赖此前 token，因此时间维度无法完全并行。模型会反复读取权重与该序列的 KV 缓存，使解码对内存带宽、批处理和通信尤其敏感。',
    significance:
      '解码决定流式交互性，也常主导长输出成本。投机解码、MTP、量化和宽专家并行都试图减少每个有效 token 的工作量或耗时。',
    benchmarkContext:
      'InferenceX 用 tok/s/user 与总 tok/s/chip 展示不同并发下的解码性能。公平比较必须匹配输出长度、批形状、精度和并行策略。',
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
      '除非方案另有说明，InferenceX 在定长场景的随机数据比较中禁用前缀缓存，避免无关请求因偶然命中而获得不真实优势。AgentX 是有意为之的例外：它回放的会话本身就会复用前缀，因此缓存容量、淘汰策略和 offload 都属于该场景要测量的内容。',
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
      'InferenceX 在定长场景的随机数据集上禁用前缀缓存，避免把缓存策略混入完整提示词处理的测量，因此那些数字应视为无命中基线。AgentX 则相反：命中率本身就是上报指标，会与该点所在的 offload 层级一并展示，因为复用正是这类工作负载的本质特征。',
  },
  'disaggregated-inference': {
    term: '分离式推理',
    aliases: ['disaggregated inference', 'PD 分离', '分离式预填充', 'disagg'],
    plainEnglish: '分离式推理把“读提示词”和“写答案”交给两组芯片，让每组都能针对自己的任务优化。',
    definition: '分离式推理在不同工作池上运行预填充与解码，并在两者之间传输请求状态。',
    explanation:
      '预填充通常偏计算密集，解码则常受内存带宽和通信限制。分离后，两侧可以采用不同芯片数、并行度、批策略和扩缩容方式。',
    significance:
      '分离可隔离提示词峰值并提升吞吐量或 SLA 稳定性，但也增加路由与 KV 传输开销；网络薄弱或内核不成熟时，它可能反而慢于聚合式服务。',
    benchmarkContext:
      'InferenceX 中的 disagg 不是万能开关。应查看预填充/解码 world size、TP/EP 布局、框架、网络域，以及分离前沿真正领先的交互性区间。',
  },
  'speculative-decoding': {
    term: '投机解码',
    aliases: ['speculative decoding', '草稿与验证解码'],
    plainEnglish:
      '投机解码让一个便宜的助手先起草多个 token，再由完整模型一次性审核，省去部分逐个生成步骤。',
    definition:
      '投机解码先以低成本提出多个未来 token，再由目标模型批量验证，从而减少昂贵的串行解码步数。',
    explanation:
      '草稿模型或内置预测头生成候选，目标模型在一次批量验证中评估这些候选并接受有效前缀；严格实现时不会改变目标分布。',
    significance:
      '加速取决于草稿 token 的接受数量，以及草稿与验证成本。稠密模型和 MoE 的表现可能不同，因为验证多个位置可能激活更多专家权重。',
    benchmarkContext:
      '应在真实接受率下比较投机解码方案并验证模型质量。定长场景仍把投机解码作为曲线标识的一部分，因此开启和关闭 MTP 的方案会分开绘制；agentic 曲线则把它当作数据点级元数据并合并这些点，在提示框中标明具体方式，因为 AgentX 按模型、芯片 SKU 和引擎给出可获得的最佳曲线。由于 AgentX 回放的内容是合成的，speculator 接受的 draft token 数会失真，因此运行时会套用一套按模型、speculator、draft 长度和思考模式在外部 agentic 编码数据集上采集的接受长度。',
  },
  'multi-token-prediction': {
    term: '多 token 预测',
    aliases: ['multi-token prediction', '多 token 预测头'],
    plainEnglish: 'MTP 让模型一次猜测多个后续 token 并一起验证，从而减少缓慢的逐 token 步骤。',
    definition:
      '多 token 预测（MTP）使用与主模型共同训练的辅助预测头，提出多个未来 token 供投机验证。',
    explanation:
      'MTP 不需要独立草稿模型，候选来自目标模型自身表示，因此分布更一致、部署也更简单；但它要求检查点包含兼容 MTP 模块，且推理引擎支持验证路径。',
    significance:
      'MTP 可用额外计算换取更少的内存受限解码步。草稿接受率高且验证能利用空闲计算时收益最大；大批次下额外工作可能减少优势。',
    benchmarkContext:
      'InferenceX 将 MTP 作为方案维度。把基准收益迁移到生产时，必须考虑接受率/长度、工作负载分布、数值质量检查与匹配交互性。',
  },
  eagle: {
    term: 'EAGLE',
    aliases: ['EAGLE 投机解码', 'EAGLE-3'],
    plainEnglish: 'EAGLE 是一种为主模型起草多个可能后续 token 的方法，可让答案流式输出得更快。',
    definition:
      'EAGLE 是一组投机解码方法：利用与目标语言模型相关的特征预测草稿序列，再由目标模型验证。',
    explanation:
      '推理框架通常通过投机步数、草稿 token 数和候选宽度等参数暴露 EAGLE。模型检查点、草稿组件与引擎实现必须匹配。',
    significance:
      'EAGLE 能提高每个目标模型步接受的 token 数，但结果依赖工作负载；接受行为、草稿开销、模型架构和批大小共同决定端到端收益。',
    benchmarkContext:
      '部分 InferenceX 曲线标注 MTP，是因为模型提供多 token 预测头，而引擎使用 EAGLE 风格管线。应查看方案参数与检查点细节，不能假设所有 MTP 曲线实现相同。',
  },
  'tensor-parallelism': {
    term: '张量并行',
    aliases: ['tensor parallelism', 'TP'],
    plainEnglish: '张量并行把一次大型计算拆给多张芯片，让它们共同完成。',
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
    plainEnglish: '专家并行把模型中的不同“专家”分配给不同芯片，再把每个 token 送到需要的专家。',
    definition:
      '专家并行（EP）把 MoE 模型的专家分布到不同加速器，并将 token 路由到持有所选专家的 rank。',
    explanation:
      'MoE 层对每个 token 只激活部分专家。EP 利用这种稀疏性，避免每张芯片存储和计算全部专家，但每个 MoE 层前后都要执行 dispatch 与 combine all-to-all。',
    significance:
      '更宽 EP 能减少每芯片专家权重占用，并改善解码批处理与容量；收益取决于路由均衡和互连能否足够快地移动 token。',
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
    plainEnglish: '宽专家并行把模型专家铺到大量芯片上，让每张芯片需要保存和移动的专家数据更少。',
    definition: '宽专家并行使用大量加速器 rank 构成 MoE 模型的专家并行组。',
    explanation:
      '把数百个专家分散到更多 rank，可减少每张芯片需要存储和流式读取的专家权重；更大的同伴组也可形成更高效的专家批次，但 dispatch/combine 流量会扩展。',
    significance:
      'Wide EP 在高带宽 scale-up 网络中最有效。若流量跨越较慢的 scale-out 网络，同样的 all-to-all 可能成为瓶颈并抵消内存侧收益。',
    benchmarkContext:
      'InferenceX 在机架级分离式方案中使用 Wide EP。比较时必须同时查看 EP 宽度、解码池大小与网络，而不能只看图例中的芯片型号。',
  },
  'all-reduce': {
    term: 'All-reduce',
    aliases: ['全归约'],
    plainEnglish: 'All-reduce 让每张芯片完成一部分计算，再合并结果并把完整答案发回所有芯片。',
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
    plainEnglish: 'All-to-all 是一次有组织的交换：每张芯片都向其他每张芯片发送不同的数据包。',
    definition: 'All-to-all 是每个参与 rank 向所有其他 rank 发送不同数据的集体通信模式。',
    explanation:
      '专家并行 MoE 层先用 all-to-all dispatch 把 token 发往所选专家，再用 combine 把专家输出送回；流量与不均衡程度取决于 token 路由。',
    significance:
      'All-to-all 比简单点对点传输更苛刻，EP 扩大后容易受网络限制。专用内核会重叠通信与计算并优化 token 打包。',
    benchmarkContext:
      '机架级 NVLink 可让 Wide EP 的 all-to-all 留在 scale-up 域内；跨节点 InfiniBand 或 RoCE 方案需要面对远低得多的每芯片 scale-out 带宽。',
  },
  'scale-up-vs-scale-out': {
    term: 'Scale-up 与 scale-out 网络',
    aliases: ['纵向扩展域', '横向扩展网络'],
    plainEnglish: 'Scale-up 是同一套芯片系统内部的超高速网络，scale-out 则连接不同服务器或机架。',
    definition:
      'Scale-up 网络连接同一紧耦合系统内的加速器，scale-out 网络则把多个系统或机架连接成更大集群。',
    explanation:
      'NVLink 等 scale-up 网络为细粒度集体通信提供极高每芯片带宽和低延迟；InfiniBand 或 RoCE 等 scale-out 网络覆盖更多机器，但每加速器带宽通常更低。',
    significance:
      '分布式推理会跨越两个域。高频 TP/EP 集体通信尤其适合留在 scale-up 内，较粗粒度请求路由和部分预填充/解码传输则更能容忍 scale-out。',
    benchmarkContext:
      '芯片名称本身不能描述通信域。八卡节点中的 B200 与 GB200 NVL72 使用相关芯片，却拥有完全不同的 scale-up 组规模。',
  },
  'high-bandwidth-memory': {
    term: '高带宽内存',
    aliases: ['high-bandwidth memory', 'HBM'],
    plainEnglish: 'HBM 是紧挨芯片的一小池超高速内存，推理时模型权重和工作数据都要放在这里。',
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
    plainEnglish: '内存带宽就像向芯片计算单元供给数据的管道宽度；管道越宽，计算单元越不容易空等。',
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
    aliases: ['NVIDIA NVLink', '芯片高速互连'],
    plainEnglish: 'NVLink 是 NVIDIA 芯片之间的高速公路，让多张芯片的协作远快于普通服务器网络。',
    definition: 'NVLink 是 NVIDIA 用于 scale-up 域内芯片直接数据传输的高带宽加速器互连。',
    explanation:
      'NVSwitch 系统连接多个 NVLink 端点，使集体通信可覆盖八卡服务器，或在 NVL72 产品中覆盖 72 芯片机架级域；该带宽不同于连接独立系统的 InfiniBand/Ethernet。',
    significance:
      '大型 TP，尤其是 Wide EP，会在每个生成 token 上交换数据。把通信留在 NVLink 上，可让机架级方案显著快于通过 scale-out 连接的相似芯片数量。',
    benchmarkContext:
      'InferenceX 同时比较节点级芯片与 NVL72。归因于单芯片算力前，应先理解系统拓扑与并行组宽度。',
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
      'InferenceX 的 FP8 标签覆盖完整方案，检查点文件名只是其中一项。引擎、注意力后端、KV 缓存格式、芯片代际和 MTP 设置都可能改变曲线。',
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
    plainEnglish: 'CUDA 是让程序在 NVIDIA 芯片上运行的软件工具箱。',
    definition: 'CUDA 是 NVIDIA 的芯片计算平台、编程模型、编译工具链与软件库生态。',
    explanation:
      'LLM 引擎使用 CUDA 内核和库执行矩阵乘、注意力、集体通信、图捕获、内存管理与融合操作；容器、驱动、CUDA 和芯片架构版本必须兼容。',
    significance:
      '服务性能取决于芯片之上的软件。新内核、CUDA Graph、编译器专用化和库版本都能在芯片不变时移动基准曲线。',
    benchmarkContext:
      'InferenceX 固定容器镜像，从而固定具体 CUDA 栈。历史比较可隔离仅更新引擎镜像对相同硬件与配置的影响。',
  },
  rocm: {
    term: 'ROCm',
    aliases: ['AMD ROCm'],
    plainEnglish: 'ROCm 是让 AI 和高性能程序在 AMD 芯片上运行的软件工具箱。',
    definition:
      'ROCm 是 AMD 的开放芯片计算软件平台，包含运行时、编译器、通信库及优化数学和 AI 内核。',
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
    plainEnglish: 'vLLM 是开源软件，通过组织请求和芯片内存，让语言模型高效服务大量用户。',
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
      '服务运行时包含连续批处理、前缀感知调度、分布式并行、投机解码，以及面向 NVIDIA/AMD 芯片的多种注意力和 MoE 内核后端。',
    significance:
      'SGLang 快速迭代的版本和模型专用内核可在硬件不变时显著改变吞吐量；低并发受调度开销影响，其他区间则由注意力、MoE 与通信内核主导。',
    benchmarkContext:
      'InferenceX 持续重跑版本固定的 SGLang 方案。对比不同版本的曲线，可以看出改动如何影响完整运行区间，并发现单个峰值点掩盖的回归或提升。',
  },
  'tensorrt-llm': {
    term: 'TensorRT-LLM',
    aliases: ['TRT-LLM', 'TRTLLM'],
    plainEnglish: 'TensorRT-LLM 是 NVIDIA 为自家芯片优化的 LLM 推理软件栈。',
    definition:
      'TensorRT-LLM 是 NVIDIA 用于在 NVIDIA 芯片上编译、优化和服务大语言模型的推理软件栈。',
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
      'NVIDIA Dynamo 协调大量芯片 worker，负责路由请求、移动模型记忆，并把读提示词和写答案分配给合适的资源池。',
    definition:
      'NVIDIA Dynamo 是用于编排请求路由、worker 池、KV 缓存移动和分离式服务的分布式推理框架。',
    explanation:
      'Dynamo 可把预填充与解码放在独立扩展的池中，并使用 vLLM 或 TensorRT-LLM 作为 worker 运行时。内核仍由这些引擎执行，Dynamo 负责外围数据与控制路径。',
    significance:
      '机架级性能由单芯片运行时、路由、缓存传输、拓扑感知与池大小共同决定。这些因素决定 Wide EP 和分离式推理能否提升端到端性能。',
    benchmarkContext:
      'Dynamo vLLM、Dynamo TRT-LLM 标签同时标识编排层与执行引擎。InferenceX 文章还会明确预填充/解码拓扑，因为两种 Dynamo 配置可能表现完全不同。',
  },
  'e2e-normalized-interactivity': {
    term: '端到端归一化交互性',
    aliases: ['E2E Normalized Interactivity', '归一化交互性', 'OSL/E2EL'],
    plainEnglish:
      '这个指标衡量一整条回答到达得有多快，既算首 token 之前的等待，也算之后的流式速度。',
    definition:
      '端到端归一化交互性是整条请求上的有效每用户 token 速率，即输出 token 数除以端到端延迟。',
    explanation:
      '把端到端延迟展开为 TTFT 加上输出长度乘以每输出 token 时间，该指标约等于 1 除以（token 间延迟加上 TTFT 除以输出 token 数），也就是常规交互性再加一项与首 token 等待成正比的惩罚。这里的“归一化”指按输出长度归一，既不是 0 到 1 的评分，也不是与其他系统对比后的相对值。',
    significance:
      '只看交互性，会奖励那些让用户先等很久、之后再快速输出的方案；只看 TTFT，则会奖励开头很快、随后拖沓的方案。把两者合成一个数字，可以暴露只在单一维度上好看的运行点。输出越短，TTFT 惩罚越明显，因为可供摊薄等待时间的 token 更少。',
    benchmarkContext:
      'InferenceX 把它作为 agentic 运行的实验性 X 轴模式，因此需要持久化的逐请求 trace，非官方运行 overlay 无法使用该视图。它是有意保留缺陷的：对高 TTFT 惩罚很重，也无法体现 prefill 与 decode 分离等优化的全部细节，所以 AgentX 提交仍会分别针对交互性和 TTFT 做优化。',
    measurement: { label: '常用单位', value: 'token/秒/用户（tok/s/user）' },
  },
  'tokens-per-dollar': {
    term: '每美元 token 数',
    aliases: ['tokens per dollar', 'tok/$', '每 1 美元 token 数'],
    plainEnglish: '每美元 token 数表示一美元基础设施支出能买到多少 token，数值越大说明系统越便宜。',
    definition:
      '每美元 token 数是某个配置在一单位建模成本下产出的 token 数量，即每 token 成本的倒数。',
    explanation:
      '它由每芯片吞吐量和建模的每芯片小时成本直接得出，因此与每百万 token 成本共用同一套假设，只是换成了人们规划容量时更习惯的方向。InferenceX 为总 token、输入 token 和输出 token 分别给出该指标，覆盖每种成本口径，并同时提供人民币与美元两种计价。',
    significance:
      '每百万 token 成本与每美元 token 数对系统的排序完全一致，但后者随硬件变好而升高，与吞吐量方向相同，因此同一张图里的坐标轴不会中途反向。该数值完全依赖背后的成本模型，脱离所声明的口径就不成立。',
    benchmarkContext:
      'InferenceX 推理图表默认的 Y 轴就是每 1 美元可购买的总 token 数。阅读时请对照图表上方的 TCO 行，并只在同一成本口径内比较：自有（超大规模费率）、自有（neocloud 费率）和 3 年租赁对同一颗芯片会给出不同结果。',
    measurement: { label: '常用单位', value: '每 1 美元 token 数（tok/$）' },
  },
  'energy-per-token': {
    term: '每 token 能耗',
    aliases: ['energy per token', 'J/token', '每请求能耗'],
    plainEnglish:
      '每 token 能耗表示系统产出一个 token 要花多少电，是每 token 成本在电力侧的对应指标。',
    definition:
      '每 token 能耗是产出单位 token 所消耗的电能，可以按全量供电口径统计，也可以取加速器实测遥测值。',
    explanation:
      '两种口径回答的是不同问题，不能混用。全量供电口径把包含供电与制冷开销在内的设施功耗预算除以实测 token 速率；实测口径来自运行期间的加速器遥测，只覆盖芯片本身。InferenceX 还会给出每次成功请求的实测能耗，以及平均功耗占 TDP 的百分比。',
    significance:
      '新建部署的约束往往是电力而不是资本开支，每焦耳产出更多 token 的系统能在同样的用电额度下服务更多需求。TDP 占比则单独反映一套方案究竟把加速器压到了什么程度，这是仅看按 token 归一的数值看不出来的。',
    benchmarkContext:
      '比较前请先看清标签：全量供电口径与实测口径之间相差整个设施开销。当底层遥测无效或统计范围不明确时，InferenceX 会屏蔽实测能耗，因此数值缺失意味着该测量不可信，而不是这次运行不耗电。',
    measurement: { label: '常用单位', value: '焦耳/token（J/tok）' },
  },
  'context-parallelism': {
    term: '上下文并行',
    aliases: ['context parallelism', 'PCP', 'DCP', '序列并行'],
    plainEnglish:
      '上下文并行把一条长提示词拆到多颗芯片上，让它们分担读取提示词和扫描注意力状态的工作。',
    definition:
      '上下文并行把 query token 切分到多个加速器上，用于 prefill 的形式称为 PCP，用于 decode 的形式称为 DCP。',
    explanation:
      'PCP 让每个 rank 处理一段 query，keys 和 values 以环形方式传递，从而并行化计算受限的 prefill，也避免某个 rank 独自承担整条长提示词。DCP 则切分 KV cache 本身，每个 rank 扫描各自分片，再以 flash-decode 方式合并部分注意力结果；由于 decode 受显存带宽限制，并行读取 KV 可以提高可达 token 速率。',
    significance:
      '张量并行会在每个 rank 上复制完整 KV cache，数据并行注意力则把会话绑定在持有其分片的 rank 上，两者在上下文达到几十万 token 时都难以扩展。上下文并行直接针对这一点，而且收益随输入长度增长，而不是随 batch 大小增长。',
    benchmarkContext:
      'InferenceX 在数据点提示框和并行标签中与 TP、EP、DP 一起展示 DCP 与 PCP 的并行度。各厂商支持程度并不均衡：在 AgentX 1.0 结果发布时，vLLM 支持矩阵中 AMD 的注意力后端仍标为不支持，因此该技术仍构成 CUDA 实际优势的一部分。',
  },
  'kv-cache-offload': {
    term: 'KV cache offload',
    aliases: ['KV cache offload', 'CPU offload', 'KV 卸载'],
    plainEnglish:
      '把芯片放不下的注意力状态暂存到主机内存，长会话下一轮就能直接恢复，而不必整段重算。',
    definition:
      'KV cache offload 把 KV block 从加速器显存移到更慢的存储层（通常是主机 DRAM），并在后续请求复用该前缀时再读回来。',
    explanation:
      'offload 通常实现为写穿缓存：写入 HBM 缓存的前缀会同时写入较慢的一层，因此当 offload 池容量大致是 HBM 的 1.5 到 3 倍时效果最好。在 agentic 的上下文长度下，重新载入长前缀远比重算划算；但对短提示词结论相反，传输开销会超过它省下的 prefill。',
    significance:
      '长 agentic 会话超出 HBM 中 KV 容量的时间，远早于超出合理的 DRAM 预算，因此 offload 决定了有多少并发对话仍可恢复。它也会转移瓶颈：前缀能够留存之后，store 与 load 路径、传输批量化和索引记账才是值得优化的开销。',
    benchmarkContext:
      'InferenceX 会给每个使用了 offload 的数据点加上虚线光环，无论它是否位于 Pareto 前沿；点详情视图还会给出 offload 类型、引擎，以及芯片与 CPU 两侧的缓存命中率。offload 属于允许但可选的优化，因此同一条曲线上可以同时存在启用和未启用的数据点。',
  },
  'kv-cache-manager': {
    term: 'KV cache 管理器',
    aliases: ['KV cache manager', 'Mooncake', 'LMCache', 'HiCache'],
    plainEnglish:
      'KV cache 管理器负责把注意力状态存放在芯片之外，并决定哪些保留、哪些淘汰、什么时候取回。',
    definition:
      'KV cache 管理器是位于推理引擎之下的可插拔层，负责跨存储层级保存可复用的 KV block，并管理其放置、淘汰与传输。',
    explanation:
      '引擎对外提供 connector 接口，因此 Mooncake Store、LMCache、SGLang HiCache 等管理器可以服务不同运行时。管理器按前缀哈希为 block 建立索引，把它们放在主机 DRAM、本地 NVMe 或远端后端；实际的字节搬运由 Mooncake Transfer Engine、NIXL 等传输引擎完成。同一个引擎内部可以并存多条路径。',
    significance:
      '一旦工作负载大量复用前缀，这一层的正确性和记账就和内核速度同等重要。混合注意力模型更难处理：一个模型同时携带形状和生命周期都不同的多个 cache group，而假设单一 block 几何结构的 connector 无法描述它们。',
    benchmarkContext:
      'InferenceX 把 KV offload 引擎记录为运行元数据，并在 AgentX 点详情视图中展示。框架标签给出的是组合而不是单个引擎，因此一套方案会显示为 Mooncake ATOMesh 或 MoRI SGLang，而不只是引擎名。',
  },
  'kv-aware-routing': {
    term: 'KV 感知路由',
    aliases: ['KV-aware routing', '缓存感知路由', '会话亲和性'],
    plainEnglish: 'KV 感知路由把请求发给已经持有该会话状态的 worker，而不是发给当前最空闲的那个。',
    definition: 'KV 感知路由依据已缓存前缀状态所在的位置来选择 worker，而不是只看队列深度或负载。',
    explanation:
      '不带可复用历史的请求发给谁都行，此时只需考虑负载均衡；但带着数 MB 已缓存前缀的请求不同，把它发给没有该前缀的空闲 worker，就要为整条提示词再付一次代价。因此 router 会跟踪 cache 事件、按会话哈希到固定 worker，并让数据并行 rank 对其持有状态的会话保持粘性。',
    significance:
      '在数据并行注意力下，每个 rank 只拥有缓存池的一部分，长会话一旦落到错误的 rank 上就要全部重算，实测命中率会远低于理论上限。仅有亲和性也不够：不加约束的粘性会把负载集中到单个热点 worker，因此缓存均衡也必须进入路由打分。',
    benchmarkContext:
      '路由位于引擎之外，因此 InferenceX 把它视为方案的一部分：Dynamo vLLM、llm-d vLLM、Mooncake ATOMesh 这类标签同时标明编排层和运行时。它的开销正比于在线前缀的数量和长度，而不是生成的 token 数，所以在内核变快之后，它可能成为 agentic 流量下的瓶颈。',
  },
  tilert: {
    term: 'TileRT',
    aliases: ['TileRT engine', 'TileRT 引擎'],
    plainEnglish:
      'TileRT 是面向极低延迟单用户生成的推理运行时，它把模型编译成一个常驻程序，而不是许多次内核启动。',
    definition:
      'TileRT 是一款推理引擎，通过取消以单个 kernel 作为执行单元的范式，来实现超低延迟服务。',
    explanation:
      '常规运行时每个 decode 步骤都要依次派发一串 kernel，而在极小 batch 下，kernel 之间的启动与调度开销会盖过实际算术运算。常驻的 engine kernel 把工作保留在加速器上，这正是交互性坐标轴最右端得以企及的原因。',
    significance:
      '前沿曲线的高交互性一端与高吞吐一端是不同的工程问题，为其中一端调优的引擎很少能同时拿下另一端。对延迟敏感的产品来说，能达到每用户每秒数百 token 的方案很有价值，即便它的单芯片总吞吐量并不突出。',
    benchmarkContext:
      'InferenceX 将 TileRT 作为独立的框架标签，并在每个 SKU 最佳配置视图中特意保留它；否则只按吞吐量取胜的曲线会丢掉 TileRT 真正服务的那些运行点。比较时请在匹配交互性下进行，而不要只看峰值吞吐量。',
  },
  recipe: {
    term: '测试配置',
    aliases: ['recipe', '配置方案', '服务配置'],
    plainEnglish:
      '一套测试配置就是产生某条曲线的全部选择：模型、引擎、镜像、精度、并行策略和工作负载。',
    definition:
      '测试配置是指产生一条实测曲线所需的完整组合：模型、推理引擎与容器镜像、数值精度、并行策略、芯片系统和工作负载。',
    explanation:
      'InferenceX 上的每个数据点都属于某套测试配置，对同一套配置做并发扫描就画出它的曲线。改动其中任何一项都会得到另一套配置，而不是同一套配置的变体，因此升级引擎镜像会作为独立结果上报，而不会并入既有曲线。',
    significance:
      '芯片峰值规格无法描述服务性能，同一颗芯片在不同配置下可以相差数倍。把整套组合写清楚，结论才可核查：脱离配置的单个数字既无法复现，也无法与其他厂商公平比较。',
    benchmarkContext:
      'InferenceX 的测试配置主要跟随 vLLM 与 SGLang 官方 cookbook，并使用上游镜像，因此结果反映用户实际能部署的性能，而不是为基准测试特调过的镜像。数据点的提示框会展示背后的配置，并给出运行溯源链接。',
  },
  'tail-latency': {
    term: '尾部延迟',
    aliases: ['tail latency', 'p90', 'p99', '分位数延迟'],
    plainEnglish:
      '尾部延迟描述的是最慢的那部分请求，而不是典型请求，因为用户真正会注意到的正是这些。',
    definition: '尾部延迟是请求分布高分位处的延迟，例如 p90 或 p99，而不是均值或中位数。',
    explanation:
      '分位数回答的问题与平均值不同。p90 为 5 秒意味着每 10 条请求中至少有 1 条等了这么久，而这条请求可能正是卡住某个 agent 继续执行的那一条。真实服务中的延迟分布高度偏斜，均值可能远低于尾部，从而把问题完全掩盖。',
    significance:
      '容量规划通常按分位数而不是平均值来定，因为一个平均很快、尾部很慢的服务，对用户来说依然是不合格的。某些优化还会在改善均值的同时恶化尾部，而单一汇总数字只会把它记成一次明确的胜利。',
    benchmarkContext:
      'InferenceX 上报的指标都带分位数限定，并在坐标轴上标明，因此 p90 TTFT 与平均 TTFT 不会混在同一次比较里。agentic 运行的分布尤其偏斜，因为端到端延迟随输出长度增长，最长的生成会主导尾部。',
  },
  'service-level-objective': {
    term: '服务级目标',
    aliases: ['service level objective', 'SLO', '延迟目标'],
    plainEnglish: 'SLO 是一套部署必须兑现的性能承诺，例如十条请求中有九条要在一秒内返回首 token。',
    definition: '服务级目标是对某个服务指标设定的目标值，通常表示为对延迟或交互性的分位数约束。',
    explanation:
      '一条有用的 SLO 会同时给出指标、分位数和阈值。此时服务容量就是系统在不违反该约束的前提下能维持的吞吐量，它小于峰值吞吐量，也是运营方唯一可以据以规划容量的数字。',
    significance:
      '吞吐量曲线上的每个点都是可达的，但只有一部分满足既定承诺。两套系统的峰值吞吐量可能很接近，而在交互性或首 token 约束下能保留多少吞吐量却相差悬殊。',
    benchmarkContext:
      'InferenceX 不强加统一的行业 SLO，因为可接受的目标因产品而异：交互式编程需要较高的 token 速率，批处理则可以容忍数秒的首 token 延迟。请按自己的阈值读取前沿曲线，而不要直接比较峰值。',
  },
  'acceptance-length': {
    term: '接受长度',
    aliases: ['acceptance length', 'AL', '接受率'],
    plainEnglish:
      '接受长度是指每次验证中完整模型实际认可的草稿 token 数，它决定了投机解码是否划算。',
    definition: '接受长度是目标模型在一次验证中平均接受的投机草稿 token 数量。',
    explanation:
      '只有草稿能通过验证，投机解码才会省时间。接受长度接近 1 意味着起草与验证这套机制白跑了一趟；数值较高则能把一次昂贵的目标模型计算摊薄到多个输出 token 上。该数值取决于 speculator、草稿长度、模型本身以及正在生成的内容。',
    significance:
      '正因为接受率取决于内容，基准测试有可能在无意中左右结论。合成或匿名化文本对于在真实语料上训练的 speculator 而言属于分布外数据，实测接受率会朝任一方向偏离生产环境的真实值。',
    benchmarkContext:
      'AgentX 回放的是填充了合成 token 的匿名化 trace，因此不让接受率由这些内容自行决定。运行时改为套用一组固定接受长度，按模型、speculator、草稿长度和思考模式在外部 agentic 编码数据集上采集，从而保持厂商中立。',
  },
  'unofficial-run': {
    term: '非官方运行',
    aliases: ['unofficial run', '非官方 overlay', '社区运行'],
    plainEnglish: '非官方运行是尚未入库到已发布数据集的基准运行，但仍可通过 URL 叠加绘制在图表上。',
    definition:
      '非官方运行是指通过运行 ID 以 overlay 形式加载进仪表板的 CI 基准运行，其数据不来自已发布的数据库。',
    explanation:
      '在页面 URL 中加上运行 ID，就会拉取该次运行，并用专门的 overlay 配色把它的数据点、roofline 和表格行画在官方数据旁边。overlay 走的是独立的渲染路径，因此可以按硬件类型开关，也可以按运行逐个关闭，而不影响下方的官方数据选择。',
    significance:
      '结果发布通常滞后于产出，而正在调优某套配置的贡献者，需要在决定是否入库之前先看到新曲线与当前前沿的对比。overlay 让尚未定稿的运行可被审阅，同时不赋予它已发布测量结果的地位。',
    benchmarkContext:
      'overlay 的配色来自按运行序号分配的调色板，而不是硬件配色，因此不会被误认为官方数据。部分视图依赖只在入库运行中持久化的数据，这些视图会明确说明 overlay 不可用，而不是默默略过。',
  },
  'chunked-prefill': {
    term: '分块 prefill',
    aliases: ['chunked prefill', '分块预填充'],
    plainEnglish:
      '分块 prefill 把长提示词分片读取，而不是一次性读完，这样其他用户在此期间仍能持续收到 token。',
    definition:
      '分块 prefill 把提示词处理切分为固定大小的 token 分块，由调度器与正在进行的 decode 工作交错执行。',
    explanation:
      '不切分的 prefill 会占用加速器直到整条提示词处理完，所有正在流式输出的用户都得排在后面。切分之后调度器可以交替执行，让 decode 在分块之间继续推进。分块大小是一个调优旋钮：分块越大 prefill 效率越高，分块越小对 decode 的打断越少。',
    significance:
      '这项技术把某一个用户的首 token 问题，转换成对所有人来说小而平稳的开销，通常是更划算的取舍。提示词越长它越重要：单条不切分的十万 token prefill 足以让整套部署卡住。',
    benchmarkContext:
      '分块大小属于测试配置的一部分，同一条曲线上不同点的取值也可能不同，因此吞吐量的跳变有可能来自重新调参而不是新硬件。长的 agentic 提示词让这个参数变得关键，而定长短提示词场景根本暴露不出这一点。',
  },
  roofline: {
    term: 'Roofline 曲线',
    aliases: ['roofline', '前沿包络', 'roofline 曲线'],
    plainEnglish:
      '在 InferenceX 上，roofline 是按硬件配置在其最优点上画出的外包络线，用来展示它达到过的边界。',
    definition:
      'InferenceX 上的 roofline 是按硬件配置绘制的 Pareto 包络曲线，穿过该配置在当前所选坐标轴下未被支配的数据点。',
    explanation:
      '哪个角算“最好”取决于所选指标：吞吐量对交互性取右上角，而成本类指标数值越低越好，因此包络会锚定在所选指标组合定义的那个角上。x 值退化的点不具备入选资格，但在显示全部数据点的视图中仍会绘制。',
    significance:
      '直接看一团原始数据点容易挑选有利结果，因为调优不佳的配置也会贡献一些运营方绝不会选择的点。包络线展示的是每套系统可达的边界，而容量决策正是依据这个形状做出的。',
    benchmarkContext:
      '这与 HPC 中经典的 roofline 模型不同：后者把可达 FLOPS 与算术强度放在一起，用于判断计算受限还是访存受限，仪表板只借用了“上界”这一图形表达。roofline 方向按指标配置，因此同一批数据点在不同坐标轴下会得到不同的包络。',
  },
  'arithmetic-intensity': {
    term: '算术强度',
    aliases: ['arithmetic intensity', '运算强度', '计算访存比'],
    plainEnglish: '算术强度表示每搬运一个字节能做多少次运算，它决定瓶颈落在计算单元还是显存上。',
    definition: '算术强度是一次计算所执行的算术运算次数与其在显存和计算单元之间搬运的字节数之比。',
    explanation:
      'prefill 会用同一份权重处理大量 token，每个载入的字节都被反复复用，因此通常是计算受限的。decode 每一步每条序列只产出一个 token，却仍要读取权重和 KV cache，搬运了大量数据却只做很少运算，因此通常受显存带宽限制。',
    significance:
      '两个阶段受限于芯片的不同部分，这解释了为什么峰值 FLOPS 亮眼的规格书在 decode 上可能令人失望，也解释了 batching 为何有效：把多条序列合并会提高算术强度，因为每次权重读取被更多 token 复用。',
    benchmarkContext:
      '这一区别解释了数据中反复出现的形态。低交互性的点跑大 batch、算术强度高，接近计算上限；高交互性一端跑小 batch，跟随显存带宽，因此带宽更充裕的硬件常常在这里胜出，尽管其峰值吞吐量更低。',
  },
  'prefix-cache-hit-rate': {
    term: '前缀缓存命中率',
    aliases: ['prefix cache hit rate', '缓存命中率', 'KV 复用率'],
    plainEnglish:
      '命中率是指提示词中有多少 token 直接来自缓存而无需重算，在长会话中这通常是绝大部分。',
    definition:
      '前缀缓存命中率是 prefill 阶段由已缓存 KV 状态满足、而非重新计算的输入 token 占比。',
    explanation:
      '命中率必须与产生它的缓存层级一起看才有意义，因为从加速器显存读取的 token 与从主机内存取回的 token，代价完全不同。它也不只取决于容量：淘汰策略可能丢掉仍会被用到的前缀，路由也可能把请求发到从未持有该前缀的 worker。',
    significance:
      '在多轮流量下，命中率基本决定了 prefill 的开销，因为每一轮都会把整段对话再加一点新内容重新发过来。一旦复用率很高，剩余的 prefill 工作就主要是真正的新 token，瓶颈也从计算转向缓存管理。',
    benchmarkContext:
      'AgentX 点详情视图会按缓存层级分别展示命中率随时间的变化，并给出 prompt token 来源拆分。如果一个数据点在低命中率下报出很高的总吞吐量，说明它做的 prefill 工作远多于缓存良好的部署。',
  },
  warmup: {
    term: 'Warmup',
    aliases: ['warmup', 'warmup 阶段', '缓存预热'],
    plainEnglish: '性能采集开始前先做一轮预热，让系统进入稳态，而不是在缓存为空的状态下被打分。',
    definition:
      'warmup 是性能采集窗口之前的阶段，基准测试在此期间预热缓存并进入稳态，该阶段的请求不计入上报结果。',
    explanation:
      '冷启动系统在两方面都不像生产环境：缓存是空的，而且所有会话都从第 0 轮开始会造成同步的突发流量，这在真实部署中并不存在。因此 AgentX 会让每个对话从其历史中一个按 seed 选定的位置开始，先回放重建该状态所需的请求，再让每条回放通道继续前进若干请求，然后才开始测量。',
    significance:
      '测量窗口从哪里开始会改变结果。把预热过程算进去，前缀复用会显得比生产环境更差；完全不做预热，依赖缓存的方案则会在一个它们在生产中根本不会遇到的状态下被打分。',
    benchmarkContext:
      'AgentX 点详情视图会把两个阶段分开，便于分别查看遥测数据。warmup 请求的输出被限制为单个 token，因此它们的输出长度约为 1，交互性和 decode 曲线为空：单个 token 没有 token 间延迟。',
  },
  aiperf: {
    term: 'AIPerf',
    aliases: ['AIPerf', '回放框架', '负载生成器'],
    plainEnglish:
      'AIPerf 是发送基准流量的厂商中立客户端，负责重建录制的 agent 会话并记录每条请求的时序。',
    definition: 'AIPerf 是驱动 AgentX 运行、面向服务端点的开源 HTTP 负载生成与回放框架。',
    explanation:
      '它把每个会话重建为有向无环图：节点是请求，边携带依赖请求发出前需要等待的延迟。这一结构可以复现主智能体轮次、并行且稍后汇合的子智能体分支、一次性的辅助请求，以及轮次之间的工具调用停顿，而这些都是扁平的提示词列表无法表达的。',
    significance:
      '客户端本身就是测量的一部分。无法表达依赖关系的框架，会把 agentic 工作负载当成互相独立的请求发出，从而抹掉这个场景本要考察的突发性与复用特征。保持厂商中立同样重要，可以避免负载生成器偏向某一套服务栈。',
    benchmarkContext:
      'seed 固定了采样哪些对话、每个对话从哪里开始，以及用于填充匿名化 block 的合成内容，因此同一套配置重跑会回放同样的工作负载。同一模型的所有提交都运行相同的框架次版本，以保证结果可比。',
  },
  'pipeline-parallelism': {
    term: '流水线并行',
    aliases: ['pipeline parallelism', 'PP', '层间并行'],
    plainEnglish: '流水线并行让每颗芯片负责一部分层，沿链条传递激活值，而不是把每一层都切开。',
    definition:
      '流水线并行按层切分模型并分配到多个加速器上，每个阶段执行自己的层，并把激活值传给下一个阶段。',
    explanation:
      '通信是阶段边界处激活值的点对点交接，比张量并行所需的逐层集合通信便宜得多。代价是空闲：只有一条请求在途时，除当前阶段外其余阶段都在等待，只有持续的并发流量才能把流水线填满。',
    significance:
      '对最大的那批模型来说，这首先是容量手段，其次才是提速手段。有些前沿模型根本装不进单个节点，流水线并行才让它们可服务；当某项竞争性优化拒绝与任何方案组合时，它甚至是唯一选项。',
    benchmarkContext:
      'InferenceX 在数据点提示框和并行标签中与 TP、EP、DP 一起展示流水线并行度，且仅在大于 1 时显示。可组合性与并行度同样重要：一种会导致投机解码无法启用的阶段切分，代价可能超过它节省的显存。',
  },
  'dp-attention': {
    term: '数据并行注意力',
    aliases: ['DP attention', 'DPA', '注意力数据并行'],
    plainEnglish:
      'DP attention 让每个 rank 处理各自的一批序列并持有自己的缓存，而不是每个 rank 都存同一份副本。',
    definition:
      '数据并行注意力让每个 rank 在互不重叠的序列集合上各自计算注意力，因此每个 rank 拥有 KV cache 的私有份额，而专家层仍然共享。',
    explanation:
      '张量并行的注意力按 head 切分，在 head 数较少时会在各 rank 之间复制 KV 状态，浪费容量。DP attention 改为把整条序列分配给某个 rank，从而避免这种重复。各 rank 仍共同参与 MoE 集合通信，因此注意力是本地的，而专家分发仍是全局的。',
    significance:
      '由于每个 rank 只拥有缓存池的私有一份，请求落在哪里就成了影响性能的关键：长会话一旦被路由到不持有其前缀的 rank，就要全部重算。此时实测命中率会远低于理论上限，而原因与缓存大小毫无关系。',
    benchmarkContext:
      'InferenceX 会在数据点提示框的并行策略部分展示 DP attention。它是否有利取决于模型；当缓存局部性变成路由约束时，不启用它的配置有时反而占据前沿曲线。',
  },
  int4: {
    term: 'INT4',
    aliases: ['INT4', '4 位整数', 'W4A16'],
    plainEnglish:
      'INT4 用 4 位整数存放权重，把模型压小，让缺少原生 4 位浮点支持的硬件每个 token 少搬很多数据。',
    definition:
      'INT4 是主要用于权重量化的 4 位整数格式，通常为每一组数值配一个更高精度的缩放因子。',
    explanation:
      '整数格式的取值是均匀分布的，不像浮点那样疏密不一，因此 INT4 依赖分组缩放因子来跟踪每一块权重的局部数值范围。激活值通常保持更高精度，矩阵乘法在计算时实时反量化，这使得该技术更多是访存优化而不是算力优化。',
    significance:
      '它在缺少 4 位浮点硬件支持的平台上最有价值。在这类硬件上，INT4 是落地 4 位权重的现实路径，但通常比原生格式更依赖细致的校准，其精度必须实测验证而不能想当然。',
    benchmarkContext:
      'InferenceX 把 INT4 与 FP4、FP8、BF16 并列为独立的精度键，精度属于测试配置而不是显示选项。把 INT4 与原生 FP4 方案对比时，务必同时查看精度评估结果，因为两种格式并不等价。',
  },
  bf16: {
    term: 'BF16',
    aliases: ['BF16', 'bfloat16', 'brain float 16'],
    plainEnglish: 'BF16 是多数模型训练所用的 16 位格式，用它做推理也是量化方案精度对照的基准。',
    definition:
      'BF16 是一种 16 位浮点格式，指数范围与 FP32 相同而尾数更短，广泛用于训练，也常作为未量化的推理基线。',
    explanation:
      '保留 FP32 的指数范围，使 BF16 能很好地容纳 transformer 激活值的数值分布，格式转换很少需要窄格式所依赖的缩放机制。它牺牲的是精度而不是范围，体积是 FP8 的两倍、4 位格式的四倍。',
    significance:
      '在基准测试中它通常扮演参照系。decode 阶段以权重读取为主，因此 BF16 方案每个 token 搬运的数据远多于量化方案，往往位于吞吐量曲线更低的位置，同时定义了其他方案所对照的精度水平。',
    benchmarkContext:
      'InferenceX 把 BF16 作为精度键，并在规格页给出每个加速器的 BF16 稠密峰值算力。量化方案会通过精度评估验证，而不是默认无损，这正是 BF16 对照有意义的前提。',
  },
  'kv-cache-quantization': {
    term: 'KV cache 量化',
    aliases: ['KV cache quantization', 'FP8 KV cache', '量化 KV'],
    plainEnglish: '把对话缓存用更小的格式存放，让芯片装下更多上下文，并在生成时更快地把它读回来。',
    definition:
      'KV cache 量化用降精度格式存放注意力的 key 与 value 状态，与模型权重所用精度相互独立。',
    explanation:
      '权重精度与缓存精度是两个独立选择，一套方案可以用 FP8 权重搭配 BF16 缓存，反过来也可以。缓存位宽减半，加速器显存能容纳的 token 数大致翻倍，每个 decode 步骤要读取的字节数也减半，而这正是 decode 大部分时间在做的事。',
    significance:
      '在长上下文服务中，这往往比压缩权重更划算，因为高并发下最先耗尽显存的是缓存而不是权重。不同模型对精度的敏感度不同，量化 key 还是 value 也有差别，因此需要实测评估而不能一概而论。',
    benchmarkContext:
      '缓存精度属于测试配置的一部分，实践中还存在混合布局：有些模型会保留两份位宽不同的缓存缓冲区，分离式传输路径必须把它们成对搬运。阅读显存容量相关的结论时，请连同其背后的缓存格式一起看。',
  },
  'sliding-window-attention': {
    term: '滑动窗口注意力',
    aliases: ['sliding window attention', 'SWA', '局部注意力'],
    plainEnglish:
      '滑动窗口注意力让某些层只看最近一段 token，因此窗口填满之后它的缓存就不再继续增长。',
    definition:
      '滑动窗口注意力把每个 query 限制在固定长度的前文范围内，从而限定该层需要保留的 KV 状态。',
    explanation:
      '由于窗口长度固定，这类层的缓存会达到上限而不会随对话增长，较早的条目会随窗口推进被移出。模型通常把这类层与全注意力层交错排列，这样远距离信息在网络中仍有通路，而大多数层保持低成本。',
    significance:
      '有界的开销带来了分配器层面的问题。窗口页不断翻转，而持久的前缀页静止不动；当两者取自同一个池子时，短暂分配往往会把有价值的那份挤出去，于是长会话可能因为短命的窗口状态而丢失昂贵的全注意力历史。',
    benchmarkContext:
      '这些效应只在多轮流量中出现。单条短提示词既不会让窗口绕过前缀，也不会造成池子争用，因此窗口感知的淘汰、offload 和分叉处理都表现为由 AgentX 推动的引擎工作，而不是定长场景的测试结果。',
  },
  'hybrid-attention': {
    term: '混合注意力',
    aliases: ['hybrid attention', '混合缓存模型'],
    plainEnglish:
      '混合模型在不同层使用不同的注意力类型，因此它的缓存是几种不同状态，而不是一块统一的数据。',
    definition:
      '混合注意力模型交错使用不同类型的注意力层，从而产生形状和生命周期各不相同的多个 KV cache group。',
    explanation:
      '统一模型每个 token 只有一种缓存布局，用单一 block 几何结构就能描述所有需要保存的内容；混合模型则不然：全注意力层、窗口层，以及循环或压缩状态同时存在，各有各的占用、各有各的丢弃时机，能否重建也不一样。',
    significance:
      '在状态需要离开加速器之前，这一区别是看不出来的。假设单一布局的 connector 无法说明某个 block 属于哪一组，因此会话最长的那些模型一度反而完全用不了 offload。循环状态最棘手，因为它累积了此前的全部内容，无法从相邻 token 重算。',
    benchmarkContext:
      'InferenceX 测试矩阵中的前沿开放权重模型越来越多采用混合结构，因此引擎对混合 cache group 的支持本身就是测试内容的一部分。offload、分离式传输和前缀复用都必须逐组扩展，而不能从统一结构的情形直接继承。',
  },
  'linear-attention': {
    term: '线性注意力',
    aliases: ['linear attention', 'GatedDeltaNet', '常数状态注意力'],
    plainEnglish:
      '线性注意力保存一份固定大小的运行摘要，而不是全部历史 token，因此内存不会随对话增长。',
    definition:
      '线性注意力用一个大小恒定、随 token 到达而更新的循环状态，替代不断增长的 key 与 value 缓存。',
    explanation:
      '标准注意力保存的状态与序列长度成正比，且每一步都要重新读取。线性或门控循环层改为携带固定大小的状态，用对每个位置的精确回忆换取有界的内存占用。GatedDeltaNet 这类结构只在部分层这样做，其余层保留全注意力，以维持精确的远距离查找能力。',
    significance:
      '在长上下文下，节省的存储相当可观，但这种状态改变了缓存的含义：它无法像窗口尾部那样由周围 token 重建，一旦丢弃就只能重放整个序列，因此复用需要显式的检查点机制，而不是普通的 block 复用。',
    benchmarkContext:
      'InferenceX 服务的模型中已有采用这类层的，引擎对循环状态的检查点与传输支持属于测试配置的一部分。一个模型可以在 day 0 就能被服务，却仍不支持这类状态的复用，表现为重复轮次上出乎意料的高 prefill 开销。',
  },
  nvl72: {
    term: 'NVL72',
    aliases: ['NVL72', 'GB200 NVL72', 'GB300 NVL72', '机架级系统'],
    plainEnglish:
      'NVL72 是一个机架，其中 72 个加速器共享同一张高速网络，因而更像一台大机器而不是一个集群。',
    definition:
      'NVL72 是 NVIDIA 的机架级系统，把 72 个加速器放进同一个 NVLink scale-up 域，而不是分散在多个八芯片节点中。',
    explanation:
      '仪表板的规格数据记录为 NVLink 5.0、每颗芯片 900 GB/s 单向带宽、scale-up world size 为 72，并通过 NVSwitch 交换。常规节点把同样的带宽限定在八颗芯片之间，超出后就要退回更慢的 scale-out 网络，因此差别不在于原始速度，而在于换用另一种网络之前能触及多少颗芯片。',
    significance:
      '开销以集合通信为主的技术，在大规模 scale-up 域中经济性会发生变化。宽专家并行把专家分散到许多芯片上，每个 token 都要付出 all-to-all 流量；在 scale-up 带宽下这可以承受，在 scale-out 网络上往往不行。',
    benchmarkContext:
      '机架级优势并非自动成立。更高的单芯片成本必须被赚回来，而在 agentic 流量下，编排层可能比网络更早成为瓶颈；因此对于不怎么用到宽并行的模型，NVL72 配置在按 TCO 归一化的吞吐量上有时会落后于八芯片节点。',
  },
  atom: {
    term: 'ATOM',
    aliases: ['ATOM', 'AMD ATOM', 'ATOMesh'],
    plainEnglish:
      'ATOM 是 AMD 自研的推理引擎，是它在厂商专用运行时这条路线上的答案，而非上游开源引擎。',
    definition:
      'ATOM 是 AMD 面向 Instinct 加速器的推理引擎，与 ROCm 上的上游 vLLM、SGLang 并列，定位为厂商自有运行时。',
    explanation:
      '它对 AMD 的意义，与厂商运行时对 NVIDIA 的意义相同：针对自家硬件调优，且可以跑在上游引擎前面。它的 router 名为 ATOMesh，最初是 SGLang router 的一个分支。该引擎最初面向单轮服务设计，因此支持长上下文多轮场景需要对其缓存管理器和 kernel 做大量改造。',
    significance:
      '厂商引擎可以在开源栈跟上之前展示硬件的能力上限，这既是有价值的证据，也是不便直接照搬的建议。多数实验室部署的是上游引擎，因此只在厂商运行时下成立的结果，并不能代表这些用户实际拿到的性能。',
    benchmarkContext:
      'InferenceX 把 ATOM 作为独立的框架标签，避免与同一加速器上的 vLLM 或 SGLang 结果混为一谈。想知道硬件能做到什么，就拿它与其他厂商运行时比较；想知道客户今天能部署什么，就拿它与上游引擎比较。',
  },
  aiter: {
    term: 'AITER',
    aliases: ['AITER', 'AMD AITER', 'ROCm kernel 库'],
    plainEnglish:
      'AITER 是 AMD 调优过的 kernel 库，决定注意力和矩阵运算在 Instinct 芯片上究竟能跑多快。',
    definition:
      'AITER 是 AMD 面向 Instinct 加速器的优化 kernel 库，供运行在 ROCm 上的推理引擎调用。',
    explanation:
      '引擎负责表达策略，kernel 决定它是否够快。AITER 提供调优过的注意力、矩阵和融合算子，引擎会用它替代通用路径。这个分发决策本身也可调优，而且在某种 shape 上取胜的 kernel 在另一种 shape 上可能落败，因此选择可能取决于上下文长度，而不是固定不变。',
    significance:
      '并行策略只有在 kernel 能表达时才算数，这正是 AMD 上的上下文并行和长上下文稀疏注意力以 kernel 工作而非引擎工作形式出现的原因。超大缓存还会暴露短请求根本触及不到的问题，例如缓存池跨过某个容量边界后地址运算溢出，从而静默访问错误的行。',
    benchmarkContext:
      '该库位于测试配置所固定的容器镜像内部，因此 AITER 的改进可以在引擎版本和硬件都不变的情况下推动曲线上移。在统一 shape 上实测到的 kernel 级收益，未必能在 agentic trace 上留存，缓存与调度带来的波动可能将其淹没。',
  },
  flashinfer: {
    term: 'FlashInfer',
    aliases: ['FlashInfer', '注意力 kernel 库'],
    plainEnglish: 'FlashInfer 是一个注意力 kernel 库，服务引擎直接调用它，而不必自己实现注意力。',
    definition:
      'FlashInfer 是开源的注意力 kernel 与后端库，供推理引擎在 prefill、decode 和投机验证中使用。',
    explanation:
      '推理特有的复杂性大多集中在注意力上：分页缓存、变长序列、分组 query head、稀疏模式，以及对草稿 token 的验证，都会改变 kernel 的形态。共享库让多个引擎复用同一份调优实现，引擎则按 shape 和硬件目标选择后端。',
    significance:
      '由于后端是被选择而不是固定的，kernel 的可用性就变成了可移植性问题。只为某一家厂商后端实现的功能，会让另一方退回通用路径；而在长上下文下，这不是小小的妥协，而是选错了 kernel。',
    benchmarkContext:
      '所使用的后端属于测试配置的一部分，改动它可以在硬件和引擎版本都不变的情况下推动曲线变化。正是这些 kernel 支持了循环状态的检查点，混合模型才得以参与前缀复用。',
  },
  'cuda-graphs': {
    term: 'CUDA graph',
    aliases: ['CUDA graphs', 'graph capture', 'full-graph 模式'],
    plainEnglish: 'CUDA graph 把一整串芯片操作录制一次并整体回放，从而免去逐个启动它们的开销。',
    definition:
      'CUDA graph capture 把一串 kernel 启动及其依赖关系录制成可回放的图，从而一次性提交整段序列，而不是逐个算子启动。',
    explanation:
      '一个 decode 步骤会发出许多小 kernel，在小 batch 下它们之间的启动与调度开销可以与实际运算相当。把整步录制下来即可消除这部分逐次启动的开销。代价是图是固定的：shape 必须稳定，因此引擎会按分桶分别录制，并把真正动态的部分留在图之外。',
    significance:
      '这更多是延迟优化而不是吞吐量优化，恰恰在 batch 很小、交互性很高的场景最有价值。它也会与一切改变 shape 的因素相互作用，因此变长的 agentic 流量可能击垮过度特化的运行时，使其几乎为每个请求重新编译。',
    benchmarkContext:
      'graph 的使用方式取决于测试配置所固定的引擎镜像，因此它可以在硬件不变的情况下推动曲线变化。有些方案会录制稳定的算子，同时让依赖请求的注意力保持 eager 执行，这是在录制覆盖率与 shape 灵活性之间的有意折中。',
  },
  goodput: {
    term: 'Goodput',
    aliases: ['goodput', '有效吞吐量', 'SLO 约束吞吐量'],
    plainEnglish:
      'Goodput 只统计满足延迟目标的那部分工作量，看起来很快但赶不上截止时间的系统拿不到任何分数。',
    definition:
      'Goodput 指满足既定服务等级目标（SLO）的那部分吞吐量，例如首 token 时间上限或每用户每秒最低 token 数。',
    explanation:
      '原始吞吐量只关心服务器完成了多少请求，不管每个用户被服务得多慢。Goodput 先做一层过滤：只有满足运营方承诺的延迟或交互性约束的请求才被计入。两套吞吐量完全相同的系统，加上截止时间后 goodput 可能相差很大，因为一套在高负载下仍能压住延迟，另一套则让排队把所有请求都拖过界。',
    significance:
      '忽略 goodput 的容量规划要么多买要么超卖。若运营方按峰值吞吐量报价，但只有一半流量能在 SLO 内完成，实际需要的集群规模就是模型估算的两倍。goodput 是把基准测试曲线换算成部署真实承载用户数的那个数字。',
    benchmarkContext:
      'InferenceX 发布完整的吞吐量对交互性 Pareto 前沿，而不是单一 goodput 数字，读者可以套用自己的 SLO。像 TCO 计算器那样在固定交互性档位上读取前沿，本质上就是在该档位测量 goodput。',
  },
  'model-flops-utilization': {
    term: '模型算力利用率',
    aliases: ['MFU', 'model FLOPs utilization', 'MBU'],
    plainEnglish: 'MFU 把模型实际完成的有效运算与芯片理论峰值运算量相除，得到一个效率百分比。',
    definition:
      '模型算力利用率（MFU）是模型逻辑上需要的浮点运算量与硬件在相同墙钟时间内理论峰值运算量之比。',
    explanation:
      '峰值 TFLOP/s 假设每个 tensor core 每个周期都在满负荷工作，这在实际推理服务中从不成立。kernel 启动间隙、访存停顿、通信等待和不完美的批处理都会让算力闲置，MFU 把这些损耗折算进一个数字。decode 通常是访存受限的，因此 decode 阶段的 MFU 天然偏低，此时带宽版本的 MBU 往往是更真实的效率指标。',
    significance:
      'MFU 把硬件能力与软件成熟度区分开：峰值算力巨大但 kernel 不行的芯片，可能输给算力较低但喂得饱运算单元的芯片。硬件不变而 MFU 上升，正是软件进步的特征，而推理性能的大部分收益正来自软件。',
    benchmarkContext:
      'InferenceX 跟踪的是每颗芯片随时间交付的 token 数而非直接报告 MFU。硬件不变而性能大幅提升的反复出现的模式，例如模型发布数周内的数量级改进，本质上就是软件把利用率追讨回来的过程。',
  },
  'memory-bound-vs-compute-bound': {
    term: '访存受限与计算受限',
    aliases: ['memory bound', 'compute bound', '带宽受限'],
    plainEnglish: '当运算单元是瓶颈时工作负载是计算受限，当等待数据搬运是瓶颈时则是访存受限。',
    definition:
      '当 kernel 的运行时间由算术吞吐能力决定时称为计算受限，由操作数在内存与运算单元之间的搬运速度决定时称为访存受限。',
    explanation:
      '每个 kernel 都有算术强度，即运算次数与访问字节数之比。如果这个比值低于硬件的平衡点，内存系统会先于运算单元饱和。LLM 的 prefill 执行算术强度很高的大矩阵乘法，通常是计算受限；而 decode 为每个请求读取全部权重和 KV cache 只产出一个 token，通常是访存受限。',
    significance:
      '瓶颈资源决定了哪个硬件规格才重要。decode 的访存受限特性解释了为什么每次加速器发布都把 HBM 容量和带宽放在标题上，为什么量化通过减少搬运字节数来加速 decode，以及为什么算力一般但内存很快的芯片能在交互式服务中获胜。',
    benchmarkContext:
      'InferenceX 对并发做扫描，让系统在两种状态之间移动：低并发 decode 受带宽限制，高并发批处理则推向计算极限。每条吞吐量对交互性曲线的形状，反映了该配置发生状态切换的位置。',
  },
  'gpu-utilization': {
    term: 'GPU 利用率',
    aliases: ['GPU utilization', '芯片利用率', '加速器利用率'],
    plainEnglish:
      'GPU 利用率衡量加速器有多忙，但监控工具里常见的百分比可能很高，而真实效率仍然很低。',
    definition:
      'GPU 利用率指加速器用于有效工作的时间或能力占比，口径从粗糙的繁忙百分比到严格的模型算力利用率不等。',
    explanation:
      '基础监控工具里的利用率只说明有 kernel 驻留，不代表芯片被用得好，一个只占用单个计算单元的 kernel 也会显示为繁忙。更严格的度量把实际交付的运算量或带宽与硬件峰值对比。在推理服务中利用率还受流量影响：请求之间的空闲、低并发以及 agent 会话中的工具调用停顿，都会让花钱买来的芯片闲着。',
    significance:
      '集群经济性取决于利用率。批处理和调度做得好的部署与朴素部署之间，同样硬件上每 token 成本常常相差数倍，这正是推理软件和请求路由与芯片本身同样受重视的原因。',
    benchmarkContext:
      'InferenceX 报告每个交互性水平下每颗芯片的实际交付吞吐量而非利用率百分比，因此引擎、精度和并行方案之间的利用率差异，会直接表现为同一硬件上曲线之间的间距。',
  },
  'continuous-batching': {
    term: '连续批处理',
    aliases: ['continuous batching', 'in-flight batching', '动态批处理'],
    plainEnglish:
      '连续批处理让新请求在旧请求完成的瞬间就加入正在运行的批次，而不是等整个批次全部结束。',
    definition:
      '连续批处理是一种在每个生成步都能接纳和退出请求的调度技术，当各序列在不同时刻完成时始终保持批次饱满。',
    explanation:
      '静态批处理先凑齐一组请求、一起运行、一起返回，因此一个批次要等最慢的成员结束。LLM 输出长度差异巨大，这种方式浪费大量算力。连续批处理在每次迭代重组批次：产出最后一个 token 的序列立即离开，排队中的请求在下一步顶上空位，加速器始终保持饱和。',
    significance:
      '这是现代 LLM 服务的奠基性优化之一，也是开源引擎取代朴素部署方式的重要原因。它在给定延迟下成倍提高吞吐量，并与分页式 KV cache 内存天然配合，使得槽位复用非常廉价。',
    benchmarkContext:
      'InferenceX 测试的每个引擎，包括 vLLM、SGLang 和 TensorRT-LLM，都使用连续批处理。并发扫描测量的正是各调度器在批次填满过程中维持交互性的能力，引擎实现之间的差异在这里显形。',
  },
  'paged-attention': {
    term: 'PagedAttention',
    aliases: ['paged attention', '分页 KV cache', 'KV cache 分页'],
    plainEnglish:
      'PagedAttention 像虚拟内存分页一样，把 KV cache 存进固定大小的小块，避免缓存内存浪费在用不到的空间上。',
    definition:
      'PagedAttention 是一种 KV cache 管理技术，通过映射表寻址的固定大小块来分配缓存，而不是为每个请求预留一整块连续区域。',
    explanation:
      '按请求连续分配必须为最长可能输出预留空间，而其中大部分永远用不上。分页借用了操作系统的做法：缓存块随序列增长按需分配，序列结束立即释放，共享相同前缀的序列还能通过写时复制共用缓存块。碎片率降到接近零，同样的 HBM 里能容纳多得多的序列。',
    significance:
      '这个由 vLLM 提出的思想解锁了让连续批处理真正获益的批次规模，并成为各推理引擎的标准做法。约束长上下文和智能体工作负载并发能力的，是有效 KV 容量而不是裸内存大小。',
    benchmarkContext:
      'InferenceX 配置中的所有引擎都以分页或分块形式管理 KV 内存。AgentX 这类长上下文场景的高并发数据点之所以可达，正是因为分页让数百个会话增长收缩时缓存浪费保持很小。',
  },
  'radix-attention': {
    term: 'RadixAttention',
    aliases: ['radix attention', 'radix tree 缓存', '基数树前缀缓存'],
    plainEnglish:
      'RadixAttention 把完成请求的 KV cache 按 token 内容存进基数树，任何新请求都能复用最长匹配前缀。',
    definition:
      'RadixAttention 是 SGLang 的前缀缓存设计，请求结束后把 KV cache 条目保留在基数树中，让共享 token 前缀的请求之间自动复用。',
    explanation:
      '基数树按 token 内容索引缓存片段，一次查找就能定位新请求已被计算过的最长前缀。复用是自动且跨请求的：多轮对话、许多用户共享的系统提示词、从共同历史分叉出的 agent 分支都会命中相同的缓存节点。近期最少使用等淘汰策略约束树占用的内存上限。',
    significance:
      '前缀复用把重复的 prefill 计算变成缓存命中。在每一轮都重发不断增长历史的 agent 流量里，这部分节省可以主导端到端成本。把复用做成结构性能力而不是可选项，是 SGLang 在此类工作负载上表现出色的重要原因。',
    benchmarkContext:
      'InferenceX 的 AgentX 轨迹保留了轮次之间和子智能体分支之间真实的共享前缀结构，因此具备强 radix 式复用能力的引擎在智能体场景中的首 token 时间和吞吐量，会明显好于固定序列场景的预测。',
  },
  'draft-model': {
    term: '草稿模型',
    aliases: ['draft model', 'speculator', '投机草稿模型'],
    plainEnglish:
      '草稿模型是投机解码中那个又小又快的模型，先猜出若干后续 token，交给大模型一次性验证。',
    definition:
      '草稿模型是投机解码中的轻量提议组件，生成候选 token 序列，由目标模型在单次批量前向中完成验证。',
    explanation:
      '草稿有多种形式：同家族的独立小模型、像 EAGLE 那样训练到目标模型上的额外预测头，或某些模型自带的多 token 预测头。草稿廉价地抢先生成几个 token，目标模型一次性检查全部候选，接受的 token 一起输出。被拒绝时回退到目标模型的输出，因此结果与目标分布一致。',
    significance:
      '草稿质量决定接受长度，接受长度决定加速比。匹配良好的草稿能在小批次下把 decode 速度提高数倍，而不匹配或过于激进的草稿会浪费验证算力，高负载下甚至拖慢服务。',
    benchmarkContext:
      'InferenceX 记录每个结果背后的投机方法和接受长度，并发布用于复现的黄金接受长度分布，因为不切实际的接受率是基准测试数字脱离生产行为的经典方式。',
  },
  'offline-inference': {
    term: '离线推理',
    aliases: ['offline inference', 'batch inference', '批量推理'],
    plainEnglish: '离线推理处理一大堆没有用户在等的请求，唯一目标是每美元最多 token，而不是延迟。',
    definition:
      '离线推理是没有交互截止时间的模型服务，请求成批处理，目标是总吞吐量和成本而不是单用户延迟。',
    explanation:
      '合成数据生成、文档处理、embedding 回填和评估扫描都不在乎单个请求何时返回。调度器因此可以放开手脚：跑内存允许的最大批次、按前缀复用最大化的方式排序请求、把加速器压在吞吐量极限上。在线服务处于同一权衡的另一端，用吞吐量换取每个用户不低于某个交互性下限。',
    significance:
      '同一套硬件在离线模式与紧延迟模式之间，每美元 token 数可以相差数倍，所以不说明工作点就报每百万 token 价格几乎没有意义。集群常常因此划分成不同的延迟档位。',
    benchmarkContext:
      'InferenceX 吞吐量对交互性曲线的最右端，即批次最大、单用户速度最低处，近似离线运行。在一条曲线的两端各读一次，就能看到该配置从在线到离线的完整成本区间。',
  },
  'context-window': {
    term: '上下文窗口',
    aliases: ['context window', '上下文长度', '长上下文'],
    plainEnglish: '上下文窗口是模型一次能处理的最大 token 数，涵盖输入和到目前为止生成的全部内容。',
    definition:
      '上下文窗口是模型支持的最大序列长度，约束提示词、对话历史、检索材料与生成输出的 token 总数。',
    explanation:
      '注意力让每个 token 都能引用之前的 token，KV cache 为它们全部保存状态，所以更长的窗口意味着随长度增长的内存和计算开销。位置编码方案和训练长度决定可用窗口，服务栈则必须为其预算 KV 容量。现代前沿模型宣称几十万 token 的窗口，但序列接近上限时吞吐量和交互性都会下降。',
    significance:
      '长上下文让代码 agent、重检索流水线和文档分析成为可能，也让它们的服务成本变高。滑动窗口层、潜在注意力和线性注意力等架构响应，主要就是为了压弯窗口的成本曲线。',
    benchmarkContext:
      'InferenceX 从两个方向覆盖窗口：固定序列场景钉住输入输出长度，例如 8K 输入 1K 输出；AgentX 则回放上下文逐轮增长、逼近真实 agent 工作集的会话。',
  },
  'grouped-query-attention': {
    term: '分组查询注意力',
    aliases: ['GQA', 'grouped-query attention', 'multi-query attention', 'MQA'],
    plainEnglish:
      '分组查询注意力让多个查询头共享一组键值头，在几乎不损失质量的情况下缩小 KV cache。',
    definition:
      '分组查询注意力（GQA）是一种注意力变体，把查询头划分成若干组，每组共享一个键值头，从而降低每 token 的 KV cache 大小和带宽。',
    explanation:
      '标准多头注意力为每个头都保存键和值，缓存大小随头数增长。多查询注意力（MQA）把所有头折叠到一对键值上，最省内存但可能伤害质量。GQA 处于两者之间：一个模型可以用 8 个 KV 头服务 64 个查询头，把缓存缩小八倍。由于 decode 的主要开销就是读取 KV cache，这一节省直接转化为更快的 token 生成。',
    significance:
      'GQA 成为稠密开源模型的默认注意力布局，因为它正面攻击了 decode 真正受限的内存侧。它也为多头潜在注意力等更激进的 KV 压缩方案铺平了道路。',
    benchmarkContext:
      '注意力布局由各模型架构固定，因此 GQA 在 InferenceX 中表现为模型层面每 token KV 字节数的差异，进而塑造相同硬件和引擎版本下可达的并发与交互性。',
  },
  'active-parameters': {
    term: '激活参数',
    aliases: ['active parameters', 'activated parameters', '激活参数量'],
    plainEnglish:
      '激活参数是混合专家模型处理每个 token 时实际用到的权重，只占其庞大总规模的一小部分。',
    definition:
      '激活参数是稀疏模型中参与计算单个 token 的那部分权重，包括共享层加上路由器选中的专家。',
    explanation:
      '一个混合专家模型可能拥有上万亿总参数，但每个 token 只经过几百亿。每 token 计算量随激活参数量增长，这是稀疏前沿模型运行成本可以接受的原因。内存则是另一回事：每个专家都必须驻留在 HBM 里随时待命，所以容量需求和并行方案跟随总参数量，尽管算术量跟随激活参数量。',
    significance:
      '总参数与激活参数之分解释了现代推理服务的大部分经济性：万亿参数模型因此可以部署，专家并行因此要跨多颗芯片，按总参数量比较模型也因此说明不了服务成本。',
    benchmarkContext:
      'InferenceX 测试的 MoE 模型，包括 DeepSeek、Kimi、Qwen 和 MiniMax 家族，激活比都很低，其配置把专家分布到多个节点，正是因为总参数量决定了内存账单。',
  },
  'dense-model': {
    term: '稠密模型',
    aliases: ['dense model', '稠密 Transformer'],
    plainEnglish:
      '稠密模型对处理的每个 token 都动用全部参数，不像稀疏模型那样把 token 路由给少数专家。',
    definition: '稠密模型是所有权重都参与每次前向计算的神经网络，每 token 计算量与总参数量成正比。',
    explanation:
      '稠密 Transformer 是更简单的设计：每一层用全部权重处理每个 token。这让行为可预测、并行策略直接、单位参数的质量表现强，但服务成本随规模线性增长。混合专家模型打破了这一关联，每个 token 只激活一小部分权重，因此最大的前沿模型是稀疏的，而中小模型往往保持稠密。',
    significance:
      '稠密与稀疏之选驱动服务策略。稠密模型占用更少芯片、避开专家路由的复杂性；稀疏模型用大得多的内存占用和更重的跨芯片通信，换取单位算力更高的质量。',
    benchmarkContext:
      'InferenceX 的覆盖以运营方实际部署的大型稀疏前沿模型为中心，Llama 级别的稠密基线则提供对照，展示没有专家路由时张量并行和内存压力的表现。',
  },
  'reasoning-model': {
    term: 'Reasoning 模型',
    aliases: ['reasoning model', '深度思考模型', '思维链模型'],
    plainEnglish:
      'Reasoning 模型在回答前生成很长的隐藏思维链，用额外的输出 token 换取困难问题上更好的结果。',
    definition:
      'Reasoning 模型是被训练成额外花费生成 token 来推演问题的 LLM，在给出最终答案之前或同时产出大量中间推理。',
    explanation:
      '除了扩展训练算力，reasoning 模型还扩展测试时算力：它们用 token 来思考。一个数学或编程问题可能触发数千 token 的内部推演，输出长度相对聊天模型爆炸式增长。对服务而言，负载大幅偏向 decode，每请求的 KV cache 驻留量膨胀，每用户每秒 token 数成为决定难题几秒还是几分钟出答案的指标。',
    significance:
      'Reasoning 把推理变成了扩展前沿：能力现在通过在服务时花更多算力来提升，成倍放大对 decode 吞吐量的需求。它重塑了硬件优先级，转向内存带宽和互连，也是智能体工作负载主导当前基准设计的核心原因。',
    benchmarkContext:
      'InferenceX 测试的前沿模型都具备 reasoning 能力，其场景反映了这类流量：固定序列测试中的长生成，以及 AgentX 中推演与工具调用在多轮之间交织的完整 agent 会话。',
  },
  tokenization: {
    term: 'Tokenization',
    aliases: ['分词', 'tokenizer', 'token', 'BPE'],
    plainEnglish: 'Tokenization 把文本切分成模型实际读写的子词单元，所有性能和价格数字都以它计价。',
    definition:
      'Tokenization 是文本与模型处理的离散 token ID 之间的转换，使用通过字节对编码（BPE）等方法学得的固定词表。',
    explanation:
      'tokenizer 把常见词映射为单个 token，把较罕见的字符串拆成多个，英文平均大约四个字符一个 token。不同模型家族词表不同，同一段文本在不同模型下的 token 数可能差异明显。下游一切都以 token 计价：上下文窗口、KV cache 大小、吞吐量、每 token 延迟和每百万 token 价格，数的都是这个单位而不是字符或单词。',
    significance:
      'token 效率是一个隐藏的价格杠杆：同样内容用更少 token 表达的模型，在相同单价下更便宜。比较供应商或基准测试时不对 tokenizer 差异做归一化，会悄悄扭曲成本和速度结论。',
    benchmarkContext:
      'InferenceX 的指标以 token 计价，其 AgentX 轨迹用确定性合成 token 替换原始文本，同时保留每轮 token 数，因此回放的会话以与源工作负载相同的 token 算术压测服务系统。',
  },
  'sequence-parallelism': {
    term: '序列并行',
    aliases: ['sequence parallelism', 'SP', 'sequence parallel'],
    plainEnglish: '序列并行把一条长序列切分到多颗芯片上，让一个请求的 token 由多个加速器同时处理。',
    definition:
      '序列并行是沿序列的 token 维度在设备间做切分的策略，为超长输入分摊激活内存和注意力计算。',
    explanation:
      '张量并行切分的是权重，序列并行切分的是序列本身：每颗芯片持有一段 token 及对应的激活和 KV 状态。注意力因此需要通信，一颗芯片上的查询必须与其他芯片上的键值相遇，ring 式注意力算法把这些通信与计算重叠。在推理中，密切相关的上下文并行正是几十万 token 上下文的 prefill 变得可行的原因。',
    significance:
      '当单个请求而非批次过大时，序列式切分就是答案：一次百万 token 的 prefill 可能超出任何单芯片的内存和时间预算。它把上下文长度从一堵硬墙变成一个可扩展维度，代价是互连流量。',
    benchmarkContext:
      'InferenceX 记录每个配置的完整并行方案。长上下文智能体场景正是序列和上下文切分选择连同互连质量，把单芯片规格相近的系统明显区分开的地方。',
  },
  'all-gather': {
    term: 'All-gather',
    aliases: ['allgather', '全收集'],
    plainEnglish:
      'All-gather 是一种群体通信操作，结束时每颗芯片都拿到最初分散在所有芯片上的完整数据。',
    definition:
      'All-gather 是一种集合通信操作，每个参与设备贡献自己的分片，所有设备都收到全部分片拼接后的结果。',
    explanation:
      '分片执行经常需要重组完整张量：某些张量并行布局中矩阵乘法前的权重分片，或需要完整隐藏状态的操作之前各设备的激活。All-gather 把每个分片送到每个 rank，通常按 ring 或 tree 调度执行，开销随张量大小和参与者数量增长。它是 reduce-scatter 的对偶操作，两者组合起来就是一次 all-reduce。',
    significance:
      '与 all-reduce、all-to-all 一起，all-gather 是决定并行方案能否扩展的少数几个集合操作之一。它的延迟处在每一使用它的层的关键路径上，这也是芯片间 scale-up 带宽被大力宣传的原因。',
    benchmarkContext:
      'InferenceX 测试的每个多芯片配置都通过其并行方案频繁调用集合操作，而 CollectiveX 工作流直接在多家厂商硬件上测量这类操作，让通信行为可以在完整模型运行之外被比较。',
  },
  'reduce-scatter': {
    term: 'Reduce-scatter',
    aliases: ['reduce scatter', '归约散播'],
    plainEnglish:
      'Reduce-scatter 把每颗芯片上对应位置的数据求和，然后让每颗芯片只保留合并结果中属于自己的那一片。',
    definition:
      'Reduce-scatter 是一种集合操作，对所有设备贡献的张量做逐元素归约，并把归约结果按分片分发，每个设备一片。',
    explanation:
      '当每个 rank 都为同一张量计算出部分结果时，这些部分结果必须相加。Reduce-scatter 完成求和后只把下一步需要的那一片交给每个 rank，避免把完整归约张量发给所有人的浪费。一次 all-reduce 恰好等于 reduce-scatter 加 all-gather，调度器会根据下一个操作实际消费什么来选择融合形式还是拆分形式。',
    significance:
      '当下游只需要分片时，用 reduce-scatter 代替完整 all-reduce 能把每个 rank 的接收数据量减半。在 NVL72 这种规模下，集合通信流量与模型本身争夺互连带宽，这一点尤为重要。把这些集合操作与计算重叠，是成熟推理栈的标志性能力。',
    benchmarkContext:
      'InferenceX 中带张量并行分片的配置在每一层 Transformer 都会触发归约类集合操作，而 CollectiveX 存在的意义正是在推理实际使用的消息尺寸上，跨厂商发布这些原语的测量结果。',
  },
  infiniband: {
    term: 'InfiniBand',
    aliases: ['IB', 'InfiniBand 网络', 'NDR InfiniBand'],
    plainEnglish:
      'InfiniBand 是连接 AI 集群中各台服务器的高速低延迟网络，承担 NVLink 够不到的跨节点流量。',
    definition:
      'InfiniBand 是原生支持 RDMA 的交换式网络，是大多数大型 NVIDIA 集群中节点之间的 scale-out 互连。',
    explanation:
      '节点或机柜内部，芯片通过 NVLink 这类 scale-up 链路通信；越过这个边界，流量就进入 scale-out 网络，InfiniBand 在这里与支持 RDMA 的 Ethernet 竞争。InfiniBand 提供微秒级延迟、当前世代每链路数百 Gb/s 的带宽，以及 SHARP 这类在网归约能力。多节点推理、prefill 与 decode 分离、宽专家并行都把跨节点集合通信和 KV 传输放在这张网络上。',
    significance:
      '一旦模型跨节点，网络就与算力一样成为一级性能要素。网络选型塑造集群成本和厂商绑定，InfiniBand 与 Ethernet 之争是 AI 基础设施领域最核心的竞争战场之一。',
    benchmarkContext:
      'InferenceX 的多节点配置，包括分离式和机柜级结果，都跑在所在集群的 scale-out 网络上，配置元数据会记录互连类型，因为它对跨节点数字的可复现性影响重大。',
  },
  rdma: {
    term: '远程直接内存访问',
    aliases: ['RDMA', 'RoCE', 'GPUDirect RDMA'],
    plainEnglish:
      'RDMA 让一台机器直接通过网络读写另一台机器的内存，两边的 CPU 都不用参与数据拷贝。',
    definition:
      '远程直接内存访问（RDMA）是一种网络能力，由网卡在两台机器的内存之间直接搬运数据，绕过操作系统和 CPU 的拷贝开销。',
    explanation:
      '常规网络栈在两端都要经过内核缓冲区拷贝数据，消耗 CPU 周期和延迟。RDMA 网卡在已注册的内存区域之间直接传输，GPUDirect 进一步让网卡直接写入加速器的 HBM。InfiniBand 原生内置 RDMA，RoCE 则把同一套语义跑在 Ethernet 上。NCCL、RCCL 等集合通信库，以及分离式服务中的 KV cache 传输路径，都建在这些原语之上。',
    significance:
      'RDMA 是整个分布式 AI 栈的地板：没有它，跨节点集合通信和缓存传输早在链路跑满之前就会卡在 CPU 上。RoCE 变体让基于 Ethernet 的集群能以更低成本与 InfiniBand 竞争。',
    benchmarkContext:
      'InferenceX 的每个多节点结果在集合通信之下都依赖 RDMA 传输，分离式配置还依赖它完成 prefill 到 decode 的 KV 搬运，因此传输层成熟度是区分相似集群结果的因素之一。',
  },
  ualink: {
    term: 'UALink',
    aliases: ['Ultra Accelerator Link', 'UALoE'],
    plainEnglish:
      'UALink 是机柜内加速器之间高速 scale-up 链路的开放行业标准，是生态对 NVLink 的回应。',
    definition:
      'UALink 是面向加速器之间 scale-up 通信的开放互连规范，让机柜内的大量芯片以交换级速度共享内存流量。',
    explanation:
      'NVLink 证明了用低延迟内存语义网络连接的一机柜芯片可以表现得像一颗巨型加速器，但它是私有的。UALink 联盟定义了开放的等价方案，让 NVIDIA 之外的厂商也能构建机柜级域。UALink over Ethernet（简称 UALoE）把协议跑在 Ethernet 交换上，AMD Helios 世代的机柜采用这条路线，组成结构上对标 NVL72 的 72 芯片 scale-up 域。',
    significance:
      'scale-up 域的大小日益决定服务架构，宽专家并行和分离式部署都希望几十颗芯片处在同一张快速网络内。开放标准决定机柜级推理是继续作为单厂商优势，还是成为整个生态的能力。',
    benchmarkContext:
      'InferenceX 在硬件覆盖中把 AMD MI455X 机柜这类 UALoE72 级系统与 NVL72 系统并列，机柜级网络上市后即可在相同模型工作负载上正面对比。',
  },
  tdp: {
    term: '热设计功耗',
    aliases: ['TDP', '整卡功耗', '全部包含功耗'],
    plainEnglish:
      'TDP 是芯片设计上可持续消耗并以热量形式散发的功率，是每份加速器规格表上的标题瓦数。',
    definition:
      '热设计功耗（TDP）是芯片被设计为可持续运行的最大功率包络，其散热系统必须能够持续把这些热量排出。',
    explanation:
      '现代加速器每颗芯片的功耗在千瓦上下甚至更高，整机柜系统乘上去就是十万瓦量级。只看 TDP 还会低估真实账单：内存、网络、CPU、电源转换损耗和散热开销都叠加在上面，因此每芯片的全部包含功耗明显高于芯片 TDP。数据中心容量按兆瓦出售，这些功率包络直接决定一个场地能容纳多少加速器。',
    significance:
      '电力已成为 AI 扩建的硬约束，在许多市场甚至排在资本之前。每芯片 TDP 的持续上升迫使行业转向液冷，也让每瓦性能与每美元性能一样，成为比较芯片世代的主要维度。',
    benchmarkContext:
      'InferenceX 用包含散热和基础设施开销的每芯片全部包含功耗来计算每 token 能耗和每兆瓦 token 数，PowerX 工作流正把这些指标从铭牌数值推向运行中的实测功耗。',
  },
  pue: {
    term: '电源使用效率',
    aliases: ['PUE', 'power usage effectiveness', '能源使用效率'],
    plainEnglish: 'PUE 衡量数据中心每向内部计算设备输送一瓦电，总共要消耗多少瓦。',
    definition:
      '电源使用效率（PUE）是数据中心总功耗与 IT 设备功耗之比，1.0 意味着每一瓦都用于计算。',
    explanation:
      '制冷、电源转换和场地系统在服务器之外额外耗能。PUE 为 1.5 意味着每一瓦 IT 负载还要搭上半瓦开销，而现代超大规模 AI 设施借助液冷和高效配电把 PUE 压向 1.1 以下。AI 园区以数百兆瓦计，PUE 的微小差异就会摊出巨大的绝对能耗和成本。',
    significance:
      'PUE 把芯片级效率与场地经济性连接起来：芯片消耗的每一瓦在电表上都要乘以 PUE。当电力供给卡住 AI 扩建时，场地效率与芯片和软件一样进入竞争计算。',
    benchmarkContext:
      'InferenceX 每 token 能耗和每兆瓦 token 数背后的全部包含功耗，已按现代 AI 数据中心的 PUE 水平计入场地开销，因此其成本与能耗比较反映的是落地的场地经济性而不是裸芯片瓦数。',
  },
  int8: {
    term: 'INT8',
    aliases: ['8 位整数量化', 'W8A8'],
    plainEnglish:
      'INT8 用 8 位整数加缩放因子存储数值，内存相比 16 位格式减半，支持的硬件上算力翻倍。',
    definition:
      'INT8 是一种 8 位整数数值格式，搭配每张量或每通道的缩放因子，用于量化推理中的模型权重和激活。',
    explanation:
      '整数量化通过缩放因子（有时还有零点）把浮点值映射到 256 个均匀间隔的等级上。均匀间隔对离群值处理得很差，因此 SmoothQuant 等技术先把激活中的离群值迁移到权重里，再按 W8A8 模式对两侧一起量化。在较早的加速器世代，INT8 是 16 位以下的主要快速路径，而新芯片增加了 FP8，同样位宽下指数位带来更宽的动态范围。',
    significance:
      'INT8 定义了 LLM 量化的第一波主流实践，在没有 8 位浮点支持的硬件上仍然重要。INT8 与 FP8 的对比也恰好展示了量化的核心权衡：均匀精度对动态范围。',
    benchmarkContext:
      'InferenceX 为每个结果标注精度，其精度对比页面存在的原因就是格式切换曾大幅移动曲线。Blackwell 和 MI350 级硬件上的现代配置偏好 FP8 和 FP4 路径，整数格式出现在特定的权重量化配置中。',
  },
  'weight-only-quantization': {
    term: '仅权重量化',
    aliases: ['weight-only quantization', 'W4A16', 'AWQ', 'GPTQ'],
    plainEnglish: '仅权重量化只把存储的模型权重压到低精度，运算本身仍在较高精度格式下进行。',
    definition:
      '仅权重量化把模型权重存为 4 位整数等低位格式，而激活和算术保持高精度，典型模式是 W4A16。',
    explanation:
      '权重是静态的，可以用 GPTQ、AWQ 等方法在离线阶段精心量化，选择能最小化质量损失的缩放和顺序。激活是动态的、更难压缩，保持 16 位可以绕开它们的离群值问题。服务时 kernel 在计算中即时反量化权重，因此访存流量减小，而乘加运算本身并没有变快。',
    significance:
      '由于 decode 是访存受限的，削减权重字节数直接加快 token 生成，也让更大的模型装进更少的芯片。仅权重方法让大型开源模型能在普通硬件上运行，在激活量化代价过高时仍是标准方案。',
    benchmarkContext:
      'InferenceX 在精度标签中区分仅权重配置与全低精度路径，因为 W4A16 配置和 NVFP4 配置对于是哪些硬件单元和带宽预算产生了曲线，做出的是很不一样的声明。',
  },
  'block-scaling': {
    term: '块缩放',
    aliases: ['block scaling', 'microscaling', 'MX 格式', '块浮点'],
    plainEnglish: '块缩放给每一小组低精度数值配一个共享缩放因子，找回超小格式自身缺失的动态范围。',
    definition:
      '块缩放是一种量化结构，数值以极低位宽格式存储，每个固定大小的块共享一个较高精度的缩放因子。',
    explanation:
      '一个 4 位数只能表示少数几个量级，远不足以覆盖模型张量的动态范围。把数值分成 16 或 32 个元素左右的块并附上共享缩放，每个块就能把格式对准自己的量级。MX 标准格式如 MXFP4、MXFP8 使用 2 的幂缩放，NVFP4 则在 16 元素块上使用 FP8 缩放，粒度更细。',
    significance:
      '块缩放是 FP4 推理世代背后的关键思想：没有每块缩放，4 位浮点对前沿模型根本不可用。缩放格式和块大小的选择，如今是硬件厂商与量化方案之间真正的差异化点。',
    benchmarkContext:
      'InferenceX 在 Blackwell 和 MI355X 覆盖中的 NVFP4 与 MXFP4 结果都是块缩放格式，精度对比页面很大程度上就是为了展示这些配置相对同硬件 FP8 基线的得失。',
  },
  'flash-attention': {
    term: 'FlashAttention',
    aliases: ['flash attention', '融合注意力 kernel'],
    plainEnglish:
      'FlashAttention 在高速片上内存中分块计算精确注意力，避免生成那个让注意力又慢又耗内存的巨大中间矩阵。',
    definition:
      'FlashAttention 是一种注意力算法，把计算分块安排在片上 SRAM 中并增量式重缩放结果，不在 HBM 中实体化完整分数矩阵就得到精确注意力。',
    explanation:
      '朴素注意力要把随序列长度平方增长的分数矩阵写入主存再读回，速度由带宽而非算术决定。FlashAttention 把整个计算融合进一个 kernel，让键值块流过片上内存，用在线 softmax 保持结果精确。后续版本和各厂商实现把这一思想扩展到新硬件世代、新头布局和面向推理的 decode 路径。',
    significance:
      '这个 kernel 家族让长上下文真正可行，把注意力从长序列的主导成本变成可控的一环。它也是单个精心设计的 kernel 能撕动整个行业性能的最经典例子。',
    benchmarkContext:
      'InferenceX 测试的所有引擎都依赖这一脉络的融合注意力 kernel，NVIDIA 硬件上经由 FlashInfer，AMD 上经由 AITER，那里的 kernel 改进经常在硬件不变的情况下移动已发布的曲线。',
  },
  triton: {
    term: 'Triton',
    aliases: ['OpenAI Triton', 'Triton kernel 语言'],
    plainEnglish:
      'Triton 是基于 Python 的加速器 kernel 编写语言，让 ML 工程师不写底层代码也能接近手工调优的速度。',
    definition:
      'Triton 是开源的 kernel 编程语言和编译器，开发者用类 Python 代码编写高性能加速器 kernel，在维护后端的厂商之间可移植。',
    explanation:
      '传统上写出峰值性能的 kernel 需要 CUDA 或汇编级调优的厂商专家知识。Triton 抬高了抽象层级：开发者编写块级程序，编译器处理访存合并、分块和调度。NVIDIA、AMD 等厂商维护后端，同一份 kernel 源码可以面向多种架构。推理引擎用它实现融合算子、量化路径和没有厂商库可用的 MoE kernel。这个名字与 NVIDIA Triton Inference Server 重名，后者是另一个独立的模型服务产品。',
    significance:
      'Triton 降低了模型研究者与硬件性能之间的门槛，其跨厂商后端具有战略意义，因为用它写的 kernel 不会锁定在单一芯片家族上。厂商把 Triton 生态运营得好不好，已经成为其软件叙事的一部分。',
    benchmarkContext:
      'InferenceX 配置中的引擎在 CUDA、CUTLASS 和 AITER 代码之外还携带大量 Triton kernel，因此编译器与后端成熟度是 NVIDIA 和 AMD 系统上引擎版本之间曲线移动的隐形推力之一。',
  },
  cutlass: {
    term: 'CUTLASS',
    aliases: ['CuTe', 'CUDA 线性代数模板库'],
    plainEnglish:
      'CUTLASS 是 NVIDIA 的模板库，提供搭建接近硬件峰值速度的矩阵乘法 kernel 所需的积木。',
    definition:
      'CUTLASS 是 NVIDIA 开源的可组合 C++ 模板库，用于构建面向各代 GPU tensor core 的 GEMM 及相关 kernel。',
    explanation:
      '峰值矩阵乘法性能要求对 tensor core 指令、共享内存搬运和异步流水线的精确编排，而且每代架构都不同。CUTLASS 把这套编排封装成可组合的部件，其 CuTe 层描述数据布局，kernel 作者可以拼装出接近峰值的 GEMM，并在尾部融合偏置、激活或量化缩放，而不必从零开始。推理引擎中大量高性能 kernel 直接建在它之上。',
    significance:
      'CUTLASS 是 NVIDIA 教生态使用每一代新 tensor core 的地方，包括 Blackwell 上的 FP4 和 FP8 路径。其模式向引擎扩散的速度，是新芯片多快达到宣称性能的真实变量。',
    benchmarkContext:
      'InferenceX 在 NVIDIA 硬件上的结果背后，GEMM 和注意力 kernel 大量源于 CUTLASS 衍生代码，引擎镜像里这些库的版本升级是平台追踪到的曲线逐日变化的常见来源。',
  },
  nccl: {
    term: 'NCCL',
    aliases: ['RCCL', 'NVIDIA 集合通信库'],
    plainEnglish:
      'NCCL 是 NVIDIA 的集合通信库，在集合操作中负责芯片之间的数据搬运，RCCL 是 AMD 的对应实现。',
    definition:
      'NCCL 是 NVIDIA 的集合通信库，在节点内经 NVLink、节点间经 RDMA 网络实现 all-reduce、all-gather、all-to-all 等跨 GPU 操作。',
    explanation:
      '框架不直接操作互连，而是调用一个集合通信库，由它发现拓扑并为每种消息尺寸选择算法和信道调度。NVIDIA 系统由 NCCL 负责，AMD 维护接口对齐的 RCCL 服务 ROCm 平台。调优是针对具体网络的：ring 与 tree 算法、协议阈值、信道数都随拓扑变化，同一模型在两个集群上的通信行为可能大不相同。',
    significance:
      '每个多芯片推理和训练任务都站在这一层之上，集合通信的回退会悄无声息地向整个集群征税。NCCL 与 RCCL 的接口兼容性同样至关重要，引擎可以面向同一套集合通信 API 覆盖多家厂商。',
    benchmarkContext:
      'InferenceX 的多芯片配置在每个张量并行和专家并行层都在调用这些库，而 CollectiveX 在推理相关的消息尺寸上跨厂商直接测量底层集合通信性能，把网络行为与模型行为分离开。',
  },
  gemm: {
    term: 'GEMM',
    aliases: ['通用矩阵乘法', 'matrix multiply'],
    plainEnglish: 'GEMM 即通用矩阵乘法，是训练和推理神经网络时占据绝大部分算术量的那一种计算。',
    definition:
      'GEMM 是通用的矩阵乘矩阵例程，神经网络中的线性层、注意力投影和专家计算最终都归结为它。',
    explanation:
      'Transformer 主要由线性变换堆叠而成，服务一个模型就是执行海量矩阵乘法。tensor core 专为加速它们而存在，峰值 TFLOP/s 规格也是针对这类稠密运算给出的。形状决定效率：prefill 产生接近方形的大矩阵乘法能喂饱算力，decode 产生的细长矩阵则受带宽限制。MoE 还带来分组 GEMM，把许多小型专家乘法合并成一次高效启动。',
    significance:
      'GEMM 效率是行业里一切性能主张的地基。在真实服务形状下，尤其是 decode 的细长矩阵上，实际交付与峰值 GEMM 吞吐量的差距，解释了规格表比例为何预测不了基准测试排名。',
    benchmarkContext:
      'InferenceX 每条曲线背后都是来自 CUTLASS、hipBLASLt 和 Triton 生成代码的 GEMM kernel 堆栈，量化配置最终也站在各厂商在其调度器产生的形状上执行低精度 GEMM 的能力之上。',
  },
  'kernel-fusion': {
    term: 'Kernel 融合',
    aliases: ['kernel fusion', '算子融合'],
    plainEnglish:
      'Kernel 融合把多个小的芯片操作合并成一个，中间数据留在快速内存里而不是反复经过 HBM。',
    definition:
      'Kernel 融合把多个连续操作合并为单次 kernel 启动，中间结果保留在寄存器或片上内存中，而不是在步骤之间写回主存。',
    explanation:
      '未融合的矩阵乘法、偏置加法、激活函数序列，每一步都把中间张量写入 HBM 再读回。融合成一个 kernel 就消除了这些往返和中间的启动开销。融合可以在库里手工实现，可以通过 CUTLASS 式的模板尾部实现，也可以由 torch.compile 和基于 Triton 的栈自动完成。FlashAttention 是这一思想最著名的单个例子。',
    significance:
      '在访存受限的推理中，消除中间流量比提升原始算术能力更值钱，因此融合是引擎手中最可靠的杠杆之一。引擎版本间的提速，很大一部分可以归结为更激进或更精准的融合。',
    benchmarkContext:
      'InferenceX 配置钉住的引擎镜像在不同版本和硬件后端上的融合库存不同，这是逐日追踪中硬件不变而曲线移动的常见原因：面向新模型和新精度的融合 kernel 落地了。',
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

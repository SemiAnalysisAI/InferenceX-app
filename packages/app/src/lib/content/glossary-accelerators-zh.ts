import type { GlossaryTranslation } from './glossary-zh';

export const acceleratorTranslations: Readonly<Record<string, GlossaryTranslation>> = {
  ascend: {
    term: 'Ascend',
    plainEnglish: 'Huawei 的 AI 加速器系列，实际性能取决于具体芯片配置、软件栈和工作负载。',
    definition:
      'Ascend 是 Huawei 的 AI 加速器系列，配合 CANN 软件栈以及设备专用的执行和内存资源工作。',
    explanation:
      'Huawei 文章研究了 950PR 硬件和 950DT 的执行 profile。Cube、vector、数据传输资源及辅助 CPU 各有分工。同属 Ascend 系列，并不意味着核心数、内存容量、主机架构或 kernel 支持相同。',
    significance:
      '模型在一种 Ascend 配置上成功运行，不能证明另一种配置也已具备部署条件。软件依赖和通信拓扑可能与标称算力同样重要。',
    benchmarkContext:
      '应记录实际 SKU、主机 CPU 架构、CANN 与驱动版本、模型精度及并行策略。历史文章分别讨论微基准测试、软件发布情况和特定模型的执行 profile，不能混为一类结果。',
  },
  cann: {
    term: 'CANN',
    expansion: '神经网络计算架构',
    plainEnglish: 'Huawei 用于在 Ascend 硬件上编译和执行 AI 算子的基础软件栈。',
    definition: 'CANN 是 Ascend 的基础软件栈，提供神经网络执行所需的编程、编译、运行时和算子支持。',
    explanation:
      '框架后端能否工作，不只取决于编译器是否接受程序。算子、运行时接口、驱动和通信组件的版本及硬件支持必须匹配。Huawei 文章同时讨论 CANN 算子和通过 TileLang 等工具编写的 kernel。',
    significance:
      '比较两个编程前端时，如果没有说明底层运行时与算子路径，就可能把性能差异归因于错误的组件。能安装、计算正确和推理服务性能达标也是不同问题。',
    benchmarkContext:
      '转载中的版本状态属于历史陈述。原文有关 CANN 和 HDK 的段落保留了不同撰稿时间的表述，不能用作当前版本选择指南。',
  },
  aicpu: {
    term: 'AICPU',
    plainEnglish: 'Ascend 设备上的辅助 CPU 资源，可执行矩阵和向量引擎之外的工作。',
    definition:
      'AICPU 指 Ascend 设备的辅助 CPU 执行资源，既不同于主机 CPU，也不同于主要 AI 计算引擎。',
    explanation:
      '部分控制逻辑或算子可以在这些资源上执行。把工作从主机转移过来，会改变提交、同步和数据访问成本，但不会让辅助 CPU 具备矩阵引擎的功能。执行位置必须结合具体操作和运行时路径判断。',
    significance:
      '算子较慢可能是执行位置造成的，不一定反映加速器的矩阵吞吐量。提出 kernel 优化前，应在 profile 中区分主机执行、辅助 CPU 任务和主要设备引擎。',
    benchmarkContext:
      'Huawei 文章对比了 AICPU 与主机 CPU 的算子耗时。测得的关系只适用于该操作和配置，不能推广到所有工作负载或所有主机 CPU。',
  },
  'cube-vector-cores': {
    term: 'Cube 与 vector 核心',
    plainEnglish: 'Ascend 分别执行矩阵和向量运算的资源，需要协调数据搬运与执行依赖。',
    definition:
      'Cube 引擎负责矩阵类运算，vector 引擎处理逐元素变换、归约，以及注意力或量化中的部分操作。',
    explanation:
      '一个 kernel 可以同时协调两条执行路径，并在各自的存储资源之间传递中间结果。MIX_AIC、MIX_AIV 等标签表示运行时任务类型，不能证明整个任务耗时都独占某一种物理执行单元。',
    significance:
      '增加矩阵吞吐量，未必会减少向量计算、通信或依赖传输的耗时。多个重叠 stream 的 kernel 耗时之和，不能直接换算成物理 Cube 或 vector 利用率。',
    benchmarkContext:
      'Huawei 文章中的 Cube 吞吐量提升假设保持实测重叠关系不变。这是按耗时组成推演的情景，不是对未来芯片的预测，也不是独占硬件资源的利用率测量。',
  },
  'memory-transfer-engine': {
    term: '内存传输引擎',
    plainEnglish: '在存储区域之间搬运数据的硬件，依赖允许时可与计算引擎并行工作。',
    definition:
      '内存传输引擎负责在支持的存储层级之间搬运数据，通过同步机制保证消费者在传输完成后安全使用数据。',
    explanation:
      'Ascend 的传输路径连接内存和本地计算存储。布局、传输粒度、缓冲和资源争用都会影响有效带宽。只有数据依赖和可用存储允许足够多的独立工作时，异步传输才能与计算重叠。',
    significance:
      '矩阵引擎加速不能消除传输瓶颈。反过来，减少传输字节数即使不改变算力，也可能加速 kernel，前提是额外的转换或同步开销没有抵消这部分收益。',
    benchmarkContext:
      'Huawei 文章讨论了针对 Ascend 传输资源的 KV 布局与调度。应比较传输量、可达带宽和完整 kernel 延迟，不能把所有收益都归因于 Cube 运算。',
  },
  tilelang: {
    term: 'TileLang',
    plainEnglish: '以分块方式表达计算，并通过不同后端生成加速器专用执行代码的 kernel 编程语言。',
    definition:
      'TileLang 是用于编写分块 kernel 的语言及编译框架，后端支持决定可用硬件指令和调度机制。',
    explanation:
      '分块编程以数据块而非单个标量表达计算和数据搬运。编译器可以管理部分缓冲与调度，但具体程序能否高效执行，仍取决于后端成熟度、布局和算子覆盖。',
    significance:
      '共用前端不保证不同厂商的生成代码、功能支持或性能一致。有效比较必须注明后端版本和实际 kernel 形状，不能只看语言名称。',
    benchmarkContext:
      'Huawei 文章在 warm cache 条件下比较 TileLang、CANN 和 Triton-Ascend。这些算子测试不能证明冷内存带宽或端到端推理加速比。',
  },
  'auto-scheduling': {
    term: 'Kernel 自动调度',
    aliases: ['auto-scheduling'],
    plainEnglish: '编译器安排计算、缓冲和数据传输，让彼此独立的操作安全重叠。',
    definition: 'Kernel 自动调度把操作分配到执行阶段或资源，并插入保持程序依赖关系所需的同步。',
    explanation:
      '调度器可以让 load 与运算流水执行、选择缓冲，或协调矩阵和向量操作。本地存储容量与资源争用限制了可重叠的工作量。消费者仍须等待生产者完成，缓冲也不能过早复用。',
    significance:
      '自动化减少了手工排程工作，但适合一种张量形状的调度，可能在另一种形状下占用过多存储或同步资源。编译成功不代表执行最优。',
    benchmarkContext:
      'Huawei 文章展示了 TileLang 在 Ascend 上的调度和算子耗时。比较生成的调度时，必须保持数值操作、形状、缓存状态和运行时版本一致。',
  },
  urma: {
    term: 'URMA',
    expansion: '统一远程内存访问',
    plainEnglish: 'Ascend 软件栈中用于协作设备间数据交换的远程内存通信接口。',
    definition: 'URMA 提供远程内存通信抽象，供软件在支持的互连与设备之间交换数据。',
    explanation:
      '通信性能取决于传输实现、端点、内存注册、消息大小和同步。接口名称不能说明物理拓扑，也不能证明通信不会与计算争用资源。应用还需要管理数据何时可供远端消费者读取。',
    significance:
      '混合专家模型即使本地 GEMM 很快，dispatch 和 combine 也可能成为关键路径。通信库必须同时适配硬件网络和模型的路由模式。',
    benchmarkContext:
      'Huawei 文章在通信栈讨论中介绍 URMA。针对特定硬件的说明，不能推广为所有 URMA 部署都能达到的通用延迟或带宽保证。',
  },
  microbenchmark: {
    term: '微基准测试',
    plainEnglish: '隔离指令、资源或小型操作的测试，不等同于完整应用性能测量。',
    definition: '微基准测试有意缩小工作负载范围，以观察特定延迟、吞吐上限、依赖或资源相互影响。',
    explanation:
      '测试程序选择指令形状、并发量、重复次数和缓存条件。这些选择可能隐藏生产环境中的主要成本，例如 launch 开销、较短的依赖链或通信。计时也必须说明范围：单条指令、单个 SM、整卡，还是一次完整调用。',
    significance:
      '微基准测试适合诊断瓶颈和检验架构假设，但应用调度组合了许多资源与依赖，不能仅凭它预测请求吞吐量或用户延迟。',
    benchmarkContext:
      '两篇加速器文章在更广泛的讨论之外，都包含隔离测试。引用 Blackwell 的深在途 MMA 队列测试或 Huawei 的 warm cache 算子结果时，应保留原始配置边界。',
  },
  'pointer-chasing': {
    term: '指针追逐',
    aliases: ['pointer chasing'],
    plainEnglish: '让每次 load 依赖上一次结果，以限制访问重叠并探测内存延迟。',
    definition:
      '指针追逐沿一条地址链执行，每次读取的值决定下一次 load 的地址，从而形成串行内存依赖。',
    explanation:
      '当前 load 返回前，下一地址未知，因此测试限制了内存级并行。缓存驻留、地址分布、链长和并发流量仍会影响延迟。比较不同核心的延迟曲线，可以推测共享资源或拓扑关系。',
    significance:
      '延迟距离矩阵是间接证据，不是物理布局图。资源争用和地址映射也可能形成看似明确的分组，依赖 load 的延迟不能替代大量独立 load 下的持续带宽。',
    benchmarkContext:
      'Huawei 与 Blackwell 文章都使用延迟探测推断资源关系。应区分观测到的耗时、推断的逻辑分组和对物理位置的猜测。',
  },
  'chip-binning': {
    term: '芯片分档',
    aliases: ['chip binning'],
    plainEnglish: '根据功能、功耗和性能测试结果，将芯片或内存组件划分为不同配置。',
    definition:
      '分档根据制造出的组件有哪些可用资源、达到哪些运行指标进行分类，而不是假定所有裸片都相同。',
    explanation:
      '缺陷可能使资源失效；频率、电压、功耗或内存能力的差异，也可能限制功能完整的组件。厂商可以选择和搭配组件，或屏蔽部分资源来形成产品配置。最终 SKU 不会揭示每个设备的所有物理细节。',
    significance:
      '标称相似的系统可能具有不同的启用资源和访问局部性。把性能差异全部归因于软件前，应记录实际设备配置与运行条件。',
    benchmarkContext:
      'Huawei 文章讨论计算与内存配置，Blackwell 文章研究启用的 SM 分组。这些架构观察不是对制造良率的直接测量。',
  },
  floorsweeping: {
    term: 'Floorsweeping',
    aliases: ['资源屏蔽'],
    plainEnglish: '屏蔽部分硬件资源，让芯片在存在缺陷或产品线划分要求时仍能按支持的配置出货。',
    definition: 'Floorsweeping 将选定的执行单元或其他硬件资源从软件可见的启用配置中移除。',
    explanation:
      '同一产品的逻辑资源数量可以保持一致，但启用单元的物理位置不同。Cluster 调度因此可能暴露出容量不均的可用分组。仅凭 SM 编号和逻辑分组，不能唯一确定核心在裸片上的位置。',
    significance:
      'Persistent kernel 和 cluster 大小会与实际执行资源分组相互影响。如果协同调度限制在单个 GPC 内，只检查 cluster 大小能否整除整卡 SM 数是不够的。',
    benchmarkContext:
      'Blackwell 文章区分逻辑 GPC 映射与假设的物理布局。延迟探测和 cluster 实验不能独立证明完整芯片布局。',
  },
  'streaming-multiprocessor': {
    term: '流式多处理器',
    plainEnglish: 'NVIDIA GPU 中调度 warp，并提供本地计算与存储资源的执行单元。',
    definition:
      '流式多处理器（SM）是 NVIDIA GPU 的执行资源组，包含 warp 调度、寄存器、shared memory 和运算资源，细节随架构变化。',
    explanation:
      '驻留的 block 和 warp 共享这些资源。整卡峰值吞吐量汇总许多 SM，而指令测试可能只报告一个 SM。可用 SM 数和资源限制决定并发 block 数，但不能单独决定有效指令发射效率。',
    significance:
      '每 SM 的带宽或 FLOPs 不能直接与整卡数字比较。占用率、依赖、指令形状和启用硬件都会影响 kernel 使用标称容量的比例。',
    benchmarkContext:
      'Blackwell 文章既报告每 SM 指令上限，也报告整卡传输结果。使用图中数据时，应明确分母和时钟口径。',
  },
  'thread-block-cluster': {
    term: 'Thread block cluster',
    aliases: ['CTA cluster', 'cooperative grid array', 'CGA', '线程块集群'],
    plainEnglish: '共同调度的一组 GPU thread block，可通过 cluster 作用域的机制协作。',
    definition:
      'Thread block cluster 将 CUDA block，也称 CTA，组成一组，提供共同调度保证和受支持的 cluster 级同步及内存操作。',
    explanation:
      '在 Blackwell 文章讨论的架构上，同一 cluster 的 block 在同一 GPC 内调度。Cluster 维度影响放置、分布式 shared memory 访问和 multicast。较大 cluster 如果无法适配本地可用分组，可能留下闲置资源。',
    significance:
      '增大 cluster 可能增加数据复用，也会降低调度灵活性。Cluster 大小能整除整卡 SM 数，不代表每个 GPC 都能被充分使用。',
    benchmarkContext:
      'Blackwell 文章讨论首选和回退 cluster 大小。应结合实际启用的 SM 分组及每个 block 的资源需求评估这些 launch 配置。',
  },
  'graphics-processing-cluster': {
    term: '图形处理集群',
    plainEnglish: 'GPU 的硬件资源分组，限制协作 thread block cluster 可以调度的位置。',
    definition: 'GPC 是 NVIDIA GPU 中包含 SM 等执行资源的硬件分组，内部组织随架构变化。',
    explanation:
      'Blackwell 文章通过 cluster 共同调度推断逻辑 SM 分组。Floorsweeping 可能造成不同分组的可用资源不同。软件可见的成员关系不能直接说明物理坐标，也不能确定多裸片封装中每组位于哪个裸片。',
    significance:
      '如果 kernel 假定每组可用容量完全相同，就可能让部分 SM 闲置。即使物理布局未知，逻辑拓扑仍影响调度。',
    benchmarkContext:
      '应将逻辑 cluster 映射证据与文章根据指针追逐提出的位置假设分开。整卡 SM 数或单张延迟矩阵，都不能单独描述全部调度及内存局部性约束。',
  },
  'distributed-shared-memory': {
    term: '分布式 shared memory',
    plainEnglish: '让同一 GPU cluster 内的 thread block 访问彼此的 shared memory。',
    definition:
      '分布式 shared memory（DSMEM）允许 thread block cluster 中的协作 block 寻址其他 block 的 shared memory 区域。',
    explanation:
      '远端访问必须遵守 cluster 同步和生命周期规则。虽然使用 shared memory 地址，其指令路径和性能仍不同于本地访问。传输大小、访问合并和所选指令都会影响吞吐量及延迟。',
    significance:
      'DSMEM 可支持跨 block 协作，不必让每个中间结果都经过 global memory。但不能把它视为一个免费扩大的存储池，更不能默认其带宽等于本地 shared memory。',
    benchmarkContext:
      'Blackwell 文章对比本地 LDS、cluster 作用域访问和 bulk copy。远端带宽较低不能证明 HBM 是瓶颈，因为这里测试的是 cluster 内的内存路径。',
  },
  'tensor-memory': {
    term: 'Tensor memory',
    plainEnglish:
      'Blackwell tensor core 使用的存储资源，与普通寄存器和 shared memory 编程模型不同。',
    definition:
      'Tensor memory（TMEM）是 Blackwell 第五代 tensor core 操作使用的存储资源，可用于存放 MMA 累加器。',
    explanation:
      '软件通过受支持的指令接口显式管理分配和访问。文章比较了两个输入都在 shared memory 的布局与一个输入在 TMEM 的布局。改变存放位置可能减轻某条数据路径的压力，但收益取决于指令形状和同步。',
    significance:
      '累加器存放位置会改变 kernel 设计与资源核算。TMEM 容量不能用普通 HBM 容量替代，其访问规则也不能按每线程寄存器理解。',
    benchmarkContext:
      'Blackwell 文章的 SS、TS 对比针对特定 MMA 形状隔离了操作数位置的影响，不能证明把任意张量移入 TMEM 都能加速完整模型。',
  },
  'tensor-memory-accelerator': {
    term: 'Tensor Memory Accelerator',
    plainEnglish: 'NVIDIA 的异步批量张量传输机制，可减少线程逐个计算地址的工作。',
    definition: 'TMA 是硬件支持的数据传输机制，利用张量描述在受支持的存储空间之间异步搬运数据。',
    explanation:
      'Blackwell 文章测试的 global-to-shared 路径可由单个线程发起多维传输。引擎处理地址生成和受支持的布局细节，同步机制通知消费者数据已经就绪。传输形状与在途工作量影响可达带宽。',
    significance:
      'TMA 能减少部分软件开销，但不保证适合所有访问模式或传输大小。不规则 page 选择或较小传输可能更适合其他 copy 机制。',
    benchmarkContext:
      '文章在明确的线程、stage 和 box 配置下比较二维 TMA 与 LDGSTS。两者性能交点取决于工作负载，转载也明确标注了原文 bytes 与 KiB 不一致的位置。',
  },
  ptx: {
    term: 'PTX',
    expansion: '并行线程执行',
    plainEnglish: 'NVIDIA 的虚拟指令语言，编译后成为特定 GPU 架构的机器指令。',
    definition: 'PTX 是 NVIDIA 编译工具链中的虚拟指令集表示，并非 GPU 最终执行的机器指令编码。',
    explanation:
      '编译器将 PTX 转换为架构专用代码。可用指令、操作数约束和生成序列都取决于目标架构与工具链。因此，看似相同的 PTX 操作在不同代硬件上可能生成不同机器指令或调度行为。',
    significance:
      'PTX 指令数量不一定等于实际执行的硬件指令数量。底层性能研究应检查生成的机器代码和计时，不能只凭源代码中的指令名称推断吞吐量。',
    benchmarkContext:
      'Blackwell 文章在测试路径中对应了 cp.async 与 LDGSTS、tensor bulk copy 与 UTMALDG。这些对应关系属于该编译上下文，不是所有 PTX 程序的无条件规则。',
  },
  sass: {
    term: 'SASS',
    plainEnglish: '研究已编译 kernel 实际执行内容时查看的 NVIDIA 架构专用机器指令。',
    definition: 'SASS 指用于查看已编译 NVIDIA GPU kernel 的架构专用机器指令表示。',
    explanation:
      '与虚拟 PTX 不同，它反映编译后的目标指令流。反汇编可以揭示高层源码中看不到的 load 路径、tensor 指令和调度细节。指令名称和编码因架构而异，出现某条指令本身并不能说明实际吞吐量。',
    significance:
      '检查生成代码有助于解释意外的性能差异，并验证编译器是否选择了预期路径。但它不能代替对依赖、资源争用和执行时间的实际测量。',
    benchmarkContext:
      'Blackwell 文章区分 LDS 与通用 LD，并讨论 LDGSTS、UTMALDG 和 UBLKCP。结论针对所测指令和配置，不能推广到所有使用 shared memory 的 kernel。',
  },
  'asynchronous-copy': {
    term: '异步 copy',
    aliases: ['async copy', 'cp.async', 'LDGSTS'],
    plainEnglish: '传输期间允许独立计算继续执行，消费者使用结果前仍须同步。',
    definition: '异步 copy 将发起传输与等待完成分开，允许两者之间执行不依赖该传输的操作。',
    explanation:
      'Blackwell 文章重点测试 cp.async 的 global-to-shared 路径，它不需要通过普通寄存器暂存数据。线程数、load 宽度、流水 stage 和在途字节数决定资源需求。读取目标数据前，仍须通过 barrier 或完成机制保证安全。',
    significance:
      '异步提交不保证传输一定重叠，也不保证带宽更高。消费者依赖、缓冲不足或内存流水线拥塞，仍可能使执行串行，甚至让增加 stage 适得其反。',
    benchmarkContext:
      '比较 LDGSTS 与 TMA 时，应使用等价数据并说明配置。文章中的延迟和吞吐量是不同指标，不能据此给所有 copy 机制排出通用优劣顺序。',
  },
  'tma-multicast': {
    term: 'TMA multicast',
    plainEnglish: '一次张量传输向多个协作 block 提供数据，减少对共享输入的重复请求。',
    definition:
      'TMA multicast 将一次传输分发给受支持 cluster 中选定的 block，让它们在各自本地存储中接收共享输入。',
    explanation:
      '显式 multicast 直接向硬件指定接收方。Blackwell 文章还单独测试多个 block 对相同地址发起独立请求的情况，请求合并可能产生类似效果。有效数据交付吞吐量相同，不代表 L2 流量相同，工作集变化时尤其如此。',
    significance:
      'GEMM 类计算可通过跨 block 复用输入来减少内存流量。收益取决于访问重叠、cluster 放置，以及剩余计算或同步瓶颈。',
    benchmarkContext:
      '应区分写入全部目标缓冲的字节数与经过 L2 或 HBM 读取的字节数。流量减少倍数不能直接视为应用加速倍数，转载也标注了原文图注中的单位问题。',
  },
  'two-sm-mma': {
    term: '双 SM MMA',
    aliases: ['2SM MMA', 'cta_group::2'],
    plainEnglish: 'Blackwell 中由一对协作 block 联合使用两个 SM 的矩阵指令模式。',
    definition:
      '双 SM MMA 是 Blackwell 的 tensor core 执行模式，由一对协作 CTA 跨两个 SM 完成矩阵乘累加。',
    explanation:
      '相比单 SM 操作，更大的执行作用域支持不同指令形状和数据共享方式。评估扩展性必须同时考虑增加的计算资源和完成的工作量。操作数布局及 shared memory 流量，也可能与算力一起改变瓶颈。',
    significance:
      '用两个 SM 获得两倍吞吐量，不等于每 SM 效率提高两倍。特定形状下超过这一比例的收益，可能来自单 SM 内存瓶颈被缓解。',
    benchmarkContext:
      'Blackwell 文章区分 SS 与 TS 布局，并报告形状相关的扩展性。引用结果时应保留这些条件，不能把最高倍数当作通用 kernel 或推理加速比。',
  },
  'matrix-multiply-accumulate': {
    term: '矩阵乘累加',
    plainEnglish: '将矩阵分块相乘，并把乘积加入累加器的操作。',
    definition:
      '矩阵乘累加（MMA）计算矩阵乘积并累加到输出 tile，支持的形状和数值格式由指令接口规定。',
    explanation:
      'Tensor core 指令在特定执行作用域内完成 MMA。输入格式、累加精度、操作数位置、tile 维度和独立在途操作数量都会影响吞吐量。较小形状可能无法用满运算路径，也可能花更多时间搬运操作数。',
    significance:
      '达到 tensor 峰值 FLOPs 需要合适的指令组合和足够独立工作。GEMM kernel 还要加载数据、同步 stage 和存储输出，因此指令吞吐量只是上限，不是完整 kernel 测量。',
    benchmarkContext:
      'Blackwell 文章分别测量指令形状和队列深度。转载保留并注明原文公式的不一致，不能把其中不匹配的分母当作经过核验的计算。',
  },
  'speed-of-light': {
    term: 'Speed-of-Light 吞吐量',
    plainEnglish: '明确给定的性能上限，用于表示实测操作距离相关硬件极限还有多远。',
    definition:
      'Speed-of-Light（SoL）吞吐量以指定的理论或可达性能上限为基准，对所测操作及资源的性能进行归一化。',
    explanation:
      '分母必须匹配数据格式、指令形状、时钟口径、资源数量以及稀疏或稠密计算约定。没有这些条件的百分比，可能掩盖不兼容的比较。计算上限与内存上限也不是同一个指标，不能互相替代。',
    significance:
      '隔离指令测试中的高 SoL 不代表应用利用率高。模型可能把大量时间花在其他操作、依赖、通信或空闲间隙上。',
    benchmarkContext:
      'Blackwell 文章在深浅不同的 MMA 队列下报告了不同峰值比例。判断实际可达性能前，应选择接近真实 kernel 的队列深度，而不是直接套用饱和测试结果。',
  },
  'bytes-in-flight': {
    term: '在途字节数',
    aliases: ['bytes in flight'],
    plainEnglish: '并发传输已经请求、但尚未全部完成的数据量。',
    definition:
      '在途字节数统计指定范围内尚未完成的传输量，例如单个 SM，而不是整个测试累计处理的字节数。',
    explanation:
      '增加在途工作可隐藏延迟并提高持续带宽，直到某项资源饱和；同时也占用缓冲、barrier 状态和指令发射能力。线程数、load 宽度、stage 数和传输形状可以产生相同字节总量，却带来不同执行成本。',
    significance:
      '相同在途字节数不保证吞吐量或延迟相同。比较时应保持范围与单位一致，并区分请求流量和向多个 multicast 目标交付的数据量。',
    benchmarkContext:
      'Blackwell 文章以在途数据量为横轴绘制传输吞吐量。转载明确标出了原文正文写 bytes、图中却使用 KiB 的位置，没有把两种单位默认为等价。',
  },
  'warm-cache-benchmark': {
    term: 'Warm-cache 基准测试',
    aliases: ['热缓存测试'],
    plainEnglish: '数据已驻留部分缓存层级时的测试，可能减少对较慢内存的访问。',
    definition:
      'Warm-cache 基准测试在此前访问已填充相关缓存后测量执行性能，有效驻留情况取决于工作集大小与缓存行为。',
    explanation:
      '反复运行小算子可能复用输入，而生产负载需要从更低层存储读取这些数据。Warmup 还可能稳定编译和运行时状态，但这与数据缓存驻留是不同效果。可复现报告应说明重复了什么，以及哪个工作集能放入缓存。',
    significance:
      'Warm-cache 测试可隔离计算或调度行为，但可能低估冷内存成本。若不披露条件就与流式内存测试比较，可能误判瓶颈。',
    benchmarkContext:
      'Huawei 文章注明 TileLang 算子比较采用 warm cache。引用加速比时必须保留这一条件，结果不能证明端到端推理吞吐量或 HBM 峰值带宽。',
  },
  'warp-occupancy': {
    term: 'Warp 占用率',
    plainEnglish: 'SM 上驻留 warp 数相对于支持上限的比例，不表示运算单元有多忙。',
    definition: 'Warp 占用率是在 kernel 资源分配约束下，SM 的实际驻留 warp 数占其支持上限的比例。',
    explanation:
      '寄存器、shared memory、block 大小和架构限制共同约束驻留数量。已经驻留的 warp 仍可能等待内存、barrier 或依赖。提高占用率可能帮助隐藏延迟，但若为此削减寄存器或有效缓冲，也可能让 kernel 变慢。',
    significance:
      '占用率不同于指令发射效率，也不同于采样设备利用率。驻留 warp 多或设备利用率高，都不能证明 tensor core 已接近算力峰值。',
    benchmarkContext:
      'Blackwell 文章讨论 copy 和注意力路径中的线程数与寄存器取舍。应结合在途字节数和实测 kernel 延迟理解这些选择，不能单独追求更高占用率。',
  },
  deepgemm: {
    term: 'DeepGEMM',
    plainEnglish: 'DeepSeek 的矩阵 kernel 库系列，不同硬件实现的支持范围需要分别核查。',
    definition:
      'DeepGEMM 为 DeepSeek 相关工作负载提供优化的矩阵乘法 kernel，并针对受支持加速器环境提供不同实现路径。',
    explanation:
      'Huawei 文章在 Ascend 软件发布背景下讨论 DeepGEMM-Ascend。Kernel 是否可用取决于硬件、数值格式、形状及主机和运行时集成。同名库在其他后端上不保证使用相同指令、支持相同功能或具有相同安装要求。',
    significance:
      '只有框架为相关操作实际选用该实现，且周围数据搬运没有抵消收益时，隔离 GEMM 的性能才有意义。不支持的主机依赖甚至可能在测量性能前就阻止执行。',
    benchmarkContext:
      '转载记录了特定 vLLM-Ascend 版本的历史 x86 主机限制。这不是当前兼容性结论，部署前应重新核查。',
  },
  deepep: {
    term: 'DeepEP',
    plainEnglish: 'DeepSeek 的专家并行通信库系列，用于向专家分发 token 并合并输出。',
    definition:
      'DeepEP 实现混合专家模型的 dispatch 和 combine 通信路径，不同后端支持不同硬件与传输机制。',
    explanation:
      'Dispatch 把 token 数据发到承载所选专家的设备，combine 则返回并聚合输出。消息分布取决于路由、batch、专家放置和拓扑。通信可以与其他工作重叠，也可能占用计算 kernel 所需的资源。',
    significance:
      '通信微基准测试较快，不保证模型按相同比例加速。路由不均、执行依赖和资源争用决定多少通信仍位于关键路径上。',
    benchmarkContext:
      'Huawei 文章比较 dispatch、combine 测量，并讨论 Ascend 通信重叠。引用时应保留硬件和配置条件，同时区分 Ascend 实现与其他 DeepEP 后端。',
  },
};

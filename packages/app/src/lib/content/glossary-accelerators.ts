import type { GlossaryEntry } from './glossary';

const HUAWEI = 'huawei-deepseek';
const BLACKWELL = 'dissecting-nvidia-blackwell-tensor';

export const acceleratorEntries: readonly GlossaryEntry[] = [
  {
    slug: 'ascend',
    term: 'Ascend',
    category: 'Hardware',
    plainEnglish:
      'Huawei’s AI accelerator family, whose performance depends on the specific chip configuration, software stack, and workload.',
    definition:
      'Ascend is Huawei’s family of AI accelerators, paired with the CANN software stack and device-specific execution and memory resources.',
    explanation:
      'The Huawei article examines 950PR hardware and a 950DT execution profile. Cube engines, vector engines, data-transfer resources, and auxiliary CPUs have different responsibilities. A family name does not establish identical core counts, memory capacity, host architecture, or kernel support across systems.',
    significance:
      'A successful model port on one Ascend configuration does not establish deployment readiness on another. Software dependencies and communication topology can matter as much as nominal arithmetic throughput.',
    benchmarkContext:
      'Record the actual SKU, host CPU architecture, CANN and driver versions, model precision, and parallelism. The historical article explicitly separates microbenchmarks, software-release claims, and a particular model execution profile.',
    relatedTerms: ['cann', 'cube-vector-cores', 'aicpu'],
    articleSlugs: [HUAWEI],
  },
  {
    slug: 'cann',
    term: 'CANN',
    expansion: 'Compute Architecture for Neural Networks',
    category: 'Software',
    plainEnglish:
      'Huawei’s software stack for compiling and running AI operations on Ascend hardware.',
    definition:
      'CANN is the Ascend software stack that supplies programming, compilation, runtime, and operator facilities for neural-network execution.',
    explanation:
      'A framework backend depends on more than a compiler accepting its program. Operators, runtime interfaces, drivers, and communication components must agree on versions and supported hardware. The Huawei article discusses both CANN-provided operators and kernels authored through other tools, including TileLang.',
    significance:
      'Comparing two frontends without identifying their underlying runtime and operator paths can attribute a performance difference to the wrong component. Installation compatibility is also distinct from numerical correctness and measured serving performance.',
    benchmarkContext:
      'Treat release-status statements in the port as historical. Its CANN and HDK paragraphs retain different drafting dates, so they are not a current version-selection guide.',
    relatedTerms: ['ascend', 'tilelang', 'deepgemm'],
    articleSlugs: [HUAWEI],
  },
  {
    slug: 'aicpu',
    term: 'AICPU',
    category: 'Hardware',
    plainEnglish:
      'Auxiliary CPU resources on Ascend devices that can execute work outside the matrix and vector engines.',
    definition:
      'AICPU denotes auxiliary CPU execution resources associated with Ascend devices, distinct from both the host CPU and the main AI compute engines.',
    explanation:
      'Some control or operator work can execute on these resources. Moving work from the host changes submission, synchronization, and data-access costs, but does not make an auxiliary CPU equivalent to a matrix engine. Placement must be understood for the particular operation and runtime path.',
    significance:
      'A slow operator may reflect where it runs rather than the accelerator’s matrix throughput. Profiling should distinguish host execution, auxiliary CPU tasks, and the main device engines before proposing a kernel optimization.',
    benchmarkContext:
      'The Huawei port includes an AICPU versus host operator timing comparison. Its measured relationship belongs to that operation and configuration, not every workload or host CPU.',
    relatedTerms: ['ascend', 'cann', 'cube-vector-cores'],
    articleSlugs: [HUAWEI],
  },
  {
    slug: 'cube-vector-cores',
    term: 'Cube and vector cores',
    category: 'Hardware',
    plainEnglish:
      'Separate Ascend execution resources for matrix arithmetic and vector operations that must coordinate data movement and dependencies.',
    definition:
      'Cube engines perform matrix-oriented arithmetic, while vector engines handle operations such as elementwise transformations, reductions, and portions of attention or quantization.',
    explanation:
      'A kernel can coordinate both paths and transfer intermediate results between their storage resources. Task labels such as MIX_AIC and MIX_AIV describe runtime task types; they do not establish that every elapsed cycle exclusively occupies one physical execution unit.',
    significance:
      'Increasing matrix throughput may leave vector work, communication, or dependent transfers unchanged. Summed kernel durations across overlapping streams therefore cannot be read directly as physical cube or vector utilization percentages.',
    benchmarkContext:
      'The Huawei article’s hypothetical cube-throughput improvement holds measured overlap constant. It is a composition scenario rather than a prediction for a future chip or a measurement of exclusive hardware occupancy.',
    relatedTerms: ['ascend', 'memory-transfer-engine', 'gpu-utilization'],
    articleSlugs: [HUAWEI],
  },
  {
    slug: 'memory-transfer-engine',
    term: 'Memory transfer engine',
    abbreviation: 'MTE',
    category: 'Hardware',
    plainEnglish:
      'Hardware that moves data between memory regions while compute engines execute other work when dependencies permit.',
    definition:
      'A memory transfer engine performs data movement between supported storage levels, with synchronization controlling when consumers can safely use the transferred data.',
    explanation:
      'On Ascend, transfer paths connect memory and local compute storage. Layout, transfer granularity, buffering, and contention affect useful bandwidth. An asynchronous transfer can overlap computation only when data dependencies and available storage leave enough independent work.',
    significance:
      'A faster matrix engine cannot remove a transfer bottleneck. Conversely, reducing transferred bytes may improve a kernel without changing arithmetic throughput, provided extra conversion or synchronization does not consume the saving.',
    benchmarkContext:
      'The Huawei port discusses KV layouts and scheduling around Ascend transfer resources. Compare transferred bytes, attainable bandwidth, and full kernel latency rather than assigning every gain to Cube arithmetic.',
    relatedTerms: ['cube-vector-cores', 'memory-bandwidth', 'auto-scheduling'],
    articleSlugs: [HUAWEI],
  },
  {
    slug: 'tilelang',
    term: 'TileLang',
    category: 'Software',
    plainEnglish:
      'A kernel programming language that expresses tiled computations and lowers them to accelerator-specific execution paths.',
    definition:
      'TileLang is a language and compiler framework for writing tiled kernels, with backend support determining the hardware instructions and scheduling mechanisms available.',
    explanation:
      'Tiling describes computation and data movement in blocks rather than individual scalar operations. Compiler transformations can manage parts of buffering and scheduling, but backend maturity, layouts, and operator coverage still determine which programs work efficiently on a particular accelerator.',
    significance:
      'Sharing a frontend does not guarantee identical generated code, supported features, or performance across vendors. The relevant comparison includes the backend version and the actual kernel shape, not just the language name.',
    benchmarkContext:
      'The Huawei article compares TileLang with CANN and Triton-Ascend under warm-cache conditions. Those operator measurements do not establish cold-memory bandwidth or end-to-end inference speedups.',
    relatedTerms: ['auto-scheduling', 'cann', 'warm-cache-benchmark'],
    articleSlugs: [HUAWEI],
  },
  {
    slug: 'auto-scheduling',
    term: 'Automatic kernel scheduling',
    aliases: ['auto-scheduling'],
    category: 'Software',
    plainEnglish:
      'Compiler decisions that arrange computation, buffering, and transfers so independent work can overlap safely.',
    definition:
      'Automatic kernel scheduling assigns operations to execution stages or resources and inserts the synchronization needed to preserve program dependencies.',
    explanation:
      'A scheduler may pipeline loads with arithmetic, select buffers, or coordinate matrix and vector work. Available local memory and resource contention constrain how much work can overlap. Correctness still requires consumers to wait for completed producers and buffers not to be reused too early.',
    significance:
      'Automation reduces manual scheduling work, but a schedule that helps one tensor shape can consume too much storage or synchronization on another. Compilation success is not evidence of optimal execution.',
    benchmarkContext:
      'The Huawei port shows TileLang scheduling and operator timings on Ascend. Evaluate each generated schedule against the same numerical operation, shapes, cache state, and runtime version.',
    relatedTerms: ['tilelang', 'memory-transfer-engine', 'kernel-fusion'],
    articleSlugs: [HUAWEI],
  },
  {
    slug: 'urma',
    term: 'URMA',
    expansion: 'Unified Remote Memory Access',
    category: 'Software',
    plainEnglish:
      'A remote-memory communication interface discussed in the Ascend stack for moving data between cooperating devices.',
    definition:
      'URMA provides a remote-memory communication abstraction used by software that exchanges data across supported interconnects and devices.',
    explanation:
      'Communication performance depends on the transport implementation, endpoints, registration, message sizes, and synchronization. An interface name does not identify the physical topology or prove that transfers avoid contention with computation. Applications must also manage when data is ready for a remote consumer.',
    significance:
      'For mixture-of-experts execution, dispatch and combine traffic can become a critical path even when local GEMMs are fast. A communication library must fit both the hardware fabric and the model’s routing pattern.',
    benchmarkContext:
      'The Huawei article discusses URMA in its communication stack. Its hardware-specific account should not be generalized into a universal latency or bandwidth guarantee for every URMA deployment.',
    relatedTerms: ['deepep', 'expert-parallelism', 'ascend'],
    articleSlugs: [HUAWEI],
  },
  {
    slug: 'microbenchmark',
    term: 'Microbenchmark',
    category: 'Benchmark metrics',
    plainEnglish:
      'A focused test that isolates an instruction, resource, or small operation rather than measuring a complete application.',
    definition:
      'A microbenchmark deliberately restricts the workload to expose a particular latency, throughput limit, dependency, or resource interaction.',
    explanation:
      'The harness chooses instruction shapes, concurrency, repetitions, and cache conditions. These choices can suppress costs that dominate production, such as launch overhead, short dependency chains, or communication. Timing also needs a clearly stated scope: a single instruction, one SM, a device, or a complete invocation.',
    significance:
      'Microbenchmarks are useful for diagnosing bottlenecks and testing architectural hypotheses. They do not by themselves predict requests per second or user-visible latency because application scheduling combines many resources and dependencies.',
    benchmarkContext:
      'Both accelerator ports use isolated tests alongside broader discussion. Blackwell’s deep in-flight MMA queues and Huawei’s warm-cache operator tests need their original configuration boundaries attached to any comparison.',
    relatedTerms: ['pointer-chasing', 'speed-of-light', 'warm-cache-benchmark'],
    articleSlugs: [HUAWEI, BLACKWELL],
  },
  {
    slug: 'pointer-chasing',
    term: 'Pointer chasing',
    category: 'Benchmark metrics',
    plainEnglish:
      'A dependent sequence of memory loads used to probe latency while limiting the overlap available between accesses.',
    definition:
      'Pointer chasing follows a chain in which each loaded value determines the address of the next load, creating a serial memory dependency.',
    explanation:
      'Because the next address is unknown until the current load returns, the test limits memory-level parallelism. Cache residency, address distribution, chain length, and concurrent traffic still affect the measured latency. Comparing latency profiles across cores can suggest shared resources or topology.',
    significance:
      'A latency-distance matrix is indirect evidence, not a physical floorplan. Contention and address mapping can produce apparent groups, and a dependent-load result cannot substitute for sustained bandwidth under many independent loads.',
    benchmarkContext:
      'The Huawei and Blackwell ports use latency probes to infer resource relationships. Preserve their distinction between observed timing, inferred logical groups, and speculative physical placement.',
    relatedTerms: ['microbenchmark', 'memory-bandwidth', 'graphics-processing-cluster'],
    articleSlugs: [HUAWEI, BLACKWELL],
  },
  {
    slug: 'chip-binning',
    term: 'Chip binning',
    category: 'Hardware',
    plainEnglish:
      'Sorting manufactured chips or memory components into configurations based on tested functionality, power, and performance.',
    definition:
      'Binning classifies manufactured components according to which resources work and which operating targets they meet, rather than assuming every die is identical.',
    explanation:
      'Defects can disable resources, while variation in frequency, voltage, power, or memory capability can limit otherwise functional parts. A vendor can create product configurations by selecting and pairing components or disabling resources. The resulting SKU does not reveal every physical detail of an individual device.',
    significance:
      'Nominally similar systems can differ in enabled resources and locality. Benchmark reports need actual device configuration and operating conditions before attributing variation entirely to software.',
    benchmarkContext:
      'The Huawei port discusses compute and memory configurations; the Blackwell port examines enabled SM groupings. These are architectural observations, not direct measurements of manufacturing yield rates.',
    relatedTerms: ['floorsweeping', 'ascend', 'streaming-multiprocessor'],
    articleSlugs: [HUAWEI, BLACKWELL],
  },
  {
    slug: 'floorsweeping',
    term: 'Floorsweeping',
    category: 'Hardware',
    plainEnglish:
      'Disabling selected hardware resources so a chip can ship with a supported configuration despite defects or product segmentation.',
    definition:
      'Floorsweeping removes selected execution or other hardware resources from the enabled configuration exposed to software.',
    explanation:
      'The logical resource count can remain consistent across a product while the physical locations of enabled units differ. Cluster scheduling may therefore reveal uneven usable groups. An SM identifier and a logical grouping alone do not uniquely determine the physical position of a core on a die.',
    significance:
      'Persistent kernels and cluster sizes interact with the available grouping of execution resources. Assuming that a cluster size divides the device-wide SM count is insufficient when co-scheduling is constrained within individual GPCs.',
    benchmarkContext:
      'The Blackwell article distinguishes logical GPC mapping from a hypothesized physical layout. Its latency probes and cluster experiments do not independently prove the full chip floorplan.',
    relatedTerms: ['chip-binning', 'graphics-processing-cluster', 'thread-block-cluster'],
    articleSlugs: [BLACKWELL],
  },
  {
    slug: 'streaming-multiprocessor',
    term: 'Streaming multiprocessor',
    abbreviation: 'SM',
    category: 'Hardware',
    plainEnglish:
      'An NVIDIA GPU execution unit that schedules warps and provides local compute and storage resources.',
    definition:
      'A streaming multiprocessor is an NVIDIA GPU execution grouping with warp scheduling, registers, shared memory, and arithmetic resources whose details vary by architecture.',
    explanation:
      'A kernel’s resident blocks and warps compete for these resources. Device-wide peak throughput combines many SMs, while instruction measurements may report only one. Available SM count and resource limits constrain how many blocks can run concurrently, but do not determine useful issue efficiency on their own.',
    significance:
      'Per-SM bandwidth or FLOPs must not be compared directly with a whole-device number. Occupancy, dependencies, instruction shapes, and enabled hardware all affect the fraction of nominal capacity a kernel uses.',
    benchmarkContext:
      'The Blackwell port reports both per-SM instruction limits and device-level transfer results. Keep the denominator and clock basis explicit when using its figures.',
    relatedTerms: ['warp-occupancy', 'thread-block-cluster', 'graphics-processing-cluster'],
    articleSlugs: [BLACKWELL],
  },
  {
    slug: 'thread-block-cluster',
    term: 'Thread block cluster',
    aliases: ['CTA cluster', 'cooperative grid array', 'CGA'],
    category: 'Parallelism',
    plainEnglish:
      'A group of GPU thread blocks scheduled together so they can coordinate through cluster-scoped mechanisms.',
    definition:
      'A thread block cluster groups CUDA blocks, also called CTAs, with co-scheduling guarantees and access to supported cluster-level synchronization and memory operations.',
    explanation:
      'On the architectures discussed in the Blackwell port, blocks in a cluster are scheduled within the same GPC. Cluster dimensions affect placement, distributed shared-memory access, and multicast opportunities. A large cluster can leave resources unused if its size does not fit the available local grouping.',
    significance:
      'Increasing cluster size trades potential data reuse against scheduling flexibility. Divisibility by the GPU’s total SM count does not guarantee full utilization within every GPC.',
    benchmarkContext:
      'The Blackwell article discusses preferred and fallback cluster sizes. Those launch choices must be evaluated with the actual enabled SM grouping and the kernel’s per-block resource requirements.',
    relatedTerms: ['graphics-processing-cluster', 'distributed-shared-memory', 'tma-multicast'],
    articleSlugs: [BLACKWELL],
  },
  {
    slug: 'graphics-processing-cluster',
    term: 'Graphics processing cluster',
    abbreviation: 'GPC',
    category: 'Hardware',
    plainEnglish:
      'A GPU hardware grouping that constrains where cooperating thread block clusters can be scheduled.',
    definition:
      'A GPC is an NVIDIA GPU hardware grouping containing execution resources, including groups of SMs, with architecture-specific organization.',
    explanation:
      'The Blackwell article uses cluster co-scheduling to infer logical SM groupings. Enabled resources can vary among groups because of floorsweeping. Software-visible membership does not directly identify physical coordinates or establish which die contains each group in a multi-die package.',
    significance:
      'A kernel that assumes all groups have identical usable capacity can leave SMs idle. Logical topology matters for scheduling even when the physical floorplan remains unknown.',
    benchmarkContext:
      'Keep logical cluster-mapping evidence separate from the article’s pointer-chase-based placement hypothesis. Neither the device-wide SM count nor a single timing matrix alone describes all scheduling and memory-locality constraints.',
    relatedTerms: ['streaming-multiprocessor', 'thread-block-cluster', 'floorsweeping'],
    articleSlugs: [BLACKWELL],
  },
  {
    slug: 'distributed-shared-memory',
    term: 'Distributed shared memory',
    abbreviation: 'DSMEM',
    category: 'Hardware',
    plainEnglish:
      'Access to the shared-memory storage of other thread blocks within a supported GPU cluster.',
    definition:
      'Distributed shared memory lets cooperating blocks in a thread block cluster address shared-memory regions belonging to other blocks in that cluster.',
    explanation:
      'Remote access is subject to cluster synchronization and lifetime rules. Its instruction path and performance differ from local shared memory, even though both expose shared-memory addresses. Transfer size, access coalescing, and the selected instruction affect throughput and latency.',
    significance:
      'DSMEM can support cross-block cooperation without routing every intermediate through global memory. It should not be modeled as free access to a larger pool with local shared-memory bandwidth.',
    benchmarkContext:
      'The Blackwell port contrasts local LDS, cluster-scoped access, and bulk copy. A lower remote bandwidth is not proof of an HBM bottleneck; the tested path is within the cluster memory system.',
    relatedTerms: ['thread-block-cluster', 'asynchronous-copy', 'memory-bandwidth'],
    articleSlugs: [BLACKWELL],
  },
  {
    slug: 'tensor-memory',
    term: 'Tensor memory',
    abbreviation: 'TMEM',
    category: 'Hardware',
    plainEnglish:
      'Blackwell storage used by tensor-core operations, separate from the ordinary register and shared-memory programming model.',
    definition:
      'Tensor memory is a Blackwell storage resource used by fifth-generation tensor-core operations, including storage of MMA accumulators.',
    explanation:
      'Software explicitly manages allocation and access through the supported instruction interface. The article compares layouts with both inputs in shared memory against layouts with one input in TMEM. Changing placement can reduce pressure on a particular data path, but the benefit depends on instruction shape and synchronization.',
    significance:
      'Accumulator placement changes kernel design and resource accounting. TMEM capacity and access rules cannot be substituted with generic HBM capacity or assumed to behave like ordinary per-thread registers.',
    benchmarkContext:
      'The Blackwell port’s SS and TS comparisons isolate operand placement for specific MMA shapes. They do not establish that moving an arbitrary tensor to TMEM accelerates a complete model.',
    relatedTerms: ['matrix-multiply-accumulate', 'two-sm-mma', 'tensor-memory-accelerator'],
    articleSlugs: [BLACKWELL],
  },
  {
    slug: 'tensor-memory-accelerator',
    term: 'Tensor Memory Accelerator',
    abbreviation: 'TMA',
    category: 'Hardware',
    plainEnglish:
      'NVIDIA’s asynchronous bulk-transfer mechanism for moving tensor data while reducing per-thread address-generation work.',
    definition:
      'TMA is a hardware-supported transfer mechanism that uses tensor descriptions to move data asynchronously between supported memory spaces.',
    explanation:
      'For the global-to-shared path studied in the Blackwell article, one thread can initiate a multidimensional transfer. The engine handles address generation and supported layout details, while synchronization tells consumers when the data is ready. Transfer shape and outstanding work affect attainable bandwidth.',
    significance:
      'TMA reduces some software overhead but is not automatically best for every access pattern or transfer size. Irregular page selection and small transfers can favor other copy mechanisms.',
    benchmarkContext:
      "The port compares two-dimensional TMA with LDGSTS under stated thread, stage, and box configurations. Its crossover behavior is workload-specific, and the port explicitly labels the source's byte-versus-KiB inconsistencies.",
    relatedTerms: ['asynchronous-copy', 'bytes-in-flight', 'tma-multicast'],
    articleSlugs: [BLACKWELL],
  },
  {
    slug: 'ptx',
    term: 'PTX',
    expansion: 'Parallel Thread Execution',
    category: 'Software',
    plainEnglish:
      'NVIDIA’s virtual instruction language, which is compiled into architecture-specific GPU machine instructions.',
    definition:
      'PTX is a virtual instruction-set representation used in NVIDIA’s compilation toolchain, rather than the final machine instruction encoding executed by a GPU.',
    explanation:
      'A compiler lowers PTX to architecture-specific code. Instruction availability, operand constraints, and generated sequences depend on the target architecture and toolchain. Similar-looking PTX operations can therefore produce different machine instructions or scheduling behavior across hardware generations.',
    significance:
      'Counting PTX instructions does not necessarily count executed hardware instructions. Low-level performance work should inspect the generated machine code and timing rather than infer throughput solely from source-level instruction names.',
    benchmarkContext:
      'The Blackwell port relates cp.async to LDGSTS and tensor bulk copies to UTMALDG for the measured paths. These mappings belong to that compilation context, not an unconditional rule for all PTX programs.',
    relatedTerms: ['sass', 'microbenchmark', 'matrix-multiply-accumulate'],
    articleSlugs: [BLACKWELL],
  },
  {
    slug: 'sass',
    term: 'SASS',
    category: 'Software',
    plainEnglish:
      'The architecture-specific NVIDIA GPU machine instructions inspected when studying what a compiled kernel actually executes.',
    definition:
      'SASS names the architecture-specific machine instruction representation used to inspect compiled NVIDIA GPU kernels.',
    explanation:
      'Unlike virtual PTX, it reflects the target instruction stream after compilation. Disassembly can reveal load paths, tensor instructions, and scheduling details absent from high-level source. Instruction names and encodings are architecture-specific, and the presence of an instruction alone does not reveal its achieved throughput.',
    significance:
      'Generated-code inspection helps explain unexpected performance differences and verify whether a compiler selected the intended path. It complements profiling rather than replacing measurements of dependencies, resource contention, and execution time.',
    benchmarkContext:
      'The Blackwell article distinguishes LDS from generic LD and discusses LDGSTS, UTMALDG, and UBLKCP. Its conclusions attach to those tested instructions and configurations rather than every kernel using shared memory.',
    relatedTerms: ['ptx', 'microbenchmark', 'asynchronous-copy'],
    articleSlugs: [BLACKWELL],
  },
  {
    slug: 'asynchronous-copy',
    term: 'Asynchronous copy',
    aliases: ['async copy', 'cp.async', 'LDGSTS'],
    category: 'Software',
    plainEnglish:
      'A data transfer that can proceed while independent computation runs, with synchronization before consumers use the result.',
    definition:
      'An asynchronous copy decouples initiating a transfer from waiting for its completion, allowing independent operations to execute in between.',
    explanation:
      'The Blackwell port focuses on the cp.async global-to-shared path, which avoids staging data through ordinary registers. Thread count, load width, pipeline stages, and outstanding bytes determine resource demand. Barriers or completion mechanisms remain necessary before the destination can be consumed safely.',
    significance:
      'Asynchronous submission does not guarantee overlap or higher bandwidth. A dependent consumer, insufficient buffering, or memory-pipeline congestion can still serialize execution or make additional stages counterproductive.',
    benchmarkContext:
      'Compare LDGSTS and TMA with equivalent data and clearly stated configurations. The article’s measured latency and throughput are distinct quantities and cannot be exchanged as a universal ranking of copy mechanisms.',
    relatedTerms: ['tensor-memory-accelerator', 'bytes-in-flight', 'memory-transfer-engine'],
    articleSlugs: [BLACKWELL],
  },
  {
    slug: 'tma-multicast',
    term: 'TMA multicast',
    category: 'Parallelism',
    plainEnglish:
      'One tensor-memory transfer supplies multiple cooperating blocks, reducing repeated requests for shared input data.',
    definition:
      'TMA multicast distributes a transfer to selected blocks in a supported cluster, allowing them to receive shared input data in their local storage.',
    explanation:
      'Explicit multicast describes the recipients to hardware. The Blackwell article separately tests independent requests to identical addresses, where request coalescing can provide some similar behavior. Equal effective delivery throughput does not imply equal L2 traffic, especially as the working set changes.',
    significance:
      'Reusing inputs across blocks can reduce memory traffic for GEMM-like computations. The benefit depends on access overlap, cluster placement, and the remaining compute or synchronization bottlenecks.',
    benchmarkContext:
      'Distinguish bytes delivered into all destination buffers from bytes fetched through L2 or HBM. A traffic-reduction factor is not automatically an application-speedup factor, and the source’s caption unit discrepancy is labeled in the port.',
    relatedTerms: ['tensor-memory-accelerator', 'thread-block-cluster', 'arithmetic-intensity'],
    articleSlugs: [BLACKWELL],
  },
  {
    slug: 'two-sm-mma',
    term: 'Two-SM MMA',
    aliases: ['2SM MMA', 'cta_group::2'],
    category: 'Hardware',
    plainEnglish:
      'A Blackwell matrix instruction mode in which a coordinated pair of blocks uses two SMs together.',
    definition:
      'Two-SM MMA is a Blackwell tensor-core execution mode in which a cooperating CTA pair performs matrix multiply-accumulate work across two SMs.',
    explanation:
      'The larger execution scope supports different instruction shapes and data-sharing arrangements than a single-SM operation. Evaluating scaling requires accounting for the extra compute resources and the amount of work performed. Operand layout and shared-memory traffic can change the bottleneck alongside arithmetic capacity.',
    significance:
      'A twofold throughput gain with two SMs is not a twofold improvement in per-SM efficiency. Gains beyond that ratio can reflect relief of a single-SM memory bottleneck for particular shapes.',
    benchmarkContext:
      'The Blackwell port distinguishes SS and TS layouts and reports shape-dependent scaling. Preserve those conditions rather than treating its best ratio as a universal kernel or inference speedup.',
    relatedTerms: ['matrix-multiply-accumulate', 'tensor-memory', 'streaming-multiprocessor'],
    articleSlugs: [BLACKWELL],
  },
  {
    slug: 'matrix-multiply-accumulate',
    term: 'Matrix multiply-accumulate',
    abbreviation: 'MMA',
    category: 'Hardware',
    plainEnglish:
      'An operation that multiplies matrix tiles and adds the product to an accumulator.',
    definition:
      'Matrix multiply-accumulate computes a matrix product and accumulates it into an output tile, with supported shapes and numerical formats defined by the instruction interface.',
    explanation:
      'Tensor-core instructions implement MMA at particular execution scopes. Input format, accumulator precision, operand placement, tile dimensions, and independent in-flight operations all affect throughput. A small shape may leave arithmetic paths unused or spend more time moving operands than performing multiplication.',
    significance:
      'Peak tensor FLOPs require an appropriate instruction mix and enough independent work. A GEMM kernel must also load data, synchronize stages, and store outputs, so instruction throughput is an upper bound rather than a complete kernel measurement.',
    benchmarkContext:
      'The Blackwell port measures instruction shapes and queue depths separately. Its formula inconsistency is retained with an editorial note, so readers should not reuse the mismatched denominator as verified arithmetic.',
    relatedTerms: ['gemm', 'two-sm-mma', 'tensor-memory'],
    articleSlugs: [BLACKWELL],
  },
  {
    slug: 'speed-of-light',
    term: 'Speed-of-Light throughput',
    abbreviation: 'SoL',
    category: 'Benchmark metrics',
    plainEnglish:
      'A stated performance ceiling used to express how close a measured operation gets to its relevant hardware limit.',
    definition:
      'Speed-of-Light throughput is a normalization against a specified theoretical or attainable performance ceiling for the operation and resource being measured.',
    explanation:
      'The denominator must match the data format, instruction shape, clock basis, resource count, and sparse or dense arithmetic convention. A percentage without that denominator can conceal incompatible comparisons. Compute and memory ceilings also describe different limits and should not be substituted for each other.',
    significance:
      'High SoL in an isolated instruction test does not establish high application utilization. A model may spend much of its time in other operations, dependencies, communication, or idle gaps.',
    benchmarkContext:
      'The Blackwell port reports different fractions of peak at deep and shallow MMA queue depths. Use the queue depth resembling the real kernel before interpreting a saturation result as practically attainable.',
    relatedTerms: ['microbenchmark', 'roofline', 'gpu-utilization'],
    articleSlugs: [BLACKWELL, HUAWEI],
  },
  {
    slug: 'bytes-in-flight',
    term: 'Bytes in flight',
    category: 'Benchmark metrics',
    plainEnglish:
      'The amount of data requested by concurrent outstanding transfers before those transfers have all completed.',
    definition:
      'Bytes in flight measures outstanding transfer volume at a stated scope, such as one SM, rather than the total bytes processed over an entire benchmark.',
    explanation:
      'More outstanding work can hide latency and raise sustained bandwidth until a resource saturates. It also consumes buffers, barrier state, and issue capacity. Thread count, load width, stage count, and transfer shape can reach the same byte total with different execution costs.',
    significance:
      'Equal outstanding bytes do not guarantee equal throughput or latency. Comparisons need the same scope and units, and should separate requested traffic from data delivered to multiple multicast destinations.',
    benchmarkContext:
      'The Blackwell port plots transfer throughput against in-flight volume. It explicitly flags places where the source prose says bytes while the chart uses KiB, rather than silently treating them as equivalent.',
    relatedTerms: ['asynchronous-copy', 'tensor-memory-accelerator', 'memory-bandwidth'],
    articleSlugs: [BLACKWELL],
  },
  {
    slug: 'warm-cache-benchmark',
    term: 'Warm-cache benchmark',
    category: 'Benchmark metrics',
    plainEnglish:
      'A test run with data already resident in some cache levels, which may reduce traffic to slower memory.',
    definition:
      'A warm-cache benchmark measures execution after prior access has populated relevant caches, with the useful residency determined by working-set size and cache behavior.',
    explanation:
      'Repeating a small operator can reuse inputs that a production workload would fetch from a lower memory level. Warmup can also stabilize compilation and runtime state, but those effects are distinct from data-cache residency. A reproducible report identifies what was repeated and which working set fits.',
    significance:
      'Warm-cache tests can isolate compute or scheduling behavior while understating cold-memory costs. Comparing them with a streaming-memory test without disclosing the difference can misidentify the bottleneck.',
    benchmarkContext:
      'The Huawei port labels its TileLang operator comparison as warm-cache testing. That condition should accompany quoted speedups; it does not establish end-to-end serving throughput or peak HBM bandwidth.',
    relatedTerms: ['microbenchmark', 'tilelang', 'memory-bandwidth'],
    articleSlugs: [HUAWEI],
  },
  {
    slug: 'warp-occupancy',
    term: 'Warp occupancy',
    category: 'Benchmark metrics',
    plainEnglish:
      'How many warps reside on an SM relative to its supported maximum, not how busy its arithmetic units are.',
    definition:
      'Warp occupancy is the fraction of an SM’s supported resident warp capacity occupied by active resident warps under a kernel’s resource allocation.',
    explanation:
      'Registers, shared memory, block size, and architectural limits constrain residency. Resident warps can still wait on memory, barriers, or dependencies. More occupancy may help hide latency, but reducing registers or useful buffering merely to raise occupancy can make a kernel slower.',
    significance:
      'Occupancy differs from instruction issue efficiency and from sampled device utilization. Neither a high resident-warp count nor a high utilization percentage proves that tensor cores run near their arithmetic peak.',
    benchmarkContext:
      'The Blackwell port discusses thread counts and register tradeoffs in copy and attention paths. Interpret those choices jointly with bytes in flight and measured kernel latency, rather than maximizing occupancy in isolation.',
    relatedTerms: ['streaming-multiprocessor', 'gpu-utilization', 'bytes-in-flight'],
    articleSlugs: [BLACKWELL],
  },
  {
    slug: 'deepgemm',
    term: 'DeepGEMM',
    category: 'Software',
    plainEnglish:
      'DeepSeek’s matrix-kernel library family, with hardware-specific implementations and support boundaries that must be checked separately.',
    definition:
      'DeepGEMM provides optimized matrix multiplication kernels used in DeepSeek-related workloads, with separate implementation paths for supported accelerator environments.',
    explanation:
      'The Huawei article discusses DeepGEMM-Ascend alongside the wider Ascend software release. Kernel availability depends on hardware, numerical format, shapes, and host/runtime integration. A similarly named library on another backend does not imply identical instructions, supported features, or installation requirements.',
    significance:
      'A fast isolated GEMM matters only when the serving framework selects it for the relevant operation and the surrounding data movement does not erase its benefit. Unsupported host dependencies can prevent execution before performance is measurable.',
    benchmarkContext:
      'The port records historical x86-host limitations for a specific vLLM-Ascend release. Those observations are not a current compatibility verdict and should be rechecked before deployment.',
    relatedTerms: ['gemm', 'ascend', 'cann'],
    articleSlugs: [HUAWEI],
  },
  {
    slug: 'deepep',
    term: 'DeepEP',
    category: 'Software',
    plainEnglish:
      'DeepSeek’s expert-parallel communication library family for routing tokens to experts and combining their outputs.',
    definition:
      'DeepEP implements communication paths for mixture-of-experts dispatch and combine, with backend-specific support for hardware and transport mechanisms.',
    explanation:
      'Dispatch sends token data to the devices hosting selected experts; combine returns and aggregates their outputs. Message distribution depends on routing, batch size, expert placement, and topology. Communication may overlap other work, but it can also consume resources needed by compute kernels.',
    significance:
      'A fast communication microbenchmark does not guarantee a proportional model speedup. Routing imbalance, dependencies, and resource contention determine how much communication remains on the critical path.',
    benchmarkContext:
      'The Huawei port compares dispatch/combine measurements and discusses Ascend communication overlap. Keep the reported hardware and configuration attached to those results, and distinguish the Ascend implementation from other DeepEP backends.',
    relatedTerms: ['expert-parallelism', 'urma', 'ascend'],
    articleSlugs: [HUAWEI],
  },
];

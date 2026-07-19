export interface Quote {
  text: string;
  /** Simplified Chinese translation of `text`, shown on /zh pages. */
  textZh?: string;
  name: string;
  title: string;
  org: string;
  logo?: string;
  link?: string;
}

export const QUOTES: Quote[] = [
  {
    text: "Vendor-neutral, continuously updated benchmarking is essential as models and inference stacks co-evolve. MiniMax M3 was built with both frontier capability and real-world deployment efficiency in mind, and the day-one vLLM support from the community reflects the collaborative spirit we're proud to be part of. InferenceX provides the kind of transparent, reproducible data the ecosystem needs.",
    textZh:
      '在模型与推理技术栈协同演进的今天，厂商中立、持续更新的基准测试不可或缺。MiniMax M3 在设计之初就兼顾了前沿能力与实际部署效率，而社区第一时间对 vLLM 的支持也体现了我们引以为豪的协作精神。InferenceX 正是生态所需的透明、可复现的数据平台。',
    name: 'Ryan Lee',
    title: 'Head of DevRel, MiniMax',
    org: 'MiniMax',
    logo: 'minimax.svg',
    link: 'https://x.com/RyanLeeMiniMax',
  },
  {
    text: 'At Moonshot AI, we are dedicated to supporting the open-source ecosystem by advancing frontier open models. As the Kimi K2 series evolves, we are glad to see its performance tracked in InferenceX™’s open and reproducible benchmarks. InferenceX™ helps the community better understand industry-level performance and encourages the ecosystem to keep improving and optimizing.',
    textZh:
      'Moonshot AI 致力于通过推动前沿开源模型来支持开源生态。随着 Kimi K2 系列的不断演进，我们很高兴看到其性能被 InferenceX™ 的开放、可复现基准测试持续追踪。InferenceX™ 帮助社区更好地理解行业级性能水平，并推动生态持续改进与优化。',
    name: 'Moonshot AI',
    title: '',
    org: 'Moonshot AI',
    logo: 'moonshot-ai.svg',
    link: 'https://www.moonshot.ai/',
  },
  {
    text: "Qwen has always been about putting capable models into the hands of as many developers as possible, and real-world inference efficiency is what makes that scale. InferenceX™ brings rigorous, vendor-neutral measurement to exactly the questions that matter: how models like Qwen3.5 actually perform across accelerators. Independent, reproducible benchmarks on real hardware give the community the clarity it needs to deploy with confidence, and we're glad to see that level of transparency driving the inference ecosystem forward.",
    textZh:
      'Qwen 始终致力于将强大的模型交到尽可能多的开发者手中，而真实推理效率是实现规模化的关键。InferenceX™ 为最重要的问题带来了严谨、厂商中立的测量：像 Qwen3.5 这样的模型在各类加速器上的实际表现如何。基于真实硬件的独立、可复现基准测试为社区提供了自信部署所需的清晰洞察，我们很高兴看到这种透明度推动着推理生态不断向前发展。',
    name: 'Alibaba Qwen',
    title: '',
    org: 'Alibaba Qwen',
    logo: 'qwen.webp',
    link: 'https://qwen.ai',
  },
  {
    text: 'GLM was built for agentic coding and long-horizon autonomous execution, the kind of workloads where real inference performance is everything. Developers are running GLM-5.2 inside coding agents and multi-step tool-calling pipelines every day, so transparent data on how it actually performs across accelerators matters enormously. InferenceX™ gives the community exactly that: open, reproducible, vendor-neutral benchmarks on real hardware. We’re proud to see rigorous measurement helping developers deploy open models with confidence.',
    textZh:
      'GLM 为智能体编程和长程自主执行而生——在这类工作负载中，真实推理性能就是一切。开发者每天都在编程智能体和多步工具调用流水线中运行 GLM-5.2，因此关于它在各类加速器上实际表现的透明数据至关重要。InferenceX™ 为社区提供的正是这些：基于真实硬件的开放、可复现、厂商中立的基准测试。看到严谨的测量帮助开发者自信地部署开源模型，我们深感自豪。',
    name: 'Zhipu GLM',
    title: '',
    org: 'Zhipu GLM',
    logo: 'zhipu.webp',
    link: 'https://z.ai/',
  },
  {
    text: "As we build systems at unprecedented scale, it's critical for the ML community to have open, transparent benchmarks that reflect how inference really performs across hardware and software. InferenceMAX™'s head-to-head benchmarks cut through the noise and provide a living picture of token throughput, performance per dollar, and tokens per Megawatt. This kind of open source effort strengthens the entire ecosystem and helps everyone, from researchers to operators of frontier datacenters, make smarter decisions.",
    textZh:
      '在我们以前所未有的规模构建系统之际，机器学习社区拥有开放、透明的基准测试至关重要——它们真实反映了推理在不同硬件和软件上的表现。InferenceMAX™ 的对比基准测试穿透噪音，提供了关于 token 吞吐量、每美元性能和每兆瓦 token 数的动态全景。这种开源努力增强了整个生态，帮助从研究者到前沿数据中心运营者的每一个人做出更明智的决策。',
    name: 'Peter Hoeschele',
    title: 'VP of Infrastructure and Industrial Compute, OpenAI Stargate',
    org: 'OpenAI',
    logo: 'openai.svg',
    link: 'https://www.linkedin.com/in/peter-hoeschele/',
  },
  {
    text: "Our mission at Azure is to give customers the most performant, efficient, and cost-effective cloud for AI. SemiAnalysis InferenceMAX™ supports that mission by providing transparent, reproducible benchmarks that track inference performance across GPUs and software stacks under realistic workloads. This continuous data on throughput, efficiency, and cost per watt strengthens our ability to tune Azure's inference platform for scale, helping customers build with confidence on Microsoft Cloud.",
    textZh:
      'Azure 的使命是为客户提供性能最强、效率最高且最具成本效益的 AI 云。SemiAnalysis InferenceMAX™ 通过提供透明、可复现的基准测试来追踪各类 GPU 和软件栈在真实工作负载下的推理性能，有力地支持了这一使命。关于吞吐量、效率和每瓦成本的持续数据增强了我们优化 Azure 推理平台规模化的能力，帮助客户在 Microsoft Cloud 上自信构建。',
    name: 'Scott Guthrie',
    title: 'Executive Vice President, Microsoft Cloud & AI',
    org: 'Microsoft',
    logo: 'microsoft.svg',
    link: 'https://www.linkedin.com/in/guthriescott/',
  },
  {
    text: 'At Microsoft, delivering the best inference performance and economics for our customers at scale requires a deep understanding of how AI models interact with real-world hardware and software. Open-source, reproducible benchmarks, like InferenceMAX™, are essential for generating transparent insights into throughput, efficiency, and cost under realistic workloads. These continuous signals help guide our platform strategy, enabling us to optimize the entire stack from silicon, to systems, to software, so that every layer works together to unlock the full potential of our infrastructure.',
    textZh:
      '在 Microsoft，为客户大规模交付最佳推理性能和经济性，需要深入理解 AI 模型如何与真实硬件和软件交互。像 InferenceMAX™ 这样的开源、可复现基准测试对于产出关于吞吐量、效率和成本的透明洞察至关重要。这些持续信号帮助指导我们的平台战略，使我们能够从芯片到系统再到软件对整个技术栈进行优化，让每一层协同工作，充分释放基础设施的潜力。',
    name: 'Saurabh Dighe',
    title: 'Corporate Vice President, Azure Strategic Planning & Architecture',
    org: 'Microsoft',
    logo: 'microsoft.svg',
    link: 'https://www.linkedin.com/in/saurabhdighe/',
  },
  {
    text: 'PyTorch was built on the belief that open tools accelerate the entire AI ecosystem. InferenceX™ embodies that same philosophy—open, reproducible, and vendor-neutral benchmarks that give the community real data on real hardware. As inference workloads scale to serve billions of users, having a continuously updated, transparent performance baseline across accelerators is essential for practitioners and platform teams making critical infrastructure decisions.',
    textZh:
      'PyTorch 基于一个信念而生：开放工具能加速整个 AI 生态。InferenceX™ 体现了同样的理念——开放、可复现、厂商中立的基准测试，为社区提供真实硬件上的真实数据。随着推理工作负载扩展到服务数十亿用户，在各类加速器上持续更新、透明的性能基线对于做出关键基础设施决策的从业者和平台团队而言不可或缺。',
    name: 'Joseph Spisak',
    title: 'Product Director, Meta Super Intelligence Lab',
    org: 'Meta Superintelligence Labs',
    logo: 'meta.svg',
    link: 'https://www.linkedin.com/in/jspisak',
  },
  {
    text: 'Oracle Cloud Infrastructure is built to give frontier labs & enterprises flexibility and choice, with many GPU SKUs available for AI at scale. InferenceMAX strengthens that mission by delivering open source, reproducible benchmarks that reflect real-world performance, efficiency, and cost on the latest hardware and software. With this transparency, customers can confidently select the platforms that best align with their AI strategies.',
    textZh:
      'Oracle Cloud Infrastructure 旨在为前沿实验室和企业提供灵活性与选择，提供多种 GPU SKU 用于大规模 AI。InferenceMAX 通过提供开源、可复现的基准测试来支持这一使命，真实反映最新硬件和软件上的性能、效率与成本。凭借这种透明度，客户可以自信地选择与其 AI 战略最契合的平台。',
    name: 'Jay Jackson',
    title: 'Vice President, Oracle Cloud Infrastructure',
    org: 'Oracle',
    logo: 'oracle.svg',
    link: 'https://www.linkedin.com/in/jayejackson/',
  },
  {
    text: 'The gap between theoretical peak and real-world inference throughput is often determined by systems software: inference engine, distributed strategies, and low-level kernels. InferenceMAX™ is valuable because it benchmarks the latest software showing how optimizations like FP4, MTP, speculative decode, and wide-EP actually play out across various hardware. Open, reproducible results like these help the whole community move faster.',
    textZh:
      '理论峰值与实际推理吞吐量之间的差距往往取决于系统软件：推理引擎、分布式策略和底层内核。InferenceMAX™ 的价值在于它对最新软件进行基准测试，展示了 FP4、MTP、投机解码和 wide-EP 等优化在不同硬件上的实际效果。这种开放、可复现的结果帮助整个社区更快地前进。',
    name: 'Tri Dao',
    title: 'Chief Scientist of Together AI & Inventor of Flash Attention',
    org: 'Together AI',
    logo: 'together-ai.svg',
    link: 'https://tridao.me/',
  },
  {
    text: "The industry needs many public, reproducible benchmarks of inference performance. We're excited to collaborate with InferenceMAX™ from the vLLM team. More diverse workloads and scenarios that everyone can trust and reference will help the ecosystem move forward. Fair, transparent measurements drive progress across every layer of the stack, from model architectures to inference engines to hardware.",
    textZh:
      '行业需要大量公开、可复现的推理性能基准测试。vLLM 团队很高兴与 InferenceMAX™ 合作。更多元化的、人人可信赖和引用的工作负载与场景将推动生态向前发展。公平、透明的测量驱动着技术栈每一层的进步——从模型架构到推理引擎再到硬件。',
    name: 'Simon Mo',
    title: 'vLLM Project Co-Lead',
    org: 'vLLM',
    logo: 'vllm.svg',
    link: 'https://www.linkedin.com/in/simon-mo-834217162/',
  },
  {
    text: 'InferenceMAX™ benchmark is pogchamp & W in chat',
    textZh: 'InferenceMAX™ 基准测试绝绝子，大写的赢',
    name: 'Kaichao You',
    title: 'vLLM Project Co-Lead & PhD Student @ Tsinghua University',
    org: 'vLLM',
    logo: 'vllm.svg',
    link: 'https://www.linkedin.com/in/youkaichao/',
  },
  {
    text: 'Arguably the most important OSS benchmark suite out today InferenceX',
    textZh: 'InferenceX 堪称当下最重要的开源基准测试套件',
    name: 'Mark Saroufim',
    title: 'GPU Mode Founder & Meta PyTorch Engineer',
    org: 'GPU Mode',
    logo: 'gpu-mode.png',
    link: 'https://x.com/marksaroufim',
  },
  {
    text: 'InferenceMAX™ demonstrates how an open ecosystem can operate in practice. Many leading inference stacks such as vLLM, SGLang, and TensorRT-LLM are built on PyTorch, and benchmarks like this show how innovations across kernels, runtimes, and frameworks translate into measurable performance on a range of hardware platforms, including NVIDIA and AMD GPUs. By being open source and running nightly, InferenceMAX™ offers a transparent, community-driven approach to tracking progress and providing PyTorch users with data-driven insights.',
    textZh:
      'InferenceMAX™ 展示了开放生态如何在实践中运作。vLLM、SGLang 和 TensorRT-LLM 等众多领先推理栈均构建于 PyTorch 之上，而这样的基准测试展示了内核、运行时和框架层面的创新如何转化为 NVIDIA 和 AMD GPU 等多种硬件平台上可衡量的性能。凭借开源属性和每夜运行，InferenceMAX™ 提供了一种透明的、社区驱动的方式来追踪进展，并为 PyTorch 用户提供数据驱动的洞察。',
    name: 'Matt White',
    title: 'Executive Director, PyTorch Foundation',
    org: 'PyTorch Foundation',
    logo: 'pytorch.svg',
    link: 'https://www.linkedin.com/in/mdwdata/',
  },
  {
    text: 'InferenceMAX™ raises the bar by delivering open, transparent benchmarks that track how inference really performs across the latest GPUs and software stacks. For customers, having reproducible data that measures real world tokens per dollar & tokens per watt, turns abstract marketing numbers into actionable insight. At CoreWeave, we support this effort because it brings clarity to a fast-moving space and helps the entire ecosystem build with confidence.',
    textZh:
      'InferenceMAX™ 通过提供开放、透明的基准测试来追踪推理在最新 GPU 和软件栈上的实际表现，树立了新标杆。对客户而言，拥有衡量真实每美元 token 数和每瓦 token 数的可复现数据，将抽象的营销数字转化为可操作的洞察。CoreWeave 支持这一努力，因为它为这个快速发展的领域带来了清晰度，帮助整个生态自信构建。',
    name: 'Peter Salanki',
    title: 'CTO, CoreWeave',
    org: 'CoreWeave',
    logo: 'coreweave.svg',
    link: 'https://www.linkedin.com/in/salanki/',
  },
  {
    text: "InferenceMAX™ sets a new standard by providing open, transparent benchmarks that reveal how inference performs across today's leading GPUs and software stacks. With reproducible data measuring real-world tokens per dollar and tokens per watt, customers can move beyond marketing claims to actionable insights. For us at Nebius, as a full-stack AI cloud provider, this initiative helps us build our inference platform with confidence and ensure we are aligned with the ecosystem.",
    textZh:
      'InferenceMAX™ 通过提供开放、透明的基准测试，揭示了推理在当今领先 GPU 和软件栈上的表现，树立了新标准。凭借衡量真实每美元 token 数和每瓦 token 数的可复现数据，客户可以超越营销宣传，获得可操作的洞察。对于作为全栈 AI 云服务商的 Nebius 而言，这一计划帮助我们自信地构建推理平台，并确保与生态保持一致。',
    name: 'Roman Chernin',
    title: 'Co-Founder & Chief Business Officer, Nebius',
    org: 'Nebius',
    logo: 'nebius.svg',
    link: 'https://www.linkedin.com/in/roman-chernin-1b4b8758/',
  },
  {
    text: "At TensorWave, we're building a next-generation cloud on AMD GPUs because we believe innovation thrives when customers have strong alternatives. InferenceMAX™ reinforces that vision by providing open source, reproducible benchmarks that track throughput, efficiency, and cost across the latest hardware and software. By cutting through synthetic numbers and highlighting real-world inference performance, it helps customers see the full potential of AMD platforms for AI at scale.",
    textZh:
      '在 TensorWave，我们基于 AMD GPU 构建下一代云，因为我们相信当客户拥有强有力的替代方案时，创新才能蓬勃发展。InferenceMAX™ 通过提供开源、可复现的基准测试来追踪最新硬件和软件的吞吐量、效率与成本，强化了这一愿景。它穿透合成数据，突出真实推理性能，帮助客户看到 AMD 平台在大规模 AI 中的全部潜力。',
    name: 'Darrick Horton',
    title: 'CEO, TensorWave',
    org: 'TensorWave',
    logo: 'tensorwave.svg',
    link: 'https://www.linkedin.com/in/darrick-horton/',
  },
  {
    text: "SGLang is the inference engine behind many production inference factories such as xAI's Grok, earning its recognition as THE Inference King. At scale, we see firsthand how much performance varies across hardware, models, and configurations. InferenceX™ benchmarks SGLang across every major GPU platform nightly, capturing that variance in a way no other benchmark does, continuously, & reproducibly.",
    textZh:
      'SGLang 是 xAI Grok 等众多生产级推理工厂背后的推理引擎，被誉为推理之王。在大规模场景中，我们深刻体会到性能在不同硬件、模型和配置间的巨大差异。InferenceX™ 每夜在所有主流 GPU 平台上对 SGLang 进行基准测试，以其他基准测试无法做到的方式——持续且可复现地——捕捉这种差异。',
    name: 'Mingyi Lu',
    title: 'SGLang Product Lead',
    org: 'SGLang',
    logo: 'sglang.webp',
    link: 'https://www.linkedin.com/in/mingyi-lu/',
  },
  {
    text: "InferenceX™ ensembles precisely that — open, reproducible benchmarks that are continuously updated as xPU accelerators (GPUs/TPUs/LPUs), memory, storage, and software stacks evolve. I'm excited to see the InferenceX benchmarking roadmap include agentic coding workloads that stress CPU KV Cache offloading & soon NVMe KV Cache offloading from xPUs. As WEKA helps scale the Memory Wall by building the KV Cache infrastructure that feeds these xPUs, having this level of visibility into inference performance helps the entire ecosystem make smarter decisions about where to invest.",
    textZh:
      'InferenceX™ 恰好体现了这一点——开放、可复现的基准测试，随着 xPU 加速器（GPU/TPU/LPU）、内存、存储和软件栈的演进而持续更新。我很高兴看到 InferenceX 基准测试路线图纳入了对 CPU KV Cache 卸载乃至即将到来的 NVMe KV Cache 卸载施压的智能体编程工作负载。WEKA 通过构建为这些 xPU 供给的 KV Cache 基础设施来帮助突破内存墙，拥有这种对推理性能的深度可见性有助于整个生态做出更明智的投资决策。',
    name: 'Val Bercovici',
    title: 'Chief AI Officer, WEKA',
    org: 'WEKA',
    logo: 'weka.svg',
    link: 'https://www.linkedin.com/in/valentinbercovici/',
  },
  {
    text: 'For researchers working on inference optimizations, understanding how new techniques interact across the software and hardware stack is critical yet incredibly hard to measure. InferenceX™ provides much-needed insights into how inference performance evolves across major hardware platforms, moving the field forward with open, reproducible data that makes the gaps and progress visible.',
    textZh:
      '对于从事推理优化的研究者而言，理解新技术如何在软硬件栈中交互至关重要，却极难衡量。InferenceX™ 提供了亟需的洞察，展示了推理性能在各主要硬件平台上的演进轨迹，以开放、可复现的数据让差距与进展清晰可见，推动了该领域的发展。',
    name: 'Simon Guo',
    title: 'PhD Student, Stanford CS',
    org: 'Stanford',
    logo: 'stanford.svg',
    link: 'https://simonguo.tech/',
  },
  {
    text: 'Hugging Face exists to make AI open and accessible to everyone. InferenceX™ extends that mission to ai chip performance, pulling models directly from the Hub and benchmarking them across every major accelerator, continuously and transparently. When the community can see exactly how frontier open models perform on real hardware in real time, it raises the bar for the entire ecosystem.',
    textZh:
      'Hugging Face 的存在是为了让 AI 对每个人都开放且可及。InferenceX™ 将这一使命延伸到 AI 芯片性能领域，直接从 Hub 拉取模型，在所有主流加速器上持续、透明地进行基准测试。当社区能够实时看到前沿开源模型在真实硬件上的确切表现时，整个生态的标准都将被提升。',
    name: 'Clement Delangue',
    title: 'CEO, Hugging Face',
    org: 'Hugging Face',
    logo: 'huggingface.svg',
    link: 'https://www.linkedin.com/in/cdelangue/',
  },
  {
    text: 'Lambda exists to make GPU compute simple and accessible for AI teams, from individual researchers to the largest labs. InferenceX™ aligns with that mission by giving the community open, reproducible benchmarks that measure what actually matters: real-world throughput, cost efficiency, and performance per watt across the latest hardware and software stacks. Teams can make informed compute choices grounded in transparent, continuously updated data.',
    textZh:
      'Lambda 致力于让 GPU 算力对 AI 团队——从个人研究者到大型实验室——都简单易用。InferenceX™ 通过为社区提供开放、可复现的基准测试来衡量真正重要的指标：真实吞吐量、成本效率以及最新硬件和软件栈上的每瓦性能，与这一使命高度契合。团队可以基于透明、持续更新的数据做出明智的算力选择。',
    name: 'Stephen Balaban',
    title: 'Co-founder and CEO, Lambda',
    org: 'Lambda',
    logo: 'lambda.svg',
    link: 'https://www.linkedin.com/in/sbalaban/',
  },
  {
    text: 'When we introduced DistServe, the thesis was simple: split prefill and decode and optimize each on its own terms. Eighteen months later, disaggregation is the default architecture across the industry. InferenceX™ is the benchmark that comparing disaggregated and aggregated serving across the whole pareto curve. InferenceX shows exactly when and where P/D separation pays off in TTFT, TPOT, throughput, and cost.',
    textZh:
      '当我们推出 DistServe 时，核心论点很简单：将预填充和解码分离，分别优化。十八个月后，解聚已成为行业默认架构。InferenceX™ 是在整条帕累托曲线上对比解聚与聚合服务的基准测试。InferenceX 精确展示了 P/D 分离在 TTFT、TPOT、吞吐量和成本方面何时何地带来收益。',
    name: 'Hao Zhang',
    title: 'Assistant Professor, UC San Diego & Co-Creator of DistServe, vLLM, and FastVideo',
    org: 'UC San Diego',
    logo: 'uc-san-diego.svg',
    link: 'https://haozhang.ai/',
  },
  {
    text: 'The benchmark is good sir',
    textZh: '这基准测试真不错',
    name: 'Michael Goin',
    title: 'vLLM Core Maintainer & Senior Principal Engineer at Red Hat',
    org: 'Red Hat',
    logo: 'redhat.svg',
    link: 'https://www.linkedin.com/in/michael-goin/',
  },
  {
    text: 'Now commonly hearing "We want the Semianalysis for X". Testament to what @dylan522p has built.',
    textZh: '现在经常听到"我们想要X领域的 SemiAnalysis"。这是对 @dylan522p 所构建之物的最好证明。',
    name: 'Sriram Krishnan',
    title: 'White House Senior AI Advisor',
    org: 'White House',
    logo: 'white-house.svg',
    link: 'https://x.com/sriramk/status/2048824255702262135',
  },
  {
    text: 'Open collaboration is driving the next era of AI innovation. The open-source InferenceMAX benchmark gives the community transparent, nightly results that inspire trust and accelerate progress. It highlights the competitive TCO performance of our AMD Instinct MI300, MI325X, and MI355X GPUs across diverse workloads, underscoring the strength of our platform and our commitment to giving developers real-time visibility into our software progress.',
    textZh:
      '开放协作正在推动 AI 创新的下一个时代。开源的 InferenceMAX 基准测试为社区提供透明的每夜结果，激发信任并加速进步。它突出了我们 AMD Instinct MI300、MI325X 和 MI355X GPU 在多样化工作负载中极具竞争力的 TCO 表现，彰显了我们平台的实力以及我们致力于让开发者实时了解软件进展的承诺。',
    name: 'Dr. Lisa Su',
    title: 'Chair and CEO, AMD',
    org: 'AMD',
    logo: 'amd.svg',
    link: 'https://www.linkedin.com/in/lisasu-amd/',
  },
  {
    text: "Inference demand is growing exponentially, driven by long-context reasoning. NVIDIA Grace Blackwell NVL72 was invented for this new era of thinking AI. NVIDIA is meeting that demand through constant hardware and software innovation to enable what's next in AI. By benchmarking frequently, InferenceMAX™ gives the industry a transparent view of LLM inference performance on real-world workloads. The results are clear: Grace Blackwell NVL72 with TRT-LLM and Dynamo delivers unmatched performance per dollar and per megawatt—powering the most productive and cost-effective AI factories in the world.",
    textZh:
      '推理需求在长上下文推理的驱动下呈指数级增长。NVIDIA Grace Blackwell NVL72 正是为这个思考型 AI 的新时代而生。NVIDIA 通过持续的硬件和软件创新来满足这一需求，推动 AI 的下一步发展。通过高频基准测试，InferenceMAX™ 为行业提供了 LLM 推理在真实工作负载上性能的透明视角。结果一目了然：Grace Blackwell NVL72 搭配 TRT-LLM 和 Dynamo 提供了无与伦比的每美元性能和每兆瓦性能——驱动着全球最高效、最具成本效益的 AI 工厂。',
    name: 'Jensen Huang',
    title: 'Founder & CEO, NVIDIA',
    org: 'NVIDIA',
    logo: 'nvidia.svg',
    link: 'https://www.linkedin.com/in/jenhsunhuang/',
  },
  {
    text: "Speed is the moat. InferenceMAX™'s nightly benchmarks match the speed of improvement of the AMD software stack. It's fantastic to see AMD's MI300, MI325, and MI355 GPUs performing so well across diverse workloads and interactivity levels.",
    textZh:
      '速度就是护城河。InferenceMAX™ 的每夜基准测试与 AMD 软件栈的改进速度同步。看到 AMD MI300、MI325 和 MI355 GPU 在多样化工作负载和交互级别上表现如此出色，令人振奋。',
    name: 'Anush Elangovan',
    title: 'VP GPU Software, AMD',
    org: 'AMD',
    logo: 'amd.svg',
    link: 'https://www.linkedin.com/in/anushelangovan/',
  },
  {
    text: 'InferenceMAX™ highlights workloads that the ML community cares about. At NVIDIA, we welcome these comparisons because they underscore the advantage of our full-stack approach—from GPUs hardware to NVLink networking to NVL72 Rack Scale to Dynamo disaggregated serving that consistently delivers industry-leading inference performance and ROI at scale.',
    textZh:
      'InferenceMAX™ 聚焦机器学习社区关注的工作负载。在 NVIDIA，我们欢迎这些对比，因为它们凸显了我们全栈方案的优势——从 GPU 硬件到 NVLink 网络，到 NVL72 机架级系统，再到 Dynamo 解聚服务，持续提供业界领先的推理性能和大规模投资回报率。',
    name: 'Ian Buck',
    title: 'VP & GM, Hyperscale, NVIDIA & Inventor of CUDA',
    org: 'NVIDIA',
    logo: 'nvidia.svg',
    link: 'https://www.linkedin.com/in/ian-buck-19201315/',
  },
  {
    text: "InferenceMAX™'s nightly results highlight the rapid pace of progress in the AMD software stack. It's exciting to witness the birth of an open project that provides a tied feedback loop between what the software team works on here at AMD and how it affects specific ML use cases across our MI300, MI325, and MI355 GPUs. I'm looking forward to see what's next for InferenceMAX and to showcase what the AMD platform can do. AMD GPUs will continue to get faster every week.",
    textZh:
      'InferenceMAX™ 的每夜结果突出展示了 AMD 软件栈的快速进步。能够见证一个开源项目的诞生令人兴奋——它在 AMD 软件团队的工作与其对我们 MI300、MI325 和 MI355 GPU 上特定机器学习用例的影响之间建立了紧密的反馈闭环。我期待看到 InferenceMAX 的下一步发展，并展示 AMD 平台的能力。AMD GPU 将持续每周变得更快。',
    name: 'Quentin Colombet',
    title: 'Senior Director, AMD, Ex-Brium CEO',
    org: 'AMD',
    logo: 'amd.svg',
    link: 'https://www.linkedin.com/in/quentincolombet/',
  },
  {
    text: "At Crusoe, we believe being a great partner means empowering our customers with choice and clarity. That's why we're proud to support InferenceMAX™, which provides the entire AI community with open-source, reproducible benchmarks for the latest hardware. By delivering transparent, real-world data on throughput, efficiency, and cost, InferenceMAX™ cuts through the hype and helps our customers confidently select the very best platform for their unique workloads.",
    textZh:
      '在 Crusoe，我们相信成为优秀合作伙伴意味着赋予客户选择权和清晰度。这就是我们自豪地支持 InferenceMAX™ 的原因——它为整个 AI 社区提供最新硬件上开源、可复现的基准测试。通过提供关于吞吐量、效率和成本的透明真实数据，InferenceMAX™ 穿透炒作，帮助客户自信地为其独特工作负载选择最佳平台。',
    name: 'Chase Lochmiller',
    title: 'Co-Founder & CEO, Crusoe',
    org: 'Crusoe',
    logo: 'crusoe.svg',
    link: 'https://www.linkedin.com/in/chase-lochmiller-604483341/',
  },
  {
    text: 'Supermicro is excited about the launch of InferenceMAX™, the SemiAnalysis benchmarking system that measures real-world throughput, performance per dollar, and energy efficiency. This open-source tool provides reproducible benchmarks running on the latest hardware and software enabling AI labs and enterprises to choose the best platforms at scale.',
    textZh:
      'Supermicro 对 InferenceMAX™ 的发布感到振奋——这是 SemiAnalysis 的基准测试系统，衡量真实吞吐量、每美元性能和能效。这一开源工具在最新硬件和软件上提供可复现的基准测试，帮助 AI 实验室和企业在大规模场景中选择最佳平台。',
    name: 'Charles Liang',
    title: 'Founder & CEO, Supermicro',
    org: 'Supermicro',
    logo: 'supermicro.svg',
    link: 'https://en.wikipedia.org/wiki/Charles_Liang',
  },
  {
    text: 'Vultr is committed to providing an open ecosystem that gives developers freedom in how they build and scale AI — whether on NVIDIA or AMD GPUs. With InferenceMAX™, customers gain open, reproducible benchmarks that deliver clear insights into throughput, efficiency, and cost across cutting-edge hardware and software. By showcasing real-world performance, we empower teams to confidently choose the right platform for their AI workloads.',
    textZh:
      'Vultr 致力于提供一个开放生态，让开发者自由选择如何构建和扩展 AI——无论是在 NVIDIA 还是 AMD GPU 上。借助 InferenceMAX™，客户获得开放、可复现的基准测试，对前沿硬件和软件的吞吐量、效率与成本提供清晰洞察。通过展示真实性能，我们赋能团队自信地为其 AI 工作负载选择合适的平台。',
    name: 'Nathan Goulding',
    title: 'SVP of Engineering, Vultr',
    org: 'Vultr',
    logo: 'vultr.svg',
    link: 'https://www.linkedin.com/in/nathangoulding/',
  },
  {
    text: "At Prime Intellect, we're pushing the frontier of AI post-training and open research. InferenceX™ complements that work by providing open, reproducible benchmarks that track real-world inference performance across hardware and software stacks as they evolve. For researchers like us, having transparent, continuously updated data on throughput and efficiency means we can focus on building better models instead of second-guessing infrastructure. This is the kind of community-driven effort that accelerates progress for everyone.",
    textZh:
      '在 Prime Intellect，我们正在推动 AI 后训练和开放研究的前沿。InferenceX™ 通过提供开放、可复现的基准测试来追踪推理性能在不断演进的硬件和软件栈上的真实表现，与我们的工作形成互补。对于像我们这样的研究者，拥有关于吞吐量和效率的透明、持续更新的数据意味着我们可以专注于构建更好的模型，而不必为基础设施选择纠结。这正是加速每个人进步的社区驱动力量。',
    name: 'Jack Min Ong',
    title: 'Researcher, Prime Intellect',
    org: 'Prime Intellect',
    logo: 'prime-intellect.svg',
    link: 'https://www.linkedin.com/in/jackminong/',
  },
  {
    text: "At Firmus, we're building the most energy-efficient AI Factories in the world — and efficiency only matters if you can measure it. InferenceX™ gives the industry open, reproducible benchmarks that track real-world throughput, cost, and performance per watt across the latest GPU platforms and software stacks. As we scale gigawatts of renewable-powered AI infrastructure across Asia-Pacific & Australia, this kind of transparent, continuously updated data helps the entire ecosystem understand what these systems actually deliver.",
    textZh:
      '在 Firmus，我们正在建造全球最节能的 AI 工厂——而效率只有在可衡量时才有意义。InferenceX™ 为行业提供开放、可复现的基准测试，追踪最新 GPU 平台和软件栈上的真实吞吐量、成本和每瓦性能。随着我们在亚太和澳洲扩展吉瓦级可再生能源驱动的 AI 基础设施，这种透明、持续更新的数据帮助整个生态了解这些系统的实际交付能力。',
    name: 'Tim Rosenfield',
    title: 'Co-Founder & Co-CEO, Firmus',
    org: 'Firmus',
    logo: 'firmus.svg',
    link: 'https://www.linkedin.com/in/tim-rosenfield-a735a4112',
  },
  {
    text: 'InferenceMAX has been useful for us even if Dylan Patel is a nice little guy with feelings',
    textZh: 'InferenceMAX 对我们很有用，即使 Dylan Patel 是个有感情的可爱小伙子',
    name: 'Matthew Leavitt',
    title: 'Chief Science Officer, DatologyAI',
    org: 'DatologyAI',
    logo: 'datologyai.svg',
    link: 'https://www.linkedin.com/in/matthew-leavitt-6797703b/',
  },
  {
    text: "InferenceX™ provides the open source measurements the community needs — nightly results across real workloads, real hardware, and real software stacks. As someone who has written extensively about the gap between theoretical and actual system performance, I'm glad to see a project that makes that gap visible and trackable for everyone.",
    textZh:
      'InferenceX™ 提供了社区所需的开源测量——真实工作负载、真实硬件和真实软件栈上的每夜结果。作为一位大量撰写过理论性能与实际系统性能差距的人，我很高兴看到一个让这种差距对每个人都清晰可见、可追踪的项目。',
    name: 'Stas Bekman',
    title: 'Developer & Author of Machine Learning Engineering Open Book (17.5K+ ⭐)',
    org: 'Stas Bekman',
    link: 'https://github.com/stas00/ml-engineering',
  },
  {
    text: 'We use InferenceX benchmarks ourselves as one of the key datapoints to help us make infrastructure decisions at Adaptive ML. Inference performance is critical for large-scale RL workloads, where fast generation directly impacts time to market & revenue for our customers. InferenceX™ benchmarks the full stack continuously — engine, model, software, and hardware across rack-scale systems like GB300 NVL72. This is the kind of open, transparent, reproducible signal the ecosystem has been missing.',
    textZh:
      '我们在 Adaptive ML 自己也使用 InferenceX 基准测试作为帮助我们做出基础设施决策的关键数据点之一。推理性能对于大规模强化学习工作负载至关重要，快速生成直接影响客户的上市时间和收入。InferenceX™ 持续对全栈进行基准测试——引擎、模型、软件和硬件，覆盖 GB300 NVL72 等机架级系统。这正是生态一直缺少的那种开放、透明、可复现的信号。',
    name: 'Julien Launay',
    title: 'Co-Founder & CEO, Adaptive ML',
    org: 'Adaptive ML',
    logo: 'adaptive-ml.svg',
    link: 'https://www.linkedin.com/in/julienlaunay/',
  },
  {
    text: "Our customers ship AI to production using frontier open-source models — and at scale, every token per second and every dollar per million tokens matters. InferenceX™ gives the ecosystem something we've always needed: an objective, open benchmark that tracks real inference performance continuously across hardware such as GB300 NVL72, GB200 NVL72, H100 & soon Rubin & TPU & Trainium. Very helpful in allowing the wider community to understand the landscape and creating a clear taxonomy around performance.",
    textZh:
      '我们的客户使用前沿开源模型将 AI 投入生产——在大规模场景中，每秒每个 token 和每百万 token 的每一美元都至关重要。InferenceX™ 为生态提供了我们一直需要的东西：一个客观、开放的基准测试，持续追踪 GB300 NVL72、GB200 NVL72、H100 以及即将到来的 Rubin、TPU 和 Trainium 等硬件上的真实推理性能。这对帮助更广泛的社区理解行业格局并建立清晰的性能分类体系非常有价值。',
    name: 'Alex Ker',
    title: 'Engineer, Baseten',
    org: 'Baseten',
    logo: 'baseten.svg',
    link: 'https://www.linkedin.com/in/alex-ker/',
  },
  {
    text: 'We founded Verda to give AI engineers frictionless access to cutting-edge compute without gatekeeping. InferenceX supports this mission by giving AI builders open, reproducible benchmarks that show what GPUs actually deliver under real inference workloads. We want our customers to see transparent, continuously updated performance data, without marketing fluff. InferenceX provides exactly that.',
    textZh:
      '我们创立 Verda 是为了让 AI 工程师无障碍地使用前沿算力，没有门槛。InferenceX 通过为 AI 构建者提供开放、可复现的基准测试来支持这一使命，展示 GPU 在真实推理工作负载下的实际交付能力。我们希望客户看到透明、持续更新的性能数据，没有营销虚辞。InferenceX 恰好提供了这一切。',
    name: 'Ruben Bryon',
    title: 'Founder & CEO, Verda',
    org: 'Verda',
    logo: 'verda.svg',
    link: 'https://www.linkedin.com/in/ruben-bryon/',
  },
  {
    text: 'Voltage Park is built to give AI teams fast, affordable access to GPU compute at scale. InferenceX™ supports that goal by providing open, reproducible benchmarks that show how inference actually performs across the latest hardware and software stacks. With transparent, continuously updated data on throughput, efficiency, and cost, teams can make confident compute decisions instead of guessing. We’re happy to back an effort that brings this level of clarity to the ecosystem.',
    textZh:
      'Voltage Park 旨在为 AI 团队提供快速、经济的大规模 GPU 算力。InferenceX™ 通过提供开放、可复现的基准测试来展示推理在最新硬件和软件栈上的实际表现，有力支持了这一目标。凭借关于吞吐量、效率和成本的透明、持续更新数据，团队可以自信地做出算力决策而非凭空猜测。我们很高兴支持一项为生态带来如此清晰度的工作。',
    name: 'Saurabh Giri',
    title: 'CTO, Voltage Park',
    org: 'Voltage Park',
    logo: 'voltage-park.svg',
    link: 'https://www.linkedin.com/in/saurabh-giri/',
  },
  {
    text: "At Periodic Labs, we're building AI scientists that turn compute into real-world scientific discoveries. That means we care deeply about what each GPU actually delivers. InferenceX™ provides open, reproducible benchmarks that cut through spec sheets and show real-world throughput, efficiency, and cost across the latest hardware and software stacks. Having done inference across thousands of GPUs, I can say this kind of transparent, continuously updated data is exactly what practitioners need to make smart infrastructure decisions.",
    textZh:
      '在 Periodic Labs，我们正在构建将算力转化为真实科学发现的 AI 科学家。这意味着我们非常关注每块 GPU 的实际交付能力。InferenceX™ 提供开放、可复现的基准测试，穿透规格表，展示最新硬件和软件栈上的真实吞吐量、效率与成本。在数千块 GPU 上做过推理后，我可以说这种透明、持续更新的数据正是从业者做出明智基础设施决策所需要的。',
    name: 'Xander Dunn',
    title: 'Founding Team, Periodic Labs',
    org: 'Periodic Labs',
    logo: 'periodic-labs.png',
    link: 'https://www.linkedin.com/in/xanderdunn/',
  },
  {
    text: 'As AI infrastructure scales globally, no single vendor or region can define the benchmarks that matter for everyone. InferenceX is an important step toward a shared, transparent view of inference performance and TCO, enabling more rational investments for sovereign AI Cloud operators, as well as healthier competition, and ultimately more accessible AI capacity worldwide.',
    textZh:
      '随着 AI 基础设施在全球范围内扩展，没有任何单一厂商或地区能够定义适用于所有人的基准测试。InferenceX 是朝着共享、透明的推理性能和 TCO 视角迈出的重要一步，为主权 AI 云运营商带来更理性的投资决策、更健康的竞争，并最终在全球范围内提供更可及的 AI 算力。',
    name: 'Talal M. Al Kaissi',
    title: 'CEO',
    org: 'Core42',
    logo: 'core42.webp',
  },
  {
    text: 'It is important to have an open and continuously updated platform for benchmarking inference engines across real workloads and diverse hardware. InferenceX provides this kind of transparent and practical evaluation, helping the community better understand real system bottlenecks and tradeoffs. Benchmarks like this are essential for building more efficient and scalable AI systems. Moreover, as LLM agents become increasingly capable at improving systems, such a platform can provide the reliable feedback needed to close the automatic optimization loop, further driving progress in this field.',
    textZh:
      '拥有一个开放且持续更新的平台来对推理引擎在真实工作负载和多样化硬件上进行基准测试非常重要。InferenceX 提供了这种透明、实用的评估，帮助社区更好地理解真实系统瓶颈和权衡。这样的基准测试对于构建更高效、更可扩展的 AI 系统至关重要。此外，随着 LLM 智能体在改进系统方面日益强大，这样的平台可以提供闭合自动优化循环所需的可靠反馈，进一步推动该领域的进步。',
    name: 'Cao Shiyi',
    title: 'Researcher, Sky Computing Lab',
    org: 'UC Berkeley',
    logo: 'sky-berkeley.webp',
  },
  {
    text: 'At GMI Cloud, we believe inference has become the center of AI value creation. SemiAnalysis has done something the industry has long needed with InferenceX—they’ve turned inference from a black box into a continuously measured, real-world system. By benchmarking not just hardware, but the full stack—models, runtimes, and distributed systems—InferenceX reflects how AI actually runs in production, not how it’s marketed.',
    textZh:
      '在 GMI Cloud，我们认为推理已成为 AI 价值创造的核心。SemiAnalysis 通过 InferenceX 做了行业期盼已久的事——将推理从一个黑箱变成了一个被持续衡量的真实系统。InferenceX 不仅对硬件进行基准测试，还覆盖完整技术栈——模型、运行时和分布式系统，反映的是 AI 在生产中的实际运行方式，而非营销宣传。',
    name: 'Alex Yeh',
    title: 'Founder & CEO, GMI Cloud',
    org: 'GMI Cloud',
    logo: 'gmi-cloud.svg',
    link: 'https://www.linkedin.com/in/gmi-yeh',
  },
  {
    text: 'At EmbeddedLLM, our team works deep in the production inference stack, including major maintainer and contributor work in vLLM, so we see every day how much real-world AI performance depends on the full system: model, runtime, kernels, scheduling, and hardware. InferenceX™ matters because it benchmarks that full system continuously and openly. It turns inference from a marketing conversation into an engineering discipline, giving AI labs, neoclouds, and enterprises the data they need to make decisions on throughput, cost, and efficiency at production scale.',
    textZh:
      '在 EmbeddedLLM，我们的团队深耕于生产推理栈，包括 vLLM 的核心维护和贡献工作，因此我们每天都能看到真实 AI 性能在多大程度上取决于完整系统：模型、运行时、内核、调度和硬件。InferenceX™ 之所以重要，是因为它持续且公开地对完整系统进行基准测试。它将推理从营销话题转变为工程学科，为 AI 实验室、新型云服务商和企业提供在生产规模上做出吞吐量、成本和效率决策所需的数据。',
    name: 'Pin Siang Tan',
    title: 'Co-founder & CTO, EmbeddedLLM',
    org: 'EmbeddedLLM',
    logo: 'embeddedllm.webp',
    link: 'https://www.linkedin.com/in/tanpinsiang',
  },
  {
    text: 'Agentic workloads are where context caching starts to matter in a very concrete way. The same tools, instructions, documents, and conversation state get reused across many steps, and every recomputed prefix adds latency and GPU cost. Tensormesh is built to make that reuse visible and usable in production, whether teams run through an OpenAI-compatible API or on reserved capacity. InferenceX is useful because it tests these workloads the way they actually behave, with long sessions, repeated context, and enough cache pressure to show whether the serving system is doing the right thing.',
    textZh:
      '智能体工作负载让上下文缓存的价值以非常具体的方式显现出来。相同的工具、指令、文档和对话状态会在许多步骤中被反复使用，而每一次重新计算的前缀都会增加延迟和 GPU 成本。Tensormesh 的目标就是让这种复用在生产环境中可见、可用——无论团队是通过 OpenAI 兼容 API 还是在预留算力上运行。InferenceX 的价值在于它按照这些工作负载的真实行为进行测试：长会话、重复上下文，以及足够的缓存压力，足以检验服务系统是否做对了。',
    name: 'Kuntai Du',
    title: 'Chief Scientist at Tensormesh & Co-Creator of LMCache',
    org: 'Tensormesh',
    logo: 'tensormesh.svg',
    link: 'https://www.linkedin.com/in/kuntai-du/',
  },
  {
    text: 'LMCache started from a simple observation: KV cache should be managed by the serving system, not treated as disposable state inside one engine. Agentic traces make that especially clear. They create repeated prefixes, shared context, long conversations, and opportunities to move cache between GPU memory, host memory, storage, and other workers. InferenceX gives the community a way to measure those behaviors directly, including KV offload, cache sharing, and prefill efficiency, on workloads that look much closer to real agent use than a fixed prompt benchmark.',
    textZh:
      'LMCache 源于一个简单的观察：KV cache 应该由服务系统统一管理，而不是被当作单个引擎内部用完即弃的状态。智能体轨迹让这一点尤为清晰：它们会产生重复前缀、共享上下文、长对话，以及在 GPU 显存、主机内存、存储和其他 worker 之间迁移缓存的机会。InferenceX 让社区能够直接测量这些行为——包括 KV 卸载、缓存共享和预填充效率——而所用的工作负载远比固定提示词基准测试更接近真实的智能体使用场景。',
    name: 'Yihua Cheng',
    title: 'Co-Creator of LMCache & CTO at Tensormesh',
    org: 'LMCache',
    logo: 'lmcache.webp',
    link: 'https://www.linkedin.com/in/yihuacheng-215133327/',
  },
];

/**
 * Orgs featured in the landing page carousel. Display order comes from the
 * QUOTES array above (carousel orgs are listed first there); this list only
 * controls membership.
 */
export const CAROUSEL_ORGS = [
  'MiniMax',
  'Moonshot AI',
  'Alibaba Qwen',
  'Zhipu GLM',
  'OpenAI',
  'Microsoft',
  'Meta Superintelligence Labs',
  'Oracle',
  'Together AI',
  'vLLM',
  'GPU Mode',
  'PyTorch Foundation',
  'CoreWeave',
  'Nebius',
  'TensorWave',
  'SGLang',
  'WEKA',
  'Stanford',
  'Hugging Face',
  'Lambda',
  'UC San Diego',
  'Red Hat',
  'White House',
] as const;

/** Display label overrides for carousel orgs. */
export const CAROUSEL_LABELS: Record<string, string> = {
  'Together AI': 'Tri Dao',
  'PyTorch Foundation': 'PyTorch',
  'Meta Superintelligence Labs': 'Meta',
  'Moonshot AI': 'Moonshot Kimi',
};

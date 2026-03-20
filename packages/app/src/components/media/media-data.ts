export type MediaType = 'article' | 'video';

export interface MediaItem {
  title: string;
  organization: string;
  url: string;
  type: MediaType;
  date: string;
}

export const MEDIA_ITEMS: MediaItem[] = [
  {
    title:
      '\u82F1\u4F1F\u8FBE\u70ED\u70B9\u5C0F\u65F6\u62A5: \u6570\u636E\u4E2D\u5FC3\u5C31\u662FToken\u5DE5\u5382 \u2014 Jensen Huang GTC 2026',
    organization: 'Sina Tech',
    url: 'https://k.sina.com.cn/article_7857201856_1d45362c001903dwbo.html?from=tech',
    type: 'article',
    date: '2026-03-20',
  },
  {
    title: 'AMD Head of AI Product, Ramine Roane, shows his Inference King Champion Belt',
    organization: 'AMD',
    url: 'https://x.com/roaner/status/2034700440173154368',
    type: 'video',
    date: '2026-03-19',
  },
  {
    title: 'NVIDIA H200 vs B200 vs GB200: Which GPU to Rent for AI in 2026?',
    organization: 'Spheron Network',
    url: 'https://www.spheron.network/blog/nvidia-h200-vs-b200-vs-gb200/',
    type: 'article',
    date: '2026-03-18',
  },
  {
    title:
      'GMI Cloud \u6210\u4E3A\u82F1\u4F1F\u8FBE Dynamo 1.0 \u53CA OpenShell \u9996\u53D1\u5408\u4F5C\u4F19\u4F34',
    organization: 'GMI Cloud (Juejin)',
    url: 'https://juejin.cn/post/7618440658614681600',
    type: 'article',
    date: '2026-03-18',
  },
  {
    title: 'Nvidia\u2019s Jensen Huang Says AI Compute Could Near $1 Trillion by 2027',
    organization: 'PYMNTS',
    url: 'https://www.pymnts.com/artificial-intelligence-2/2026/nvidias-jensen-huang-says-ai-compute-could-near-1-trillion-by-2027/',
    type: 'article',
    date: '2026-03-17',
  },
  {
    title: 'Telcos are the best channel to Democratize AI',
    organization: 'Sebastian Barros',
    url: 'https://sebastianbarros.substack.com/p/telcos-are-the-best-channel-to-democratize',
    type: 'article',
    date: '2026-03-17',
  },
  {
    title: 'How NVIDIA Dynamo 1.0 Powers Multi-Node Inference at Production Scale',
    organization: 'NVIDIA Developer Blog',
    url: 'https://developer.nvidia.com/blog/nvidia-dynamo-1-production-ready/',
    type: 'article',
    date: '2026-03-16',
  },
  {
    title: 'MI355X Just Flipped the Script on B200 for FP8 DeepSeek Disagg',
    organization: 'TensorWave',
    url: 'https://tensorwave.com/blog/mi355x-just-flipped-the-script-on-b200-for-fp8-deepseek-disagg',
    type: 'article',
    date: '2026-03-10',
  },
  {
    title: 'Meta\u2019s Most Efficient AI Infrastructure for Digital Intelligence',
    organization: 'Forbes',
    url: 'https://www.forbes.com/sites/jonmarkman/2026/03/09/metas-most-efficient-ai-infrastructure-for-digital-intelligence/',
    type: 'article',
    date: '2026-03-09',
  },
  {
    title: 'Unpacking the deceptively simple science of tokenomics',
    organization: 'The Register',
    url: 'https://www.theregister.com/2026/03/07/ai_inference_economics/',
    type: 'article',
    date: '2026-03-07',
  },
  {
    title: 'The Future of AI Infrastructure: Why Inference Max Matters',
    organization: 'SAIL Media',
    url: 'https://www.youtube.com/watch?v=IYmhJRajnMg',
    type: 'video',
    date: '2026-03-05',
  },
  {
    title: 'Lecture 100: InferenceX Continuous OSS Inference Benchmarking',
    organization: 'GPU Mode By Mark Saroufim, Meta Pytorch Engineer',
    url: 'https://www.youtube.com/watch?v=kPBTBl7xvEY',
    type: 'video',
    date: '2026-03-04',
  },
  {
    title: 'Weekly: Micron Leans Into Memory Supercycle',
    organization: 'Chip Briefing',
    url: 'https://chipbriefing.substack.com/p/weekly-micron-leans-into-memory-supercycle',
    type: 'article',
    date: '2026-02-26',
  },
  {
    title: 'Introducing the SN50 RDU: Purpose-Built for Agentic Inference',
    organization: 'SambaNova',
    url: 'https://sambanova.ai/blog/introducing-the-sn50-rdu-purpose-built-for-agentic-inference',
    type: 'article',
    date: '2026-02-24',
  },
  {
    title: 'RPU -- A Reasoning Processing Unit',
    organization: 'arXiv',
    url: 'https://arxiv.org/abs/2602.18568',
    type: 'article',
    date: '2026-02-20',
  },
  {
    title: 'Nvidia pulls ahead as AMD\u2019s software stack falls short: report',
    organization: 'SDxCentral',
    url: 'https://www.sdxcentral.com/news/nvidia-pulls-ahead-as-amds-software-stack-falls-short-report/',
    type: 'article',
    date: '2026-02-19',
  },
  {
    title: 'Speed is the Moat: Inference Performance on AMD GPUs',
    organization: 'AMD Developer Blog',
    url: 'https://www.amd.com/en/developer/resources/technical-articles/2026/inference-performance-on-amd-gpus.html',
    type: 'article',
    date: '2026-02-17',
  },
  {
    title: 'SGLang is also officially crowned "InferenceMax King" by SemiAnalysis',
    organization: 'LMSys SGLang',
    url: 'https://x.com/lmsysorg/status/2023558136532267295',
    type: 'article',
    date: '2026-02-16',
  },
  {
    title:
      'New SemiAnalysis InferenceX Data Shows NVIDIA Blackwell Ultra Delivers up to 50x Better Performance and 35x Lower Costs for Agentic AI',
    organization: 'NVIDIA Blog',
    url: 'https://blogs.nvidia.com/blog/data-blackwell-ultra-performance-lower-cost-agentic-ai/',
    type: 'article',
    date: '2026-02-16',
  },
  {
    title: 'InferenceX v2: NVIDIA Blackwell Vs AMD vs Hopper',
    organization: 'SemiAnalysis',
    url: 'https://newsletter.semianalysis.com/p/inferencex-v2-nvidia-blackwell-vs',
    type: 'article',
    date: '2026-02-16',
  },
  {
    title:
      'NVIDIA\u2019s Blackwell Ultra Pushes "Agentic AI" Performance to New Heights, Delivering Up to 50\u00D7 Higher Tokens/Watt & Stronger Long-Context Workloads',
    organization: 'WCCFTech',
    url: 'https://wccftech.com/nvidias-blackwell-ultra-pushes-agentic-ai-performance-to-new-heights/',
    type: 'article',
    date: '2026-02-16',
  },
  {
    title: '[vLLM Office Hours #37] InferenceMAX & vLLM',
    organization: 'Red Hat - Co-Maintainers of vLLM',
    url: 'https://www.youtube.com/watch?v=kK6Ta4OZiJE',
    type: 'video',
    date: '2025-11-13',
  },
  {
    title: 'Scaling MoE Inference with NVIDIA Dynamo on Google Cloud',
    organization: 'Google Cloud Blog',
    url: 'https://cloud.google.com/blog/products/compute/scaling-moe-inference-with-nvidia-dynamo-on-google-cloud-a4x',
    type: 'article',
    date: '2026-02-06',
  },
  {
    title: 'How to run LLM performance benchmarks (and why you should)',
    organization: 'Baseten',
    url: 'https://www.baseten.co/blog/how-to-run-llm-performance-benchmarks-and-why-you-should/',
    type: 'article',
    date: '2026-02-05',
  },
  {
    title: 'Scaling Multi-Node LLM Inference with NVIDIA Dynamo and ND GB200 NVL72 GPUs on AKS',
    organization: 'Microsoft Azure Engineering Blog',
    url: 'https://blog.aks.azure.com/2025/10/24/dynamo-on-aks',
    type: 'article',
    date: '2025-10-24',
  },
  {
    title:
      'The New AI Benchmark: Unlocking Real-World Performance with InferenceMAX by SemiAnalysis',
    organization: 'Crusoe',
    url: 'https://www.crusoe.ai/resources/blog/the-new-ai-benchmark-unlocking-real-world-performance-with-inferencemax-by-semianalysis',
    type: 'article',
    date: '2025-10-16',
  },
  {
    title:
      'Benchmark Breakdown: How AMD\u2019s MI300X, MI325X, and MI355X Are Redefining AI Inference Economics',
    organization: 'TensorWave',
    url: 'https://tensorwave.com/blog/benchmark-breakdown-how-amds-mi300x-mi325x-and-mi355x-are-redefining-ai-inference-economics',
    type: 'article',
    date: '2025-10-10',
  },
  {
    title: 'InferenceMAX\u2122: Open Source Inference Benchmarking',
    organization: 'SemiAnalysis',
    url: 'https://newsletter.semianalysis.com/p/inferencemax-open-source-inference',
    type: 'article',
    date: '2025-10-09',
  },
  {
    title:
      'InferenceMax AI Benchmark Tests Software Stacks, Efficiency, and TCO \u2014 Vendor-Neutral Suite Runs Nightly and Tracks Performance Changes Over Time',
    organization: "Tom's Hardware",
    url: 'https://www.tomshardware.com/tech-industry/inferencemax-ai-benchmark-tests-software-stacks-efficiency-and-tco-vendor-neutral-suite-runs-nightly-and-tracks-performance-changes-over-time',
    type: 'article',
    date: '2025-10-10',
  },
  {
    title: 'Nvidia, AMD Chips Compared in New Benchmarks. See Who Comes Out on Top.',
    organization: 'Barron\u2019s',
    url: 'https://www.barrons.com/articles/nvidia-amd-semianalysis-inferencemax-benchmarks-92258192',
    type: 'article',
    date: '2025-10-09',
  },
  {
    title:
      'NVIDIA Blackwell Raises Bar in New InferenceMAX Benchmarks, Delivering Unmatched Performance and Efficiency',
    organization: 'NVIDIA Blog',
    url: 'https://blogs.nvidia.com/blog/blackwell-inferencemax-benchmark-results/',
    type: 'article',
    date: '2025-10-09',
  },
  {
    title: 'SemiAnalysis InferenceMAX: vLLM and NVIDIA Accelerate Blackwell Inference',
    organization: 'vLLM Blog',
    url: 'https://blog.vllm.ai/2025/10/09/blackwell-inferencemax.html',
    type: 'article',
    date: '2025-10-09',
  },
  {
    title: 'NVIDIA Blackwell Leads on SemiAnalysis InferenceMAX v1 Benchmarks',
    organization: 'NVIDIA Developer Blog',
    url: 'https://developer.nvidia.com/blog/nvidia-blackwell-leads-on-new-semianalysis-inferencemax-benchmarks/',
    type: 'article',
    date: '2025-10-13',
  },
  {
    title: 'SGLang and NVIDIA Accelerating SemiAnalysis InferenceMAX and GB200 Together',
    organization: 'SGLang LMSYS Org',
    url: 'https://lmsys.org/blog/2025-10-14-sa-inference-max/',
    type: 'article',
    date: '2025-10-14',
  },
  {
    title: 'InferenceMAX: Benchmarking Progress in Real Time',
    organization: 'AMD Developer Blog',
    url: 'https://www.amd.com/en/developer/resources/technical-articles/2025/inferencemax-benchmarking-progress-in-real-time.html',
    type: 'article',
    date: '2025-10-09',
  },
  {
    title: 'SemiAnalysis InferenceMAX Benchmarking the AI Frontier',
    organization: 'Open Compute Project',
    url: 'https://www.youtube.com/watch?v=xCBNjLDVrf0',
    type: 'video',
    date: '2025-10-09',
  },
  {
    title: 'InferenceMAX Instagram Explainer',
    organization: 'NVIDIA',
    url: 'https://www.instagram.com/reels/DPm7wjJgMJ-/',
    type: 'video',
    date: '2025-10-09',
  },
  {
    title: 'InferenceMAX Mention During NVIDIA Q3 FY2026 Report',
    organization: 'NVIDIA',
    url: 'https://nvidianews.nvidia.com/news/nvidia-announces-financial-results-for-third-quarter-fiscal-2026',
    type: 'article',
    date: '2025-11-19',
  },
  {
    title: 'AMD Instinct MI350\u2122: Generational Efficiency gains - Up to 10x on InferenceMAX',
    organization: 'AMD SVP of AI, Vamsi Boppana',
    url: 'https://x.com/SemiAnalysis_/status/1989641250077913201',
    type: 'video',
    date: '2025-11-11',
  },
  {
    title: 'NVIDIA GTC DC 2025 - Jensen Huang talks about InferenceMAX',
    organization: 'NVIDIA',
    url: 'https://x.com/dylan522p/status/1983257990796062890',
    type: 'video',
    date: '2025-10-28',
  },
  {
    title: 'Kareus: Joint Reduction of Dynamic and Static Energy in Large Model Training',
    organization: 'arXiv',
    url: 'https://arxiv.org/abs/2601.17654',
    type: 'article',
    date: '2026-01-25',
  },
  {
    title: 'CES Analyst Q&A [timestamp - 3:37]',
    organization: 'NVIDIA',
    url: 'https://video.ibm.com/recorded/134654723',
    type: 'video',
    date: '2026-01-05',
  },
];

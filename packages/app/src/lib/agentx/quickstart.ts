export const AGENTX_INSTALL = "pip install 'agentx-harness==1.0.7'";

export const AGENTX_PROFILE = `agentx profile \\
  --url "http://127.0.0.1:8000" --endpoint /v1/chat/completions \\
  --model "$HUGGINGFACE_MODEL_NAME" --tokenizer "$HUGGINGFACE_MODEL_NAME" \\
  --tokenizer-trust-remote-code \\
  --concurrency "$CONC_SESSIONS" \\
  --public-dataset "semianalysis_cc_traces_weka_062126" \\
  --output-artifact-dir "output_dir_results"`;

export const AGENTX_ROUTING = `# Adds X-Dynamo-Session-ID; subagents also get X-Dynamo-Parent-Session-ID.
# Only this option sends the parent ID, preserving forked-agent lineage.
export AIPERF_HTTP_X_DYNAMO_SESSION_ID_FROM_CORRELATION_ID=true
# Also sends X-Session-ID, if a front-end router needs it.
export AIPERF_HTTP_X_SESSION_ID_FROM_CORRELATION_ID=true`;

export const AGENTX_QUICKSTART = {
  en: {
    title: 'Benchmark your own chips with AgentX',
    description:
      'Install agentx-harness, point it at your inference server, and replay a public agentic workload on your own hardware.',
    requirements:
      'Use Python 3.11–3.13 in a dedicated virtual environment, separate from upstream aiperf. Start your model server first with an OpenAI-compatible streaming chat-completions endpoint.',
    install: 'Install the harness',
    configure: 'Set your model and concurrency',
    configureHelp:
      'Replace org/model with your Hugging Face model ID. Set CONC_SESSIONS to the number of concurrent session trees to replay; 16 below is only an example, not a prescribed benchmark setting.',
    run: 'Run the benchmark',
    runHelp:
      'Replace the URL if your server runs elsewhere. If the server uses a model alias, change --model to that alias and keep --tokenizer set to the matching Hugging Face tokenizer. agentx profile selects the AgentX scenario automatically.',
    trust:
      'Only use --tokenizer-trust-remote-code with a tokenizer repository you trust: it permits repository-provided Python code to run. Omit it when the tokenizer does not need custom code.',
    routing: 'Optional: session-aware routing',
    routingHelp:
      'Export these variables in the same shell before running agentx profile, only if your routing stack needs them. The Dynamo option adds the session ID and, for subagents, the parent-session ID. X-Session-ID alone does not send the parent ID.',
    results: 'Check the results',
    resultsHelp:
      'Results are written to output_dir_results. Keep the full artifact directory, inspect errors and the submission_valid verdict, and record the server configuration before comparing runs. A local run is not automatically published to InferenceX.',
    compare:
      'Match the dataset to the server’s context window and use the same dataset and replay settings for comparisons. Sweep concurrency in separate runs with distinct output directories. Follow the full methodology for comparable hardware results, including server-side settings.',
    guide: 'Open the full quickstart',
    back: 'AgentX datasets',
    methodology: 'Benchmark methodology',
    repository: 'Harness documentation',
    setup: 'Create a virtual environment',
    setupNote:
      'These commands use a POSIX shell. On Linux ARM64, install a C compiler first if the crick dependency needs to build from source.',
    summary:
      'Set HUGGINGFACE_MODEL_NAME and CONC_SESSIONS for your deployment, then run the commands below from a dedicated Python 3.11–3.13 environment. The guide covers setup, tokenizer safety, optional routing headers, and result checks.',
  },
  zh: {
    title: '用 AgentX 测试自己的芯片',
    description:
      '安装 agentx-harness，连接推理服务器，即可在自己的硬件上回放公开的智能体工作负载。',
    requirements:
      '使用 Python 3.11–3.13，并创建独立的虚拟环境，不要与上游 aiperf 混装。先启动模型服务器，提供兼容 OpenAI 的 streaming chat-completions endpoint。',
    install: '安装测试工具',
    configure: '设置模型与并发数',
    configureHelp:
      '将 org/model 替换为 Hugging Face 模型 ID。CONC_SESSIONS 表示同时回放的会话树数量；下面的 16 仅为示例，并非规定的测试配置。',
    run: '运行基准测试',
    runHelp:
      '如果服务器不在本机，请替换 URL。如果服务器使用模型别名，将 --model 改为该别名，--tokenizer 仍指定匹配的 Hugging Face tokenizer。agentx profile 会自动选择 AgentX 场景。',
    trust:
      '仅对可信的 tokenizer 仓库使用 --tokenizer-trust-remote-code：该选项允许执行仓库提供的 Python 代码。如果 tokenizer 不需要自定义代码，请省略此选项。',
    routing: '可选：会话感知路由',
    routingHelp:
      '仅在路由栈需要时，在运行 agentx profile 前于同一 shell 中导出这些变量。Dynamo 选项会添加会话 ID，并为子智能体添加父会话 ID。仅启用 X-Session-ID 不会发送父会话 ID。',
    results: '检查测试结果',
    resultsHelp:
      '结果写入 output_dir_results。比较测试结果前，请保留完整产物目录，检查错误和 submission_valid 判定，并记录服务器配置。本地测试结果不会自动发布到 InferenceX。',
    compare:
      '选择与服务器上下文窗口匹配的数据集，比较时保持数据集和回放配置一致。扫描不同并发数时，分别运行并使用不同的输出目录。要获得可比的硬件测试结果，请遵循完整的基准测试方法，包括服务器端设置。',
    guide: '查看完整快速入门指南',
    back: 'AgentX 数据集',
    methodology: '基准测试方法',
    repository: '测试工具文档',
    setup: '创建虚拟环境',
    setupNote:
      '这些命令适用于 POSIX shell。在 Linux ARM64 上，如果 crick 依赖需要从源码构建，请先安装 C 编译器。',
    summary:
      '根据部署设置 HUGGINGFACE_MODEL_NAME 和 CONC_SESSIONS，然后在独立的 Python 3.11–3.13 环境中运行以下命令。完整指南介绍环境配置、tokenizer 代码安全、可选路由 header 和结果检查。',
  },
} as const;

export const AGENTX_INSTALL = "pip install 'agentx-harness==1.0.7'";

export const AGENTX_PROFILE = `agentx profile \\
  --url "http://127.0.0.1:8000" --endpoint /v1/chat/completions \\
  --model "$HUGGINGFACE_MODEL_NAME" --tokenizer "$HUGGINGFACE_MODEL_NAME" \\
  --tokenizer-trust-remote-code \\
  --concurrency "$CONC_SESSIONS" \\
  --public-dataset "semianalysis_cc_traces_weka_062126" \\
  --output-artifact-dir "output_dir_results"`;

export const AGENTX_COMMANDS = `${AGENTX_INSTALL}

export HUGGINGFACE_MODEL_NAME="org/model"
export CONC_SESSIONS=16

${AGENTX_PROFILE}`;

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
    run: 'Run AgentX',
    runHelp:
      'Start an OpenAI-compatible server, then set your model, URL, and concurrent session count below. Requires Python 3.11–3.13; 16 sessions is just an example.',
    modelNote:
      'Using a model alias? Change --model and keep --tokenizer set to the matching Hugging Face tokenizer.',
    trust:
      'Use --tokenizer-trust-remote-code only for trusted repositories. Omit it if custom tokenizer code is unnecessary.',
    routing: 'Optional routing headers',
    routingHelp:
      'Export these before running AgentX if your router needs session headers. Only the Dynamo option sends the parent-session ID for subagents.',
    resultsHelp:
      'Results go to output_dir_results. Check errors and submission_valid, and follow the methodology before comparing hardware. Runs are not automatically published.',
    guide: 'Open the full quickstart',
    back: 'AgentX datasets',
    methodology: 'Benchmark methodology',
    repository: 'Harness documentation',
    summary:
      'Set your model, server URL, and session concurrency, then run this with Python 3.11–3.13. The full guide includes optional routing headers.',
  },
  zh: {
    title: '用 AgentX 测试自己的芯片',
    description:
      '安装 agentx-harness，连接推理服务器，即可在自己的硬件上回放公开的智能体工作负载。',
    run: '运行 AgentX',
    runHelp:
      '先启动兼容 OpenAI 的服务器，再修改下面的模型、URL 和并发会话数。需要 Python 3.11–3.13；16 个会话仅为示例。',
    modelNote:
      '服务器使用模型别名时，请修改 --model，并让 --tokenizer 仍指向匹配的 Hugging Face tokenizer。',
    trust:
      '仅对可信仓库使用 --tokenizer-trust-remote-code。不需要自定义 tokenizer 代码时，请省略此选项。',
    routing: '可选路由 header',
    routingHelp:
      '如果路由器需要会话 header，请在运行 AgentX 前导出这些变量。只有 Dynamo 选项会为子智能体发送父会话 ID。',
    resultsHelp:
      '结果写入 output_dir_results。请检查错误和 submission_valid，并遵循基准测试方法后再比较硬件。测试结果不会自动发布。',
    guide: '查看完整快速入门指南',
    back: 'AgentX 数据集',
    methodology: '基准测试方法',
    repository: '测试工具文档',
    summary:
      '设置模型、服务器 URL 和并发会话数，然后使用 Python 3.11–3.13 运行以下命令。完整指南包含可选路由 header。',
  },
} as const;

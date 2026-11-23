export const AGENTX_INSTALL = "pip install 'agentx-harness==1.0.14'";

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

export const AGENTX_GOLDEN_AL_URL =
  'https://github.com/SemiAnalysisAI/InferenceX/tree/main/inferencex-e2e/infx/golden_al_distribution';

export const AGENTX_GOLDEN_AL = `# Golden AL curves:
# ${AGENTX_GOLDEN_AL_URL}
git clone --depth 1 https://github.com/SemiAnalysisAI/InferenceX
cd InferenceX/inferencex-e2e

# Every golden curve and its measured draft lengths
python -m infx.golden_al_distribution list
# Golden AL for <model prefix> <method> <num_speculative_tokens>
python -m infx.golden_al_distribution lookup qwen3.5 mtp 3   # <placeholder_value>

# Force that AL in your engine:
# vLLM, inside --speculative-config:
#   "rejection_sample_method": "synthetic", "synthetic_acceptance_length": <placeholder_value>
# SGLang, server environment:
#   SGLANG_SIMULATE_ACC_LEN=<placeholder_value>
#   SGLANG_SIMULATE_ACC_METHOD=match-expected
#   SGLANG_SIMULATE_ACC_TOKEN_MODE=real-draft-token
# ATOM:
#   --spec-decode-acceptance-length <placeholder_value>
# TensorRT-LLM counts draft tokens only, so use AL - 1:
#   TLLM_SPEC_DECODE_FORCE_NUM_ACCEPTED_TOKENS=<placeholder_value - 1>`;

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
    goldenAl: 'Speculative decoding: golden acceptance length',
    goldenAlHelp:
      'AgentX anonymizes trace tokens to protect user privacy, so draft-token acceptance on the replayed text does not reflect real workloads. If your server runs MTP, EAGLE3, DSpark, or DFlash, force the committed golden acceptance length (AL) for your model, method, thinking mode, and draft length. Each value is the mean AL measured with real verification on the SPEED-Bench coding category, and every submission for the same model and mode uses the same curve, so results compare serving systems rather than draft heads.',
    goldenAlNote:
      'lookup defaults to thinking_on; pass --thinking thinking_off for non-thinking runs. You may pick any measured draft length, but not a different AL. A missing curve or draft length fails the lookup; add a measured curve instead of guessing. Accuracy evals use real verification.',
    goldenAlLink: 'Golden AL curves and collection method',
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
    title: '用 AgentX 对自己的芯片做基准测试',
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
    goldenAl: '投机解码：golden acceptance length',
    goldenAlHelp:
      '为保护用户隐私，AgentX 对 trace 中的 token 做了匿名化处理，因此在回放文本上测得的 draft token 接受率不能反映真实负载。如果服务器启用了 MTP、EAGLE3、DSpark 或 DFlash，请按模型、方法、thinking mode 和 draft length 固定使用仓库中提交的 golden acceptance length（AL，接受长度）。每个值都是在 SPEED-Bench coding 类别上用真实验证测得的平均 AL。同一模型和模式的所有提交都使用同一条曲线，因此结果比较的是推理服务系统，而不是 draft head。',
    goldenAlNote:
      'lookup 默认使用 thinking_on；非 thinking 运行请传入 --thinking thinking_off。可以选择任意已测量的 draft length，但不能改用其他 AL。缺少对应曲线或 draft length 时查询会失败；请补充实测曲线，不要自行估算。精度评测使用真实验证。',
    goldenAlLink: 'Golden AL 曲线与采集方法',
    resultsHelp:
      '结果写入 output_dir_results。请检查错误和 submission_valid，并遵循基准测试方法后再比较硬件。测试结果不会自动发布。',
    guide: '查看完整快速入门指南',
    back: 'AgentX 数据集',
    methodology: '基准测试方法',
    repository: 'Harness 文档',
    summary:
      '设置模型、服务器 URL 和并发会话数，然后使用 Python 3.11–3.13 运行以下命令。完整指南包含可选路由 header。',
  },
} as const;

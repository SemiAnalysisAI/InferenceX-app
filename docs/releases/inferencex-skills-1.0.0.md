# InferenceX skills 1.0.0

The first stable CLI and agent skill release includes the previously unpublished
0.12.0 work and dashboard view guidance.

- One `inferencex` entry point for discovery, PowerX, AgentX, provenance, TCO,
  framework comparisons, CollectiveX, offline verification, and installation diagnostics.
- Saved source responses and replayable evidence bundles; missing data and unmet
  coverage requirements remain explicit.
- Guidance for 21 read-only dashboard views. These APIs are deployed with the
  website; their raw captures are separate from formal CLI evidence bundles.
- Stable 1.x command, required-output, and exit-code compatibility.

Requires Node 24 or later; Linux and macOS are qualified. Upgrade from 0.11 and
earlier using the [migration guide](https://github.com/SemiAnalysisAI/InferenceX-app/blob/inferencex-skills-v1.0.0/docs/inferencex-cli-compatibility.md).
The attached release manifest and summary identify the accepted archive and
verification scope. No new benchmarks are launched.

## 中文说明

这是 CLI 与 Agent Skill 的首个稳定版本，包含此前尚未发布的 0.12.0 改动，
以及仪表板只读接口的使用指导。

- 统一使用 `inferencex`，支持数据发现、PowerX、AgentX、结果溯源、TCO、
  框架版本比较、CollectiveX、离线核验与安装诊断。
- 保存来源响应，生成可离线复核的证据目录；缺失数据与未满足的覆盖要求都会明确标出。
- 提供 21 个只读仪表板视图的使用指导。这些接口随网站部署；其原始响应不属于
  CLI 正式证据目录。
- 1.x 系列对已支持的命令、必需输出字段和退出码语义提供稳定的兼容性保证。

需要 Node 24 或更高版本；发布验收覆盖 Linux 和 macOS。从 0.11 及更早版本
升级请参阅[迁移说明](https://github.com/SemiAnalysisAI/InferenceX-app/blob/inferencex-skills-v1.0.0/docs/inferencex-cli-compatibility.md)。
随版本附带的发布清单与发布摘要记录了本次已验收的安装包身份及验证范围。本工具不会启动新的基准测试。

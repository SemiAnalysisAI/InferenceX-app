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

### Known agent-report limitations

This release proceeds with explicit maintainer acceptance of incomplete native-agent
qualification. The published archive includes a subsequent installer concurrency fix;
**all 26 maintained native runtime/case combinations have not been rerun on these bytes**.
On the preceding candidate, a focused Claude retest passed 2 cases and failed 1.
That failure incorrectly describes an interpolated TCO point as a single
measured knot; its saved calculation and report are correct, but the final reply adds
an unsupported claim. Review agent-written conclusions against the saved evidence.
An earlier full campaign passed 18 of 26 cases on another archive; those results
are retained separately and do not qualify these published bytes. Package, platform,
installation, and public verification gates remain required.

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

### 已知的 agent 报告问题

维护者已明确接受本次真实 agent 验收尚未完成的状态，并决定发布。最终安装包还包含
后续的安装器并发修复；**26 个运行时与用例组合均未在这份包上重跑**。
前一份候选包的 Claude 定向复测为 2 项通过、1 项失败。
该失败是将一个插值 TCO 数据点误写成单个实测点：已保存的计算与报告正确，
但最终回复额外加入了没有证据支持的说法。使用 agent 的结论前，仍需对照保存的证据复核。
此前完整测试有 18／26 项通过，但使用的是另一份安装包；这些结果单独保留，
不算作最终安装包的验收。包测试、平台、安装和公开发布核验仍须通过。

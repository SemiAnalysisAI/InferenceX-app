# InferenceX skills 1.1.0

This release adds a general `inferencex` entry, AgentX chart and table entries,
user-level installation, and helpers that keep TCO and trace findings within
their measured scope. 1.x command, required-output, and exit-code compatibility
is unchanged.

- `/inferencex` is the general entry for agents. `/inferencex-to-chart` and
  `/inferencex-to-table` turn one AgentX result into a one-metric chart, or a table
  image with a spreadsheet CSV. Installation and `status --json` cover all four
  entries; the `inferencex-api` name and its script paths still work.
- `install --scope user` installs into `~/.agents/skills/` (Codex) or
  `~/.claude/skills/` (Claude Code) so the skills work in every project.
- Discovery accepts model keys as well as display names.
- Pareto frontier and hinterland guidance for the beta `GET /api/v1/pareto` endpoint.
- `tco-summary` reports per-workload break-even price ratios when prices are
  missing and leaves the cost winner empty. `trace-summary` separates the global
  and per-phase longest requests of a selected AgentX trace. `capture-response`
  saves complete raw API responses before validating them.
- Dashboard view guidance adds `ubenchx`, cache-reuse recipe selection, and
  historical editorial articles. OperatorX is feature-gated and is no longer
  documented as a read-only view.
- Requests to `inferencex.semianalysis.com` identify the package version and label
  CI traffic for aggregate request counts. They carry no user or machine identifier.
  Set `INFERENCEX_TELEMETRY=0` or `DO_NOT_TRACK=1` to turn this off.

Requires Node 24 or later; Linux and macOS are qualified. Upgrade an existing
installation with `install --force`, using the same target and scope.
The attached release manifest and summary identify the accepted archive and
verification scope. No new benchmarks are launched.

## 中文说明

本版本新增通用入口 `inferencex`、AgentX 图表与表格入口和用户级安装，并提供辅助工具，
使 TCO 与 trace 结论限定在实测范围内。1.x 系列对命令、必需输出字段和退出码的兼容性保证保持不变。

- `/inferencex` 是面向 Agent 的通用入口。`/inferencex-to-chart` 与 `/inferencex-to-table`
  可将单个 AgentX 结果绘制成单指标图表，或生成表格图片并附带电子表格 CSV。安装与
  `status --json` 覆盖全部四个入口；`inferencex-api` 名称及其脚本路径继续可用。
- `install --scope user` 安装到 `~/.agents/skills/`（Codex）或 `~/.claude/skills/`
  （Claude Code），在所有项目中均可使用。
- 数据发现除显示名称外，也接受模型键。
- 新增 Pareto 前沿和最差边界的使用指导，对应 beta 接口 `GET /api/v1/pareto`。
- 缺少价格时，`tco-summary` 按工作负载输出成本持平时的价格比，不判定哪一方成本更低。
  `trace-summary` 区分所选 AgentX trace 的全局最长请求与各阶段最长请求。
  `capture-response` 在校验前完整保存原始 API 响应。
- 仪表板视图说明新增 `ubenchx`、cache-reuse 推理方案选择和已发布历史文章的用法。
  OperatorX 受功能开关控制，不再列为只读视图。
- 发往 `inferencex.semianalysis.com` 的请求会标明包版本并区分 CI 流量，用于统计请求总量，
  不包含用户或设备标识。设置 `INFERENCEX_TELEMETRY=0` 或 `DO_NOT_TRACK=1` 可关闭。

需要 Node 24 或更高版本；发布验收覆盖 Linux 和 macOS。升级已有安装请使用
`install --force`，并保持相同的 target 与 scope。随版本附带的发布清单与发布摘要
记录了本次已验收的安装包身份及验证范围。本工具不会启动新的基准测试。

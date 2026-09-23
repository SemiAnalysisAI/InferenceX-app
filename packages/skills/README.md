# InferenceX Skills

> InferenceX benchmark data for coding agents and the command line.

Install the `inferencex` skill for Codex or Claude Code. Query existing public
benchmarks, export results with their source data, and verify saved evidence offline.

## Install

Requires Node.js 24 or later. Run from your project directory.

The commands below target 1.1.0. Until it is published, use the supplied candidate
archive as described below.

```sh
# Codex
npm exec --yes --package @semianalysisai/inferencex-skills@1.1.0 -- \
  inferencex-skills install --target codex

# Claude Code
npm exec --yes --package @semianalysisai/inferencex-skills@1.1.0 -- \
  inferencex-skills install --target claude
```

The default installation is project-scoped. Add
`--scope user` to make the skill available in every project on this machine:
Codex uses `~/.agents/skills/`; Claude Code uses `~/.claude/skills/`. Use
`--scope project` (the default) for `.agents/skills/` or `.claude/skills/` in the
current directory. `--dir <skills-root>` is an explicit alternative to `--scope`.

Each installation includes `inferencex/` (the task entry) and `inferencex-api/`
(the shared CLI and cookbooks). Existing script paths and the old skill name
continue to work. Upgrade an existing installation with `install --force` using
the same target and scope; save local edits first. `status --json` reports both
paths, including a missing or damaged entry.

<details>
<summary>Installing an unpublished build</summary>

Replace the package name and version with the absolute path to the supplied `.tgz`
and add `--offline`. Use that same archive for installation, status checks and upgrades.

If you need to build the archive, run `npm pack` in `packages/skills`.

</details>

## Usage

Open a new Claude Code session and type `/inferencex <your task>`. In Codex,
select **inferencex** from `/skills` or mention `$inferencex`. If the entry does
not appear after installation, restart the agent in the project where you installed
it. Personal installations also work when you start from another project.

For example:

> /inferencex Check the TCO assumptions in this spreadsheet against InferenceX.
> Keep my workload, latency target, prices and units; flag anything that does not match.

For AgentX source comparisons, the same skill can produce charts, tables or both:

> /inferencex Chart request counts, token lengths and latency distributions by recorded source
> category for this AgentX result.

> Now give me the same comparison as a table and CSV for my spreadsheet.

The chart uses a dark theme; Markdown tables and CSV share its statistics and
scope. Each output retains the saved source and sample counts.

You can also use the CLI directly from the installed skill:

```sh
inferencex_cli=.agents/skills/inferencex-api/scripts/inferencex.mjs
node "$inferencex_cli" discover models
mkdir -p evidence
node "$inferencex_cli" powerx export --model DeepSeek-V4-Pro --isl 8192 --osl 1024 \
  --output-dir evidence/powerx
node "$inferencex_cli" verify evidence/powerx
```

For Claude Code, use `.claude/skills/inferencex-api/scripts/inferencex.mjs` instead.
Each export needs a new output directory. Public queries require no API key.

| Workflow             | Use it to                                                             |
| -------------------- | --------------------------------------------------------------------- |
| PowerX               | Export measured power and energy observations.                        |
| AgentX               | Export agentic workload summaries and check trace availability.       |
| AgentX charts/tables | Compare request counts, token lengths and latency by recorded source. |
| Result provenance    | Investigate a result's producer, configuration and logs.              |
| TCO                  | Compare costs using your price assumptions.                           |
| Framework releases   | Compare matched observations across versions.                         |
| CollectiveX          | Compare communication benchmark runs.                                 |

The package queries existing observations; it does not launch benchmarks.

Online requests carry package attribution for aggregate request counts. Set
`INFERENCEX_TELEMETRY=0` to opt out. [Fields and controls](https://github.com/SemiAnalysisAI/InferenceX-app/blob/master/packages/skills/skills/inferencex-api/references/cli.md#request-usage).

## Documentation

- [CLI reference](https://github.com/SemiAnalysisAI/InferenceX-app/blob/master/packages/skills/skills/inferencex-api/references/cli.md) — commands, exports and offline verification.
- [Chart and table templates](https://github.com/SemiAnalysisAI/InferenceX-app/blob/master/packages/skills/skills/inferencex-api/references/chart-templates.md) — output styles and offline AgentX source comparisons.
- [Dashboard views](https://github.com/SemiAnalysisAI/InferenceX-app/blob/master/packages/skills/skills/inferencex-api/references/dashboard-views.md) — dashboard filters and calculated chart data.
- [Upgrading and compatibility](https://github.com/SemiAnalysisAI/InferenceX-app/blob/master/docs/inferencex-cli-compatibility.md) — migration from 0.11 and earlier.
- [Public API](https://inferencex.semianalysis.com/api) — endpoints and response formats.

<details>
<summary>简体中文</summary>

为 Codex 或 Claude Code 安装 `inferencex` skill，查询 InferenceX 已有的公开基准测试数据，
导出结果与原始响应，并离线核验已保存的证据。

需要 Node.js 24 或更高版本。上方命令指定 1.1.0；发布前请将包名和版本替换为候选 `.tgz` 的绝对路径，并加上 `--offline`。
安装、状态检查和升级使用同一份产物。没有候选包时，在 `packages/skills` 目录执行 `npm pack` 生成。

默认只安装到当前项目；加上 `--scope user` 后，本机所有项目均可使用：
Codex 安装到 `~/.agents/skills/`，Claude Code 安装到 `~/.claude/skills/`。
`--scope project` 使用当前项目的对应目录；自定义目录可用 `--dir`，不与 `--scope` 混用。
每处安装均包含 `inferencex/` 任务入口和 `inferencex-api/` 共用 CLI 与 cookbook。
旧脚本路径与技能名称继续可用。升级时使用相同 target 和 scope 并加上 `--force`，
先保存本地修改；`status --json` 会分别报告两个目录的状态，入口缺失或损坏时也会报告。

安装后，新开一个 Claude Code 会话并输入 `/inferencex 核对这份表格里的 TCO 假设`；
Codex 可在 `/skills` 中选择 inferencex，或使用 `$inferencex`。
若安装后没有显示入口，重启 agent；
项目级安装须从对应项目启动。也可按上方示例直接运行 CLI。
每次导出都需要新的输出目录；公开查询不需要 API key。

PowerX 可导出实测功耗与能耗；AgentX 可导出智能体工作负载汇总并检查 trace 可用性。
同一个 skill 可将 AgentX 来源比较做成图表、表格或两者。例如：“按这条 AgentX 结果中记录的来源类别，绘制请求数、token 长度和延迟分布。”
再说“把同一组比较做成表格和 CSV，方便放进我的电子表格”。深色图表、Markdown 表格和 CSV 共用统计结果与数据范围，保留原始响应和样本数。
还可追溯结果的来源、配置和日志，按自定义价格假设比较 TCO，在框架版本间比较匹配的观测，
以及比较两次 CollectiveX 通信基准测试。该包查询已有观测，不启动基准测试。
详细命令、仪表板视图、旧版迁移和接口格式见上方文档链接。
在线请求会携带包来源标识，用于统计请求总量；设置 `INFERENCEX_TELEMETRY=0` 可关闭，
采集字段及控制方式见上方链接。

</details>

## License

[GPL-3.0-or-later](https://github.com/SemiAnalysisAI/InferenceX-app/blob/master/packages/skills/LICENSE).

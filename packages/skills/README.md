# InferenceX Skills

> InferenceX benchmark data for coding agents and the command line.

Install InferenceX skills for Codex or Claude Code. Query existing public benchmarks,
create AgentX charts and tables, export source data, and verify saved evidence offline.

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

Each installation includes `inferencex/` (the general entry), `inferencex-to-chart/`
and `inferencex-to-table/` (AgentX output shortcuts), and `inferencex-api/`
(the shared CLI and cookbooks). Existing script paths and the old skill name
continue to work. Upgrade an existing installation with `install --force` using
the same target and scope; save local edits first. `status --json` reports all four
paths, including missing or damaged entries.

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

For AgentX source comparisons, use the output-specific entries:

> /inferencex-to-chart Show request counts by recorded source category
> for AgentX result `<result-id>`.

> /inferencex-to-table Compare the recorded source categories in this saved AgentX
> capture. Give me a simple table image, with CSV for my spreadsheet.

In Codex, use `$inferencex-to-chart` or `$inferencex-to-table`, or select the entry
from `/skills`. Replace `<result-id>` with your selected result; a saved
selected-point capture works too. The ready template compares one result's recorded
source categories. The chart entry shows one metric per image: request counts by
default, or median input tokens, output tokens, E2E or TTFT. The table entry puts
request counts, share and all four medians in one image, with detailed Markdown and
a CSV for spreadsheets. Both layouts adapt from one source to forty. Each output
retains the saved source and sample counts.
You can still ask `/inferencex` for either output, or request a chart and table together.

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

为 Codex 或 Claude Code 安装 InferenceX skills，查询已有的公开基准测试数据，
生成 AgentX 图表与表格、导出源数据，并离线核验已保存的证据。

需要 Node.js 24 或更高版本。上方命令指定 1.1.0；发布前请将包名和版本替换为候选 `.tgz` 的绝对路径，并加上 `--offline`。
安装、状态检查和升级使用同一份产物。没有候选包时，在 `packages/skills` 目录执行 `npm pack` 生成。

默认只安装到当前项目；加上 `--scope user` 后，本机所有项目均可使用：
Codex 安装到 `~/.agents/skills/`，Claude Code 安装到 `~/.claude/skills/`。
`--scope project` 使用当前项目的对应目录；自定义目录可用 `--dir`，不与 `--scope` 混用。
每处安装均包含 `inferencex/` 通用入口、`inferencex-to-chart/` 与 `inferencex-to-table/`
两个 AgentX 输出入口，以及 `inferencex-api/` 共用 CLI 与 cookbook。
旧脚本路径与技能名称继续可用。升级时使用相同 target 和 scope 并加上 `--force`，
先保存本地修改；`status --json` 会分别报告四个目录的状态，入口缺失或损坏时也会报告。

安装后，新开一个 Claude Code 会话并输入 `/inferencex 核对这份表格里的 TCO 假设`；
Codex 可在 `/skills` 中选择 inferencex，或使用 `$inferencex`。
若安装后没有显示入口，重启 agent；
项目级安装须从对应项目启动。也可按上方示例直接运行 CLI。
每次导出都需要新的输出目录；公开查询不需要 API key。

PowerX 可导出实测功耗与能耗；AgentX 可导出智能体工作负载汇总并检查 trace 可用性。
在 Claude Code 中，输入 `/inferencex-to-chart 按 AgentX 结果 <result-id> 中记录的来源类别，画一张请求数对比图`；
输入 `/inferencex-to-table 将这份已保存的 AgentX capture 按记录的来源类别整理为简明表格图片，并附上 CSV` 可生成表格图片和电子表格所需的数据。
Codex 对应使用 `$inferencex-to-chart` 或 `$inferencex-to-table`，也可从 `/skills` 选择。
将 `<result-id>` 替换为选定结果的 ID，也可提供已保存的 selected-point capture。
现成模板用于比较单条结果中记录的来源类别。图表入口每张图只呈现一个指标：默认为请求数，
也可改为输入 token 数、输出 token 数、E2E 或 TTFT 的中位数。表格入口把请求数、占比和四项中位数
汇总在一张图片中，另附详细的 Markdown 表格和可导入电子表格的 CSV。两种版式都会根据来源数量（1 到 40 个）自动调整。
两种输出共用统计结果与数据范围，保留已保存的源数据和样本数。也可以通过通用 `/inferencex` 入口生成其中任一输出，或同时生成图表和表格。
还可追溯结果的来源、配置和日志，按自定义价格假设比较 TCO，在框架版本间比较匹配的观测，
以及比较两次 CollectiveX 通信基准测试。该包查询已有观测，不启动基准测试。
详细命令、仪表板视图、旧版迁移和接口格式见上方文档链接。
在线请求会携带包来源标识，用于统计请求总量；设置 `INFERENCEX_TELEMETRY=0` 可关闭，
采集字段及控制方式见上方链接。

</details>

## License

[GPL-3.0-or-later](https://github.com/SemiAnalysisAI/InferenceX-app/blob/master/packages/skills/LICENSE).

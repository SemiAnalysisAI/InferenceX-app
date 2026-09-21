# InferenceX Skills

> InferenceX benchmark data for coding agents and the command line.

Install the `inferencex-api` skill for Codex or Claude Code. Query existing public
benchmarks, export results with their source data, and verify saved evidence offline.

## Install

Requires Node.js 24 or later. Run from your project directory.

The commands below target 1.0.0 and become available when that version is published.

```sh
# Codex
npm exec --yes --package @semianalysisai/inferencex-skills@1.0.0 -- \
  inferencex-skills install --target codex

# Claude Code
npm exec --yes --package @semianalysisai/inferencex-skills@1.0.0 -- \
  inferencex-skills install --target claude
```

Codex installs to `.agents/skills/inferencex-api/`; Claude Code uses
`.claude/skills/inferencex-api/`.

<details>
<summary>Installing an unpublished build</summary>

Replace the package name and version with the absolute path to the supplied `.tgz`
and add `--offline`. Use that same archive for installation, status checks and upgrades.

</details>

## Usage

Ask your agent to use public InferenceX data:

> Export the latest available DeepSeek-V4-Pro PowerX observations for an 8192-input,
> 1024-output workload. Preserve missing values and save the source responses.

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

| Workflow           | Use it to                                                       |
| ------------------ | --------------------------------------------------------------- |
| PowerX             | Export measured power and energy observations.                  |
| AgentX             | Export agentic workload summaries and check trace availability. |
| Result provenance  | Investigate a result's producer, configuration and logs.        |
| TCO                | Compare costs using your price assumptions.                     |
| Framework releases | Compare matched observations across versions.                   |
| CollectiveX        | Compare communication benchmark runs.                           |

The package queries existing observations; it does not launch benchmarks.

## Documentation

- [CLI reference](https://github.com/SemiAnalysisAI/InferenceX-app/blob/master/packages/skills/skills/inferencex-api/references/cli.md) — commands, exports and offline verification.
- [Dashboard views](https://github.com/SemiAnalysisAI/InferenceX-app/blob/master/packages/skills/skills/inferencex-api/references/dashboard-views.md) — dashboard filters and calculated chart data.
- [Upgrading and compatibility](https://github.com/SemiAnalysisAI/InferenceX-app/blob/master/docs/inferencex-cli-compatibility.md) — migration from 0.11 and earlier.
- [Public API](https://inferencex.semianalysis.com/api) — endpoints and response formats.

<details>
<summary>简体中文</summary>

为 Codex 或 Claude Code 安装 `inferencex-api` skill，查询 InferenceX 已有的公开基准测试数据，
导出结果与原始响应，并离线核验已保存的证据。

需要 Node.js 24 或更高版本。在项目目录执行上方安装命令；命令指定 1.0.0，须待该版本发布后使用。
Codex 安装到 `.agents/skills/inferencex-api/`，Claude Code 安装到
`.claude/skills/inferencex-api/`。安装未发布版本时，将包名和版本替换为提供的 `.tgz` 绝对路径，
加上 `--offline`；安装、状态检查和升级均使用同一份产物。

安装后可让 agent 使用 InferenceX 公开数据，例如导出指定工作负载的 PowerX 观测，
也可按上方示例直接运行已安装的 CLI。每次导出都需要新的输出目录；公开查询不需要 API key。

PowerX 可导出实测功耗与能耗；AgentX 可导出智能体工作负载汇总并检查 trace 可用性。
还可追溯结果的来源、配置和日志，按自定义价格假设比较 TCO，在框架版本间比较匹配的观测，
以及比较两次 CollectiveX 通信基准测试。该包查询已有观测，不启动基准测试。
详细命令、仪表板视图、旧版迁移和接口格式见上方文档链接。

</details>

## License

[GPL-3.0-or-later](https://github.com/SemiAnalysisAI/InferenceX-app/blob/master/packages/skills/LICENSE).

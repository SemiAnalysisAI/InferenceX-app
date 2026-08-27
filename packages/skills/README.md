# @semianalysisai/inferencex-skills

Agent Skills for the [InferenceX](https://inferencex.semianalysis.com) public REST API —
teach your AI agent (Claude Code, Codex, Cursor, or anything that reads Agent Skills) to
query InferenceX LLM-inference benchmark data and build visualizations from it.
Humans welcome too: every skill is plain markdown with complete, runnable examples.

## Install

```bash
# into .claude/skills/ (default)
npx @semianalysisai/inferencex-skills install

# other agent conventions
npx @semianalysisai/inferencex-skills install --target codex    # .codex/skills/
npx @semianalysisai/inferencex-skills install --target cursor   # .cursor/skills/
npx @semianalysisai/inferencex-skills install --target agents   # .agents/skills/

# anywhere
npx @semianalysisai/inferencex-skills install --dir ./my-agent/skills

# see what's bundled / get help
npx @semianalysisai/inferencex-skills list
npx @semianalysisai/inferencex-skills --help
```

No dependencies; requires Node 18+. Re-run with `--force` to overwrite existing copies.

## Skill catalog

| Skill                   | What it teaches                                                                                                                                                                                                      | Supporting files                                                   |
| ----------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| `inferencex-api`        | The full public REST API: `/api/v1/views/*` (chart-ready views, beta) + stable raw-rows endpoints; discovery flow, params/defaults/enums, response envelopes, error shape, CSV, caching; curl / Python / JS examples | `reference/endpoints.md` — exhaustive per-endpoint param tables    |
| `inferencex-matplotlib` | Python plotting recipes: Pareto frontier scatter, historical trends, calculator bars, fleet margin curves, eval score bars; consistent hardware colors                                                               | 5 runnable scripts in `scripts/` (requests + matplotlib only)      |
| `inferencex-react`      | React dashboards: typed SWR/fetch hooks, Recharts scatter with frontier line, trend lines, sortable rankings table                                                                                                   | `examples/` — `types.ts`, `hooks.ts`, 3 single-file components     |
| `inferencex-html`       | Zero-build single-file HTML+JS visualizations with Chart.js from CDN                                                                                                                                                 | `examples/` — 3 standalone `.html` pages (open in a browser, done) |

All four skills share one hardware color palette so charts are consistent across
Python, React, and HTML outputs.

## Quick taste

```bash
# discover every valid parameter value
curl -s https://inferencex.semianalysis.com/api/v1/views/options

# frontier-flagged cost-vs-interactivity series, ready to plot
curl -s 'https://inferencex.semianalysis.com/api/v1/views/inference?model=DeepSeek-V4-Pro&metric=costh'
```

The base URL is `https://inferencex.semianalysis.com`; all endpoints are GET, no auth.
The `/api/v1/views/*` family is **beta** — the skills document graceful fallbacks to the
stable raw-rows API.

## 中文说明

本包提供四个 Agent Skills（智能体技能），教 AI 智能体（及人类开发者）使用
InferenceX 公开 REST API（`https://inferencex.semianalysis.com`，GET、无需鉴权）
查询大模型推理基准数据并构建可视化：

- **inferencex-api** — 完整 API 指南：`/api/v1/views/*` 图表视图端点与既有原始数据端点、
  参数与默认值、响应结构、错误格式、CSV 输出；附 curl / Python / JavaScript 示例。
- **inferencex-matplotlib** — Python 绘图配方：帕累托前沿散点图、历史趋势线、
  计算器柱状图、机群利润曲线、评测得分图；`scripts/` 内含可直接运行的脚本。
- **inferencex-react** — React 仪表盘：类型定义、SWR/fetch 钩子、Recharts 示例组件。
- **inferencex-html** — 零构建单文件 HTML+JS 可视化（Chart.js CDN），浏览器直接打开即可。

安装：`npx @semianalysisai/inferencex-skills install`（默认复制到 `.claude/skills/`，
可用 `--target` 或 `--dir` 指定其他位置）。需要 Node 18+，无任何依赖。

## Development

This package lives in the [InferenceX-app](https://github.com/SemiAnalysisAI/InferenceX-app)
monorepo at `packages/skills`. The skills are static content — there is no build step.

```bash
node bin/install.mjs list
node bin/install.mjs install --dir /tmp/skills-test
```

## License

GPL-3.0-or-later, same as the InferenceX-app repository.

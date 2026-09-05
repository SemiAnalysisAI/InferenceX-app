# @semianalysisai/inferencex-skills

One Agent Skill, `inferencex-api`, for querying the
[InferenceX public API](https://inferencex.semianalysis.com/api) from Codex or Claude Code.
It supports current OpenAPI discovery, basic benchmark lookups, and validated
PowerX CSV/JSON exports for an exact single-turn workload, preserving measurement
dates, model keys, and source links.

**Unpublished candidate.** Use a local package archive supplied by a maintainer.
The commands below install that archive; public npm availability has not been established.

## Prerequisites

Node 24 with npm, a local `.tgz` package archive, and Codex or Claude Code. Benchmark
queries need public HTTPS access. The installed skill works outside this repository
without database credentials or additional runtime dependencies.

## Install from the archive

Run from the project where the agent should discover the skill. Replace the archive
path with the actual file; quoting preserves paths containing spaces.

```bash
INFERENCEX_SKILLS_TGZ='/absolute/path/semianalysisai-inferencex-skills-0.1.0.tgz'
npm exec --yes --offline --package "$INFERENCEX_SKILLS_TGZ" -- inferencex-skills install --target codex
```

| Target              | Skill location relative to the current project |
| ------------------- | ---------------------------------------------- |
| `codex` or `agents` | `.agents/skills/inferencex-api/`               |
| `claude` (default)  | `.claude/skills/inferencex-api/`               |

For Claude Code, an explicit skills-root directory, or inspection:

```bash
npm exec --yes --offline --package "$INFERENCEX_SKILLS_TGZ" -- inferencex-skills install --target claude
npm exec --yes --offline --package "$INFERENCEX_SKILLS_TGZ" -- inferencex-skills install --dir './my project/.agents/skills'
npm exec --yes --offline --package "$INFERENCEX_SKILLS_TGZ" -- inferencex-skills list
npm exec --yes --offline --package "$INFERENCEX_SKILLS_TGZ" -- inferencex-skills --help
```

`--dir` selects the parent skills directory; the installer appends `inferencex-api`.
A relative directory resolves from the current working directory and takes precedence
over `--target`. Help and list leave files unchanged. The local archive has no runtime
dependencies, so `--offline` keeps installation independent of the npm registry;
subsequent API queries still need internet access.

## Use and upgrade

Open an agent session in the project and ask:

> Use inferencex-api to show five latest available DeepSeek-V4-Pro observations for
> single-turn requests with 8192 input and 1024 output tokens. Include the actual
> measurement dates, raw model keys, request URL, and source run links.

The installed [SKILL.md](skills/inferencex-api/SKILL.md) contains the lookup example.
It reads supported operations and model names from the
[current OpenAPI document](https://inferencex.semianalysis.com/api/openapi.json).
Latest available data may contain historical measurements; the requested cutoff and
each observation's date remain separate.

The skill helps navigate the public API; the single-turn PowerX exporter below is
its first worked export example, not the boundary of API lookup support.

### Export measured PowerX data

Ask the installed skill:

> Use inferencex-api to export measured PowerX data for DeepSeek-V4-Pro, single-turn
> requests with 8192 input and 1024 output tokens, as CSV. Require strictV2, preserve
> source identities and measurement dates, and report the selected scope and counts.

The [PowerX cookbook](skills/inferencex-api/references/powerx.md) explains measured
per-GPU watts, whole-deployment GPU energy, validity, and provenance. You can also
run the bundled Node 24 exporter from your project:

```bash
# Codex installation: CSV (the default format)
node .agents/skills/inferencex-api/scripts/export-powerx.mjs \
  --model DeepSeek-V4-Pro --isl 8192 --osl 1024 --output powerx.csv 2> powerx-report.log

# Claude Code installation: JSON with an as-of cutoff
node .claude/skills/inferencex-api/scripts/export-powerx.mjs \
  --model DeepSeek-V4-Pro --isl 8192 --osl 1024 \
  --date 2026-09-04 --format json --output powerx.json
```

For a custom installation, use its actual `inferencex-api/scripts/export-powerx.mjs`
path. Output paths resolve from your current directory. `--raw-model` optionally
narrows a returned model key; omitted `--date` means latest available observations.
Both formats retain request and package-version metadata. JSON preserves optional
nested worker/audit data; CSV leaves missing metrics blank and preserves real zeros.
Status and coverage go to stderr; omitting `--output` sends the export to stdout.
The report log includes a JSON metadata record even when CSV has no selected rows.
It records the applied filters, disjoint exclusion counts, and `metric_coverage`: each
field's finite-value and unavailable counts among selected rows. A validated row can
still lack a requested metric. Keep that row and report the missing metric; never
fill it with zero. Some role-specific metrics may not apply to every configuration.

The exporter downloads complete JSON and selects numeric validity `1`, schema `2`,
and the exact single-turn workload. Empty results report that no strictV2 rows
matched the requested scope; request/response failures exit unsuccessfully. These
are existing observations, not new benchmark runs. The cookbook describes the
measurement units and limitations; strict validity alone does not establish an
energy-efficiency advantage.

### Upgrade

Repeated installation skips an existing skill. To upgrade deliberately, point
`INFERENCEX_SKILLS_TGZ` at the new archive and add `--force`:

```bash
npm exec --yes --offline --package "$INFERENCEX_SKILLS_TGZ" -- inferencex-skills install --target codex --force
```

Force merges the packaged files into the existing skill and overwrites matching
files. It preserves unrelated neighboring skills and leaves obsolete files in the
skill directory. Keep a copy of local edits before choosing an overwrite.

## 中文说明

本包提供一个 Agent Skill（智能体技能）`inferencex-api`，供 Codex 或 Claude Code
查询 [InferenceX 公开 API](https://inferencex.semianalysis.com/zh/api)。技能支持查阅
实时 OpenAPI、基础基准测试查询，以及指定单轮请求工作负载下的已验证 PowerX CSV/JSON
导出，并在结果中保留测量日期、原始模型键和来源链接。技能面向整个公开 API 的查询；
单轮 PowerX 导出是首个完整示例，不代表技能只能查询这类数据。

**当前为尚未发布的候选版本。** 请使用维护者提供的本地 `.tgz` 产物。上面的命令安装
该本地产物；目前尚未确认可通过公开 npm 仓库安装。

需要 Node 24、npm、本地包产物，以及 Codex 或 Claude Code。查询需要访问公开 HTTPS
接口；安装后的技能无需检出本仓库，也不需要数据库凭据或额外运行时依赖。

在目标项目目录中执行上面的安装命令，将 `INFERENCEX_SKILLS_TGZ` 改为实际产物的
文件路径，并保留引号以支持带空格的路径。`--target codex` 和 `--target agents`
将技能安装到 `.agents/skills/inferencex-api/`；`--target claude` 安装到
`.claude/skills/inferencex-api/`，也是省略目标时的默认行为。

`--dir` 指定存放各项技能的目录，安装器在其中创建 `inferencex-api`。相对路径以
当前工作目录为基准，且 `--dir` 优先于 `--target`。`list` 和 `--help` 不修改文件。
本地产物没有运行时依赖，因此可用 `--offline` 在不访问 npm 仓库的情况下安装；
后续 API 查询仍需要联网。

安装后，在该项目的智能体会话中提出请求，例如：

> 使用 inferencex-api 查询 DeepSeek-V4-Pro 最新可用的五条基准测试观测数据，限定为
> 输入 8192、输出 1024 个 token 的单轮请求。请附上实际测量日期、原始模型键、
> 请求 URL 和来源运行记录链接。

已安装的 [SKILL.md](skills/inferencex-api/SKILL.md) 包含查询示例，并从
[实时 OpenAPI 文档](https://inferencex.semianalysis.com/api/openapi.json) 获取受支持的接口
和模型名称。最新可用数据可能包含历史测量值；查询指定的截止日期与每条数据自身的
测量日期是两项独立信息。

也可以提出 PowerX 导出请求：

> 使用 inferencex-api 将 DeepSeek-V4-Pro 的实测 PowerX 数据导出为 CSV，限定为输入
> 8192、输出 1024 个 token 的单轮请求，并要求 strictV2。请保留来源标识和测量日期，
> 说明筛选范围及返回、选中的数据条数。

[PowerX 指南](skills/inferencex-api/references/powerx.md) 说明实测单 GPU 功率、整个
部署的 GPU 能耗、验证状态和溯源字段。也可直接在项目目录中执行上面的 Node 24 导出
命令：Codex 默认使用 `.agents/skills/inferencex-api/scripts/export-powerx.mjs`，
Claude Code 使用 `.claude/skills/inferencex-api/scripts/export-powerx.mjs`；自定义
安装则使用实际路径。输出文件路径以当前工作目录为基准。

`--raw-model` 可进一步筛选响应中的原始模型键；省略 `--date` 表示查询最新可用观测值。
默认格式为 CSV，也支持 JSON；两种格式均记录请求与包版本元数据。JSON 保留可选的嵌套
worker/审计信息；CSV 将缺失指标留空，并保留真实零值。状态和覆盖范围输出到 stderr，
省略 `--output` 时将导出内容写入 stdout。
即使 CSV 没有选中任何数据行，示例中的报告日志也会包含一条 JSON 格式的元数据记录。
该记录包含实际筛选条件、互不重叠的排除数量，以及 `metric_coverage`：即每个字段在
选中数据行中有限数值的条数与不可用的条数。已通过验证的数据行仍可能缺少用户请求的
指标；此时应保留该行并说明指标缺失，不能补零。部分按角色拆分的指标可能并不适用于
所有配置。

导出器下载完整 JSON，只保留验证值为数字 `1`、schema 为数字 `2` 且满足指定单轮工作
负载的数据。结果为空时，导出器会报告该范围内没有匹配的 strictV2 数据；请求或响应失败会以非零
状态退出。导出使用已有观测值，不会启动新的基准测试。指标单位和限制见 PowerX 指南；
通过严格验证本身并不能证明具有能效优势。

重复安装默认跳过已有技能。需要升级时，将 `INFERENCEX_SKILLS_TGZ` 指向新产物，
然后在对应安装命令后添加 `--force`。该选项会将包内文件合并进已有技能目录，并覆盖
同名文件；相邻的其他技能不受影响，技能目录中已不再随包提供的旧文件也不会被删除。
覆盖前请自行备份本地修改。

## License / 许可证

GPL-3.0-or-later, matching the InferenceX-app repository.

采用 GPL-3.0-or-later，与 InferenceX-app 仓库一致。

# @semianalysisai/inferencex-skills

One Agent Skill, `inferencex-api`, for querying the
[InferenceX public API](https://inferencex.semianalysis.com/api) from Codex or Claude Code.
It uses current OpenAPI discovery and a basic benchmark lookup to preserve model,
workload, measurement dates, and source links in the result.

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
查询 [InferenceX 公开 API](https://inferencex.semianalysis.com/zh/api)。技能通过实时
OpenAPI 查阅接口，并提供基础基准测试查询示例，在结果中保留模型、工作负载、测量日期
和来源链接。

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

重复安装默认跳过已有技能。需要升级时，将 `INFERENCEX_SKILLS_TGZ` 指向新产物，
然后在对应安装命令后添加 `--force`。该选项会将包内文件合并进已有技能目录，并覆盖
同名文件；相邻的其他技能不受影响，技能目录中已不再随包提供的旧文件也不会被删除。
覆盖前请自行备份本地修改。

## License / 许可证

GPL-3.0-or-later, matching the InferenceX-app repository.

采用 GPL-3.0-or-later，与 InferenceX-app 仓库一致。

## Problem Statement

InferenceX already publishes a public API and a measured-power contract, but users must still teach their agents how to discover the right operations, select comparable observations, interpret PowerX metrics, and preserve provenance in an export. A machine-readable schema describes the interface; it does not by itself install reusable task guidance in Codex or Claude Code.

Users want to install one skill, ask for benchmark or PowerX data in plain language, and receive a traceable CSV or JSON result using public HTTP access. They should not need the InferenceX repository, database credentials, or familiarity with dashboard implementation details. Incorrect workload selection, mixed model releases, missing validity fields, and confusion between measured and provisioned power can otherwise produce plausible but misleading results.

## Solution

Publish one public `inferencex-api` Agent Skill in the npm package `@semianalysisai/inferencex-skills`. Reuse the package and installer foundation proposed in #901, adapting the skill to currently deployed public operations. Use #938's shipped measured-power contract as the API foundation.

The first release includes a concise skill entrypoint, one PowerX cookbook, a Node 24 export example, and a predictable installer for Codex and Claude Code. Add bilingual agent onboarding to the existing API reference. A user can install the package, ask for validated PowerX observations for a chosen workload, and receive an export with correct units, validity, source identities, request metadata, and an honest explanation of unavailable data.

## User Stories

1. As an agent user, I want to install one published npm package, so that I can use InferenceX without assembling instructions myself.
2. As a Codex user, I want the installer to place the skill where Codex discovers project skills, so that it is available in my working project.
3. As a Claude Code user, I want the same skill installed in Claude Code's supported location, so that I can use the same workflow in my chosen agent.
4. As a user with a custom project setup, I want to choose an explicit installation destination, so that the skill fits my existing organization.
5. As an existing skill user, I want repeated installation to preserve my current files by default, so that installation does not silently overwrite my work.
6. As an existing skill user, I want an explicit upgrade option with documented overwrite behavior, so that I can intentionally adopt a newer version.
7. As a prospective user, I want help and a list of bundled skills without filesystem changes, so that I can understand the package before installing it.
8. As an external API consumer, I want the installed package to work outside the InferenceX repository and without private credentials, so that public access is sufficient.
9. As an agent user, I want the skill to consult the current OpenAPI document, so that it uses deployed operations and supported parameters.
10. As a benchmark analyst, I want a basic benchmark lookup example, so that I can retrieve source observations before performing more specialized analysis.
11. As a benchmark analyst, I want requested display models and returned model keys kept distinct, so that a display bucket containing multiple releases is not mistaken for one exact release.
12. As a benchmark analyst, I want to select an as-of date while retaining actual measurement dates, so that historical observations are not presented as newly measured results.
13. As a PowerX analyst, I want strict validated schema-v2 selection, so that my primary export uses the supported measurement semantics.
14. As a PowerX analyst, I want exact workload selection, so that single-turn observations with my input/output lengths are not mixed with other workloads.
15. As an analyst studying an exact model release, I want to further select a returned raw model key, so that related releases in the same display bucket remain separate.
16. As a PowerX analyst, I want measured per-GPU watts, whole-deployment GPU energy, and provisioned estimates clearly distinguished, so that I compare quantities with the same meaning.
17. As an analyst, I want missing measurements and genuine zero values to remain different, so that absence is not interpreted as perfect efficiency.
18. As an analyst, I want original run provenance and logical snapshot provenance preserved separately, so that I can trace each observation to its actual source.
19. As a spreadsheet user, I want a correctly escaped CSV with workload, configuration, measurements, and provenance, so that I can analyze the result in my existing tools.
20. As a programmatic consumer, I want JSON containing selected observations and request metadata, so that structured optional audit information can remain intact.
21. As an analyst, I want an empty strict selection reported precisely, so that I do not confuse missing eligible power data with missing benchmark data altogether.
22. As an analyst investigating unavailable measurements, I want a bounded diagnostic recipe for the same scope, so that I can distinguish invalid, legacy, missing, and unsupported-schema data when the API permits it.
23. As an API consumer, I want HTTP and malformed-response failures reported as failures, so that a failed download cannot masquerade as a successful empty export.
24. As an analyst, I want identifiers preserved exactly, including large numeric-looking strings, so that exported provenance remains reliable.
25. As a user returning to an analysis, I want the request URL, retrieval time, selected scope, and package version recorded, so that I can repeat the procedure and identify live-data changes.
26. As an English- or Chinese-speaking visitor, I want equivalent installation instructions and sample prompts in the API reference, so that I can start in my preferred language.
27. As a new user, I want advertised installation commands to refer to an available package version, so that onboarding works when I follow it.
28. As a maintainer, I want the packed artifact tested outside the monorepo, so that release contents and executable wiring are verified before publication.
29. As a maintainer, I want skill-only changes to trigger meaningful CI checks, so that later edits do not silently break installation or extraction.
30. As a maintainer, I want realistic acceptance runs in both supported agents, so that skill quality is judged by completed user tasks rather than instruction text alone.
31. As a release owner, I want the exact reviewed archive published and checked by version, so that the public package matches the tested candidate.
32. As a maintainer of the broader views effort, I want this focused package work to remain compatible with that effort, so that later integration does not restore guidance for unavailable operations or duplicate the package.

## Implementation Decisions

- **One package and one skill.** Retain the proposed npm identity from #901 and initially bundle only `inferencex-api`. Selectively reuse its installer and package metadata; adapt its API guidance to the shipped contract. Keep the common workflow in the skill and PowerX interpretation in one cookbook. Consult live OpenAPI for endpoint details instead of carrying an exhaustive copied schema catalogue.
- **Existing API foundation.** #938 is merged and deployed. This feature consumes that contract; it does not require another PowerX endpoint, database migration, or chart-data API. Public benchmark lookup remains available to the general skill. The first executable export recipe covers observed single-turn snapshots.
- **Runtime.** Use Node 24 and its standard library for the installer and exporter. Declare and test that requirement truthfully. The public package has no runtime dependency on the monorepo, a private SDK, or a second language environment.
- **Installer interface.** Keep help, list, install, target selection, explicit destination, and explicit force-overwrite behavior. Both Codex and generic Agent Skills targets use Codex's supported project discovery location; Claude Code uses its supported project location. Default installation skips an existing skill. Force performs documented merging and overwriting, preserves neighboring skills, and does not promise deletion of obsolete files. Invalid commands/options return useful errors without unintended writes.
- **Exporter interface.** Accept a display model, input/output lengths, optional as-of date, optional returned raw-model selection, output format, and output destination. Default to CSV and support JSON. Record that an omitted date means latest available data. Use standard URL construction and compressed-response handling.
- **Strict selection.** Request `powerValid=strictV2`, then defensively require numeric validity `1` and numeric schema version `2`. Strings, booleans, absent fields, an invalid verdict, and unsupported versions do not satisfy the rule. Locally select single-turn observations with the exact requested input/output lengths. The ordinary benchmark endpoint ignores its sequence parameter outside the calculator projection; that projection cannot be combined with the strict filter. The history operation has no equivalent server-side power filter, so historical guidance must validate locally when needed.
- **Model and date identity.** Discover supported display names through the current contract, retain returned raw model keys, and expose mixed-release buckets explicitly. Do not maintain a duplicated static alias table. An as-of cutoff, original measurement date, and logical snapshot date remain distinct.
- **Measurement interpretation.** Describe average per-GPU watts, schema-v2 whole-deployment GPU energy over its stated denominator, and provisioned-power estimates separately. Measured GPU energy is not measured facility energy. Preserve missing versus zero values and exclude non-finite measurements. Eligibility alone does not establish a representative performance or energy win.
- **Export contents.** Include query URL, retrieval time, requested model/date, raw model, exact benchmark identity, hardware/framework/image, precision, speculative method, workload/concurrency, original topology/configuration, relevant watts/joules fields, validity/schema, original date/run URL, and separate snapshot metadata where supplied. Preserve IDs as supplied, including strings beyond safe integer precision. Never substitute a curve identity for an absent producer identity. JSON can retain optional nested workers/audit data; CSV leaves missing values blank.
- **Unavailable data and failures.** An empty strict selection means no strictV2 observations matched the scope. The diagnostic recipe may make one corresponding unfiltered request to classify the underlying availability. Fail on non-success HTTP responses, malformed JSON, or unexpected response shape with an actionable message and nonzero status; do not emit a misleading successful empty result.
- **Onboarding.** Add a small bilingual agent-skill section to the existing API reference using its shared rendering, localized copy, and copyable-command interaction. Keep real API-operation quickstarts separate from package installation guidance. Maintain consistent package identity, tested version, sample prompts, and terminology across the website and package documentation.
- **CI and packaging.** Reuse the existing workspace test runner, Node's built-in tests for package behavior, and the existing API-reference browser coverage. Ensure changes limited to the skills package trigger the relevant checks. The release archive contains only intended installer, metadata, documentation, and the one skill with its required resources.
- **Release sequencing.** Prepare and test the exact archive from reviewed source, verify publication ownership and an unused version, publish that archive when authorized, and verify installation of the pinned public version before activating website onboarding. If release policy requires source merge before publication, activate the prepared onboarding afterward. Avoid a runtime release flag for this sequencing.

## Testing Decisions

- **Principal acceptance seam: the installed package's public interface.** From a clean project outside the monorepo, install the reviewed archive through npm's real executable resolution, confirm skill discovery, and use the installed skill/exporter to retrieve and export PowerX observations. Check actual files, exit statuses, scope, units, measurements, and provenance against the HTTP response used for that run. Exercise this flow in Codex and Claude Code. Record request URLs and retrieval time rather than asserting fixed production row counts.
- **Installer behavior through the same seam.** Check the single bundled skill, complete references/resources, help/list without writes, supported targets, explicit destinations containing spaces, repeat installation, deliberate force-overwrite, and preservation of neighboring skills. Assertions concern resulting behavior, not internal parser functions or implementation shape.
- **Exceptional extraction cases through controlled HTTP responses.** Use representative deterministic fixtures for invalid or nonnumeric validity, unsupported schemas, mixed workload/model rows, missing versus zero/non-finite measurements, oversized string IDs, absent producer identity with present snapshot identity, CSV quoting/Unicode, empty results, HTTP errors, and malformed bodies. Keep any focused lower-level checks limited to cases that cannot be reliably exercised through the public interface. Do not introduce public testing switches or a generic transport framework solely for tests.
- **Existing website seam.** Extend the current API-reference browser tests to cover both languages, consistent commands and release status, sample-prompt/cookbook navigation, and the existing copy interaction. Reuse the current browser suite and shared page.
- **Prior art and CI.** The proposed package installer in #901 provides the existing CLI interface; the repository's workspace runner already discovers package test scripts; its API-reference browser tests already exercise localized content and copyable code. Add skills-package trigger coverage and run the repository's required type, lint, formatting, typography, unit, and E2E smoke checks. Keep the API synchronization guard passing without gratuitously changing handler digests for onboarding-only work.
- **Release acceptance.** Inspect the candidate archive, test installation through npm from that local archive before publishing, publish exactly the reviewed archive, and verify the pinned public artifact and one real extraction afterward. Preserve evidence for benchmark lookup, valid PowerX export, and unavailable/error requests. Review Chinese semantic fidelity and naturalness using the repository's established advisory workflow.

## Out of Scope

- Additional PowerX API behavior, reimplementation of #938, new database credentials or migrations, or private database access for consumers.
- The broader views API, chart refactors, interpolation changes, ranking/comparison engines, or visualization skills proposed by #901.
- An SDK, a second skills package, native plugin distribution, or a new test framework.
- New benchmark execution, automatic claims of benchmark wins, or treating historical/as-of rows as new measurements.
- A mandatory dependency on populated #939 audit fields; optional unavailable provenance stays unavailable.
- A general historical/agentic export engine in the first executable example; the general skill can consult the public API for other supported reads.
- Destructive cleanup of installed skill directories or unrelated project configuration.
- Automatic npm publication or permission to post PR reviews beyond the separately authorized actions.

## Further Notes

- API foundation: [#938](https://github.com/SemiAnalysisAI/InferenceX-app/pull/938).
- Package/installer work to reuse selectively: [#901](https://github.com/SemiAnalysisAI/InferenceX-app/pull/901). Its wider views scope remains separate; coordinate later integration so it preserves this shipped skill's contract.
- Optional detailed provenance work: [#939](https://github.com/SemiAnalysisAI/InferenceX-app/pull/939). Current documentation can describe fields before every dataset supplies values.
- Authoritative consumer documentation: [API reference](https://inferencex.semianalysis.com/api) and [OpenAPI document](https://inferencex.semianalysis.com/api/openapi.json). Recheck these and related PR heads when implementation starts.
- Completion means a clean-project user can install the published version, ask for PowerX data in plain language, and receive a correct, source-qualified export using public HTTP access. Package, agent, and website acceptance must all pass; a written skill alone is insufficient.

## 中文说明

### 问题陈述

InferenceX 已提供公开 API 和实测功耗契约，但用户仍需自行指导智能体发现合适的接口、筛选可比的数据、理解 PowerX 指标，并在导出时保留溯源信息。机器可读的 schema 描述了接口，却不会自动把可复用的操作指南安装到 Codex 或 Claude Code 中。

用户希望安装一个技能后，直接用自然语言请求基准测试或 PowerX 数据，获得可追溯的 CSV 或 JSON，无需检出 InferenceX 仓库、获取数据库凭据或了解仪表板内部实现。工作负载筛选错误、混入不同模型版本、误读验证字段，以及混淆实测功耗和预留功率估算，都可能造成看似合理却具有误导性的结果。

### 解决方案

通过 npm 包 `@semianalysisai/inferencex-skills` 发布一个公开的 `inferencex-api` Agent Skill。复用 #901 中的包结构和安装器基础，将技能指南改为使用已部署的公开接口，并以 #938 已上线的实测功耗契约为基础。

首版包含简洁的技能入口、一份 PowerX 使用指南、一个基于 Node 24 的导出示例，以及行为明确的 Codex/Claude Code 安装器。现有 API 文档增加双语智能体入门说明。用户安装后即可请求指定工作负载下通过验证的 PowerX 观测值，获得包含单位、验证状态、来源标识和请求元数据的导出结果；数据不可用时，应准确解释缺失情况。

### 用户故事

1. 作为使用智能体的用户，我希望安装一个已发布的 npm 包，以便直接使用 InferenceX，无需自己拼装操作指南。
2. 作为 Codex 用户，我希望安装器将技能放入 Codex 支持的项目技能位置，以便在当前项目中发现并使用它。
3. 作为 Claude Code 用户，我希望同一技能可以安装到 Claude Code 支持的位置，以便在自己选择的智能体中使用相同流程。
4. 作为采用自定义项目结构的用户，我希望显式指定安装目标，以便与现有组织方式保持一致。
5. 作为已有技能的用户，我希望重复安装默认保留现有文件，以免安装操作悄悄覆盖我的修改。
6. 作为已有技能的用户，我希望通过明确的升级选项采用新版本，并了解覆盖行为，以便主动控制升级。
7. 作为准备使用该包的用户，我希望在不修改文件系统的情况下查看帮助和技能列表，以便先了解安装内容。
8. 作为外部 API 使用者，我希望安装后的包可以独立于 InferenceX 仓库运行，且无需私有凭据，以便仅凭公开访问完成任务。
9. 作为使用智能体的用户，我希望技能查阅当前 OpenAPI 文档，以便使用已部署的接口和受支持的参数。
10. 作为基准测试分析者，我希望获得一个基础查询示例，以便在开展专项分析前先获取原始观测数据。
11. 作为基准测试分析者，我希望区分请求中的展示模型名称和响应中的模型键，以免把包含多个版本的展示分组误当成单一模型版本。
12. 作为基准测试分析者，我希望按截止日期查询，同时保留实际测量日期，以免将历史观测值描述成新测结果。
13. 作为 PowerX 分析者，我希望严格筛选通过验证的 schema v2 数据，以便主要导出结果采用受支持的测量口径。
14. 作为 PowerX 分析者，我希望准确筛选工作负载，以免将指定输入/输出长度的单轮请求数据与其他工作负载混在一起。
15. 作为研究特定模型版本的分析者，我希望进一步筛选响应中的原始模型键，以便区分同一展示分组中的相关版本。
16. 作为 PowerX 分析者，我希望清楚区分实测单 GPU 功率、整个部署的 GPU 能耗和预留功率估算，以便比较口径一致的数值。
17. 作为分析者，我希望区分缺失测量值和真实的零值，以免将数据缺失误读为极高能效。
18. 作为分析者，我希望分别保留原始运行和逻辑快照的溯源信息，以便追踪每个观测值的真实来源。
19. 作为电子表格用户，我希望获得正确转义且包含工作负载、配置、测量值和溯源信息的 CSV，以便在现有工具中分析数据。
20. 作为程序化使用者，我希望获得包含所选观测值和请求元数据的 JSON，以便完整保留可选的结构化审计信息。
21. 作为分析者，我希望准确理解严格筛选后的空结果，以免把缺少符合要求的功耗数据误认为完全没有基准测试数据。
22. 作为排查测量数据不可用原因的分析者，我希望获得针对相同范围的有限诊断流程，以便在 API 信息允许时区分无效、旧版未验证、缺失及不受支持的 schema 数据。
23. 作为 API 使用者，我希望 HTTP 错误和响应格式错误明确表现为失败，以免把下载失败当作成功导出的空结果。
24. 作为分析者，我希望完整保留标识符，包括看似数值的大整数文本，以便确保导出结果的溯源可靠。
25. 作为重新开展分析的用户，我希望记录请求 URL、获取时间、筛选范围和包版本，以便复用同一过程并识别线上数据变化。
26. 作为英语或中文用户，我希望 API 文档提供内容一致的安装说明和示例提示词，以便使用自己熟悉的语言入门。
27. 作为新用户，我希望文档中的安装命令对应实际可用的包版本，以便按照说明操作时能够成功。
28. 作为维护者，我希望在仓库外测试打包产物，以便在发布前验证包内容和可执行命令的连接是否正确。
29. 作为维护者，我希望仅修改技能包也会触发有意义的 CI 检查，以免后续编辑悄悄破坏安装或数据提取。
30. 作为维护者，我希望在两个受支持的智能体中运行真实任务验收，以便根据用户任务是否完成来判断技能质量，而非只检查指南文字。
31. 作为发布负责人，我希望发布经过审核的确切归档文件，并按版本验证，以便公开包与已测试的候选产物保持一致。
32. 作为更大范围视图功能的维护者，我希望本次聚焦的技能包工作可以与后续开发衔接，以免之后的集成恢复对未上线接口的依赖或重复创建包。

### 实现决策

- **一个包、一个技能。** 沿用 #901 提议的 npm 名称，首版仅包含 `inferencex-api`。选择性复用安装器和包元数据，将指南调整为当前已上线的契约。通用流程保留在技能入口中，PowerX 的解释性内容集中在一份指南中。接口细节以实时 OpenAPI 为准，不复制维护一份完整 schema 目录。
- **使用现有 API 基础。** #938 已合并并部署。本功能使用该契约，无需新增 PowerX 接口、数据库迁移或图表数据 API。通用技能继续支持公开基准测试查询；首个可执行导出示例仅处理已有的单轮请求快照。
- **运行环境。** 安装器和导出器使用 Node 24 及其标准库，并如实声明和测试该要求。公开包运行时不依赖整个仓库、私有 SDK 或另一种语言环境。
- **安装器接口。** 保留帮助、列表、安装、目标选择、显式目录和显式强制覆盖选项。Codex 和通用 Agent Skills 目标使用 Codex 支持的项目技能发现位置；Claude Code 使用其支持的项目位置。默认跳过已有技能。强制操作按文档约定合并并覆盖，保留相邻技能，但不承诺删除过时文件。无效命令或参数应给出明确错误，不产生意外写入。
- **导出器接口。** 接受展示模型名称、输入/输出长度、可选截止日期、可选原始模型键筛选、输出格式和目标位置。默认 CSV，同时支持 JSON。省略日期时记录其含义为最新可用数据。使用标准 URL 构造和压缩响应处理。
- **严格筛选。** 请求 `powerValid=strictV2`，并再次检查验证值为数字 `1`、schema 版本为数字 `2`。字符串、布尔值、缺失字段、无效判定和不受支持的版本均不满足条件。在本地筛选单轮请求及精确的输入/输出长度。普通基准测试接口在计算器投影之外会忽略 sequence 参数，而计算器投影不能与严格功耗筛选组合使用。历史接口没有对应的服务端功耗筛选参数，需要时由历史查询指南在本地验证。
- **模型与日期标识。** 从当前契约发现受支持的展示名称，保留响应中的原始模型键，并明确提示混合版本分组。避免维护重复的静态别名表。截止日期、原始测量日期和逻辑快照日期必须分别保留。
- **测量口径。** 分别说明实测单 GPU 平均功率、按指定分母归一化的 schema v2 整体部署 GPU 能耗，以及预留功率估算。实测 GPU 能耗不等于实测设施总能耗。区分缺失值和零值，排除非有限测量值。通过数据筛选本身并不能证明具有代表性的性能或能效优势。
- **导出内容。** 包含请求 URL、获取时间、请求模型/日期、原始模型、准确的基准测试标识、硬件/框架/镜像、精度、投机解码方法、工作负载/并发数、原始拓扑与配置、相关功率/能耗指标、验证值/schema、原始日期/运行 URL，以及独立的快照元数据。按响应原样保留标识符，包括超出安全整数精度范围的字符串。不得用曲线标识补充缺失的生产运行标识。JSON 可保留可选的嵌套 worker/审计数据；CSV 中缺失值留空。
- **不可用数据与失败。** 严格筛选为空仅表示该范围内没有符合 strictV2 的观测值。诊断指南可以追加一次相同范围、不启用功耗筛选的查询，进一步判断底层数据情况。非成功 HTTP 响应、无效 JSON 或异常响应结构应产生可操作的错误信息和非零退出状态，不得伪装成成功的空导出。
- **入门说明。** 在现有 API 文档中增加简洁的双语智能体技能说明，复用共享渲染、本地化文案和复制命令交互。真实 API 操作的快速入门与包安装指南分别呈现。网站与包文档统一包名称、已测试版本、示例提示词和术语。
- **CI 与打包。** 复用现有工作区测试运行器，使用 Node 内置测试验证包行为，并扩展现有 API 文档浏览器测试。确保仅修改技能包也会触发相关检查。发布归档仅包含预期的安装器、元数据、文档，以及该技能所需的资源。
- **发布顺序。** 从已审核源码生成并测试确切的归档文件，确认发布权限及未使用的版本号，取得授权后发布该归档，验证固定公开版本的安装，再启用网站入门说明。如果发布流程要求先合并源码，则在发布后启用已准备好的说明。无需为该顺序增加运行时发布开关。

### 测试决策

- **主要验收接口：安装后包的公开接口。** 在仓库外的干净项目中，通过 npm 实际的可执行命令解析安装已审核归档，确认技能可被发现，再使用已安装的技能/导出器获取并导出 PowerX 观测值。将产物、退出状态、筛选范围、单位、测量值和溯源信息与本次实际使用的 HTTP 响应对照。在 Codex 和 Claude Code 中分别执行，并记录 URL 与获取时间，不断言线上行数永久不变。
- **通过同一接口验证安装行为。** 检查仅包含一个技能、资源与引用完整、帮助/列表不写文件、支持的目标、含空格的显式目录、重复安装、主动强制覆盖及相邻技能保留。断言实际行为，而不是内部参数解析函数或代码结构。
- **以受控 HTTP 响应覆盖异常提取场景。** 用有代表性的固定数据覆盖无效或非数字验证值、不支持的 schema、混合工作负载/模型、缺失与零值/非有限数值、超大字符串标识符、生产标识缺失但快照标识存在、CSV 转义/Unicode、空结果、HTTP 错误及响应格式错误。只有无法通过公开接口可靠覆盖的情况，才增加聚焦的底层检查；不为测试新增公开开关或通用传输框架。
- **复用现有网站测试接口。** 扩展当前 API 文档浏览器测试，覆盖两种语言、命令及发布状态一致性、示例提示词/指南导航，以及已有复制交互。复用现有浏览器测试套件和共享页面。
- **沿用现有实践与 CI。** #901 的安装器提供现有 CLI 接口；仓库工作区运行器已支持发现包测试脚本；API 文档浏览器测试已覆盖本地化内容和可复制代码。补充技能包触发范围，运行仓库要求的类型、lint、格式、排版、单元和 E2E 冒烟检查。仅增加入门说明时，不无故修改处理器摘要，同时保持 API 同步检查通过。
- **发布验收。** 检查候选归档，在发布前通过 npm 安装本地归档，发布经过审核的同一归档，再验证公开固定版本及一次真实提取任务。保留基础查询、有效 PowerX 导出和不可用/错误请求的验收证据。中文文案遵循仓库既有的语义准确性、自然度和非阻断审核流程。

### 不在范围内

- 新增 PowerX API 行为、重新实现 #938、新增数据库迁移或要求消费者提供数据库凭据。
- #901 中更大范围的视图 API、图表重构、插值调整、排名/对比引擎和可视化技能。
- SDK、第二个技能包、原生插件分发或新的测试框架。
- 启动新的基准测试、自动宣称基准测试优势，或把历史/截止日期查询结果描述成新测数据。
- 强制依赖 #939 的审计字段已经填充；缺失的可选溯源信息仍应保持缺失。
- 在首个可执行示例中构建通用历史/智能体工作负载导出引擎；通用技能仍可查阅公开 API 完成其他受支持的读取任务。
- 破坏性清理已安装技能目录，或修改无关项目配置。
- 自动发布 npm 包，或未经单独授权发布 PR 评审内容。

### 补充说明

- API 基础为 [#938](https://github.com/SemiAnalysisAI/InferenceX-app/pull/938)。
- 包与安装器选择性复用 [#901](https://github.com/SemiAnalysisAI/InferenceX-app/pull/901)。其更大的视图范围独立处理，后续集成应保留本技能已上线的契约。
- 可选的详细溯源工作见 [#939](https://github.com/SemiAnalysisAI/InferenceX-app/pull/939)。文档包含某个字段，并不代表所有数据集都已提供该字段的值。
- 面向使用者的权威文档为 [API 文档](https://inferencex.semianalysis.com/api)和 [OpenAPI 文档](https://inferencex.semianalysis.com/api/openapi.json)。实施前重新检查这些内容与相关 PR 的最新状态。
- 完成标准：用户在干净项目中安装已发布版本，用自然语言请求 PowerX 数据，仅通过公开 HTTP 访问即可获得准确且可追溯的导出结果。包、智能体和网站验收均须通过，仅写出技能说明不足以完成本任务。

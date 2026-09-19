# 不可变测量结果发布

[English](./measurement-publication.md)

Phase 1 的读取端接受由 InferenceX 独立受信托管签发流程生成的 version 1 源测量回执。之后生成的发布记录引用该回执，并补充 merge、changelog、ingest 和公开应用的版本。结果从 staging 进入生产时，源回执保持不变。当前实现属于读取端前置条件；本地测试通过不代表读取端已经部署，也不代表 GPU 验收已经完成。

`prepare-receipt-transport.ts` 独立检查源运行的产物清单。只要存在 `native-execution-*` 上传项，就必须提供回执；失败的 native 执行也适用。受信调度端同时传递 `receipt-required`。缺少 native 证据的运行不能通过 native 资格验收。不含该能力标识的旧产物继续使用较弱的兼容选择逻辑，但已接受回执的运行不能再通过旧入口绕过回执。

应用仓库必须配置 `INFX_RECEIPT_ISSUER_SHAS`，其中以逗号分隔经过审查的签发流程版本；同时将 `INFX_RECEIPT_ISSUER_WORKFLOW` 设置为准确的 `.github/workflows/<name>.yml` 路径。只要旧回执仍受支持，就应保留对应的允许版本。接收端检查签发运行已成功完成、仓库及运行归属准确、API digest、ZIP 字节和成员路径一致。payload 不能选择任意下载 URL 或受信代码。签发流程成功完成后，才能调度发布。

读取回执沿用仓库级凭据 `INFX_MAIN_PAT`，并要求它具有读取源 Actions 运行及产物的权限。凭据只传给实际需要它的步骤；迁移到受保护的 GitHub Environment 时，必须同时迁移已存储凭据及其策略，仅在工作流里添加空的 `environment` 无法完成迁移。应用当前配置的 zizmor 检查通过；单独运行 auditor persona 时，会额外提示这种既有凭据架构，包括新增的回执读取步骤。这些提示未被抑制。

调度字段为 `receipt-required`、`receipt-artifact-id`、`receipt-artifact-sha256`、`receipt-sha256`、`receipt-issuer-run-id` 和 `receipt-issuer-sha`。ZIP digest 与 JSON digest 分别校验。回执 ZIP 包含 `receipt.json`。生产发布及恢复还需提供 `publication-artifact-id`、`publication-artifact-sha256`、`publication-sha256`、`publication-issuer-run-id` 和 `publication-issuer-sha`；后续 ZIP 包含 `publication.json`。staging 与 ingest 工作流都会转发这些字段。staging 会先验证传输，再执行可选的数据库重置。

接收工作流根据实际数据库目标确定 `PUBLICATION_REQUIRED`。native 生产发布即使源运行与 merge 运行 ID 相同，也必须提供后续发布记录；staging 可以只使用源回执。签发运行必须由 `main` 上的 `workflow_dispatch` 触发并成功完成，接收端还会通过 API 独立验证源运行的原始 attempt 和 head。在 GitHub Actions 中，记录的 `ingest_sha` 必须匹配应用执行 checkout 的 `GITHUB_SHA`。签发发布记录前，应将源仓库的 `INFX_PHASE1_READER_REVISION` 固定到这个已部署的应用 commit，并保留公开应用确实使用所记录 `app_sha` 的部署证据。

读取端分别支持 `aiperf-1.4`、`agentx-v1` 和 publication contract 1。不支持的必需版本会在导入前报错。每个点都绑定其原始执行及 attempt、prepared bundle、native manifest、物理拓扑、规范化后的模型/硬件/framework/precision、必需指标、完整数据集身份，以及准确的产物和文件引用。输入支持规范化 AgentX JSON，也支持每个任务的原始 lm-eval 结果和 `meta_env.json`。评估必须完整覆盖 `(task, doc_id, filter)`。live preview 与数据库中的文档级样本统一选择 strict-match，不受行顺序影响；同一过滤器的冲突副本会被拒绝。聚合部署元数据映射到一个实际 serving role，兼容字段中的 worker 数量为 0/0。

产物下载使用 argv 形式调用 `gh`，先写入私有临时 ZIP 文件，再在以数字 ID 命名的目录中解压。压缩包和成员的哈希计算均按固定大小分块读取。Node/Bun 工作进程先流式读取所有 ZIP 成员完成校验，再流式解压并复核已接受的成员集合；大型 trace 文件不会同时驻留内存。校验会拒绝越界路径、链接、规范化后重名的成员、文件与目录冲突、覆盖写入以及成员集合变化。经过验证的兼容视图保留已有消费端的发现名称。在第一次数据库写入之前，必须验证完整 snapshot 的文件字节和规范化要求。

回执导入根据回执中准确的成员绑定选择基准测试 JSON 和评估样本。执行元数据及其他 JSON 附属文件保留为证据，不进入基准测试行映射。规范化聚合评估与原始 lm-eval 输出都会写入明确绑定的 strict-match 样本；样本关联不依赖目录或时间戳命名约定。

如果回执要求导入吞吐量测量点，`evals-only` changelog 不能缩小该范围，读取端会在数据库写入前拒绝这一冲突。在刷新已发布曲线或将 snapshot 标记为完成之前，每个已接受的基准测试文件都必须从数据库写入中返回回执规定的测量点数量，重复导入时已有的数据行也计入。因此，按测量点执行的清除规则若跳过必需数据，snapshot 会保持未完成状态。

部署读取端之前，先应用 `016_measurement_snapshots.sql`。该表保留紧凑回执，并将源仓库/run/attempt 绑定到唯一的已接受 snapshot。渐进式导入中断后，状态保持 `writing`，恢复时只能使用同一回执；成功后的重复导入保持结果稳定。替换测量字节需要独立版本的源执行。执行回滚不会撤销既有数据库写入。对保留的回执版本，必须继续提供兼容读取端。

缓存刷新后，工作流执行只读校验命令 `packages/db/src/verify-measurement-publication.ts <public-origin> <verification.json>`。它将 exact-run 和最新曲线中的指标与拓扑同已接受的 snapshot 比较，检查评估汇总和 strict 样本计数，并验证 trace 明细可用性。该命令使用 `INGEST_ARTIFACTS_PATH` 及传输步骤生成的回执环境变量。应将其报告与现有 PowerX、数据库诊断一起保留。单次运行通过不代表整个集群覆盖范围均已完成验收。

本地回归覆盖 Python/TypeScript 回执互操作、不安全归档、缺失或归属错误的准确 ID、不受信签发流程、重新计算 digest 后仍不合法的结果、完整样本与过滤器覆盖、实际 PGlite 中断恢复/重复导入保护，以及独立进程对受控 HTTP API 的发布校验。部署、H100 全部八个吞吐量点与 c28 评估、staging 和 merge 后的生产验证仍是明确的发布步骤。

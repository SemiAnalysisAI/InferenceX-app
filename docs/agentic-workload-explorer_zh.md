# Agentic Workload Explorer

[English](agentic-workload-explorer.md) | **中文**

Agentic Workload Explorer（`/agentic-workload-explorer`、`/zh/agentic-workload-explorer`）位于
**Hidden** 中，通过 ↑↑↓↓ 解锁。它移植自独立的
[ProxyTrace-ReadOnly](https://github.com/SemiAnalysisAI/ProxyTrace-ReadOnly) 仪表板，展示
ProxyTrace 采集的真实 coding agent 流量的冻结匿名快照，涵盖会话、token 流向、前缀缓存复用、延迟、
工具调用、错误与成本。AgentX 基准测试负载正是从这类流量中提炼的，而本页面展示的是原始观测流量。

## 数据来源

Explorer 通过 `DATABASE_PROXYTRACE_READONLY_URL` 读取独立的 Neon **只读副本**，不做任何写入：
没有数据摄取、定时任务、登录或管理接口。所有查询只返回匿名数据行（`privacy_mode = 'anon'`，见
`packages/app/src/lib/agentic-workload-explorer/api.ts` 中的 `ANON_ONLY_VISIBILITY`）。只展示
`packages/db/src/proxytrace/shared/pricing.ts` 中列出的模型，其余模型统一标为 `other`；`?model=`
传入未列出的名称时返回 400。

快照截止于 `AS_OF_ISO`（`packages/db/src/proxytrace/shared/as-of.ts`）。所有依赖当前时间的查询和标签
都以该时间点代替系统时钟：SQL 使用 `packages/db/src/proxytrace/as-of.ts` 中的 `NOW`、
`TODAY_UTC_DATE`、`TODAY_UTC_START`，UI 使用 `packages/app/src/lib/agentic-workload-explorer/snapshot.ts`。

除了从生产环境复制的表，副本还需要 `session_summary` 和 `daily_client_usage` 物化视图、
`session_hash_stats` 表，以及预先构建的 `stats_cache` / `tool_analytics_cache`。相关 DDL、脱敏脚本与
重建步骤见 ProxyTrace-ReadOnly 的 README。这里的缓存写入均为空操作：缓存未命中时现场计算，但不写回。
`tool_analytics_cache` 重建完成前，“工具”页面会显示预热状态。

重新加载快照时：先在副本的主库上重建派生表和缓存，再更新 `AS_OF_ISO` / `SNAPSHOT_START_ISO` 并重新部署。
成功响应带有一天的 CDN `s-maxage`，重新部署后 CDN 缓存从空开始。

## 代码结构

| 内容                        | 位置                                                                              |
| --------------------------- | --------------------------------------------------------------------------------- |
| 查询（Kysely）与类型        | `packages/db/src/proxytrace/`                                                     |
| 定价、分类器、快照时间      | `packages/db/src/proxytrace/shared/`（客户端代码也会引用）                        |
| API 路由（`page-bff`）      | `packages/app/src/app/api/v1/agentic-workload-explorer/`                          |
| 页面（英文 / 中文）         | `packages/app/src/app/(dashboard)/agentic-workload-explorer/`、`zh/(dashboard)/…` |
| 视图与图表                  | `packages/app/src/components/agentic-workload-explorer/`                          |
| Hooks、辅助函数、页面元数据 | `packages/app/src/{hooks,lib}/agentic-workload-explorer/`                         |

与 `packages/db` 其余部分不同，这里的查询沿用 Kysely，因为移植的查询层就是基于它编写的。`getDb()`
对 Neon 主机使用 Neon HTTP 驱动；`createDirectDb()` 为单次请求需执行多条语句的全量分析打开 `pg`
连接池，调用方负责 `destroy()`。

页面只是包装共享客户端视图的服务端组件，因此中英文渲染同一组件。界面文案来自组件内的
`STRINGS = { en, zh }` 字典，并通过 `useLocale()` 选择。Explorer 内部链接经由 `explorerHref()` /
`useExplorerHref()` 生成，保证 `/zh` 页面链接到 `/zh` 页面。只有 Explorer 根页面可被索引并收录进
sitemap；会话详情页为 `noindex`。Explorer 在 `DashboardShell` 内以独立 provider 渲染，并设置
`tabNav: false`（见 `DASHBOARD_SHELL_CAPABILITY_ROUTES`），因此不显示 InferenceX 仪表板标签栏：
Explorer 自身的分区导航（数字键 1–0 快捷切换）和全局 `?version=` trace 版本筛选直接位于站点页头下方。

## API 覆盖

`/api/v1/agentic-workload-explorer/*` 是页面专属接口（在 `api-route-catalog.ts` 中归类为 `page-bff`），
响应结构跟随页面设计，因此不在 OpenAPI 参考或 `inferencex-skills` 的只读视图 API 中发布。
`DASHBOARD_API_COVERAGE` 记录了这一排除项。

# InferenceX Dashboard / InferenceX 仪表板

<div align="center">

[English](./README.md) | **中文**

</div>

一个基于 [Next.js](https://nextjs.org) 的仪表板，用于可视化 ML 推理基准测试数据。数据存储于 Neon PostgreSQL，使用 React Query 获取数据，D3.js 绘制交互式图表。

**技术栈**：Next.js 16（App Router）· TypeScript · Tailwind CSS 4 · shadcn/ui · D3.js · Neon PostgreSQL · Vercel · Cypress

## 概览

LLM 推理性能是提供 AI 服务时的核心关注点，但准确的性能分析始终难以获得。软件开发与模型发布的快节奏使得不同配置之间的性能比较十分困难。现有的性能基准测试由于是静态的而迅速过时，参与者还会用不切实际、高度特化的配置来"刷榜"。InferenceX 通过每晚使用最新软件在主流硬件平台上对热门模型进行基准测试来解决这些问题。对于每个模型与硬件组合，InferenceX 会扫描不同的张量并行大小与最大并发请求数，以吞吐量-延迟曲线呈现完整图景。在软件配置方面，我们确保其在不同服务场景下具有普遍适用性，并开源整个仓库以欢迎社区贡献。我们希望 InferenceX 能为社区提供最新、真实的 LLM 推理性能信息。

## 架构

```
Neon PostgreSQL → API routes (/api/v1/*) → React Query hooks → Context providers → D3.js charts
```

前端从由 Neon PostgreSQL 只读副本支撑的 API 路由获取数据。所有展示逻辑都在前端 — API 路由只返回原始数据库数据。

### Monorepo 结构

```
packages/
├── app/          # Next.js 前端
├── constants/    # 共享常量（GPU key、模型映射）
└── db/           # 数据库层、ETL、迁移、查询、数据摄取脚本
```

## 前置条件

- **Node.js**：24.x
- **Bun**：1.3.14+

在 macOS 或 Linux 上安装 Bun：

```bash
curl -fsSL https://bun.sh/install | bash
```

在 Windows PowerShell 上安装 Bun：

```powershell
powershell -c "irm bun.sh/install.ps1|iex"
```

## 快速开始

如需搭建帮助，欢迎提交 GitHub issue。

### 1. 克隆与安装

```bash
git clone https://github.com/SemiAnalysisAI/InferenceX-app.git
cd InferenceX-app
bun install
```

### 2. 配置数据库

仪表板需要实时 PostgreSQL 数据库。在 `.env` 中设置 `DATABASE_READONLY_URL`；应用同时支持标准 PostgreSQL 服务器和 Neon。

#### 方式 A：标准 PostgreSQL

本地或远程托管的 PostgreSQL 服务器使用 `postgres` 驱动：

```bash
cp .env.example .env
cat >> .env <<'EOF'
DATABASE_READONLY_URL=postgresql://postgres:postgres@localhost:5432/postgres
DATABASE_DRIVER=postgres
DATABASE_SSL=false
EOF
```

远程 PostgreSQL 服务器默认使用 TLS。除非服务器明确要求禁用 TLS，否则请省略 `DATABASE_SSL`。

#### 方式 B：Neon

将 `DATABASE_READONLY_URL` 设为 Neon PostgreSQL 连接串。Neon 主机会自动使用无服务器 HTTP 驱动；也可以显式设置 `DATABASE_DRIVER=neon`。

```bash
cp .env.example .env
cat >> .env <<'EOF'
DATABASE_READONLY_URL=postgresql://user:password@ep-example.us-east-1.aws.neon.tech/database
DATABASE_DRIVER=neon
DATABASE_SSL=true
EOF
```

### 3. 启动开发服务器

```bash
bun run dev
```

用浏览器打开 [http://localhost:3000](http://localhost:3000)。

## 开发脚本

以下是开发过程中的常用脚本。数据库与缓存管理的运维脚本单独列在下方。
部分脚本可能需要额外的配置或环境变量。

| 脚本                           | 说明                              |
| ------------------------------ | --------------------------------- |
| `bun run dev`                  | 启动开发服务器（Turbopack）       |
| `bun run build`                | 生产构建                          |
| `bun run start`                | 启动生产服务器                    |
| `bun run preview`              | 本地构建并启动生产服务器          |
| `bun run typecheck`            | TypeScript 类型检查（所有包）     |
| `bun run lint`                 | 使用 oxlint 进行 lint             |
| `bun run lint:fix`             | 自动修复 lint 问题                |
| `bun run fmt`                  | 使用 oxfmt 检查格式               |
| `bun run fmt:fix`              | 自动修复格式                      |
| `bun run security`             | 安全审计                          |
| `bun run test`                 | 运行所有测试（单元 + E2E）        |
| `bun run test:unit`            | Vitest 单元测试                   |
| `bun run test:unit:coverage`   | Vitest 单元测试（含覆盖率）       |
| `bun run test:e2e`             | 精选的本地 Cypress smoke 测试套件 |
| `bun run test:e2e:full`        | 完整 Cypress 组件与集成测试套件   |
| `bun run test:e2e:component`   | 仅运行完整 Cypress 组件测试套件   |
| `bun run test:e2e:integration` | 仅运行完整 Cypress 集成测试套件   |
| `bun run clean`                | 清除构建产物                      |
| `bun run clean:all`            | 清除构建产物 + node_modules       |

本项目使用 Vitest 和 Cypress。请使用上表中的 `bun run test:*` 脚本；`bun test` 会调用 Bun 自带的另一套测试运行器，本项目不支持该命令。

### 运维脚本

以下脚本用于数据库与缓存的管理维护，常规开发中一般不需要。
不过在改动数据库或 API 路由后，将 `bun run admin:cache:invalidate` 指向本地开发服务器进行测试会很有用。

合并到 `main` 或 `master` 的 `packages/db/src/etl/run-overrides.ts` 变更会由 CI 自动应用到生产数据库，随后执行数据库校验、缓存失效和缓存预热。覆盖命令仍可用于本地预览和手动恢复。

| 脚本                                   | 说明                           |
| -------------------------------------- | ------------------------------ |
| `bun run admin:db:migrate`             | 运行数据库迁移                 |
| `bun run admin:db:ingest:run`          | 从 GitHub 运行摄取基准测试数据 |
| `bun run admin:db:ingest:ci`           | 摄取基准测试数据（CI 模式）    |
| `bun run admin:db:ingest:gcs`          | 从 GCS 摄取基准测试数据        |
| `bun run admin:db:ingest:supplemental` | 摄取补充数据                   |
| `bun run admin:db:apply-overrides`     | 手动预览或应用数据覆盖         |
| `bun run admin:db:reset`               | 重置数据库                     |
| `bun run admin:db:verify`              | 校验数据库完整性               |
| `bun run admin:cache:invalidate`       | 失效 API 缓存                  |
| `bun run admin:cache:warmup`           | 预热 API 缓存                  |

## 部署

部署于 Vercel。所有必需的环境变量见 [`.env.example`](.env.example)。

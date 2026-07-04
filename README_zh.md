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
- **pnpm**：10+

通过 Corepack（随 Node.js 附带）安装 pnpm：

```bash
corepack enable
corepack prepare pnpm@latest --activate
```

## 快速开始

如需搭建帮助，欢迎提交 GitHub issue。

### 1. 克隆与安装

```bash
git clone https://github.com/SemiAnalysisAI/InferenceX-app.git
cd InferenceX-app
pnpm install
```

### 2. 配置数据源

仪表板可以对接实时数据库，也可以使用静态 JSON dump。JSON dump 方式无需配置数据库，是最简单的上手方式。

#### 方式 A：JSON Dump（无需数据库，仅限本地开发）

从 [GitHub Releases](https://github.com/SemiAnalysisAI/InferenceX-app/releases) 下载最新的数据库 dump，解包后将 `DUMP_DIR` 指向该目录。dump 以 xz 压缩并拆分为一个或多个 `.tar.xz.part*` 文件；用 `cat` 管道接 `xz` 重新组装。此方式仅适用于 `pnpm dev`；生产构建需要实时数据库。

```bash
cp .env.example .env

# 下载并解包最新 dump（需要 xz；macOS 上执行 `brew install xz`）
gh release download db-dump/2026-03-30 -p 'inferencex-dump-*.tar.xz.part*'
cat inferencex-dump-2026-03-30.tar.xz.part* | xz -d -T0 | tar -x

# 写入 .env
echo 'DUMP_DIR=./inferencex-dump-2026-03-30' >> .env
```

确保 `.env` 中没有设置（或已注释掉）`DATABASE_READONLY_URL`。

#### 方式 B：实时数据库

在 `.env` 中将 `DATABASE_READONLY_URL` 设为 Neon PostgreSQL 连接串。详见 [`.env.example`](.env.example)。

### 3. 启动开发服务器

```bash
pnpm dev
```

用浏览器打开 [http://localhost:3000](http://localhost:3000)。

## 开发脚本

以下是开发过程中的常用脚本。数据库与缓存管理的运维脚本单独列在下方。
部分脚本可能需要额外的配置或环境变量。

| 脚本                        | 说明                              |
| --------------------------- | --------------------------------- |
| `pnpm dev`                  | 启动开发服务器（Turbopack）       |
| `pnpm build`                | 生产构建                          |
| `pnpm start`                | 启动生产服务器                    |
| `pnpm preview`              | 本地构建并启动生产服务器          |
| `pnpm typecheck`            | TypeScript 类型检查（所有包）     |
| `pnpm lint`                 | 使用 oxlint 进行 lint             |
| `pnpm lint:fix`             | 自动修复 lint 问题                |
| `pnpm fmt`                  | 使用 oxfmt 检查格式               |
| `pnpm fmt:fix`              | 自动修复格式                      |
| `pnpm security`             | 安全审计（pnpm audit + audit-ci） |
| `pnpm test`                 | 运行所有测试（单元 + E2E）        |
| `pnpm test:unit`            | Vitest 单元测试                   |
| `pnpm test:unit:coverage`   | Vitest 单元测试（含覆盖率）       |
| `pnpm test:e2e`             | Cypress E2E 测试                  |
| `pnpm test:e2e:component`   | 仅 Cypress 组件测试               |
| `pnpm test:e2e:integration` | 仅 Cypress 集成测试               |
| `pnpm clean`                | 清除构建产物                      |
| `pnpm clean:all`            | 清除构建产物 + node_modules       |

### 运维脚本

以下脚本用于数据库与缓存的管理维护，常规开发中一般不需要。
不过在改动数据库或 API 路由后，将 `pnpm admin:cache:invalidate` 指向本地开发服务器进行测试会很有用。

| 脚本                                | 说明                           |
| ----------------------------------- | ------------------------------ |
| `pnpm admin:db:migrate`             | 运行数据库迁移                 |
| `pnpm admin:db:ingest:run`          | 从 GitHub 运行摄取基准测试数据 |
| `pnpm admin:db:ingest:ci`           | 摄取基准测试数据（CI 模式）    |
| `pnpm admin:db:ingest:gcs`          | 从 GCS 摄取基准测试数据        |
| `pnpm admin:db:ingest:supplemental` | 摄取补充数据                   |
| `pnpm admin:db:apply-overrides`     | 应用数据覆盖                   |
| `pnpm admin:db:reset`               | 重置数据库                     |
| `pnpm admin:db:verify`              | 校验数据库完整性               |
| `pnpm admin:cache:invalidate`       | 失效 API 缓存                  |
| `pnpm admin:cache:warmup`           | 预热 API 缓存                  |

## 部署

部署于 Vercel。所有必需的环境变量见 [`.env.example`](.env.example)。

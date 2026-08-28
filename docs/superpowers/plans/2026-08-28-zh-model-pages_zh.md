[English](./2026-08-28-zh-model-pages.md) | [中文](./2026-08-28-zh-model-pages_zh.md)

# [11/N] 中文模型页面实施计划

> **执行方式：** 严格采用测试驱动开发。分支只修改模型页面自有代码；核心图表和模型架构图的中文化由 PR #836 负责，并在合并顺序中的组合版本上再次验证。

**目标：** 新增 `/zh/model` 与 `/zh/model/[slug]`，提供中文页面界面、摘要、metadata 和正确的语言内导航；未翻译的英文深度解析正文需明确标注。

**架构：** 中英文共用服务端渲染的模型索引与详情组件。canonical 模型事实及英文 MDX 继续由 `model-pages.ts` 管理；另建与 slug 精确对应的中文摘要目录；页面自有 UI 文案按 locale 读取。路由 wrapper 负责 metadata、canonical 和 hreflang。

**技术栈：** Next.js 16 App Router、TypeScript、React Server Components、MDX、Vitest、Cypress。

---

## 任务 1：先用失败测试锁定目录与文案约束

**文件：**

- 新建：`packages/app/src/lib/model-pages-zh.ts`
- 新建：`packages/app/src/lib/model-pages-zh.test.ts`
- 新建：`packages/app/src/components/model/model-page-copy.test.ts`
- 修改：`packages/app/src/lib/model-pages.ts`

1. 增加测试，要求中文摘要目录的键与 `getModelPageSlugs()` 双向完全一致。
2. 增加受保护字段测试，确保标题、开发者、发布日期、模型 display name、架构缩写、参数量和英文 MDX 始终读取 canonical 值。
3. 为所有现有页面自有英文字符串增加精确匹配测试，并为中文标签和句子 builder 增加本地化输出测试。
4. 先运行 focused Vitest，记录预期 RED，再编写生产实现。
5. 实现中文摘要目录与带类型的 locale 文案 helper。
6. 重跑 focused 测试并取得 GREEN。

## 任务 2：抽取 locale-aware 模型索引页

**文件：**

- 新建：`packages/app/src/components/model/ModelIndexContent.tsx`
- 修改：`packages/app/src/app/model/page.tsx`
- 新建：`packages/app/src/app/zh/model/page.tsx`
- 测试：`packages/app/src/components/model/model-page-copy.test.ts`

1. 先增加 RED 断言，覆盖对应语言的面包屑、标题、卡片摘要、发布日期、卡片 href 与 JSON-LD URL。
2. 将现有英文索引页 markup 移到 `ModelIndexContent({ locale })`，英文字符串与布局 class 不得变化。
3. `locale="zh"` 时使用中文摘要目录和中文页面词典。
4. 模型名、开发者名称、MoE/Dense、注意力标签和参数量保持不变。
5. 英文路由传入 `locale="en"`，中文 wrapper 使用中文 metadata。
6. 运行 focused 测试，并通过 `git diff` 检查英文渲染保持不变。

## 任务 3：抽取 locale-aware 模型详情页

**文件：**

- 新建：`packages/app/src/components/model/ModelDetailContent.tsx`
- 修改：`packages/app/src/app/model/[slug]/page.tsx`
- 新建：`packages/app/src/app/zh/model/[slug]/page.tsx`
- 测试：`packages/app/src/components/model/model-page-copy.test.ts`

1. 先增加 RED 断言，覆盖 locale-aware 别名、面包屑、发布日期、仪表板标题/说明/链接、正文提示和 `lang="en"`。
2. 将现有详情页 markup 移到共享 async server component，英文输出精确保持不变。
3. 两种语言都编译同一份 canonical MDX。中文页面在 `lang="en"` 的文章容器前显示已确认的中文提示及英文页面链接。
4. 中文仪表板链接指向 `/zh/inference`，现有查询参数必须保持完全一致。
5. 中文别名在 `/zh/model` 内跳转；未知 slug 使用对应语言的 404。
6. 本分支不修改架构图和嵌入式仪表板内部文案；PR #836 合并后，它们根据 pathname 取得 locale，并在组合版本上跑浏览器验证。
7. 运行 focused 测试并核对英文输出约束。

## 任务 4：补齐双向 metadata 与页面发现

**文件：**

- 修改：`packages/app/src/app/model/page.tsx`
- 修改：`packages/app/src/app/model/[slug]/page.tsx`
- 修改：`packages/app/src/app/zh/model/page.tsx`
- 修改：`packages/app/src/app/zh/model/[slug]/page.tsx`
- 修改：`packages/app/src/lib/i18n.ts`
- 修改：`packages/app/src/lib/i18n.test.ts`
- 修改：`packages/app/src/app/sitemap.ts`
- 测试：在 `packages/app/src/app/` 下新增或扩展 focused model metadata 测试

1. 先增加 RED 测试，覆盖 `/model` mirrored-route 匹配、语言切换、索引/详情 canonical、完整语言 alternates、中文 OG locale、JSON-LD 语言/URL 和双语 sitemap。
2. 英文 metadata 改用 `enAlternates(...)`，但英文 title/description 不得变化。
3. 中文页面使用 `zhAlternates(...)`、`ZH_OG_LOCALE` 和中文 metadata/JSON-LD 文案。
4. 在 `ZH_MIRRORED_ROUTES` 注册 `/model`。
5. sitemap 中英文专属的模型条目改为索引页和全部已发布 slug 的 `localizedPair(...)`。
6. 复用英文 OG artwork，不在未经 CJK 字体验证的 renderer 中引入中文。
7. 运行 focused metadata、i18n、sitemap 与目录测试。

## 任务 5：覆盖真实浏览器链路与响应式布局

**文件：**

- 修改：`packages/app/cypress/e2e/model-architecture.cy.ts`
- 仅在完整实测确有需要时修改：`packages/app/timings.json`

1. 只有现有 selector 无法表达测试约束时才新增稳定、非文案型 test ID。
2. 在现有 model spec 中增加中英文“索引页点击进入详情页”链路。
3. 断言中文界面、卡片摘要、语言内 href、正文提示、`lang="en"`、仪表板链接、canonical/hreflang、架构图容器和嵌入式仪表板容器。
4. 明确覆盖 1440x900、375px 和 390px，并要求 document 没有横向溢出。
5. 使用 fixture 数据，在 Chrome 和 Firefox 中运行受影响 spec。
6. 如果 spec 调整实质影响 shard 平衡，按文档执行完整 `SPLIT=1` integration run；只能提交实测生成的 timing。

## 任务 6：审核中文文案并保护英文

**文件：** 所有改动的用户可见文案与测试。

1. 对每条新增中文文案执行仓库 `review-zh-copy` 流程，同时提供英文原文和完整 UI 上下文。
2. 逐条检查 12 个中文摘要的事实范围、名称、日期、模型标识符，以及中文在 ML 基础设施语境中的自然度。
3. 脱离英文原文阅读中文索引页，以及有代表性的 Dense/MoE 详情页。
4. 确认提示不会让用户误以为长文已经翻译。
5. 将 `packages/app/content/models/` 与分支基线逐字节比较。
6. 除 hreflang plumbing 外，现有英文页面字符串、链接、查询参数和 metadata 文案必须保持不变。

## 任务 7：完整验证、复审与 Draft PR

1. 先运行 focused Vitest，再运行 `bun run test:unit`、`bun run typecheck`、`bun run lint`、`bun run fmt`、typography 检查和 `git diff --check`。
2. 运行 `E2E_FIXTURES=1` production build；环境阻塞需与源码失败分开记录。
3. 在 Chrome 和 Firefox 中运行受影响 Cypress integration tests，并运行相关 component specs。
4. 请求独立的 source/spec 与中文文案复审；针对确认的问题补充新的 RED/GREEN 证据后修复。
5. 前序 roadmap 依赖（尤其 #836）合并后，将分支 rebase 到最新 `master` 并重跑受影响验证。
6. commit 使用英文 conventional subject，并在 body 中附中文说明。
7. 推送 `feat/zh-model-pages`，创建 Draft PR：`[11/N] fix(zh): localize model page chrome and metadata / 本地化模型页面界面与元数据`。
8. PR body 必须双语，链接 issue #823，说明依赖 #836，并明确模型长文仍为英文且暂缓翻译。
9. 在 issue #823 的中英文 roadmap 中以未勾选项加入裸 PR URL，不得提前标记完成。

[English](./2026-08-28-zh-model-pages-design.md) | [中文](./2026-08-28-zh-model-pages-design_zh.md)

# [11/N] 中文模型页面设计

## 状态

本设计已于 2026-08-28 在对话中确认。该工作补齐模型索引页和详情页的中文界面，但暂不翻译模型深度解析正文。

## 问题

InferenceX 目前只有英文 `/model` 和 `/model/[slug]`。这两个可索引路由尚无 `/zh` 对应页面，语言切换器无法保留当前路径，模型页面的界面文案和 metadata 也未纳入 issue #823 跟踪的中文 rollout。

模型目录目前包含 12 篇英文 MDX 深度解析。文章翻译属于独立的编辑工作，本项明确不处理正文翻译。

## 目标

- 为每个已发布模型 slug 增加 `/zh/model` 和 `/zh/model/[slug]`。
- 翻译索引页与详情页的全部界面文案、metadata、面包屑、提示、链接、无障碍标签、本次路由涉及的空白/加载/错误状态，以及所有模型卡片摘要。
- 模型名、开发者名称、硬件/模型标识符、架构缩写、参数量、单位和基准测试数据保持不变。
- 现有英文路由和英文 MDX 源文件逐字节保持不变。
- 补齐双向语言切换、别名跳转、canonical、hreflang、Open Graph locale、JSON-LD 与 sitemap。
- 通过真实的“索引页点击进入详情页”链路验证桌面端和窄屏移动端。

## 非目标

- 翻译 `packages/app/content/models/` 下的 12 篇长文。
- 改写技术结论或修改模型架构数据。
- 修改基准测试查询、图表计算或仪表板默认值。
- 宣称模型长文的中文编辑工作已经完成。

## 用户体验

### 模型索引页

`/zh/model` 沿用英文索引页布局。页面标题、说明、面包屑、发布日期标签、卡片摘要和相关无障碍文案均使用自然中文。模型标题、开发者名称、MoE/Dense、注意力机制和参数量保留业界通用写法。每张卡片链接到 `/zh/model/[slug]`。

### 模型详情页

`/zh/model/[slug]` 会中文化面包屑、摘要、发布日期标签、架构区域界面、实时性能标题与说明、仪表板链接和 metadata。架构图与嵌入式仪表板通过已有的 locale 接口或最小范围的新增接口接收 `locale="zh"`，同时精确保留英文默认值。

未翻译的 MDX 正文继续显示，以保证中文路由仍然有实际用途。正文前增加中文提示，明确说明深度解析暂时只提供英文，并提供英文 canonical 页面的直接链接。文章容器使用 `lang="en"`；页面其他界面仍处于中文文档语言环境。英文 MDX 继续从现有源文件编译，不做翻译、转换或复制。

别名跳转必须留在当前语言树内：`/zh/model/<alias>` 跳转到 `/zh/model/<canonical-slug>`。

## 数据与组件设计

1. 新增以 slug 为键的中文模型 metadata 目录，保存翻译后的 `description`，供索引卡片、详情摘要、metadata 与 JSON-LD 共用。标题、开发者和发布日期等受保护事实继续读取英文 canonical frontmatter。
2. 增加完整性测试：`getModelPageSlugs()` 返回的每个 slug 都必须且只能有一条中文摘要。
3. 抽取或参数化模型索引页与详情页的共享渲染逻辑。英文继续使用当前完全一致的字符串，避免维护两套容易漂移的布局。
4. 对会渲染可见界面的客户端模型组件显式传递 `locale`。仅在兼容现有调用确有必要时保留英文默认值。
5. 英文 MDX loader 仍是长文的唯一来源。中文页面只能在明确标记为英文的区域内渲染该正文。

## 路由与 metadata

- 在 `ZH_MIRRORED_ROUTES` 中注册 `/model`。
- 将英文索引页和详情页的 English-only canonical 改为 `enAlternates(...)`。
- 中文页面使用 `zhAlternates(...)`，并设置 `openGraph.locale = zh_CN`。
- 中文 metadata 标题、说明和 JSON-LD 展示字段需本地化，同时保留模型事实和 URL。
- 在适用位置增加 `inLanguage`，面包屑 URL 必须指向正确语言路径。
- sitemap 中的 `/model` 和每个已发布模型 slug 改用 `localizedPair(...)`。
- 如果现有 OG renderer 无法安全渲染 CJK，则复用英文模型 OG 图片；metadata 不得声明一个实际无法显示中文字体的本地化图片。

## 英文保持不变的约束

- 现有 `/model` 和 `/model/[slug]` 的可见英文必须逐字节保持不变。
- 除新增双向 hreflang 外，英文 metadata 文案、别名、链接和仪表板查询参数必须保持不变。
- 英文 MDX 文件必须逐字节保持不变。
- 测试直接比较英文词典和输出约束，不能只依赖人工目测。

## 测试

### 单元测试与 metadata 测试

- 中文摘要目录与所有已发布模型 slug 精确对应。
- 中英文索引页/详情页的 canonical、hreflang、Open Graph locale 和模型事实正确。
- 英文文案保持精确一致，中文页面不泄漏页面界面英文。
- locale-aware 链接与别名 helper 能正确保留 `/zh`。
- 中文页面显示正文语言提示，编译后的正文标记为 `lang="en"`。
- sitemap 与 mirrored-route registry 覆盖模型索引页和所有详情页。

### 浏览器测试

- 优先扩展现有 model 页面 spec；只有在明显提高稳定性时才新增 timing shard。
- 覆盖中英文“索引页点击进入详情页”链路。
- 验证语言切换链接、canonical/hreflang metadata、中文仪表板链接、英文正文提示，以及架构图和仪表板渲染。
- 覆盖 1440px 桌面端、375px 与 390px 移动端，并确认页面没有 document 级横向溢出。
- 在 Chrome 和 Firefox 中运行受影响的 integration spec；共享客户端界面有改动时补跑 component tests。
- 如果测试分布发生实质变化，只能根据一次真实完整的 `SPLIT=1` 运行结果更新 `packages/app/timings.json`。

## 编辑审校

所有新增中文文案均需通过仓库 `review-zh-copy` 的忠实度与自然度审校。每条模型摘要都要对照英文 frontmatter，并放回实际页面语境阅读；模型名、事实、日期、缩写、链接和单位保持不变。自动 CI 只验证客观约束，不能用来证明中文自然流畅。

## 交付方式

- 分支：`feat/zh-model-pages`
- Draft PR 标题：`[11/N] fix(zh): localize model page chrome and metadata / 本地化模型页面界面与元数据`
- Roadmap：在 issue #823 中链接 Draft PR；只有完成人工审阅和运行时检查后才能勾选完成。
- PR 描述必须明确说明模型长文翻译仍处于暂缓状态。

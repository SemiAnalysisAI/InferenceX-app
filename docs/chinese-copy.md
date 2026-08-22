# Chinese Copy Editorial Guide / 中文文案编辑规范

This guide is the editorial source of truth for user-visible Simplified Chinese in
InferenceX. It complements the route architecture in [i18n.md](./i18n.md): that document
explains where Chinese pages live; this one defines how their copy is written and reviewed.

本文是 InferenceX 简体中文用户文案的编辑规范。它与 [i18n.md](./i18n.md) 分工：
后者说明中文页面的技术架构，本文规定中文文案的写法与审核方式。

## Audience and baseline tone / 读者与基本语气

Write for Chinese-speaking ML infrastructure engineers who already understand models,
hardware, serving frameworks, and performance metrics. The copy should be precise,
restrained, and easy to read without consulting the English source.

目标读者是熟悉模型、硬件、推理框架和性能指标的中文 ML 基础设施工程师。文案应当
准确、克制；即使不对照英文，也能独立读懂。

- Lead with the user action, result, or claim. Do not reproduce English modifier chains.
- Prefer ordinary technical Chinese over slogans, literal metaphors, and stacked nouns.
- Preserve facts, qualifications, modality, numbers, units, product names, and attribution.
- Do not add confidence, causality, or endorsement that is absent from the English source.
- Keep English only when Chinese practitioners normally keep it: product and model names,
  hardware SKUs, framework names, flags, identifiers, and units.

- 先说用户动作、结果或核心判断，不照搬英文的前置修饰链。
- 使用工程师日常采用的技术中文，避免口号、直译隐喻和名词堆叠。
- 保留事实、限定条件、语气强弱、数字、单位、产品名和署名。
- 英文原文没有表达的确定性、因果关系或背书，不得自行添加。
- 只有中文技术社区通常保留英文时才不翻译，例如产品与模型名称、硬件 SKU、框架名、
  flag、标识符和单位。

## Register by surface / 不同界面的语域

| Surface                               | Editorial register                                                                                                                  | 中文要求                                                                 |
| ------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| Buttons, navigation, and short labels | Brief and action-led. Omit subjects that the UI already makes obvious.                                                              | 简短、以动作或对象为中心；界面已经明确的主语不重复。                     |
| Tooltips and dashboard explanations   | Explain what the metric or control means and what changes when it is used. Prefer one to three direct sentences.                    | 说明指标或控件的含义，以及操作后会发生什么；通常用一至三句直述。         |
| Empty, loading, and error states      | State the current condition, then the next useful action when one exists. Do not blame the user.                                    | 先说明当前状态，再给出可执行的下一步；不要把问题归咎于用户。             |
| Metadata                              | Standalone, factual, and search-readable. Do not stuff keywords or repeat the title mechanically.                                   | 脱离页面正文也能读懂；以事实为主，不堆关键词，也不机械重复标题。         |
| Technical prose                       | Preserve definitions and causal structure, but reorganize clauses for Chinese readability. Define an uncommon acronym on first use. | 保留定义和因果关系，但按中文逻辑重组分句；不常见缩写首次出现时补充说明。 |
| Landing and marketing copy            | Evidence-led and restrained. Concrete capabilities and provenance are stronger than superlatives.                                   | 以事实和证据为主，克制表达；具体能力和数据来源比夸张形容词更可信。       |
| Attributed quotations                 | Preserve the speaker's claim, degree of certainty, and voice. Do not polish a quotation into house marketing copy.                  | 保留说话者的观点、语气强弱和个人表达，不得改写成官方营销文案。           |

Second-person wording is contextual, not a mechanical ban. Controls and tooltips normally omit
the pronoun. A deliberate `您` is acceptable in a direct, respectful call to action when the
surrounding surface uses that register. Do not replace every `您` with `你`, and do not reject an
otherwise natural sentence solely because it contains `您`.

第二人称必须结合场景判断，不能全局禁用。控件和提示框通常省略第二人称；直接面向读者、
且有意采用礼貌语气的 CTA 可以使用 `您`。不要把所有 `您` 机械替换为 `你`，也不要仅因
一句话包含 `您` 就判定文案不合格。

## Rewrite method / 改写方法

For each changed UI element or paragraph:

1. Read the complete English source and the surrounding rendered UI or paragraph.
2. Write one plain-language sentence stating the intended meaning. Record facts, scope,
   modality, metrics, links, and attribution that cannot change.
3. Hide the old Chinese translation and rewrite from the intended meaning.
4. Compare the rewrite with the source for semantic fidelity.
5. Read the Chinese alone for naturalness, register, and information order.
6. Verify the desktop and mobile rendering when width, hierarchy, or interaction affects copy.

逐个 UI 元素或段落执行：

1. 阅读完整英文原文，并查看对应的页面或段落上下文。
2. 用一句直白的中文写出原意，并记录不得改变的事实、范围、语气强弱、指标、链接和署名。
3. 隐藏旧译文，根据原意重新写，不在旧句上逐词替换。
4. 回到英文原文，检查语义是否完整、准确。
5. 脱离英文单独阅读中文，检查自然度、语域和信息顺序。
6. 如果宽度、层级或交互会影响文案，在桌面端和移动端实际页面中检查。

Semantic fidelity and natural Chinese are independent gates. A fluent mistranslation fails the
first gate; an accurate but translation-shaped sentence fails the second. Both must pass.

语义准确和中文自然度是两道独立门槛。中文流畅但翻错原意，第一关不通过；语义准确但仍是
英文句式，第二关不通过。两关都通过才算完成。

## Context-aware terminology / 上下文相关的术语表

The table records defaults, not blind substitutions. When an exception is needed, document the
surface and reason in the PR or add a reviewed example here.

下表记录默认写法，不是全局替换表。需要例外时，应在 PR 中说明使用场景与理由，或将经过
审核的案例补充到本文。

| English                | Preferred Chinese   | Context and exceptions                                                                                                                                                                                                            |
| ---------------------- | ------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| benchmark              | 基准测试            | Use for the process or result set. A short UI label may use “测试” only when the surrounding heading already establishes that it is a benchmark. / 表示测试过程或结果集；只有上下文已经明确是基准测试时，短标签才可简写为“测试”。 |
| dashboard              | 仪表板              | Use for the interactive data surface. Do not use “完整仪表板” merely to mirror “full”; write “查看完整仪表板” when it is an action. / 表示交互式数据页面；按钮需要表达动作时写“查看完整仪表板”。                                  |
| chart                  | 图表                | Use “图” only when naming a specific conventional form such as a scatter plot. / 特指散点图等固定图形时可用“图”。                                                                                                                 |
| configuration / config | 配置                | “测试配置” is preferred when the surrounding text could otherwise refer to deployment configuration. / 容易与部署配置混淆时写“测试配置”。                                                                                         |
| inference              | 推理                | Keep inside established product names and identifiers. / 产品名和标识符中的英文保持不变。                                                                                                                                         |
| throughput             | 吞吐量              | Preserve the token type, denominator, and scope. / 必须保留 token 类型、分母和统计范围。                                                                                                                                          |
| latency                | 延迟                | Preserve percentile and stage qualifiers such as TTFT or TPOT. / 必须保留分位数以及 TTFT、TPOT 等阶段限定。                                                                                                                       |
| evaluation / eval      | 评估                | Keep `eval` in code identifiers, flags, and filenames. / 代码标识符、flag 和文件名中的 `eval` 不翻译。                                                                                                                            |
| artifact               | 产物                | Use for CI or benchmark outputs. “文件” is acceptable only when the object is literally a user-facing file. / 表示 CI 或基准测试输出；确实指用户下载的文件时可写“文件”。                                                          |
| chip                   | 芯片                | Keep English inside units and identifiers such as `tok/s/chip`, `$/chip-hour`, and `ChipSKU`. / `tok/s/chip`、`$/chip-hour`、`ChipSKU` 等单位和标识符保持英文。                                                                   |
| framework              | 框架                | Keep names such as vLLM, SGLang, and TensorRT-LLM unchanged. / vLLM、SGLang、TensorRT-LLM 等名称不翻译。                                                                                                                          |
| agent / agentic        | 智能体 / 智能体相关 | Keep `AgentX` as a product name. Translate according to the role, not by replacing every occurrence mechanically. / `AgentX` 作为产品名保持不变；其他场景根据实际角色翻译，不做全局替换。                                         |
| workload               | 工作负载            | Avoid using “场景” when the source refers to the actual request distribution or task mix. / 原文指请求分布或任务组合时，不要弱化成“场景”。                                                                                        |
| disaggregated serving  | 分离式推理          | Use “分离式部署” when the sentence is about architecture or deployment rather than the serving process. / 强调架构或部署方式时可写“分离式部署”。                                                                                  |
| speculative decoding   | 投机解码            | Do not rewrite the ordinary verb “推测”. / 不影响作为普通动词使用的“推测”。                                                                                                                                                       |
| recipe                 | 测试配置 / 配置方案 | Choose from context; do not leave `recipe` in user-facing prose merely because it appears in code. / 根据上下文选择，不因代码中使用 `recipe` 就在用户文案中保留英文。                                                             |
| methodology            | 测试方法 / 方法说明 | Use “方法论” only when the content actually discusses a methodology as a field or system of principles. / 只有内容确实讨论一套方法论或原则体系时才使用“方法论”。                                                                  |
| industry testimonials  | 业界评价            | Use for navigation and section labels. Preserve the speaker's own wording inside each attributed quotation. / 用于导航和栏目名称；每条署名引用仍需保留说话者自己的表达。                                                          |
| Land Acknowledgement   | 原住民传统领地声明  | Use for the dedicated legal-cultural page and its link. Preserve community, nation, and place names exactly. / 用于对应的法律与文化说明页面及其链接；原住民族群、社群和地名必须准确保留。                                         |

## Review workflow / 审核流程

1. The author supplies the English source, intended meaning, and rendered context for every
   changed Chinese passage.
2. Claude loads `review-zh-copy`, evaluates semantic fidelity and natural Chinese separately,
   and reports complete suggested replacements rather than isolated word swaps.
3. The skill's findings never block another contributor's merge. Claude must not label a
   Chinese-copy finding `BLOCKING` or submit a request-changes review for it. If an issue is serious
   enough that it would normally warrant blocking, Claude labels it
   `Needs Chinese maintainer confirmation`, mentions `@edwingao28`, and asks for review.
4. The Chinese-speaking maintainer manually reads every changed sentence and makes the final
   editorial decision. Attributed quotations receive an explicit attribution-and-voice check.

中文步骤：

1. 作者为每段改动的中文提供英文原文、核心意思和实际页面上下文。
2. Claude 加载 `review-zh-copy`，分别检查语义准确度和中文自然度，并给出完整改写，
   而不是只替换孤立词语。
3. skill 的 finding 不阻断其他贡献者合并。Claude 不得把中文文案 finding 标为
   `BLOCKING`，也不得因此提交 request-changes review。如果某项问题严重到通常需要阻断，
   则标为 `Needs Chinese maintainer confirmation`，并 `@edwingao28` 请中文维护者审核。
4. 中文维护者逐句人工审阅并作出最终编辑决定；署名引用还要单独核对署名、观点和说话者
   语气。

## Pull request checklist / PR 审核清单

- [ ] Every changed Chinese passage has an identified English source and intended meaning.
      中文：每段改动的中文都有对应英文来源和明确原意。
- [ ] Facts, numbers, units, identifiers, links, modality, and attribution are unchanged.
      中文：事实、数字、单位、标识符、链接、语气强弱和署名均未改变。
- [ ] The Chinese reads naturally without preserving English word order or noun stacking.
      中文：中文脱离英文后仍自然通顺，没有照搬英文语序或名词堆叠。
- [ ] The register matches the surface.
      中文：文案语域与所在界面一致。
- [ ] English UI strings remain byte-identical in a Chinese-only rewrite.
      中文：仅修改中文时，英文界面字符串保持逐字节不变。
- [ ] The complete UI element or paragraph was reviewed, not only the changed word.
      中文：审核对象是完整 UI 元素或段落，而不是孤立的替换词。
- [ ] Visible copy was checked in rendered desktop and mobile context.
      中文：用户可见文案已在桌面端和移动端实际页面中检查。
- [ ] The Chinese-speaking maintainer manually reviewed every changed sentence.
      中文：中文维护者已逐句人工审核所有改动。

## Relationship to automation / 与自动化检查的关系

Deterministic CI may enforce only context-independent rules such as punctuation, protected
identifiers, dictionary completeness, and terminology with a genuinely universal rendering.
It must not decide fluency, sentence structure, register, or contextual pronoun choice.

确定性 CI 只适合检查与上下文无关的规则，例如标点、受保护标识符、字典完整性，以及确实
只有一种正确写法的术语。流畅度、句法、语域和第二人称选择不得交给机械规则判定。

The `review-zh-copy` skill assists the judgment layer and stays non-blocking. Serious findings
mention `@edwingao28` for review instead of holding another contributor's merge, and the Chinese
maintainer makes the final wording decision. Separately verified mechanical cases from #819 may
enter deterministic CI fixtures in #820, but editorial rewrites are never automatic ground truth.

`review-zh-copy` skill 用于辅助判断性审核，并保持非阻断模式。严重 finding 应
`@edwingao28` 请中文维护者审核，而不是阻止其他贡献者合并；最终文案决定由中文维护者
作出。#819 中经过单独验证的机械案例可以进入 #820 的确定性 CI fixtures，但编辑性改写
不得自动视为标准答案。

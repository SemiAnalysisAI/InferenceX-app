import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { CopyableCodeBlock } from '@/components/ui/copyable-code-block';
import { JsonLd } from '@/components/json-ld';
import { getApiDocumentation, type ApiDocumentationLocale } from '@/lib/api-documentation';
import { ZH_LANG_TAG } from '@/lib/i18n';
import { AUTHOR_NAME, AUTHOR_URL, SITE_NAME, SITE_URL } from '@semianalysisai/inferencex-constants';

const UI_COPY = {
  en: {
    facts: {
      version: 'Specification',
      auth: 'Authentication',
      format: 'Response format',
      baseUrl: 'Base URL',
    },
    openApiKicker: 'Machine-readable contract',
    openApiTitle: 'OpenAPI 3.1 JSON',
    openApiDescription: 'Inspect the canonical schema or pass it directly to your tooling.',
    openApiAction: 'Open OpenAPI JSON',
    quickstart: 'Quickstart',
    quickstartDescription: 'Move from contract discovery to a real response in a few steps.',
    agentSkill: 'Use the API with your agent',
    agentSkillDescription:
      'The inferencex-api skill helps your agent navigate the public API: benchmarks, provenance, datasets, CollectiveX, and diagnostics. Validated single-turn PowerX export is the first worked example.',
    agentCandidate: 'Unpublished candidate · 0.1.0',
    agentPrerequisites:
      'Requires Node 24 with npm and Codex or Claude Code. Use the local .tgz archive supplied by a maintainer; this candidate is not available as a public npm install.',
    agentInstall: 'Install in your project',
    agentInstallDescription:
      'Run the command for your agent from your project directory. Replace the archive path with the supplied file, then start an agent session in that project.',
    agentPromptTitle: 'First example: measured PowerX',
    agentPrompt: `Use inferencex-api to export latest available measured PowerX data for DeepSeek-V4-Pro:
- Select single-turn requests with exactly 8192 input and 1024 output tokens; require strictV2.
- Create powerx.csv and powerx.json with the installed exporter, outside the InferenceX repository.
- Keep measured per-GPU watts and whole-deployment GPU energy distinct from provisioned-power estimates.
- Preserve raw model keys, source IDs/URLs, measurement dates, and separate snapshot metadata.
- Record the request URL, retrieval time, package version, local filters, and returned/selected counts.
- Explain why rows were excluded and list missing requested metrics.
- Keep missing metrics unavailable and genuine zeros unchanged. Explain empty results without inferring that all benchmarks are absent.`,
    agentCookbook: 'PowerX cookbook and direct export',
    agentCookbookDescription:
      'Open the cookbook at the installed path below for validity, units, missing-data handling, and provenance. The bundled Node 24 exporter also runs directly from your project, without an InferenceX checkout or database credentials.',
    agentExport: 'Run the installed exporter (Codex)',
    agentExportDescription:
      'For Claude Code, use the .claude/skills/inferencex-api path. For JSON, use --format json --output powerx.json. Omit --date for latest available observations, or add --date YYYY-MM-DD for an as-of cutoff. Keep the report log: it records request and coverage metadata even for an empty CSV.',
    agentMeasurements:
      'avg_power_w is measured mean watts per GPU. Schema-v2 joules metrics without a role prefix describe whole-deployment GPU energy; prefill/decode-prefixed energy is role-local. These are existing observations, not new benchmark runs or facility-energy measurements.',
    conventions: 'Conventions',
    conventionsDescription: 'Shared request, error, and cache behavior for the supported surface.',
    schemas: 'BenchmarkRow and metrics',
    schemasDescription: 'Interpret the primary benchmark payload and its measured fields.',
    endpoints: 'Endpoint reference',
    endpointsDescription: 'Expand an operation for parameters, statuses, and complete examples.',
    operation: 'operation',
    operations: 'operations',
    parameters: 'Parameters',
    noParameters: 'No parameters.',
    name: 'Name',
    location: 'Location',
    type: 'Type',
    requirement: 'Requirement',
    description: 'Description',
    example: 'Example',
    required: 'Required',
    optional: 'Optional',
    request: 'Request',
    responses: 'Responses',
    responseShape: 'Response shape',
    responseExample: 'Response example',
    mediaType: 'Media type',
    schemaShape: 'Shape',
    schemaExample: 'Example',
    stable: 'Stable',
    beta: 'Beta',
    alternateRepresentation: 'Alternate representation',
    schemaKicker: 'Schema',
    referenceKicker: 'Reference',
  },
  zh: {
    facts: {
      version: '规范版本',
      auth: '身份验证',
      format: '响应格式',
      baseUrl: '基础 URL',
    },
    openApiKicker: '机器可读契约',
    openApiTitle: 'OpenAPI 3.1 JSON',
    openApiDescription: '查看标准 schema，或直接将其传入工具链。',
    openApiAction: '打开 OpenAPI JSON',
    quickstart: '快速入门',
    quickstartDescription: '只需几步，即可从查看契约到获得真实响应。',
    agentSkill: '通过智能体使用 API',
    agentSkillDescription:
      'inferencex-api 技能帮助智能体查找和使用公开 API，涵盖基准测试、溯源、数据集、CollectiveX 和诊断接口。已验证的单轮请求 PowerX 导出是首个完整示例。',
    agentCandidate: '尚未发布的候选版本 · 0.1.0',
    agentPrerequisites:
      '需要 Node 24、npm，以及 Codex 或 Claude Code。请使用维护者提供的本地 .tgz 产物；当前候选版本尚不能通过公开 npm 仓库安装。',
    agentInstall: '安装到项目',
    agentInstallDescription:
      '在项目目录中执行对应智能体的命令，将产物路径替换为实际文件路径，然后在该项目中启动智能体会话。',
    agentPromptTitle: '首个示例：实测 PowerX 数据',
    agentPrompt: `使用 inferencex-api 导出 DeepSeek-V4-Pro 最新可用的实测 PowerX 数据：
- 仅选取输入恰好为 8192、输出恰好为 1024 个 token 的单轮请求，并要求 strictV2。
- 在 InferenceX 仓库之外，通过已安装的导出器生成 powerx.csv 和 powerx.json。
- 区分实测单 GPU 功率、整个部署的 GPU 能耗与预留功率估算。
- 保留原始模型键、来源标识和 URL、测量日期，以及独立的快照元数据。
- 记录请求 URL、提取时间、包版本、本地筛选条件，以及返回和选中的数据条数。
- 说明数据行被排除的原因，并列出所请求指标的缺失项。
- 缺失指标保持不可用，真实零值保持为零。说明空结果的含义，不据此推断所有基准测试数据都不存在。`,
    agentCookbook: 'PowerX 指南与直接导出',
    agentCookbookDescription:
      '打开下方安装路径中的指南，查看验证规则、单位、缺失数据处理和溯源说明。随包提供的 Node 24 导出器也可在项目中直接运行，无需检出 InferenceX 仓库或提供数据库凭据。',
    agentExport: '运行已安装的导出器（Codex）',
    agentExportDescription:
      'Claude Code 使用 .claude/skills/inferencex-api 路径。导出 JSON 时改用 --format json --output powerx.json。省略 --date 表示查询最新可用观测值，也可添加 --date YYYY-MM-DD 指定截止日期。请保留报告日志：即使 CSV 为空，其中也会记录请求和数据覆盖范围的元数据。',
    agentMeasurements:
      'avg_power_w 是实测单 GPU 平均功率，单位为 W。schema v2 中不带角色前缀的 joules 指标表示整个部署的 GPU 能耗；带 prefill/decode 前缀的能耗仅对应相应角色。这些数据是已有观测值，不是新运行的基准测试，也不是设施总能耗测量值。',
    conventions: '约定',
    conventionsDescription: '适用于受支持接口的通用请求、错误与缓存行为。',
    schemas: 'BenchmarkRow 与指标',
    schemasDescription: '理解主要基准测试响应数据及其中的实测字段。',
    endpoints: '端点参考',
    endpointsDescription: '展开任一操作，即可查看参数、状态码和完整示例。',
    operation: '项操作',
    operations: '项操作',
    parameters: '参数',
    noParameters: '无需参数。',
    name: '名称',
    location: '位置',
    type: '类型',
    requirement: '要求',
    description: '说明',
    example: '示例',
    required: '必填',
    optional: '可选',
    request: '请求',
    responses: '响应',
    responseShape: '响应结构',
    responseExample: '响应示例',
    mediaType: '媒体类型',
    schemaShape: '结构',
    schemaExample: '示例',
    stable: '稳定',
    beta: '测试版',
    alternateRepresentation: '其他表示格式',
    schemaKicker: '数据结构',
    referenceKicker: '参考',
  },
} as const;

function formatCode(value: unknown): string {
  if (typeof value === 'string') return value;
  return JSON.stringify(value, null, 2) ?? '';
}

export function ApiReferencePage({ locale }: { locale: ApiDocumentationLocale }) {
  const documentation = getApiDocumentation(locale);
  const copy = UI_COPY[locale];
  const pageUrl = `${SITE_URL}${locale === 'zh' ? '/zh' : ''}/api`;
  const operationCount = documentation.groups.reduce(
    (count, group) => count + group.operations.length,
    0,
  );
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'TechArticle',
    headline: documentation.title,
    description: documentation.description,
    url: pageUrl,
    mainEntityOfPage: pageUrl,
    inLanguage: locale === 'zh' ? ZH_LANG_TAG : 'en-US',
    version: `${documentation.version} / ${documentation.specVersion}`,
    isAccessibleForFree: true,
    author: {
      '@type': 'Organization',
      name: AUTHOR_NAME,
      url: AUTHOR_URL,
    },
    publisher: {
      '@type': 'Organization',
      name: SITE_NAME,
      url: SITE_URL,
    },
  };

  return (
    <main data-testid="api-reference" className="relative">
      <JsonLd data={jsonLd} />
      <div className="container mx-auto flex flex-col gap-4 px-4 pb-8 lg:px-8">
        <Card className="overflow-hidden p-0 md:p-0">
          <header className="grid lg:grid-cols-3">
            <div className="p-5 sm:p-6 lg:col-span-2 lg:p-8">
              <p className="font-mono text-xs font-semibold tracking-widest text-brand uppercase">
                {documentation.eyebrow}
              </p>
              <h1 className="mt-3 text-3xl font-bold tracking-tight text-balance sm:text-4xl">
                {documentation.title}
              </h1>
              <p className="mt-3 max-w-3xl text-sm leading-6 text-muted-foreground sm:text-base sm:leading-7">
                {documentation.description}
              </p>
            </div>

            <div className="border-t border-border/50 bg-accent/40 p-5 sm:p-6 lg:border-t-0 lg:border-l lg:p-8">
              <p className="font-mono text-xs font-semibold tracking-widest text-brand uppercase">
                {copy.openApiKicker}
              </p>
              <h2 className="mt-3 text-xl font-semibold">{copy.openApiTitle}</h2>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">
                {copy.openApiDescription}
              </p>
              <a
                data-testid="api-openapi-link"
                href={documentation.openApiUrl}
                className="mt-5 inline-flex min-h-10 items-center rounded-md border border-brand/50 px-4 py-2 text-sm font-semibold text-brand transition-colors hover:bg-brand/10 focus-visible:outline-none"
              >
                {copy.openApiAction}
                <span aria-hidden="true" className="ml-2">
                  →
                </span>
              </a>
            </div>
          </header>

          <dl className="grid border-t border-border/50 sm:grid-cols-2 lg:grid-cols-4">
            <div className="border-b border-border/50 p-4 sm:border-r lg:border-b-0">
              <dt className="text-xs font-medium text-muted-foreground">{copy.facts.version}</dt>
              <dd data-testid="api-spec-version" className="mt-1 font-mono text-sm font-semibold">
                {documentation.version} · {documentation.specVersion}
              </dd>
            </div>
            <div className="border-b border-border/50 p-4 lg:border-r lg:border-b-0">
              <dt className="text-xs font-medium text-muted-foreground">{copy.facts.auth}</dt>
              <dd className="mt-1">
                <span className="block text-sm font-semibold">{documentation.auth.title}</span>
                <span className="mt-0.5 block text-xs leading-5 text-muted-foreground">
                  {documentation.auth.description}
                </span>
              </dd>
            </div>
            <div className="border-b border-border/50 p-4 sm:border-r sm:border-b-0">
              <dt className="text-xs font-medium text-muted-foreground">{copy.facts.format}</dt>
              <dd className="mt-1">
                <span className="block font-mono text-sm font-semibold">
                  {documentation.format.title}
                </span>
                <span className="mt-0.5 block text-xs leading-5 text-muted-foreground">
                  {documentation.format.description}
                </span>
              </dd>
            </div>
            <div className="p-4">
              <dt className="text-xs font-medium text-muted-foreground">{copy.facts.baseUrl}</dt>
              <dd className="mt-1 break-all font-mono text-sm font-semibold">
                {documentation.baseUrl}
              </dd>
            </div>
          </dl>
        </Card>

        <Card className="p-0 md:p-0">
          <section aria-labelledby="api-quickstart-heading" className="p-5 sm:p-6 lg:p-8">
            <div className="max-w-3xl">
              <p className="font-mono text-xs font-semibold tracking-widest text-brand uppercase">
                01 / {copy.quickstart}
              </p>
              <h2
                id="api-quickstart-heading"
                className="mt-2 text-2xl font-semibold tracking-tight"
              >
                {copy.quickstart}
              </h2>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">
                {copy.quickstartDescription}
              </p>
            </div>

            <ol className="mt-6 divide-y divide-border/50 border-y border-border/50">
              {documentation.quickstarts.map((step, index) => (
                <li key={step.id} className="grid gap-4 py-5 lg:grid-cols-3 lg:gap-8">
                  <div className="flex gap-3">
                    <span className="font-mono text-xs font-semibold text-brand">
                      {String(index + 1).padStart(2, '0')}
                    </span>
                    <div>
                      <h3 className="font-semibold">{step.label}</h3>
                      <p className="mt-1 text-sm leading-6 text-muted-foreground">
                        {step.description}
                      </p>
                    </div>
                  </div>
                  <div className="min-w-0 lg:col-span-2">
                    <CopyableCodeBlock locale={locale} label={step.label}>
                      {step.command}
                    </CopyableCodeBlock>
                  </div>
                </li>
              ))}
            </ol>
          </section>
        </Card>

        <Card className="p-0 md:p-0">
          <section
            data-testid="api-agent-skill"
            aria-labelledby="api-agent-skill-heading"
            className="min-w-0 p-5 sm:p-6 lg:p-8"
          >
            <div className="max-w-3xl">
              <Badge variant="outline">{copy.agentCandidate}</Badge>
              <h2
                id="api-agent-skill-heading"
                className="mt-3 text-2xl font-semibold tracking-tight"
              >
                {copy.agentSkill}
              </h2>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">
                {copy.agentSkillDescription}
              </p>
              <p className="mt-3 break-all font-mono text-xs">@semianalysisai/inferencex-skills</p>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">
                {copy.agentPrerequisites}
              </p>
            </div>

            <h3 className="mt-6 font-semibold">{copy.agentInstall}</h3>
            <p className="mt-1 text-sm leading-6 text-muted-foreground">
              {copy.agentInstallDescription}
            </p>
            <div className="mt-3 grid min-w-0 gap-4 lg:grid-cols-2">
              {(['codex', 'claude'] as const).map((target) => (
                <div key={target} data-testid={`api-agent-install-${target}`} className="min-w-0">
                  <CopyableCodeBlock
                    locale={locale}
                    label={target === 'codex' ? 'Codex' : 'Claude Code'}
                  >
                    {`INFERENCEX_SKILLS_TGZ='/absolute/path/semianalysisai-inferencex-skills-0.1.0.tgz'\nnpm exec --yes --offline --package "$INFERENCEX_SKILLS_TGZ" -- inferencex-skills install --target ${target}`}
                  </CopyableCodeBlock>
                </div>
              ))}
            </div>

            <div data-testid="api-agent-prompt" className="mt-6 min-w-0">
              <CopyableCodeBlock locale={locale} label={copy.agentPromptTitle}>
                {copy.agentPrompt}
              </CopyableCodeBlock>
            </div>

            <details id="api-powerx-cookbook" className="mt-6 border-t border-border/50 pt-4">
              <summary className="cursor-pointer font-semibold">{copy.agentCookbook}</summary>
              <p className="mt-3 text-sm leading-6 text-muted-foreground">
                {copy.agentCookbookDescription}
              </p>
              <dl className="mt-3 space-y-2 text-sm">
                <div>
                  <dt className="font-medium">Codex</dt>
                  <dd className="break-all font-mono text-xs">
                    .agents/skills/inferencex-api/references/powerx.md
                  </dd>
                </div>
                <div>
                  <dt className="font-medium">Claude Code</dt>
                  <dd className="break-all font-mono text-xs">
                    .claude/skills/inferencex-api/references/powerx.md
                  </dd>
                </div>
              </dl>
              <div className="mt-4 min-w-0">
                <CopyableCodeBlock locale={locale} label={copy.agentExport}>
                  {`node .agents/skills/inferencex-api/scripts/export-powerx.mjs \\\n  --model DeepSeek-V4-Pro --isl 8192 --osl 1024 \\\n  --format csv --output powerx.csv 2> powerx-report.log`}
                </CopyableCodeBlock>
              </div>
              <p className="mt-3 text-sm leading-6 text-muted-foreground">
                {copy.agentExportDescription}
              </p>
              <p className="mt-3 text-sm leading-6 text-muted-foreground">
                {copy.agentMeasurements}
              </p>
            </details>
          </section>
        </Card>

        <Card className="p-0 md:p-0">
          <section aria-labelledby="api-conventions-heading" className="p-5 sm:p-6 lg:p-8">
            <div className="max-w-3xl">
              <p className="font-mono text-xs font-semibold tracking-widest text-brand uppercase">
                02 / {copy.conventions}
              </p>
              <h2
                id="api-conventions-heading"
                className="mt-2 text-2xl font-semibold tracking-tight"
              >
                {copy.conventions}
              </h2>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">
                {copy.conventionsDescription}
              </p>
            </div>

            <dl className="mt-6 grid border-y border-border/50 md:grid-cols-2">
              {documentation.conventions.map((convention) => (
                <div
                  key={convention.id}
                  className="min-w-0 border-b border-border/50 p-4 last:border-b-0 md:border-r md:even:border-r-0"
                >
                  <dt className="font-semibold">{convention.title}</dt>
                  <dd className="mt-1 text-sm leading-6 text-muted-foreground">
                    {convention.description}
                  </dd>
                </div>
              ))}
            </dl>
          </section>
        </Card>

        <Card className="p-0 md:p-0">
          <section aria-labelledby="api-schemas-heading" className="p-5 sm:p-6 lg:p-8">
            <div className="max-w-3xl">
              <p className="font-mono text-xs font-semibold tracking-widest text-brand uppercase">
                03 / {copy.schemaKicker}
              </p>
              <h2 id="api-schemas-heading" className="mt-2 text-2xl font-semibold tracking-tight">
                {copy.schemas}
              </h2>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">
                {copy.schemasDescription}
              </p>
            </div>

            <dl className="mt-6 grid border-y border-border/50 md:grid-cols-2">
              {documentation.schemaNotes.map((schema) => (
                <div
                  key={schema.id}
                  className="min-w-0 border-b border-border/50 p-4 last:border-b-0 md:border-r md:even:border-r-0"
                >
                  <dt className="font-mono text-sm font-semibold">{schema.title}</dt>
                  <dd className="mt-2">
                    <p className="text-sm leading-6 text-muted-foreground">{schema.description}</p>
                    <p className="mt-4 mb-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                      {copy.schemaShape}
                    </p>
                    <CopyableCodeBlock locale={locale}>
                      {formatCode(schema.shape)}
                    </CopyableCodeBlock>
                    {schema.example !== undefined && (
                      <>
                        <p className="mt-4 mb-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                          {copy.schemaExample}
                        </p>
                        <CopyableCodeBlock locale={locale}>
                          {formatCode(schema.example)}
                        </CopyableCodeBlock>
                      </>
                    )}
                  </dd>
                </div>
              ))}
            </dl>
          </section>
        </Card>

        <Card className="p-0 md:p-0">
          <section aria-labelledby="api-endpoints-heading" className="p-5 sm:p-6 lg:p-8">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
              <div className="max-w-3xl">
                <p className="font-mono text-xs font-semibold tracking-widest text-brand uppercase">
                  04 / {copy.referenceKicker}
                </p>
                <h2
                  id="api-endpoints-heading"
                  className="mt-2 text-2xl font-semibold tracking-tight"
                >
                  {copy.endpoints}
                </h2>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">
                  {copy.endpointsDescription}
                </p>
              </div>
              <p className="shrink-0 font-mono text-xs text-muted-foreground">
                {operationCount} {operationCount === 1 ? copy.operation : copy.operations}
              </p>
            </div>

            <div className="mt-8 space-y-8">
              {documentation.groups.map((group) => (
                <section key={group.id} aria-labelledby={`api-group-${group.id}`}>
                  <div className="mb-3 border-l-2 border-brand pl-3">
                    <h3 id={`api-group-${group.id}`} className="text-lg font-semibold">
                      {group.title}
                    </h3>
                    <p className="mt-1 text-sm leading-6 text-muted-foreground">
                      {group.description}
                    </p>
                  </div>

                  <div className="divide-y divide-border/50 border-y border-border/50">
                    {group.operations.map((operation) => (
                      <details
                        key={operation.id}
                        data-testid={`api-endpoint-${operation.id}`}
                        className="group"
                      >
                        <summary className="flex cursor-pointer list-none flex-wrap items-start gap-3 rounded-md hover:bg-muted/50 px-2 py-4 focus-visible:outline-none [&::-webkit-details-marker]:hidden">
                          <Badge
                            variant="outline"
                            className="mt-0.5 border-brand/50 font-mono text-brand"
                          >
                            {operation.method}
                          </Badge>
                          <Badge variant="outline" className="mt-0.5">
                            {operation.stability === 'stable' ? copy.stable : copy.beta}
                          </Badge>
                          <span className="min-w-0 flex-1">
                            <code className="break-all text-sm font-semibold text-foreground">
                              {operation.path}
                            </code>
                            <span className="mt-1 block text-sm leading-6 text-muted-foreground">
                              {operation.summary}
                            </span>
                          </span>
                          <span
                            aria-hidden="true"
                            className="mt-0.5 text-xl leading-none text-muted-foreground transition-transform duration-200 group-open:rotate-45 motion-reduce:transition-none"
                          >
                            +
                          </span>
                        </summary>

                        <div className="px-2 pt-1 pb-6 sm:pl-20">
                          <p className="max-w-3xl text-sm leading-6 text-muted-foreground">
                            {operation.description}
                          </p>

                          <section className="mt-6" aria-labelledby={`${operation.id}-parameters`}>
                            <h4 id={`${operation.id}-parameters`} className="text-sm font-semibold">
                              {copy.parameters}
                            </h4>
                            {operation.parameters.length === 0 ? (
                              <p className="mt-2 text-sm text-muted-foreground">
                                {copy.noParameters}
                              </p>
                            ) : (
                              <div
                                tabIndex={0}
                                role="region"
                                aria-labelledby={`${operation.id}-parameters`}
                                className="mt-2 overflow-x-auto rounded-lg border border-border/50 focus-visible:outline-none"
                              >
                                <table className="w-full min-w-3xl border-collapse text-left text-sm">
                                  <caption className="sr-only">
                                    {operation.method} {operation.path}: {copy.parameters}
                                  </caption>
                                  <thead className="bg-accent/50 text-xs text-muted-foreground">
                                    <tr>
                                      <th scope="col" className="px-3 py-2 font-medium">
                                        {copy.name}
                                      </th>
                                      <th scope="col" className="px-3 py-2 font-medium">
                                        {copy.location}
                                      </th>
                                      <th scope="col" className="px-3 py-2 font-medium">
                                        {copy.type}
                                      </th>
                                      <th scope="col" className="px-3 py-2 font-medium">
                                        {copy.requirement}
                                      </th>
                                      <th scope="col" className="px-3 py-2 font-medium">
                                        {copy.description}
                                      </th>
                                      <th scope="col" className="px-3 py-2 font-medium">
                                        {copy.example}
                                      </th>
                                    </tr>
                                  </thead>
                                  <tbody className="divide-y divide-border/50">
                                    {operation.parameters.map((parameter) => (
                                      <tr key={`${parameter.location}-${parameter.name}`}>
                                        <th
                                          scope="row"
                                          className="px-3 py-3 font-mono font-semibold"
                                        >
                                          {parameter.name}
                                        </th>
                                        <td className="px-3 py-3 font-mono text-xs">
                                          {parameter.location}
                                        </td>
                                        <td className="px-3 py-3 font-mono text-xs">
                                          {parameter.type}
                                        </td>
                                        <td className="px-3 py-3 text-xs">
                                          {parameter.required ? copy.required : copy.optional}
                                        </td>
                                        <td className="max-w-sm px-3 py-3 leading-5 text-muted-foreground">
                                          {parameter.description}
                                        </td>
                                        <td className="px-3 py-3 font-mono text-xs">
                                          {parameter.example === undefined
                                            ? null
                                            : formatCode(parameter.example)}
                                        </td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                            )}
                          </section>

                          <section className="mt-6" aria-labelledby={`${operation.id}-request`}>
                            <h4
                              id={`${operation.id}-request`}
                              className="mb-2 text-sm font-semibold"
                            >
                              {copy.request}
                            </h4>
                            <CopyableCodeBlock
                              locale={locale}
                            >{`curl -sS '${operation.curlUrl}'`}</CopyableCodeBlock>
                          </section>

                          <section className="mt-6" aria-labelledby={`${operation.id}-responses`}>
                            <div className="flex flex-wrap items-baseline justify-between gap-2">
                              <h4
                                id={`${operation.id}-responses`}
                                className="text-sm font-semibold"
                              >
                                {copy.responses}
                              </h4>
                              <code className="text-xs text-muted-foreground">
                                {operation.responseShapeName}
                              </code>
                            </div>
                            <div className="mt-2 divide-y divide-border/50 border-y border-border/50">
                              {operation.responses.map((response) => (
                                <div key={response.status} className="py-4">
                                  <div className="flex flex-wrap items-start gap-3">
                                    <Badge variant="outline" className="font-mono">
                                      {response.status}
                                    </Badge>
                                    <p className="min-w-0 flex-1 text-sm leading-6 text-muted-foreground">
                                      {response.description}
                                    </p>
                                    {response.mediaType && (
                                      <span className="font-mono text-xs text-muted-foreground">
                                        {copy.mediaType}: {response.mediaType}
                                      </span>
                                    )}
                                  </div>
                                  <div className="mt-4 grid gap-4 lg:grid-cols-2">
                                    <div className="min-w-0">
                                      <p className="mb-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                                        {copy.responseShape}
                                      </p>
                                      <CopyableCodeBlock locale={locale}>
                                        {formatCode(response.schema)}
                                      </CopyableCodeBlock>
                                    </div>
                                    {response.example !== undefined && (
                                      <div className="min-w-0">
                                        <p className="mb-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                                          {copy.responseExample}
                                        </p>
                                        <CopyableCodeBlock locale={locale}>
                                          {formatCode(response.example)}
                                        </CopyableCodeBlock>
                                      </div>
                                    )}
                                  </div>
                                  {response.alternateRepresentations?.map((alternate) => (
                                    <div
                                      key={alternate.mediaType}
                                      className="mt-4 border-t border-border/50 pt-4"
                                    >
                                      <p className="font-mono text-xs font-semibold text-muted-foreground">
                                        {copy.alternateRepresentation}: {alternate.mediaType}
                                      </p>
                                      <div className="mt-3 grid gap-4 lg:grid-cols-2">
                                        <div className="min-w-0">
                                          <p className="mb-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                                            {copy.responseShape}
                                          </p>
                                          <CopyableCodeBlock locale={locale}>
                                            {formatCode(alternate.schema)}
                                          </CopyableCodeBlock>
                                        </div>
                                        <div className="min-w-0">
                                          <p className="mb-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                                            {copy.responseExample}
                                          </p>
                                          <CopyableCodeBlock locale={locale}>
                                            {formatCode(alternate.example)}
                                          </CopyableCodeBlock>
                                        </div>
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              ))}
                            </div>
                          </section>
                        </div>
                      </details>
                    ))}
                  </div>
                </section>
              ))}
            </div>
          </section>
        </Card>
      </div>
    </main>
  );
}

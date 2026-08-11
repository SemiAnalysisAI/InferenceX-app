import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
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
    openApiDescription: '查看标准数据结构，或将其直接传入开发工具。',
    openApiAction: '打开 OpenAPI JSON',
    quickstart: '快速入门',
    quickstartDescription: '只需几步，即可从查看契约到获得真实响应。',
    conventions: '约定',
    conventionsDescription: '适用于受支持接口的通用请求、错误与缓存行为。',
    schemas: 'BenchmarkRow 与指标',
    schemasDescription: '理解主要基准测试响应数据及其中的实测字段。',
    endpoints: '端点参考',
    endpointsDescription: '展开操作，查看参数、状态码与完整示例。',
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

function CodeBlock({ children }: { children: string }) {
  return (
    <pre className="overflow-x-auto rounded-lg border border-border/50 bg-foreground p-4 text-xs leading-6 text-background">
      <code>{children}</code>
    </pre>
  );
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
        <Card className="overflow-hidden p-0">
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
                className="mt-5 inline-flex min-h-10 items-center rounded-md border border-brand/50 px-4 py-2 text-sm font-semibold text-brand transition-colors hover:bg-brand/10 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background focus-visible:outline-none"
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

        <Card className="p-0">
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
                    <CodeBlock>{step.command}</CodeBlock>
                  </div>
                </li>
              ))}
            </ol>
          </section>
        </Card>

        <Card className="p-0">
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
                  className="border-b border-border/50 p-4 last:border-b-0 md:border-r md:even:border-r-0"
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

        <Card className="p-0">
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
                  className="border-b border-border/50 p-4 last:border-b-0 md:border-r md:even:border-r-0"
                >
                  <dt className="font-mono text-sm font-semibold">{schema.title}</dt>
                  <dd className="mt-2">
                    <p className="text-sm leading-6 text-muted-foreground">{schema.description}</p>
                    <p className="mt-4 mb-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                      {copy.schemaShape}
                    </p>
                    <CodeBlock>{formatCode(schema.shape)}</CodeBlock>
                    {schema.example !== undefined && (
                      <>
                        <p className="mt-4 mb-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                          {copy.schemaExample}
                        </p>
                        <CodeBlock>{formatCode(schema.example)}</CodeBlock>
                      </>
                    )}
                  </dd>
                </div>
              ))}
            </dl>
          </section>
        </Card>

        <Card className="p-0">
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
                        <summary className="flex cursor-pointer list-none items-start gap-3 rounded-md px-2 py-4 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background focus-visible:outline-none [&::-webkit-details-marker]:hidden">
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
                              <div className="mt-2 overflow-x-auto rounded-lg border border-border/50">
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
                            <CodeBlock>{`curl -sS '${operation.curlUrl}'`}</CodeBlock>
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
                                      <CodeBlock>{formatCode(response.schema)}</CodeBlock>
                                    </div>
                                    {response.example !== undefined && (
                                      <div className="min-w-0">
                                        <p className="mb-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                                          {copy.responseExample}
                                        </p>
                                        <CodeBlock>{formatCode(response.example)}</CodeBlock>
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
                                          <CodeBlock>{formatCode(alternate.schema)}</CodeBlock>
                                        </div>
                                        <div className="min-w-0">
                                          <p className="mb-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                                            {copy.responseExample}
                                          </p>
                                          <CodeBlock>{formatCode(alternate.example)}</CodeBlock>
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

'use client';

import { track } from '@/lib/analytics';
import type { ApiDocumentationLocale } from '@/lib/api-documentation';

export function ApiAgentExamplesLink({
  label,
  locale,
}: {
  label: string;
  locale: ApiDocumentationLocale;
}) {
  return (
    <a
      data-testid="api-agent-examples"
      href="https://github.com/SemiAnalysisAI/InferenceX-app/blob/master/docs/inferencex-api-examples.md"
      className="mt-3 inline-block text-sm underline underline-offset-4"
      onClick={() => track('api_agent_examples_opened', { locale })}
    >
      {label}
    </a>
  );
}

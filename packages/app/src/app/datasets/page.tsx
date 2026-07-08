import type { Metadata } from 'next';

import { Card } from '@/components/ui/card';
import { JsonLd } from '@/components/json-ld';
import { DatasetList } from '@/components/datasets/dataset-list';
import { enAlternates } from '@/lib/i18n';
import { SITE_URL } from '@semianalysisai/inferencex-constants';

const DESCRIPTION =
  'The real Claude Code agentic conversation traces that the InferenceX agentic benchmark replays — methodology, distributions, and per-conversation flamegraphs.';

export const metadata: Metadata = {
  title: 'Agentic Datasets',
  description: DESCRIPTION,
  alternates: enAlternates('/datasets'),
  openGraph: {
    title: 'Agentic Datasets | InferenceX',
    description: DESCRIPTION,
    url: `${SITE_URL}/datasets`,
  },
  twitter: { title: 'Agentic Datasets | InferenceX', description: DESCRIPTION },
};

const jsonLd = {
  '@context': 'https://schema.org',
  '@type': 'CollectionPage',
  name: 'InferenceX Agentic Datasets',
  description: DESCRIPTION,
  url: `${SITE_URL}/datasets`,
};

export default function DatasetsPage() {
  return (
    <main className="relative">
      <JsonLd data={jsonLd} />
      <div className="container mx-auto flex flex-col gap-6 px-4 pb-8 lg:px-8">
        <section>
          <Card>
            <h1 className="mb-2 text-xl font-semibold text-foreground">
              Agentic Benchmark Datasets
            </h1>
            <p className="mb-3 text-sm text-muted-foreground">
              InferenceX&apos;s agentic benchmark doesn&apos;t replay synthetic prompts — it replays
              real Claude Code coding sessions captured as <strong>conversation traces</strong>.
              Each trace is a full multi-turn session: the main agent&apos;s turns plus any
              subagents it spawned, with per-turn input/output token counts and the 64-token
              KV-cache block hashes needed to reconstruct prefix-cache reuse. The traces are
              published openly on HuggingFace under <code>semianalysisai/cc-traces-weka-*</code>{' '}
              (apache-2.0).
            </p>

            <h2 className="mb-1.5 mt-4 text-sm font-semibold text-foreground">
              How traces are captured
            </h2>
            <p className="mb-3 text-sm text-muted-foreground">
              Production Claude Code sessions are recorded through a logging proxy that captures
              every API request: its input and output token counts, the model used, timing (TTFT,
              inter-token latency), and a list of <code>hash_ids</code> — one per 64-token KV block
              of the request&apos;s input. Subagent invocations are grouped under their parent turn.
              No prompt or completion text is stored; only token counts and block hashes, so the
              corpus is shareable while remaining a faithful workload for replay.
            </p>

            <h2 className="mb-1.5 mt-4 text-sm font-semibold text-foreground">
              Cached prefix vs uncached suffix
            </h2>
            <p className="mb-3 text-sm text-muted-foreground">
              Agentic workloads are dominated by prefix reuse: each turn resends the growing
              conversation, so most of its input is already in the KV cache from prior turns. We
              reconstruct this exactly. Walking a conversation in order under an idealized infinite
              cache, a turn&apos;s <strong>cached prefix</strong> is its longest run of leading{' '}
              <code>hash_ids</code> already seen; the rest is the <strong>uncached suffix</strong>{' '}
              that must be (re)computed. Blocks are 64 tokens; the split is clamped so cached +
              uncached equals the turn&apos;s effective input even on a partial final block.
              Subagents run against a snapshot of the parent cache at spawn (their context is
              separate and is not folded back into the parent).
            </p>

            <h2 className="mb-1.5 mt-4 text-sm font-semibold text-foreground">Dataset variants</h2>
            <ul className="mb-1 list-disc space-y-1 pl-5 text-sm text-muted-foreground">
              <li>
                <strong>full</strong> — every captured request, unmodified.
              </li>
              <li>
                <strong>256k</strong> — requests whose input + output exceeds 256,000 tokens are
                dropped so every turn fits a 256k context window (used when benchmarking engines
                configured for a 256k max context).
              </li>
            </ul>
          </Card>
        </section>

        <section className="flex flex-col gap-3">
          <h2 className="text-lg font-semibold text-foreground">Datasets</h2>
          <DatasetList />
        </section>
      </div>
    </main>
  );
}

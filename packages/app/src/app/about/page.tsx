import type { Metadata } from 'next';
import Link from 'next/link';

import { FAQ_ITEMS } from '@/components/about/faq-data';
import { AgentXFaq } from '@/components/about/agentx-faq';
import { buildFaqJsonLd, FaqList } from '@/components/about/faq';
import { PromoVideo } from '@/components/about/promo-video';
import { JsonLd } from '@/components/seo/json-ld';
import { buttonVariants } from '@/components/ui/button';
import { Eyebrow } from '@/components/ui/eyebrow';
import { Heading } from '@/components/ui/heading';
import {
  ARTICLE_H2_CLASS,
  READING_LINK_CLASS,
  READING_PAGE_CLASS,
  READING_SECTION_CLASS,
  READING_TOP_CLASS,
} from '@/components/ui/reading-layout';
import { enAlternates } from '@/lib/i18n/i18n';
import { cn } from '@/lib/shared/utils';
import { socialMetadata } from '@/lib/seo/social-metadata';
import { GITHUB_OWNER, GITHUB_REPO, SITE_URL } from '@semianalysisai/inferencex-constants';

const faqJsonLd = buildFaqJsonLd(FAQ_ITEMS);

const ABOUT_DESCRIPTION =
  'InferenceX benchmarks agentic and fixed-sequence inference across accelerators and serving stacks. AgentX is its long-context, multi-turn coding scenario.';

export const metadata: Metadata = {
  title: 'About',
  description: ABOUT_DESCRIPTION,
  alternates: enAlternates('/about'),
  ...socialMetadata({
    title: 'About | InferenceX',
    description: ABOUT_DESCRIPTION,
    url: `${SITE_URL}/about`,
    locale: 'en',
  }),
};

export default function AboutPage() {
  return (
    <main className="relative">
      <JsonLd data={faqJsonLd} />
      <div className={cn(READING_PAGE_CLASS, READING_TOP_CLASS, 'flex flex-col gap-12')}>
        <section>
          <Eyebrow as="p">About InferenceX</Eyebrow>
          <Heading as="h1" level="reading" className="mt-3 max-w-4xl">
            Open-source continuous agentic inference benchmark trusted by operators of
            trillion-dollar, gigawatt-scale token factories
          </Heading>
          <div className="mt-4 flex max-w-measure flex-col gap-4 leading-reading text-foreground">
            <p>
              Software development and model releases move fast. Static benchmarks quickly become
              obsolete, and participants often submit software images purpose-built for the
              benchmark itself which do not reflect real world performance.
            </p>
            <p>
              <strong className="font-medium text-foreground">InferenceX&trade;</strong> (formerly
              InferenceMAX) is our independent, vendor neutral, reproducible benchmark. It measures
              both fixed-sequence serving and AgentX, our long-context, multi-turn agentic coding
              workload, across AI accelerators and serving stacks available to the ML community.
            </p>
            <p>
              Our open data and insights are widely adopted by the ML community, capacity planning
              strategy teams at trillion dollar token factories and AI labs, and at multiple billion
              dollar NeoClouds. Learn more in our articles:{' '}
              <Link
                href="/blog/inferencemax-open-source-inference-benchmarking"
                className={cn(READING_LINK_CLASS, 'whitespace-nowrap')}
              >
                InferenceX v1
              </Link>
              ,{' '}
              <Link
                href="/blog/inferencex-v2-nvidia-blackwell-vs-amd-vs-hopper"
                className={cn(READING_LINK_CLASS, 'whitespace-nowrap')}
              >
                InferenceX v2
              </Link>
              .
            </p>
          </div>
        </section>

        <PromoVideo />

        <AgentXFaq locale="en" />

        <section id="reproducibility" className={READING_SECTION_CLASS}>
          <h2 className={ARTICLE_H2_CLASS}>Reproducibility</h2>
          <p className="mt-3 max-w-measure leading-reading text-foreground">
            Every data point on the dashboard is the output of a public GitHub Actions workflow run.
            The recipe, logs, artifacts, and the resulting database row are all linked end to end,
            so anyone can audit, rerun, or fork a benchmark.
          </p>
          <ol className="mt-6 flex max-w-measure flex-col gap-4 leading-reading text-foreground">
            <li className="flex gap-4">
              <span className="w-4 shrink-0 font-medium text-foreground tabular-nums">1</span>
              <div>
                <strong className="font-medium text-foreground">Recipe in repo.</strong> Every
                combination of hardware, framework, model, and precision is a shell script committed
                to the public repo. The exact image, command line, and parallelism are pinned in
                source.
              </div>
            </li>
            <li className="flex gap-4">
              <span className="w-4 shrink-0 font-medium text-foreground tabular-nums">2</span>
              <div>
                <strong className="font-medium text-foreground">Run on real hardware.</strong>{' '}
                GitHub Actions schedules the workflow on the actual target accelerator (NVIDIA, AMD,
                etc.) and streams the full job log publicly while it runs.
              </div>
            </li>
            <li className="flex gap-4">
              <span className="w-4 shrink-0 font-medium text-foreground tabular-nums">3</span>
              <div>
                <strong className="font-medium text-foreground">Artifacts uploaded.</strong> Request
                latencies, token counts, chip power telemetry, and evaluation samples are attached
                to the run page. GitHub Actions retains them for 90 days.
              </div>
            </li>
            <li className="flex gap-4">
              <span className="w-4 shrink-0 font-medium text-foreground tabular-nums">4</span>
              <div>
                <strong className="font-medium text-foreground">
                  Ingested into the dashboard.
                </strong>{' '}
                Successful runs are loaded into the database and surfaced here. Every chart tooltip
                carries a direct link back to the GitHub Actions run that produced the point. Click
                any point to audit the source.
              </div>
            </li>
          </ol>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link
              href={`https://github.com/${GITHUB_OWNER}/${GITHUB_REPO}/actions?query=branch%3Amain+event%3Apush`}
              target="_blank"
              rel="noopener noreferrer"
              className={buttonVariants({ variant: 'outline' })}
            >
              Browse workflow runs
            </Link>
            <Link
              href={`https://github.com/${GITHUB_OWNER}/${GITHUB_REPO}/tree/main/benchmarks`}
              target="_blank"
              rel="noopener noreferrer"
              className={buttonVariants({ variant: 'outline' })}
            >
              View benchmark recipes
            </Link>
            <Link
              href={`https://github.com/${GITHUB_OWNER}/${GITHUB_REPO}`}
              target="_blank"
              rel="noopener noreferrer"
              className={buttonVariants({ variant: 'outline' })}
            >
              Source repository
            </Link>
          </div>
        </section>

        <FaqList title="Frequently asked questions" items={FAQ_ITEMS} />
      </div>
    </main>
  );
}

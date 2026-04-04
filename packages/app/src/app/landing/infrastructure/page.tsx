import type { Metadata } from 'next';

import { Card } from '@/components/ui/card';
import { SITE_URL } from '@semianalysisai/inferencex-constants';

const CLUSTERS = [
  {
    location: 'Santa Clara, CA',
    codename: 'SCL-01',
    specs: 'NVIDIA GB200 NVL72, H100 SXM, H200 SXM',
    description:
      'Our flagship West Coast cluster houses the latest NVIDIA Blackwell and Hopper GPUs with NVLink interconnect. Primary site for multi-GPU disaggregated serving benchmarks.',
  },
  {
    location: 'Dallas, TX',
    codename: 'DFW-02',
    specs: 'AMD MI300X, MI325X, MI355X',
    description:
      'Dedicated AMD Instinct cluster for cross-vendor comparisons. Full ROCm stack with latest driver releases. Houses our growing AMD benchmark suite.',
  },
  {
    location: 'Chicago, IL',
    codename: 'ORD-03',
    specs: 'NVIDIA H100 PCIe, A100 SXM, L40S',
    description:
      'Mid-tier GPU cluster focused on cost-efficiency benchmarks. Tests the GPUs most commonly deployed in production inference workloads today.',
  },
  {
    location: 'Ashburn, VA',
    codename: 'IAD-04',
    specs: 'Mixed — edge and inference accelerators',
    description:
      'East Coast facility for latency-sensitive edge inference testing. Cross-region latency measurements originate from this site.',
  },
];

export const metadata: Metadata = {
  title: 'Infrastructure',
  description:
    'InferenceX benchmark infrastructure — bare-metal GPU clusters across four US regions running NVIDIA and AMD hardware.',
  alternates: { canonical: `${SITE_URL}/landing/infrastructure` },
  openGraph: {
    title: 'Infrastructure | InferenceX',
    description: 'Explore the GPU clusters powering InferenceX benchmarks across four US regions.',
    url: `${SITE_URL}/landing/infrastructure`,
  },
};

export default function InfrastructurePage() {
  return (
    <main className="relative">
      <div className="container mx-auto px-4 lg:px-8 pb-8">
        <Card className="gap-10">
          <header className="max-w-3xl">
            <p className="mb-3 text-xs font-semibold uppercase tracking-[0.32em] text-brand">
              Infrastructure
            </p>
            <h1 className="text-4xl font-semibold tracking-[-0.04em] text-foreground md:text-5xl">
              Bare metal. No compromises.
            </h1>
            <p className="mt-4 text-sm leading-6 text-muted-foreground md:text-base">
              InferenceX benchmarks run on dedicated bare-metal servers across four US regions. No
              cloud VMs, no shared resources — just raw hardware performance with full control over
              the software stack from BIOS to framework.
            </p>
          </header>

          <section className="grid gap-4 md:grid-cols-2" aria-label="Cluster locations">
            {CLUSTERS.map((cluster) => (
              <article
                key={cluster.codename}
                className="rounded-2xl border border-border/40 bg-background/20 p-5"
              >
                <div className="flex items-center justify-between">
                  <p className="text-xs font-semibold uppercase tracking-[0.28em] text-muted-foreground">
                    {cluster.location}
                  </p>
                  <span className="rounded-full border border-brand/30 bg-brand/10 px-2.5 py-0.5 text-xs font-medium text-brand">
                    {cluster.codename}
                  </span>
                </div>
                <h2 className="mt-3 text-lg font-semibold tracking-[-0.04em] text-foreground">
                  {cluster.specs}
                </h2>
                <p className="mt-4 text-sm leading-6 text-muted-foreground">
                  {cluster.description}
                </p>
              </article>
            ))}
          </section>

          <p className="max-w-3xl text-sm leading-6 text-muted-foreground">
            All clusters are connected via dedicated 100Gbps links. Hardware configurations are
            documented in our open-source repository and updated with each infrastructure change.
          </p>
        </Card>
      </div>
    </main>
  );
}

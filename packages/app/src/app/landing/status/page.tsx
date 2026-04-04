import type { Metadata } from 'next';

import { Card } from '@/components/ui/card';
import { SITE_URL } from '@semianalysisai/inferencex-constants';

const SYSTEMS = [
  {
    name: 'Dashboard & API',
    status: 'Operational',
    uptime: '99.97%',
    description:
      'The InferenceX web dashboard and public API endpoints. Served via Vercel with global edge caching and automatic failover.',
  },
  {
    name: 'Benchmark Pipeline',
    status: 'Operational',
    uptime: '99.8%',
    description:
      'Automated benchmark orchestration — GPU provisioning, framework deployment, load generation, and result ingestion. Runs on a daily cron cycle.',
  },
  {
    name: 'Database',
    status: 'Operational',
    uptime: '99.99%',
    description:
      'Neon PostgreSQL serving all benchmark data, configurations, and historical records. Read replicas across multiple regions for low-latency queries.',
  },
  {
    name: 'GPU Clusters',
    status: 'Partial',
    uptime: '96.2%',
    description:
      'Bare-metal GPU servers across four US regions. Partial status reflects scheduled hardware maintenance windows and GPU refresh cycles.',
  },
];

const INCIDENTS = [
  {
    date: 'March 28, 2026',
    severity: 'Minor',
    title: 'Delayed benchmark ingestion',
    description:
      'A database migration caused a 4-hour delay in benchmark result publication. No data was lost; results were backfilled after the migration completed.',
  },
  {
    date: 'March 15, 2026',
    severity: 'Major',
    title: 'SCL-01 cluster offline',
    description:
      'Power supply failure in the Santa Clara cluster took GB200 benchmarks offline for 18 hours. Redundant power has since been installed.',
  },
];

export const metadata: Metadata = {
  title: 'Status',
  description:
    'InferenceX system status — dashboard, API, benchmark pipeline, database, and GPU cluster health.',
  alternates: { canonical: `${SITE_URL}/landing/status` },
  openGraph: {
    title: 'Status | InferenceX',
    description: 'Real-time status of InferenceX systems and infrastructure.',
    url: `${SITE_URL}/landing/status`,
  },
};

export default function StatusPage() {
  return (
    <main className="relative">
      <div className="container mx-auto px-4 lg:px-8 pb-8">
        <Card className="gap-10">
          <header className="max-w-3xl">
            <p className="mb-3 text-xs font-semibold uppercase tracking-[0.32em] text-brand">
              System Status
            </p>
            <h1 className="text-4xl font-semibold tracking-[-0.04em] text-foreground md:text-5xl">
              All systems operational.
            </h1>
            <p className="mt-4 text-sm leading-6 text-muted-foreground md:text-base">
              Current status of InferenceX infrastructure. We monitor dashboard availability,
              benchmark pipeline health, database performance, and GPU cluster uptime continuously.
            </p>
          </header>

          <section className="grid gap-4 md:grid-cols-2" aria-label="System status">
            {SYSTEMS.map((system) => (
              <article
                key={system.name}
                className="rounded-2xl border border-border/40 bg-background/20 p-5"
              >
                <div className="flex items-center justify-between">
                  <p className="text-xs font-semibold uppercase tracking-[0.28em] text-muted-foreground">
                    {system.name}
                  </p>
                  <span
                    className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${
                      system.status === 'Operational'
                        ? 'border border-emerald-500/30 bg-emerald-500/10 text-emerald-400'
                        : 'border border-amber-500/30 bg-amber-500/10 text-amber-400'
                    }`}
                  >
                    {system.status}
                  </span>
                </div>
                <div className="mt-3 flex items-baseline gap-1">
                  <span className="text-2xl font-semibold tracking-[-0.04em] text-foreground">
                    {system.uptime}
                  </span>
                  <span className="text-xs text-muted-foreground">uptime (30d)</span>
                </div>
                <p className="mt-3 text-sm leading-6 text-muted-foreground">{system.description}</p>
              </article>
            ))}
          </section>

          <section aria-label="Recent incidents">
            <h2 className="mb-4 text-xs font-semibold uppercase tracking-[0.32em] text-muted-foreground">
              Recent Incidents
            </h2>
            <div className="space-y-4">
              {INCIDENTS.map((incident) => (
                <div
                  key={incident.date}
                  className="rounded-2xl border border-border/40 bg-background/20 p-5"
                >
                  <div className="flex items-center gap-3">
                    <span
                      className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${
                        incident.severity === 'Minor'
                          ? 'border border-amber-500/30 bg-amber-500/10 text-amber-400'
                          : 'border border-red-500/30 bg-red-500/10 text-red-400'
                      }`}
                    >
                      {incident.severity}
                    </span>
                    <span className="text-xs text-muted-foreground">{incident.date}</span>
                  </div>
                  <h3 className="mt-2 text-lg font-semibold tracking-[-0.04em] text-foreground">
                    {incident.title}
                  </h3>
                  <p className="mt-2 text-sm leading-6 text-muted-foreground">
                    {incident.description}
                  </p>
                </div>
              ))}
            </div>
          </section>

          <p className="max-w-3xl text-sm leading-6 text-muted-foreground">
            For real-time alerts, subscribe to our status RSS feed or follow @SemiAnalysis on X.
            Incident postmortems are published within 48 hours of resolution.
          </p>
        </Card>
      </div>
    </main>
  );
}

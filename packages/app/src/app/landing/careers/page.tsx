import type { Metadata } from 'next';

import { Card } from '@/components/ui/card';
import { SITE_URL } from '@semianalysisai/inferencex-constants';

const ROLES = [
  {
    department: 'Engineering',
    title: 'Systems Engineer — GPU Infrastructure',
    location: 'San Jose, CA · On-site',
    description:
      'Build and maintain the bare-metal GPU clusters that power InferenceX benchmarks. You will work directly with NVIDIA and AMD hardware, configure multi-node NVLink topologies, and optimize kernel-level performance.',
  },
  {
    department: 'Engineering',
    title: 'Full-Stack Engineer — Dashboard',
    location: 'Remote · US',
    description:
      'Own the InferenceX dashboard — Next.js, D3.js, and React Query at scale. Build interactive charts that make complex benchmark data intuitive for GPU buyers, ML engineers, and researchers.',
  },
  {
    department: 'Research',
    title: 'ML Performance Researcher',
    location: 'Remote · Global',
    description:
      'Design and execute inference benchmarks that capture real-world performance characteristics. Publish methodology papers and collaborate with framework teams on optimization strategies.',
  },
  {
    department: 'Content',
    title: 'Technical Writer — AI Hardware',
    location: 'Remote · US/EU',
    description:
      'Turn benchmark data into compelling analysis. Write blog posts, deep-dives, and reports that help the AI community understand GPU performance tradeoffs and make informed decisions.',
  },
];

const VALUES = [
  { title: 'Ship Daily', description: 'Small, frequent releases over big-bang launches.' },
  { title: 'Data Over Opinions', description: 'We measure first, debate second.' },
  { title: 'Build in Public', description: 'Open source by default, proprietary by exception.' },
];

export const metadata: Metadata = {
  title: 'Careers',
  description:
    'Join the InferenceX team — open roles in GPU infrastructure, full-stack engineering, ML research, and technical writing.',
  alternates: { canonical: `${SITE_URL}/landing/careers` },
  openGraph: {
    title: 'Careers | InferenceX',
    description:
      'Open roles at InferenceX — GPU infrastructure, engineering, research, and writing.',
    url: `${SITE_URL}/landing/careers`,
  },
};

export default function CareersPage() {
  return (
    <main className="relative">
      <div className="container mx-auto px-4 lg:px-8 pb-8">
        <Card className="gap-10">
          <header className="max-w-3xl">
            <p className="mb-3 text-xs font-semibold uppercase tracking-[0.32em] text-brand">
              Careers
            </p>
            <h1 className="text-4xl font-semibold tracking-[-0.04em] text-foreground md:text-5xl">
              Help us benchmark the future of AI compute.
            </h1>
            <p className="mt-4 text-sm leading-6 text-muted-foreground md:text-base">
              InferenceX is a small, high-leverage team inside SemiAnalysis. We build the tools that
              GPU buyers, ML engineers, and researchers rely on to make million-dollar hardware
              decisions. If you care about performance, open data, and shipping fast — we want to
              talk to you.
            </p>
          </header>

          <section className="grid gap-4 md:grid-cols-3" aria-label="Values">
            {VALUES.map((v) => (
              <div key={v.title} className="rounded-2xl border border-brand/20 bg-brand/5 p-5">
                <h3 className="text-lg font-semibold tracking-[-0.04em] text-foreground">
                  {v.title}
                </h3>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">{v.description}</p>
              </div>
            ))}
          </section>

          <section className="grid gap-4 md:grid-cols-2" aria-label="Open roles">
            {ROLES.map((role) => (
              <article
                key={role.title}
                className="rounded-2xl border border-border/40 bg-background/20 p-5"
              >
                <div className="flex items-center justify-between">
                  <p className="text-xs font-semibold uppercase tracking-[0.28em] text-muted-foreground">
                    {role.department}
                  </p>
                  <span className="text-xs text-muted-foreground">{role.location}</span>
                </div>
                <h2 className="mt-3 text-lg font-semibold tracking-[-0.04em] text-foreground">
                  {role.title}
                </h2>
                <p className="mt-4 text-sm leading-6 text-muted-foreground">{role.description}</p>
              </article>
            ))}
          </section>

          <p className="max-w-3xl text-sm leading-6 text-muted-foreground">
            No formal job listing needed — if you have relevant experience and want to work on hard
            problems in AI infrastructure, reach out to us directly.
          </p>
        </Card>
      </div>
    </main>
  );
}

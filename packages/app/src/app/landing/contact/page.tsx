import type { Metadata } from 'next';

import { Card } from '@/components/ui/card';
import { SITE_URL } from '@semianalysisai/inferencex-constants';

const CHANNELS = [
  {
    type: 'General',
    title: 'Community & Support',
    description:
      'For questions, bug reports, and feature requests — open an issue on our GitHub repository. Our team triages daily and responds to most issues within 24 hours.',
    contact: 'github.com/SemiAnalysisAI/InferenceX-app',
  },
  {
    type: 'Business',
    title: 'Enterprise & Partnerships',
    description:
      'For custom benchmark requests, hardware partnership inquiries, or enterprise data access — reach out to our business team directly.',
    contact: 'partnerships@semianalysis.com',
  },
  {
    type: 'Press',
    title: 'Media & Press',
    description:
      'For press inquiries, interview requests, or access to high-resolution assets and benchmark data for publication.',
    contact: 'press@semianalysis.com',
  },
  {
    type: 'Security',
    title: 'Security Disclosures',
    description:
      'Found a security vulnerability? We take security seriously. Please report responsibly through our security contact — do not open public issues.',
    contact: 'security@semianalysis.com',
  },
];

const SOCIALS = [
  { platform: 'GitHub', handle: 'SemiAnalysisAI' },
  { platform: 'X / Twitter', handle: '@SemiAnalysis' },
  { platform: 'YouTube', handle: '@SemiAnalysis' },
  { platform: 'Discord', handle: 'SemiAnalysis Community' },
];

export const metadata: Metadata = {
  title: 'Contact',
  description:
    'Get in touch with the InferenceX team — community support, enterprise partnerships, press inquiries, and security disclosures.',
  alternates: { canonical: `${SITE_URL}/landing/contact` },
  openGraph: {
    title: 'Contact | InferenceX',
    description: 'Reach the InferenceX team for support, partnerships, or press inquiries.',
    url: `${SITE_URL}/landing/contact`,
  },
};

export default function ContactPage() {
  return (
    <main className="relative">
      <div className="container mx-auto px-4 lg:px-8 pb-8">
        <Card className="gap-10">
          <header className="max-w-3xl">
            <p className="mb-3 text-xs font-semibold uppercase tracking-[0.32em] text-brand">
              Contact
            </p>
            <h1 className="text-4xl font-semibold tracking-[-0.04em] text-foreground md:text-5xl">
              Let&apos;s talk inference.
            </h1>
            <p className="mt-4 text-sm leading-6 text-muted-foreground md:text-base">
              Whether you&apos;re reporting a bug, proposing a partnership, or just want to nerd out
              about GPU benchmarks — we&apos;d love to hear from you.
            </p>
          </header>

          <section className="grid gap-4 md:grid-cols-2" aria-label="Contact channels">
            {CHANNELS.map((channel) => (
              <article
                key={channel.type}
                className="rounded-2xl border border-border/40 bg-background/20 p-5"
              >
                <p className="text-xs font-semibold uppercase tracking-[0.28em] text-brand">
                  {channel.type}
                </p>
                <h2 className="mt-3 text-xl font-semibold tracking-[-0.04em] text-foreground">
                  {channel.title}
                </h2>
                <p className="mt-4 text-sm leading-6 text-muted-foreground">
                  {channel.description}
                </p>
                <p className="mt-4 rounded-lg border border-border/30 bg-background/30 px-3 py-2 text-sm font-medium text-foreground">
                  {channel.contact}
                </p>
              </article>
            ))}
          </section>

          <section aria-label="Social links">
            <h2 className="mb-4 text-xs font-semibold uppercase tracking-[0.32em] text-muted-foreground">
              Find Us
            </h2>
            <div className="grid gap-4 grid-cols-2 md:grid-cols-4">
              {SOCIALS.map((social) => (
                <div
                  key={social.platform}
                  className="rounded-2xl border border-brand/20 bg-brand/5 p-5 text-center"
                >
                  <p className="text-xs font-semibold uppercase tracking-[0.28em] text-muted-foreground">
                    {social.platform}
                  </p>
                  <p className="mt-2 text-sm font-medium text-foreground">{social.handle}</p>
                </div>
              ))}
            </div>
          </section>

          <p className="max-w-3xl text-sm leading-6 text-muted-foreground">
            Response times vary by channel. GitHub issues are fastest for technical questions. For
            time-sensitive business matters, email is preferred.
          </p>
        </Card>
      </div>
    </main>
  );
}

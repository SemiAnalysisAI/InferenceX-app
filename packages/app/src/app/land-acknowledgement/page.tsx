import type { Metadata } from 'next';

import { Card } from '@/components/ui/card';
import { SITE_URL } from '@semianalysisai/inferencex-constants';

const REGIONAL_ACKNOWLEDGEMENTS = [
  {
    region: 'San Jose',
    peoples: 'Muwekma Ohlone Tribe',
    acknowledgement:
      'Our San Jose-area benchmark infrastructure operates on the unceded ancestral homelands of the Muwekma Ohlone Tribe of the San Francisco Bay Area.',
  },
  {
    region: 'Los Angeles',
    peoples: 'Tongva, Tataviam, Serrano, Kizh, and Chumash Peoples',
    acknowledgement:
      'Our Los Angeles-area benchmark infrastructure operates on land originally and still inhabited and cared for by the Tongva, Tataviam, Serrano, Kizh, and Chumash Peoples.',
  },
  {
    region: 'Chicago',
    peoples:
      'Council of the Three Fires, Illinois Confederacy, Miami, Ho-Chunk, Menominee, Fox, and Sac Peoples',
    acknowledgement:
      'Our Chicago-area benchmark infrastructure operates on land stewarded by the Council of the Three Fires (Ojibwe, Odawa, and Potawatomi Nations), the Illinois Confederacy, and many other Native Nations including the Miami, Ho-Chunk, Menominee, Fox, and Sac Peoples.',
  },
];

export const metadata: Metadata = {
  title: 'Land Acknowledgement',
  description:
    'A land acknowledgement for the Indigenous peoples and homelands connected to InferenceX US benchmark clusters in San Jose, Los Angeles, and Chicago.',
  alternates: { canonical: `${SITE_URL}/land-acknowledgement` },
  openGraph: {
    title: 'Land Acknowledgement | InferenceX',
    description:
      'A land acknowledgement for the Indigenous peoples and homelands connected to InferenceX US benchmark clusters in San Jose, Los Angeles, and Chicago.',
    url: `${SITE_URL}/land-acknowledgement`,
  },
  twitter: {
    title: 'Land Acknowledgement | InferenceX',
    description:
      'A land acknowledgement for the Indigenous peoples and homelands connected to InferenceX US benchmark clusters in San Jose, Los Angeles, and Chicago.',
  },
};

export default function LandAcknowledgementPage() {
  return (
    <main data-testid="land-acknowledgement-page" className="relative">
      <div className="container mx-auto px-4 lg:px-8 pb-8">
        <Card className="gap-10">
          <header className="max-w-3xl">
            <p className="mb-3 text-xs font-semibold uppercase tracking-[0.32em] text-brand">
              Land Acknowledgement
            </p>
            <h1 className="text-4xl font-semibold tracking-[-0.04em] text-foreground md:text-5xl">
              We recognize the Indigenous homelands connected to our US infrastructure.
            </h1>
            <p className="mt-4 text-sm leading-6 text-muted-foreground md:text-base">
              InferenceX benchmark clusters serve traffic from several regions. This page focuses on
              our US sites in San Jose, Los Angeles, and Chicago, and acknowledges the Indigenous
              peoples who have stewarded these lands across generations and continue to do so today.
            </p>
          </header>

          <section
            data-testid="land-acknowledgement-regions"
            className="grid gap-4 lg:grid-cols-3"
            aria-label="Regional land acknowledgements"
          >
            {REGIONAL_ACKNOWLEDGEMENTS.map((entry) => (
              <article
                key={entry.region}
                data-testid={`land-acknowledgement-${entry.region
                  .toLowerCase()
                  .replaceAll(' ', '-')}`}
                className="rounded-2xl border border-border/40 bg-background/20 p-5"
              >
                <p className="text-xs font-semibold uppercase tracking-[0.28em] text-muted-foreground">
                  {entry.region}
                </p>
                <h2 className="mt-3 text-xl font-semibold tracking-[-0.04em] text-foreground">
                  {entry.peoples}
                </h2>
                <p className="mt-4 text-sm leading-6 text-muted-foreground">
                  {entry.acknowledgement}
                </p>
              </article>
            ))}
          </section>

          <p className="max-w-3xl text-sm leading-6 text-muted-foreground">
            Acknowledgement is only a starting point. We share this statement with respect for
            Native sovereignty, history, and ongoing community presence, and we welcome corrections
            if our wording should be improved.
          </p>
        </Card>
      </div>
    </main>
  );
}

import type { Metadata } from 'next';

import { Heading } from '@/components/ui/heading';
import { READING_PAGE_CLASS, READING_TOP_CLASS } from '@/components/ui/reading-layout';
import { enAlternates } from '@/lib/i18n/i18n';
import { cn } from '@/lib/shared/utils';
import { SITE_URL } from '@semianalysisai/inferencex-constants';
import { socialMetadata } from '@/lib/seo/social-metadata';

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
  alternates: enAlternates('/land-acknowledgement'),
  ...socialMetadata({
    title: 'Land Acknowledgement | InferenceX',
    description:
      'A land acknowledgement for the Indigenous peoples and homelands connected to InferenceX US benchmark clusters in San Jose, Los Angeles, and Chicago.',
    url: `${SITE_URL}/land-acknowledgement`,
    locale: 'en',
  }),
};

export default function LandAcknowledgementPage() {
  return (
    <main data-testid="land-acknowledgement-page" className="relative">
      <div className={cn(READING_PAGE_CLASS, READING_TOP_CLASS, 'flex flex-col gap-10')}>
        <header className="max-w-3xl">
          <p className="mb-3 text-xs font-medium text-muted-foreground">Land acknowledgement</p>
          <Heading as="h1" level="reading">
            We recognize the Indigenous homelands connected to our US infrastructure
          </Heading>
          <p className="mt-4 max-w-measure leading-reading text-muted-foreground">
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
              className="rounded-xl border border-border/30 bg-card p-5"
            >
              <p className="text-xs font-medium text-muted-foreground">{entry.region}</p>
              <h2 className="mt-2 text-xl font-semibold text-foreground">{entry.peoples}</h2>
              <p className="mt-4 leading-reading text-foreground">{entry.acknowledgement}</p>
            </article>
          ))}
        </section>

        <p className="max-w-measure leading-reading text-foreground">
          Acknowledgement is only a starting point. We share this statement with respect for Native
          sovereignty, history, and ongoing community presence, and we welcome corrections if our
          wording should be improved.
        </p>
      </div>
    </main>
  );
}

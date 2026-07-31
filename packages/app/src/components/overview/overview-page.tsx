import { Card } from '@/components/ui/card';
import type { OverviewPageData } from '@/lib/overview-data';

import {
  DesktopOverviewMatrix,
  MobileOverviewList,
  OverviewEngineScopeSwitcher,
  OverviewMethodology,
  OverviewTierSwitcher,
  overviewFormatters,
  OVERVIEW_STRINGS,
  type OverviewLocale,
} from './overview-scorecard';

/** The SemiAnalysis AI Cloud TCO model behind `HW_REGISTRY.costh`. */
const OVERVIEW_SOURCE_HREF = 'https://semianalysis.com/ai-cloud-tco-model/';

interface OverviewPageProps {
  data: OverviewPageData;
  locale: OverviewLocale;
}

export function OverviewPageContent({ data, locale }: OverviewPageProps) {
  const strings = OVERVIEW_STRINGS[locale];
  const formatters = overviewFormatters(locale);

  return (
    <section className="flex flex-col gap-4">
      <Card>
        <header>
          {/* Desktop: title and metric definition share the first row; phones
              and tablets stack the metric under the title. */}
          <div className="flex flex-col gap-x-6 gap-y-1 xl:flex-row xl:items-baseline xl:justify-between">
            <h1 className="text-lg font-semibold">{strings.title}</h1>
            <div className="flex flex-col gap-y-0.5 xl:items-end">
              <p
                data-testid="overview-scope"
                aria-label={strings.scopeAria}
                className="inline-flex flex-wrap items-baseline gap-x-2 leading-snug"
              >
                <span
                  data-testid="overview-scope-metric"
                  className="text-base font-semibold text-foreground"
                >
                  {strings.scopeMetric}
                </span>{' '}
                <span aria-hidden="true" className="text-sm text-muted-foreground">
                  ·
                </span>{' '}
                <span
                  data-testid="overview-scope-direction"
                  className="text-sm font-normal text-muted-foreground"
                >
                  {strings.scopeDirection}
                </span>
              </p>
              {/* The $/GPU/hr behind every cell comes from this model, so the
                  matrix cites it where it states its metric. */}
              <p className="text-xs leading-snug text-muted-foreground xl:text-right">
                <a
                  data-testid="overview-source-link"
                  href={OVERVIEW_SOURCE_HREF}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="rounded-sm underline decoration-dotted underline-offset-4 hover:decoration-solid focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
                >
                  {strings.sourceNote}
                </a>
              </p>
            </div>
          </div>
          <p className="mt-2 max-w-3xl text-sm text-muted-foreground">{strings.purpose}</p>
          <div className="mt-3 flex flex-col gap-2 lg:flex-row lg:flex-wrap lg:items-center lg:gap-x-6">
            <OverviewTierSwitcher
              tier={data.tier}
              engineScope={data.engineScope}
              locale={locale}
              strings={strings}
            />
            <OverviewEngineScopeSwitcher
              engineScope={data.engineScope}
              tier={data.tier}
              locale={locale}
              strings={strings}
            />
          </div>
        </header>
      </Card>

      {/* Official-only summary; uploaded runs remain in the linked dashboard. */}
      <Card className="overflow-hidden p-0 md:p-0">
        <DesktopOverviewMatrix
          models={data.models}
          locale={locale}
          formatters={formatters}
          strings={strings}
        />
        <MobileOverviewList
          models={data.models}
          locale={locale}
          formatters={formatters}
          strings={strings}
        />
        <OverviewMethodology strings={strings} />
      </Card>
    </section>
  );
}

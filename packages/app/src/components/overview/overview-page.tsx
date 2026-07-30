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
              <span
                data-testid="overview-scope-direction"
                className="text-sm font-normal text-muted-foreground"
              >
                {strings.scopeDirection}
              </span>
            </p>
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

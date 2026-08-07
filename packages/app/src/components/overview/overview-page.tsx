'use client';

import { Card } from '@/components/ui/card';
import { ExternalLinkIcon } from '@/components/ui/external-link-icon';
import type { OverviewPageData } from '@/lib/overview-data';
import { overviewHref } from '@/lib/overview-links';

import {
  DesktopOverviewMatrix,
  MobileOverviewList,
  OverviewComparisonSwitcher,
  OverviewEngineScopeSwitcher,
  OverviewMethodology,
  OverviewTierSwitcher,
  overviewFormatters,
  OVERVIEW_STRINGS,
  type OverviewLocale,
} from './overview-scorecard';
import { OverviewNavigationProvider, useOverviewNavigation } from './overview-navigation';

/** The SemiAnalysis AI Cloud TCO model behind `HW_REGISTRY.costh`. */
const OVERVIEW_SOURCE_HREF = 'https://semianalysis.com/ai-cloud-tco-model/';

interface OverviewPageProps {
  data: OverviewPageData;
  locale: OverviewLocale;
}

export function OverviewPageContent({ data, locale }: OverviewPageProps) {
  return (
    <OverviewNavigationProvider
      initialData={data}
      initialHref={overviewHref(
        locale,
        data.tier,
        data.engineScope,
        data.comparisonMode,
        data.referenceHardware,
      )}
    >
      <OverviewPageBody locale={locale} />
    </OverviewNavigationProvider>
  );
}

function OverviewPageBody({ locale }: { locale: OverviewLocale }) {
  const { data } = useOverviewNavigation();
  const strings = OVERVIEW_STRINGS[locale];
  const formatters = overviewFormatters(locale);

  return (
    <section data-testid="overview-page" className="flex flex-col gap-4">
      <Card>
        <header>
          {/* Two rows at every width: the title, then the metric it is
              measured in and where that measure comes from. */}
          <div className="flex flex-col gap-y-1">
            <h1 className="text-lg font-semibold">{strings.title}</h1>
            {/* Metric, direction and provenance read as one line: the numbers
                and the model they are priced from belong together. */}
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
              </span>{' '}
              <span aria-hidden="true" className="text-sm text-muted-foreground">
                ·
              </span>{' '}
              <span className="text-sm font-normal text-muted-foreground">
                {strings.sourcePrefix}
                <a
                  data-testid="overview-source-link"
                  href={OVERVIEW_SOURCE_HREF}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="group rounded-sm underline decoration-dotted underline-offset-4 hover:decoration-solid focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
                >
                  {strings.sourceLinkText}
                  <ExternalLinkIcon />
                </a>
              </span>
            </p>
          </div>
          <div className="mt-3 flex flex-col gap-2 lg:flex-row lg:flex-wrap lg:items-center lg:gap-x-6">
            <OverviewTierSwitcher
              tier={data.tier}
              engineScope={data.engineScope}
              comparisonMode={data.comparisonMode}
              referenceHardware={data.referenceHardware}
              locale={locale}
              strings={strings}
            />
            <OverviewEngineScopeSwitcher
              engineScope={data.engineScope}
              tier={data.tier}
              comparisonMode={data.comparisonMode}
              referenceHardware={data.referenceHardware}
              locale={locale}
              strings={strings}
            />
          </div>
        </header>
      </Card>

      <OverviewComparisonSwitcher
        comparisonMode={data.comparisonMode}
        engineScope={data.engineScope}
        tier={data.tier}
        referenceHardware={data.referenceHardware}
        locale={locale}
        strings={strings}
      />

      {/* Official-only summary; uploaded runs remain in the linked dashboard. */}
      {/* Clipped on phones for the rounded corners; visible from xl so the
          desktop matrix header can stick to the page as it scrolls. */}
      <Card className="overflow-hidden p-0 md:p-0 xl:overflow-visible">
        <DesktopOverviewMatrix
          models={data.models}
          locale={locale}
          formatters={formatters}
          strings={strings}
          comparisonMode={data.comparisonMode}
          referenceHardware={data.referenceHardware}
        />
        <MobileOverviewList
          models={data.models}
          locale={locale}
          formatters={formatters}
          strings={strings}
          comparisonMode={data.comparisonMode}
          referenceHardware={data.referenceHardware}
        />
        <OverviewMethodology
          strings={strings}
          comparisonMode={data.comparisonMode}
          referenceHardware={data.referenceHardware}
        />
      </Card>
    </section>
  );
}

'use client';

import { Maximize2, Minimize2 } from 'lucide-react';
import { useEffect, useState } from 'react';

import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { ExternalLinkIcon } from '@/components/ui/external-link-icon';
import { track } from '@/lib/analytics';
import type { OverviewPageData } from '@/lib/overview-data';
import { overviewHref } from '@/lib/overview-links';

import {
  DesktopOverviewMatrix,
  MobileOverviewList,
  OverviewComparisonSwitcher,
  OverviewEngineScopeSwitcher,
  OverviewMethodology,
  OverviewModelScopeToggle,
  OverviewTierSwitcher,
  overviewFormatters,
  OVERVIEW_STRINGS,
  type OverviewLocale,
} from './overview-scorecard';
import { OverviewNavigationProvider, useOverviewNavigation } from './overview-navigation';
import { OverviewHardwareSelect } from './overview-hardware-select';

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
        data.modelScope,
        data.historyDays,
        data.visibleHardware,
      )}
    >
      <OverviewPageBody locale={locale} />
    </OverviewNavigationProvider>
  );
}

function OverviewPageBody({ locale }: { locale: OverviewLocale }) {
  const { data } = useOverviewNavigation();
  const [presentation, setPresentation] = useState(false);
  const strings = OVERVIEW_STRINGS[locale];
  const formatters = overviewFormatters(locale);

  useEffect(() => {
    if (!presentation) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setPresentation(false);
    };
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [presentation]);

  return (
    <section
      data-testid="overview-page"
      data-presentation={presentation ? 'true' : 'false'}
      className={
        presentation
          ? 'fixed inset-0 z-[100] flex flex-col gap-3 overflow-auto bg-background p-3 lg:p-5'
          : 'flex flex-col gap-4'
      }
    >
      <Card className={presentation ? 'hidden' : undefined}>
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
              modelScope={data.modelScope}
              historyDays={data.historyDays}
              visibleHardware={data.visibleHardware}
              locale={locale}
              strings={strings}
            />
            <OverviewEngineScopeSwitcher
              engineScope={data.engineScope}
              tier={data.tier}
              comparisonMode={data.comparisonMode}
              referenceHardware={data.referenceHardware}
              modelScope={data.modelScope}
              historyDays={data.historyDays}
              visibleHardware={data.visibleHardware}
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
        modelScope={data.modelScope}
        historyDays={data.historyDays}
        visibleHardware={data.visibleHardware}
        locale={locale}
        strings={strings}
        hidden={presentation}
      />

      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex min-w-0 flex-wrap items-end gap-4">
          {presentation ? (
            <div className="pb-1">
              <h1 className="text-lg font-semibold">{strings.title}</h1>
              <p className="text-xs text-muted-foreground">
                {data.comparisonMode === 'history'
                  ? `${strings.developmentSpeedLabel}: ${strings.comparisonOptions[data.historyDays]}`
                  : strings.hardwareComparisonLabel(
                      data.models[0]?.platforms.find(
                        (platform) => platform.hardware === data.referenceHardware,
                      )?.hardwareLabel ?? data.referenceHardware,
                    )}
              </p>
            </div>
          ) : null}
          <div className="flex min-w-0 flex-col gap-1 text-xs">
            <span className="text-muted-foreground">{strings.hardwareColumnsLabel}</span>
            <OverviewHardwareSelect
              locale={locale}
              tier={data.tier}
              engineScope={data.engineScope}
              comparisonMode={data.comparisonMode}
              referenceHardware={data.referenceHardware}
              modelScope={data.modelScope}
              historyDays={data.historyDays}
              value={data.visibleHardware}
              ariaLabel={strings.hardwareColumnsAria}
            />
          </div>
        </div>
        <Button
          data-testid="overview-presentation-toggle"
          type="button"
          variant="outline"
          className="min-h-11"
          onClick={() =>
            setPresentation((current) => {
              track('overview_presentation_toggled', { enabled: !current });
              return !current;
            })
          }
        >
          {presentation ? <Minimize2 /> : <Maximize2 />}
          {presentation ? strings.exitPresentationView : strings.presentationView}
        </Button>
      </div>

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
          historyDays={data.historyDays}
          visibleHardware={data.visibleHardware}
          presentation={presentation}
        />
        <MobileOverviewList
          models={data.models}
          locale={locale}
          formatters={formatters}
          strings={strings}
          comparisonMode={data.comparisonMode}
          referenceHardware={data.referenceHardware}
          historyDays={data.historyDays}
          visibleHardware={data.visibleHardware}
          presentation={presentation}
        />
        <OverviewMethodology
          strings={strings}
          comparisonMode={data.comparisonMode}
          referenceHardware={data.referenceHardware}
          historyDays={data.historyDays}
        />
        <OverviewModelScopeToggle
          modelScope={data.modelScope}
          tier={data.tier}
          engineScope={data.engineScope}
          comparisonMode={data.comparisonMode}
          referenceHardware={data.referenceHardware}
          historyDays={data.historyDays}
          visibleHardware={data.visibleHardware}
          locale={locale}
          strings={strings}
        />
      </Card>
    </section>
  );
}

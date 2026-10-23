'use client';

import type { ReactNode } from 'react';

import { TCO_SOURCE_URL } from '@semianalysisai/inferencex-constants';

import { Card } from '@/components/ui/card';
import { ExternalLinkIcon } from '@/components/ui/external-link-icon';
import { OVERVIEW_HISTORY_WINDOW_DAYS, type OverviewPageData } from '@/lib/overview/overview-data';
import { overviewHref } from '@/lib/overview/overview-links';

import {
  DesktopOverviewMatrix,
  MobileOverviewList,
  OverviewComparisonSwitcher,
  OverviewEngineScopeSwitcher,
  OverviewHardwareRowScopeToggle,
  OverviewMethodology,
  OverviewModelScopeToggle,
  OverviewRowScopeToggle,
  OverviewTierSwitcher,
  overviewFormatters,
} from './overview-scorecard';
import { OVERVIEW_STRINGS, type OverviewLocale } from './overview-strings';
import {
  OverviewNavigationProvider,
  useOverviewData,
  useOverviewNavigation,
  useOverviewNavigationError,
  useOverviewReference,
} from './overview-navigation';
import {
  OverviewPresentationProvider,
  OverviewPresentationSurface,
  OverviewPresentToggle,
  useOverviewPresentation,
} from './overview-presentation';
import { useWideViewport } from './use-wide-viewport';

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
        data.rowScope,
        data.hardwareRowScope,
      )}
    >
      <OverviewPresentationProvider locale={locale}>
        <OverviewPageBody locale={locale} />
      </OverviewPresentationProvider>
    </OverviewNavigationProvider>
  );
}

function OverviewPendingStatus({ label }: { label: string }) {
  const { isPending } = useOverviewNavigation();
  return (
    <p role="status" aria-live="polite" className="sr-only">
      {isPending ? label : ''}
    </p>
  );
}

function OverviewNavigationErrorStatus({ label }: { label: string }) {
  const hasError = useOverviewNavigationError();
  if (!hasError) return null;
  return (
    <p
      role="alert"
      data-testid="overview-navigation-error"
      className="rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-foreground"
    >
      {label}
    </p>
  );
}

function OverviewMatrixCard({ children }: { children: ReactNode }) {
  const { isPending } = useOverviewNavigation();
  return (
    <Card
      aria-busy={isPending}
      className={`overflow-clip p-0 transition-opacity md:p-0 ${isPending ? 'opacity-60' : ''}`}
    >
      {children}
    </Card>
  );
}

function OverviewPageBody({ locale }: { locale: OverviewLocale }) {
  const data = useOverviewData();
  const referenceHardware = useOverviewReference();
  const { presenting } = useOverviewPresentation();
  const strings = OVERVIEW_STRINGS[locale];

  return (
    <section data-testid="overview-page" className="flex flex-col gap-4">
      <OverviewPendingStatus label={strings.loadingStatus} />
      <OverviewNavigationErrorStatus label={strings.navigationError} />
      {presenting ? null : (
        <Card className="md:py-5">
          <header>
            <div className="flex flex-col gap-y-1">
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
                    href={TCO_SOURCE_URL}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="group rounded-sm underline decoration-dotted underline-offset-4 hover:decoration-solid focus-visible:outline-none"
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
                referenceHardware={referenceHardware}
                modelScope={data.modelScope}
                rowScope={data.rowScope}
                hardwareRowScope={data.hardwareRowScope}
                locale={locale}
                strings={strings}
              />
              <OverviewEngineScopeSwitcher
                engineScope={data.engineScope}
                tier={data.tier}
                comparisonMode={data.comparisonMode}
                referenceHardware={referenceHardware}
                modelScope={data.modelScope}
                rowScope={data.rowScope}
                hardwareRowScope={data.hardwareRowScope}
                locale={locale}
                strings={strings}
              />
            </div>
          </header>
        </Card>
      )}

      <OverviewPresentationSurface>
        <OverviewMatrixSection locale={locale} />
      </OverviewPresentationSurface>
    </section>
  );
}

function OverviewControlRow({ locale }: { locale: OverviewLocale }) {
  const data = useOverviewData();
  const referenceHardware = useOverviewReference();
  const { presenting } = useOverviewPresentation();
  const strings = OVERVIEW_STRINGS[locale];

  const views = (
    <OverviewComparisonSwitcher
      comparisonMode={data.comparisonMode}
      engineScope={data.engineScope}
      tier={data.tier}
      referenceHardware={referenceHardware}
      modelScope={data.modelScope}
      rowScope={data.rowScope}
      hardwareRowScope={data.hardwareRowScope}
      locale={locale}
      strings={strings}
    />
  );

  if (!presenting) {
    return (
      <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1.5 md:grid md:grid-cols-[1fr_auto_1fr]">
        <div className="hidden md:block" />
        <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1.5 md:justify-self-center">
          {views}
        </div>
        <div className="md:justify-self-end">
          <OverviewPresentToggle strings={strings} />
        </div>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-x-6">
      <div className="justify-self-start">
        <OverviewTierSwitcher
          tier={data.tier}
          engineScope={data.engineScope}
          comparisonMode={data.comparisonMode}
          referenceHardware={referenceHardware}
          modelScope={data.modelScope}
          rowScope={data.rowScope}
          hardwareRowScope={data.hardwareRowScope}
          locale={locale}
          strings={strings}
        />
      </div>
      <div className="justify-self-center">{views}</div>
      <div className="flex items-center gap-x-2 justify-self-end">
        {data.comparisonMode === 'hardware' ? (
          <OverviewHardwareRowScopeToggle
            variant="toolbar"
            hardwareRowScope={data.hardwareRowScope}
            emptyRowCount={data.emptyRowCount}
            tier={data.tier}
            engineScope={data.engineScope}
            referenceHardware={referenceHardware}
            modelScope={data.modelScope}
            locale={locale}
            strings={strings}
          />
        ) : (
          <OverviewRowScopeToggle
            variant="toolbar"
            windowDays={OVERVIEW_HISTORY_WINDOW_DAYS[data.comparisonMode]}
            rowScope={data.rowScope}
            unchangedRowCount={data.unchangedRowCount}
            tier={data.tier}
            engineScope={data.engineScope}
            referenceHardware={referenceHardware}
            modelScope={data.modelScope}
            locale={locale}
            strings={strings}
          />
        )}
        <OverviewModelScopeToggle
          variant="toolbar"
          modelScope={data.modelScope}
          tier={data.tier}
          engineScope={data.engineScope}
          comparisonMode={data.comparisonMode}
          referenceHardware={referenceHardware}
          rowScope={data.rowScope}
          hardwareRowScope={data.hardwareRowScope}
          locale={locale}
          strings={strings}
        />
        <OverviewPresentToggle strings={strings} />
      </div>
    </div>
  );
}

function OverviewMatrixSection({ locale }: { locale: OverviewLocale }) {
  const data = useOverviewData();
  const referenceHardware = useOverviewReference();
  const { presenting } = useOverviewPresentation();
  const wide = useWideViewport();
  const strings = OVERVIEW_STRINGS[locale];
  const formatters = overviewFormatters(locale);

  const matrix = (
    <DesktopOverviewMatrix
      models={data.models}
      locale={locale}
      formatters={formatters}
      strings={strings}
      comparisonMode={data.comparisonMode}
      referenceHardware={referenceHardware}
      presenting={presenting}
    />
  );

  if (data.models.length === 0) {
    return (
      <>
        <OverviewControlRow locale={locale} />
        <OverviewMatrixCard>
          <p
            role="status"
            data-testid="overview-empty-state"
            className="px-6 py-12 text-center text-sm text-muted-foreground"
          >
            {strings.emptyState}
          </p>
        </OverviewMatrixCard>
      </>
    );
  }

  return (
    <>
      <OverviewControlRow locale={locale} />

      <OverviewMatrixCard>
        {presenting ? (
          matrix
        ) : (
          <>
            {wide === false ? null : matrix}
            {wide === true ? null : (
              <MobileOverviewList
                models={data.models}
                locale={locale}
                formatters={formatters}
                strings={strings}
                comparisonMode={data.comparisonMode}
                referenceHardware={referenceHardware}
              />
            )}
            <div className="flex flex-col gap-x-6 gap-y-2 border-t border-border/50 px-4 py-3 lg:flex-row lg:items-center lg:justify-between lg:px-6">
              <OverviewMethodology
                strings={strings}
                comparisonMode={data.comparisonMode}
                referenceHardware={referenceHardware}
              />
              <div className="flex shrink-0 flex-wrap items-center gap-x-2 gap-y-1">
                {data.comparisonMode === 'hardware' ? (
                  <OverviewHardwareRowScopeToggle
                    hardwareRowScope={data.hardwareRowScope}
                    emptyRowCount={data.emptyRowCount}
                    tier={data.tier}
                    engineScope={data.engineScope}
                    referenceHardware={referenceHardware}
                    modelScope={data.modelScope}
                    locale={locale}
                    strings={strings}
                  />
                ) : (
                  <OverviewRowScopeToggle
                    windowDays={OVERVIEW_HISTORY_WINDOW_DAYS[data.comparisonMode]}
                    rowScope={data.rowScope}
                    unchangedRowCount={data.unchangedRowCount}
                    tier={data.tier}
                    engineScope={data.engineScope}
                    referenceHardware={referenceHardware}
                    modelScope={data.modelScope}
                    locale={locale}
                    strings={strings}
                  />
                )}
                <OverviewModelScopeToggle
                  modelScope={data.modelScope}
                  tier={data.tier}
                  engineScope={data.engineScope}
                  comparisonMode={data.comparisonMode}
                  referenceHardware={referenceHardware}
                  rowScope={data.rowScope}
                  hardwareRowScope={data.hardwareRowScope}
                  locale={locale}
                  strings={strings}
                />
              </div>
            </div>
          </>
        )}
      </OverviewMatrixCard>
    </>
  );
}

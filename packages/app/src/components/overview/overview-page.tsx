'use client';

import type { ReactNode } from 'react';

import { TCO_SOURCE_URL } from '@semianalysisai/inferencex-constants';

import { Card } from '@/components/ui/card';
import { ExternalLinkIcon } from '@/components/ui/external-link-icon';
import { OVERVIEW_HISTORY_WINDOW_DAYS, type OverviewPageData } from '@/lib/overview-data';
import { overviewHref } from '@/lib/overview-links';

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
  OVERVIEW_STRINGS,
  type OverviewLocale,
} from './overview-scorecard';
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
      {/* Passed as `children`, never rendered inside the provider's own JSX:
          that keeps this element's identity stable so a pending-state change
          re-renders the provider without re-rendering the whole matrix. The
          presentation provider is in the same slot for the same reason. */}
      <OverviewPresentationProvider locale={locale}>
        <OverviewPageBody locale={locale} />
      </OverviewPresentationProvider>
    </OverviewNavigationProvider>
  );
}

/** Both pending consumers live outside `OverviewPageBody` on purpose: reading
 *  `isPending` there would re-render the whole matrix on every click, which is
 *  exactly the cost the split context removes. */
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
      className={`overflow-hidden p-0 transition-opacity md:p-0 xl:overflow-visible ${
        isPending ? 'opacity-60' : ''
      }`}
    >
      {children}
    </Card>
  );
}

function OverviewPageBody({ locale }: { locale: OverviewLocale }) {
  const data = useOverviewData();
  // Not `data.referenceHardware`: the reference follows the URL directly, so a
  // cached payload built for another reference still renders the right column.
  const referenceHardware = useOverviewReference();
  const { presenting } = useOverviewPresentation();
  const strings = OVERVIEW_STRINGS[locale];

  return (
    <section data-testid="overview-page" className="flex flex-col gap-4">
      <OverviewPendingStatus label={strings.loadingStatus} />
      <OverviewNavigationErrorStatus label={strings.navigationError} />
      {/* Held in a stable child slot: swapping the header out for the surface
          would remount the surface and drop the browser out of fullscreen. The
          browser already stops painting it, so this only keeps the hidden
          duplicates of the SLO and engine controls out of the accessibility
          tree while the surface renders its own. */}
      {presenting ? null : (
        /* Tighter than the default card rhythm: every pixel spent here pushes
           the matrix further below the fold on a laptop viewport. */
        <Card className="md:py-5">
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
                    href={TCO_SOURCE_URL}
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

/**
 * The strip above the matrix. On the page it is just the view tabs plus the
 * button that starts a presentation. Presenting turns it into the deck's only
 * toolbar, so it splits into three columns — what is being measured on the
 * left, which view on the centre, and the way out on the right — rather than
 * letting a centred row push the tabs off-centre and read Exit as a third tab.
 */
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
    // Same three-column skeleton as the presenting toolbar below: the tabs
    // keep the matrix centre and Present anchors the right edge as an action,
    // instead of trailing the tabs and reading as a third view.
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
      {/* The header card carrying the SLO is gone while presenting, so the
          control comes along here rather than stranding the audience on
          whichever tier the deck happened to open on. */}
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
      {/* The scope filters live under the matrix on the page, where their full
          sentences fit. Here they ride next to Exit as chips: the left column
          is already 355px of SLO, and moving the tabs off the matrix centre to
          make room there would cost more than it buys. */}
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

/** The half of the page that goes fullscreen: the view tabs and the matrix. */
function OverviewMatrixSection({ locale }: { locale: OverviewLocale }) {
  const data = useOverviewData();
  const referenceHardware = useOverviewReference();
  const { presenting } = useOverviewPresentation();
  // Both surfaces used to render on every width and hide one with CSS, so every
  // selection built the matrix twice. The Tailwind classes stay — they carry
  // SSR and the pre-hydration frame — and this only drops the unused one after.
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

      {/* Official-only summary; uploaded runs remain in the linked dashboard. */}
      {/* Clipped on phones for the rounded corners; visible from xl so the
          desktop matrix header can stick to the page as it scrolls. */}
      <OverviewMatrixCard>
        {/* A deck lays out at a fixed width and is scaled by `zoom`, so the
            viewport no longer decides which surface fits: the matrix is the
            slide at every projector size and the phone list would only ever be
            dead weight behind it. */}
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
            {/* One footer bar instead of three stacked link rows: the notes
                keep the left edge, the scope chips keep the right, and the card
                ends on a single rule. */}
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

'use client';

import type { ReactNode } from 'react';

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
  OverviewModelScopeToggle,
  OverviewTierSwitcher,
  overviewFormatters,
  OVERVIEW_STRINGS,
  type OverviewLocale,
} from './overview-scorecard';
import {
  OverviewNavigationProvider,
  useOverviewData,
  useOverviewNavigation,
  useOverviewReference,
} from './overview-navigation';
import { useWideViewport } from './use-wide-viewport';

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
      )}
    >
      {/* Passed as `children`, never rendered inside the provider's own JSX:
          that keeps this element's identity stable so a pending-state change
          re-renders the provider without re-rendering the whole matrix. */}
      <OverviewPageBody locale={locale} />
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
  // Both surfaces used to render on every width and hide one with CSS, so every
  // selection built the matrix twice. The Tailwind classes stay — they carry
  // SSR and the pre-hydration frame — and this only drops the unused one after.
  const wide = useWideViewport();
  const strings = OVERVIEW_STRINGS[locale];
  const formatters = overviewFormatters(locale);

  return (
    <section data-testid="overview-page" className="flex flex-col gap-4">
      <OverviewPendingStatus label={strings.loadingStatus} />
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
              referenceHardware={referenceHardware}
              modelScope={data.modelScope}
              locale={locale}
              strings={strings}
            />
            <OverviewEngineScopeSwitcher
              engineScope={data.engineScope}
              tier={data.tier}
              comparisonMode={data.comparisonMode}
              referenceHardware={referenceHardware}
              modelScope={data.modelScope}
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
        referenceHardware={referenceHardware}
        modelScope={data.modelScope}
        locale={locale}
        strings={strings}
      />

      {/* Official-only summary; uploaded runs remain in the linked dashboard. */}
      {/* Clipped on phones for the rounded corners; visible from xl so the
          desktop matrix header can stick to the page as it scrolls. */}
      <OverviewMatrixCard>
        {wide === false ? null : (
          <DesktopOverviewMatrix
            models={data.models}
            locale={locale}
            formatters={formatters}
            strings={strings}
            comparisonMode={data.comparisonMode}
            referenceHardware={referenceHardware}
          />
        )}
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
        <OverviewMethodology
          strings={strings}
          comparisonMode={data.comparisonMode}
          referenceHardware={referenceHardware}
        />
        <OverviewModelScopeToggle
          modelScope={data.modelScope}
          tier={data.tier}
          engineScope={data.engineScope}
          comparisonMode={data.comparisonMode}
          referenceHardware={referenceHardware}
          locale={locale}
          strings={strings}
        />
      </OverviewMatrixCard>
    </section>
  );
}

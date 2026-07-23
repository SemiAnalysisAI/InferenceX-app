import { Card } from '@/components/ui/card';
import type { OverviewPageData } from '@/lib/overview-data';

import {
  DesktopOverviewMatrix,
  MobileOverviewList,
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
  const snapshot =
    data.datasetThroughDate === null
      ? null
      : strings.snapshot(formatters.shortDate(data.datasetThroughDate));

  return (
    <section className="flex flex-col gap-4">
      <Card>
        <header className="max-w-4xl">
          <h1 className="text-lg font-semibold mb-2">{strings.title}</h1>
          <p className="max-w-3xl text-sm text-muted-foreground">{strings.purpose}</p>
          <p className="mt-1.5 max-w-4xl text-xs leading-snug text-muted-foreground">
            {strings.scope(data.tier)}
          </p>
          {snapshot === null ? null : (
            <p className="mt-1 text-xs text-muted-foreground/80 tabular-nums">{snapshot}</p>
          )}
          <OverviewTierSwitcher tier={data.tier} locale={locale} strings={strings} />
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

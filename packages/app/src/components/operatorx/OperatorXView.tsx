'use client';

import { Card } from '@/components/ui/card';
import { Heading } from '@/components/ui/heading';
import { useOperatorXRuns } from '@/hooks/api/use-operatorx';

/** Placeholder while the OperatorX page is designed; the data layer and API are live. */
export default function OperatorXView() {
  const runs = useOperatorXRuns();
  return (
    <Card data-testid="operatorx-page">
      <Heading as="h1" level="section">
        OperatorX
      </Heading>
      <p className="mt-2 text-sm text-muted-foreground">
        {runs.isLoading
          ? 'Loading runs…'
          : runs.error
            ? runs.error.message
            : `${runs.data?.runs.length ?? 0} runs from ${runs.data?.source}`}
      </p>
    </Card>
  );
}

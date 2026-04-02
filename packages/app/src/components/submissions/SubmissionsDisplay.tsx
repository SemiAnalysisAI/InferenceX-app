'use client';

import { useEffect, useMemo } from 'react';

import { track } from '@/lib/analytics';
import { Card } from '@/components/ui/card';
import { useSubmissions } from '@/hooks/api/use-submissions';

import SubmissionsChart from './SubmissionsChart';
import SubmissionsTable from './SubmissionsTable';
import { computeTotalStats } from './submissions-utils';

export default function SubmissionsDisplay() {
  const { data, isLoading, error } = useSubmissions();

  useEffect(() => {
    track('submissions_page_viewed');
  }, []);

  const stats = useMemo(() => {
    if (!data?.summary) return null;
    return computeTotalStats(data.summary);
  }, [data?.summary]);

  if (error) {
    return (
      <Card>
        <p className="text-destructive text-sm">Failed to load submission data.</p>
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Stats summary */}
      {stats && (
        <section>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <StatCard label="Total Datapoints" value={stats.totalDatapoints.toLocaleString()} />
            <StatCard label="Unique Configs" value={stats.totalConfigs.toLocaleString()} />
            <StatCard label="NVIDIA Datapoints" value={stats.nvidiaDatapoints.toLocaleString()} />
            <StatCard
              label="Non-NVIDIA Datapoints"
              value={stats.nonNvidiaDatapoints.toLocaleString()}
            />
          </div>
        </section>
      )}

      {/* Activity chart */}
      <section>
        <Card>
          {isLoading ? (
            <div className="h-[300px] flex items-center justify-center text-muted-foreground text-sm">
              Loading chart data...
            </div>
          ) : data?.volume ? (
            <SubmissionsChart volume={data.volume} />
          ) : null}
        </Card>
      </section>

      {/* Submissions table */}
      <section>
        <Card>
          <div className="flex flex-col gap-4">
            <div>
              <h2 className="text-lg font-semibold mb-1">Benchmark Submissions</h2>
              <p className="text-muted-foreground text-sm">
                All benchmark configurations submitted to InferenceX. Click a row to expand for
                details.
              </p>
            </div>
            {isLoading ? (
              <div className="h-32 flex items-center justify-center text-muted-foreground text-sm">
                Loading submissions...
              </div>
            ) : data?.summary ? (
              <SubmissionsTable data={data.summary} />
            ) : null}
          </div>
        </Card>
      </section>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <Card className="p-4">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-2xl font-bold tabular-nums">{value}</p>
    </Card>
  );
}

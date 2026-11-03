'use client';

import type { ReactNode } from 'react';

import InferenceDashboard from '@/components/inference/inference-dashboard';
import { PowerXSurfaceProvider } from '@/components/inference/ui/powerx-surface';
import { PowerXFeatureGate } from '@/components/powerx/powerx-feature-gate';
import type { Locale } from '@/lib/i18n/i18n';

export default function PowerXDashboard({
  locale,
  children,
}: {
  locale: Locale;
  children: ReactNode;
}) {
  return (
    <PowerXFeatureGate locale={locale}>
      <PowerXSurfaceProvider>
        <InferenceDashboard activeTab="inference" />
      </PowerXSurfaceProvider>
      {children}
    </PowerXFeatureGate>
  );
}

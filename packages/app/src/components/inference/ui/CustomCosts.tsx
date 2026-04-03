'use client';

import { memo } from 'react';

import CustomGpuValuePanel from '@/components/inference/ui/CustomGpuValuePanel';

const CustomCosts = memo(({ loading }: { loading: boolean }) => {
  return <CustomGpuValuePanel loading={loading} kind="costs" />;
});

CustomCosts.displayName = 'CustomCosts';

export default CustomCosts;

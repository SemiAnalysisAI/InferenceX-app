'use client';

import { memo } from 'react';

import CustomGpuValuePanel from '@/components/inference/ui/CustomGpuValuePanel';

const CustomPowers = memo(({ loading }: { loading: boolean }) => (
  <CustomGpuValuePanel loading={loading} kind="powers" />
));

CustomPowers.displayName = 'CustomPowers';

export default CustomPowers;

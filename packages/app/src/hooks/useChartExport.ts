import { useCallback, useState } from 'react';

import type { ChartImageExportOptions } from '@/lib/export/chart-image-export';
import type { PngAspectRatio } from '@/lib/export/png-layout';
import { useLocale } from '@/lib/i18n/use-locale';
export type { PngAspectRatio } from '@/lib/export/png-layout';

const STRINGS = {
  en: { exportFailed: 'Failed to export image. Please try again.' },
  zh: { exportFailed: '图片导出失败，请重试。' },
};

export function useChartExport({
  chartId,
  setIsLegendExpanded,
  hideLegend = false,
  exportFileName,
}: ChartImageExportOptions) {
  const locale = useLocale();
  const t = STRINGS[locale];
  const [isExporting, setIsExporting] = useState(false);

  const exportToImage = useCallback(
    async (ratio: PngAspectRatio = 'auto') => {
      setIsExporting(true);
      try {
        const { exportChartImage } = await import('@/lib/export/chart-image-export');
        await exportChartImage(
          { chartId, setIsLegendExpanded, hideLegend, exportFileName },
          ratio,
          t.exportFailed,
        );
      } catch (error) {
        console.error('Error exporting image:', error);
        alert(t.exportFailed);
      } finally {
        setIsExporting(false);
      }
    },
    [chartId, setIsLegendExpanded, hideLegend, exportFileName, t],
  );

  return { isExporting, exportToImage };
}

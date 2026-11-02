import { isModelVisible } from '@/lib/catalog/data-mappings';
import {
  applyOverviewHardwareRowScope,
  applyOverviewRowScope,
  type OverviewPageData,
} from './overview-data';

/**
 * UI-only projection of a complete matrix. The requested scopes are retained
 * on `fullData`, but its rows must not already be narrowed by those scopes.
 * Filtering visibility first keeps both directions of each toggle accurate.
 */
export function overviewDataForModelVisibility(
  fullData: OverviewPageData,
  featureGateUnlocked: boolean,
): OverviewPageData {
  const visible = {
    ...fullData,
    models: fullData.models.filter((entry) => isModelVisible(entry.model, featureGateUnlocked)),
  };
  return applyOverviewHardwareRowScope(
    applyOverviewRowScope(visible, fullData.rowScope),
    fullData.hardwareRowScope,
  );
}

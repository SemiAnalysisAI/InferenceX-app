import { Card } from '@/components/ui/card';
import { CONTROL_HEIGHT } from '@/components/ui/control-styles';
import { Skeleton } from '@/components/ui/skeleton';
import { useLocale } from '@/lib/i18n/use-locale';

import { OperatorXHeader } from '../OperatorXHeader';

/** Loading state laid out like the loaded Model View: header and controls, then the diagram. */
export function ModelViewLoading() {
  return (
    <div
      className="flex flex-col gap-4"
      data-testid="operatorx-loading"
      aria-busy="true"
      aria-label={useLocale() === 'zh' ? '正在加载结果…' : 'Loading results…'}
    >
      <OperatorXHeader>
        <Skeleton aria-hidden="true" className={`${CONTROL_HEIGHT.default} mt-6 mb-3`} />
      </OperatorXHeader>
      <Card>
        <Skeleton aria-hidden="true" className="h-[600px]" />
      </Card>
    </div>
  );
}

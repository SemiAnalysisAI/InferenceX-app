import { Loader2 } from 'lucide-react';

import { Card } from '@/components/ui/card';
import { useLocale } from '@/lib/i18n/use-locale';

export function ModelViewLoading() {
  const locale = useLocale();
  return (
    <Card data-testid="operatorx-loading" className="min-h-80 items-center justify-center">
      <Loader2 className="size-6 animate-spin text-muted-foreground" />
      <p className="mt-3 text-sm text-muted-foreground">
        {locale === 'zh' ? '正在加载结果…' : 'Loading results…'}
      </p>
    </Card>
  );
}

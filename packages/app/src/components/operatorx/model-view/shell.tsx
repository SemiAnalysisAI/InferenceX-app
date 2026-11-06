import { Loader2 } from 'lucide-react';

import { Card } from '@/components/ui/card';

export const DEFAULT_MODEL = 'DeepSeek-R1-0528';

export function ModelViewLoading() {
  return (
    <Card data-testid="operatorx-loading" className="min-h-80 items-center justify-center">
      <Loader2 className="size-6 animate-spin text-muted-foreground" />
      <p className="mt-3 text-sm text-muted-foreground">Loading results…</p>
    </Card>
  );
}

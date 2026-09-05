import { WhitepaperIndexContent } from '@/components/whitepaper/whitepaper-index-content';
import { whitepaperIndexMetadata } from '@/lib/whitepapers';

export const metadata = whitepaperIndexMetadata('zh');

export default function ZhWhitepaperIndexPage() {
  return <WhitepaperIndexContent locale="zh" />;
}

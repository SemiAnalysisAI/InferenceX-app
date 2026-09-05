import { WhitepaperIndexContent } from '@/components/whitepaper/whitepaper-index-content';
import { whitepaperIndexMetadata } from '@/lib/whitepapers';

export const metadata = whitepaperIndexMetadata('en');

export default function WhitepaperIndexPage() {
  return <WhitepaperIndexContent locale="en" />;
}

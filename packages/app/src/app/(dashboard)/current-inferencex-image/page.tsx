import { CurrentImageContent } from '@/components/latest-image/latest-image-content';
import { tabMetadata } from '@/lib/tab-meta';

export const metadata = tabMetadata('current-inferencex-image');

export default function CurrentInferenceXImagePage() {
  return <CurrentImageContent />;
}

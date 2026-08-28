import { CompareRouteSkeleton } from '@/components/motion/route-skeletons';

// Streams instantly on navigation while comparison data loads; the header
// stays mounted and interactive.
export default function CompareLoading() {
  return <CompareRouteSkeleton />;
}

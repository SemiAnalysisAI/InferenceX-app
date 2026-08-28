import { CompareDetailRouteSkeleton } from '@/components/motion/route-skeletons';

// Streams instantly on navigation while the comparison's benchmark payload
// loads; mirrors the detail page's heading + chart structure.
export default function CompareDetailLoading() {
  return <CompareDetailRouteSkeleton />;
}

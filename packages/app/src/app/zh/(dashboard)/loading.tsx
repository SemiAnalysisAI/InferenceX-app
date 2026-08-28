import { DashboardRouteSkeleton } from '@/components/motion/route-skeletons';

// Streams instantly on navigation while the route's server payload loads;
// the header and tab rail above stay mounted and interactive.
export default function DashboardLoading() {
  return <DashboardRouteSkeleton />;
}

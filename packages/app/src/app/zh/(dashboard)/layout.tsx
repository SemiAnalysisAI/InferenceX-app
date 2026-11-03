import { LazyDashboardShell } from '@/components/dashboard/lazy-dashboard-shell';

export default function ZhDashboardLayout({ children }: { children: React.ReactNode }) {
  return <LazyDashboardShell>{children}</LazyDashboardShell>;
}

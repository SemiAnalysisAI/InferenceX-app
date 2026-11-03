import { LazyDashboardShell } from '@/components/dashboard/lazy-dashboard-shell';

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return <LazyDashboardShell>{children}</LazyDashboardShell>;
}

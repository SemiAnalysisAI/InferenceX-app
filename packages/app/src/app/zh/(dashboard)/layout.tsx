import { DashboardShell } from '@/components/dashboard/dashboard-shell';

export default function ZhDashboardLayout({ children }: { children: React.ReactNode }) {
  return <DashboardShell>{children}</DashboardShell>;
}

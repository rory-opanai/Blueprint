import { AppShell } from "@/components/app-shell";
import { DashboardClient } from "@/components/dashboard-client";

export default function DashboardPage() {
  return (
    <AppShell>
      <section className="page-header">
        <h2>Command Center</h2>
        <p>Monitor active opportunities, review TAS coverage, and push updates with minimal admin overhead.</p>
      </section>
      <DashboardClient />
    </AppShell>
  );
}

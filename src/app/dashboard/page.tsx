import { AppShell } from "@/components/app-shell";
import { DashboardClient } from "@/components/dashboard-client";

export default function DashboardPage() {
  return (
    <AppShell>
      <section className="page-header">
        <h2>Deal Workspace Index</h2>
        <p>Track deals, create new cards, and jump into a deal to ingest context with LLM-to-TAS mapping.</p>
      </section>
      <DashboardClient />
    </AppShell>
  );
}

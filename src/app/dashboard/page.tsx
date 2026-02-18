import { AppShell } from "@/components/app-shell";
import { DashboardClient } from "@/components/dashboard-client";

export default function DashboardPage() {
  return (
    <AppShell>
      <section className="page-header">
        <h2>Command Center</h2>
        <p>
          Pull live deals from Salesforce, enrich from Gmail/Slack/Gong/GTM Agent, and create new cards when needed.
        </p>
      </section>
      <DashboardClient />
    </AppShell>
  );
}

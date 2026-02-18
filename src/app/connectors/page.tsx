import { AppShell } from "@/components/app-shell";
import { ConnectorsClient } from "@/components/connectors-client";

export default function ConnectorsPage() {
  return (
    <AppShell>
      <section className="page-header">
        <h2>Connectors</h2>
        <p>
          Connection checks run automatically when this page is viewed. Missing connectors need credentials before
          deals can be enriched.
        </p>
      </section>
      <ConnectorsClient />
    </AppShell>
  );
}

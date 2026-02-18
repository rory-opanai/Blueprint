import { AppShell } from "@/components/app-shell";
import { ConnectorsClient } from "@/components/connectors-client";

export default async function ConnectorsPage({
  searchParams
}: {
  searchParams: Promise<{ connected?: string; error?: string }>;
}) {
  const { connected, error } = await searchParams;

  return (
    <AppShell>
      <section className="page-header">
        <h2>Connectors</h2>
        <p>
          Connect your own Salesforce, Gmail, Slack, Gong, and GTM Agent accounts. Checks run automatically on open,
          and Slack channel subscriptions control two-way deal updates.
        </p>
      </section>
      <ConnectorsClient connectedProvider={connected} oauthError={error} />
    </AppShell>
  );
}

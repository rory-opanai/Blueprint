"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { ConnectorAccountView, ConnectorProvider, SlackChannelSubscriptionView } from "@/lib/types";

type ConnectorResponse = {
  checkedAt?: string;
  data?: ConnectorAccountView[];
  slackChannels?: SlackChannelSubscriptionView[];
  error?: string;
};

type ManualSalesforceTokenPayload = {
  instanceUrl: string;
  accessToken: string;
  refreshToken?: string;
};

const PROVIDER_ORDER: ConnectorProvider[] = ["salesforce", "gmail", "slack", "gong", "gtm_agent"];

function providerLabel(provider: ConnectorProvider): string {
  if (provider === "gtm_agent") return "GTM Agent";
  return provider.charAt(0).toUpperCase() + provider.slice(1);
}

function actionLabel(row: ConnectorAccountView): string {
  if (row.action === "connect") return "Connect";
  if (row.action === "reconnect") return "Reconnect";
  if (row.action === "configure_channel") return "Configure Channel";
  return "Disconnect";
}

function statusLabel(status: ConnectorAccountView["status"]): string {
  if (status === "connected") return "Connected";
  if (status === "configured") return "Configured";
  if (status === "degraded") return "Needs Attention";
  if (status === "expired") return "Needs Reauth";
  return "Not Connected";
}

export function ConnectorsClient({
  connectedProvider,
  oauthError
}: {
  connectedProvider?: string;
  oauthError?: string;
}) {
  const [rows, setRows] = useState<ConnectorAccountView[]>([]);
  const [channels, setChannels] = useState<SlackChannelSubscriptionView[]>([]);
  const [checkedAt, setCheckedAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [workingProvider, setWorkingProvider] = useState<ConnectorProvider | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [channelId, setChannelId] = useState("");
  const [channelName, setChannelName] = useState("");
  const [savingChannel, setSavingChannel] = useState(false);

  const [showSalesforceManualToken, setShowSalesforceManualToken] = useState(false);
  const [manualToken, setManualToken] = useState<ManualSalesforceTokenPayload>({
    instanceUrl: "",
    accessToken: "",
    refreshToken: ""
  });
  const [savingManualToken, setSavingManualToken] = useState(false);

  useEffect(() => {
    void loadConnectors(true);
    const timer = setInterval(() => {
      void loadConnectors(true);
    }, 60_000);
    return () => clearInterval(timer);
  }, []);

  async function loadConnectors(withProbe: boolean) {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/connectors?probe=${withProbe ? "true" : "false"}`, {
        cache: "no-store"
      });
      const payload = (await response.json()) as ConnectorResponse;
      if (!response.ok) {
        throw new Error(payload.error ?? "Unable to load connectors.");
      }

      const indexed = new Map((payload.data ?? []).map((row) => [row.connectorType, row]));
      const ordered = PROVIDER_ORDER.map((provider) => indexed.get(provider)).filter(
        (value): value is ConnectorAccountView => Boolean(value)
      );
      setRows(ordered);
      setChannels(payload.slackChannels ?? []);
      setCheckedAt(payload.checkedAt ?? new Date().toISOString());
    } catch (cause) {
      setRows([]);
      setChannels([]);
      setError(cause instanceof Error ? cause.message : "Unable to load connectors.");
    } finally {
      setLoading(false);
    }
  }

  async function handleProviderAction(row: ConnectorAccountView) {
    if (row.action === "configure_channel") {
      const channelInput = document.getElementById("channelId");
      channelInput?.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }

    setWorkingProvider(row.connectorType);
    setError(null);
    try {
      if (row.action === "disconnect") {
        const response = await fetch(`/api/connectors/${row.connectorType}/disconnect`, {
          method: "POST"
        });
        const payload = (await response.json()) as { error?: string };
        if (!response.ok) {
          throw new Error(payload.error ?? `Unable to disconnect ${row.connectorType}.`);
        }
        await loadConnectors(true);
        return;
      }

      const response = await fetch(`/api/connectors/${row.connectorType}/connect/start`, {
        method: "POST"
      });
      const payload = (await response.json()) as {
        error?: string;
        data?: { redirectUrl?: string };
      };
      if (!response.ok) {
        throw new Error(payload.error ?? `Unable to connect ${row.connectorType}.`);
      }

      if (payload.data?.redirectUrl) {
        window.location.assign(payload.data.redirectUrl);
        return;
      }

      await loadConnectors(true);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : `Unable to update ${row.connectorType}.`);
    } finally {
      setWorkingProvider(null);
    }
  }

  async function handleAddSlackChannel(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!channelId.trim()) return;

    setSavingChannel(true);
    setError(null);
    try {
      const response = await fetch("/api/connectors/slack/channels", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          channelId: channelId.trim(),
          channelName: channelName.trim() || undefined
        })
      });
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) {
        throw new Error(payload.error ?? "Unable to bind Slack channel.");
      }

      setChannelId("");
      setChannelName("");
      await loadConnectors(true);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to bind Slack channel.");
    } finally {
      setSavingChannel(false);
    }
  }

  async function handleRemoveSlackChannel(id: string) {
    setSavingChannel(true);
    setError(null);
    try {
      const response = await fetch(`/api/connectors/slack/channels/${id}`, {
        method: "DELETE"
      });
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) {
        throw new Error(payload.error ?? "Unable to remove Slack channel.");
      }
      await loadConnectors(true);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to remove Slack channel.");
    } finally {
      setSavingChannel(false);
    }
  }

  async function handleSaveManualSalesforceToken(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSavingManualToken(true);
    setError(null);

    try {
      const response = await fetch("/api/connectors/salesforce/manual-token", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          instanceUrl: manualToken.instanceUrl.trim(),
          accessToken: manualToken.accessToken.trim(),
          refreshToken: manualToken.refreshToken?.trim() || undefined
        })
      });
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) {
        throw new Error(payload.error ?? "Unable to save Salesforce token.");
      }

      setManualToken({
        instanceUrl: "",
        accessToken: "",
        refreshToken: ""
      });
      setShowSalesforceManualToken(false);
      await loadConnectors(true);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to save Salesforce token.");
    } finally {
      setSavingManualToken(false);
    }
  }

  const connectedCount = useMemo(
    () => rows.filter((row) => row.status === "connected").length,
    [rows]
  );
  const readyCount = useMemo(
    () => rows.filter((row) => row.status === "connected" || row.status === "configured").length,
    [rows]
  );
  return (
    <div className="dashboard-stack">
      <section className="card">
        <h3>Connector Status</h3>
        <p>
          Auto-check runs when this page opens. Connected now: {connectedCount}/{rows.length}. Ready (configured or
          connected): {readyCount}/{rows.length}.
        </p>
        <div className="actions">
          <button type="button" onClick={() => void loadConnectors(true)} disabled={loading}>
            {loading ? "Checking..." : "Re-check Connectors"}
          </button>
          <button type="button" onClick={() => void loadConnectors(false)} disabled={loading}>
            Load Config Only
          </button>
        </div>
        {checkedAt ? <small>Last checked: {new Date(checkedAt).toLocaleString()}</small> : null}
      </section>

      {connectedProvider ? <p className="success-banner">{providerLabel(connectedProvider as ConnectorProvider)} connected.</p> : null}
      {oauthError ? <p className="error-banner">{oauthError}</p> : null}
      {error ? <p className="error-banner">{error}</p> : null}

      <section className="card connector-legend">
        <strong>Status legend</strong>
        <div className="chips">
          <span className="status-badge status-connected">Connected</span>
          <span className="status-badge status-expired">Needs Reauth</span>
          <span className="status-badge status-degraded">Missing Workspace Prereq</span>
          <span className="status-badge status-missing_config">Channel Not Bound / Not Connected</span>
        </div>
      </section>

      <section className="connector-grid connector-grid-wide">
        {rows.map((row) => (
          <article key={row.connectorType} className="connector-item connector-item-wide">
            <div className="connector-header">
              <strong>{providerLabel(row.connectorType)}</strong>
              <span className={`status-badge status-${row.status}`}>{statusLabel(row.status)}</span>
            </div>

            <div className="connector-meta">
              {row.mode ? <small>Mode: {row.mode}</small> : null}
              {row.lastCheckedAt ? <small>Checked: {new Date(row.lastCheckedAt).toLocaleTimeString()}</small> : null}
            </div>

            {row.details ? <p>{row.details}</p> : null}
            {row.isWorkspaceException ? <p>Workspace-secret connector. User action enables this source.</p> : null}

            <div className="actions">
              <button
                type="button"
                disabled={workingProvider === row.connectorType}
                onClick={() => void handleProviderAction(row)}
              >
                {workingProvider === row.connectorType ? "Working..." : actionLabel(row)}
              </button>

              {row.connectorType === "salesforce" &&
              (row.action === "connect" || row.action === "reconnect") ? (
                <button type="button" onClick={() => setShowSalesforceManualToken((current) => !current)}>
                  {showSalesforceManualToken ? "Hide Manual Token" : "Use Manual Token"}
                </button>
              ) : null}
            </div>
          </article>
        ))}
      </section>

      {showSalesforceManualToken ? (
        <section className="card">
          <h3>Salesforce Manual Token</h3>
          <form className="create-form" onSubmit={handleSaveManualSalesforceToken}>
            <label>
              Instance URL
              <input
                value={manualToken.instanceUrl}
                onChange={(event) =>
                  setManualToken((current) => ({ ...current, instanceUrl: event.target.value }))
                }
                placeholder="https://your-instance.my.salesforce.com"
                required
              />
            </label>
            <label>
              Access Token
              <input
                value={manualToken.accessToken}
                onChange={(event) =>
                  setManualToken((current) => ({ ...current, accessToken: event.target.value }))
                }
                placeholder="00D..."
                required
              />
            </label>
            <label>
              Refresh Token (optional)
              <input
                value={manualToken.refreshToken}
                onChange={(event) =>
                  setManualToken((current) => ({ ...current, refreshToken: event.target.value }))
                }
                placeholder="optional"
              />
            </label>
            <button type="submit" disabled={savingManualToken}>
              {savingManualToken ? "Saving..." : "Save Token"}
            </button>
          </form>
        </section>
      ) : null}

      <section className="card">
        <h3>Slack Channel Binding</h3>
        <p>
          Register one or more `Blueprint-*` channels. The app ingests updates from subscribed channels and maps root
          posts tagged `deal:&lt;opportunityId&gt;`.
        </p>
        <form className="create-form" onSubmit={handleAddSlackChannel}>
          <label htmlFor="channelId">
            Channel ID
            <input
              id="channelId"
              value={channelId}
              onChange={(event) => setChannelId(event.target.value)}
              placeholder="C0123456789"
              required
            />
          </label>
          <label>
            Display Name (optional)
            <input
              value={channelName}
              onChange={(event) => setChannelName(event.target.value)}
              placeholder="#blueprint-deals"
            />
          </label>
          <button type="submit" disabled={savingChannel}>
            {savingChannel ? "Saving..." : "Add Channel"}
          </button>
        </form>

        {channels.length === 0 ? (
          <p>No channels registered yet.</p>
        ) : (
          <div className="connector-grid">
            {channels.map((channel) => (
              <article key={channel.id} className="connector-item">
                <strong>{channel.channelName || channel.channelId}</strong>
                <small>{channel.channelId}</small>
                <small>Added {new Date(channel.createdAt).toLocaleDateString()}</small>
                <button type="button" onClick={() => void handleRemoveSlackChannel(channel.id)} disabled={savingChannel}>
                  Remove
                </button>
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

"use client";

import { useEffect, useMemo, useState } from "react";

type ConnectorStatus = "missing_config" | "configured" | "connected" | "degraded";

type ConnectorHealthRow = {
  connectorType: "salesforce" | "gmail" | "slack" | "gong" | "gtm_agent";
  status: ConnectorStatus;
  mode?: string;
  details?: string;
  lastIngestedAt?: string;
};

type ConnectorResponse = {
  checkedAt?: string;
  data?: ConnectorHealthRow[];
};

const CONNECTOR_SETUP_HINTS: Record<ConnectorHealthRow["connectorType"], string> = {
  salesforce: "Set SALESFORCE_INSTANCE_URL + SALESFORCE_ACCESS_TOKEN.",
  gmail: "Set GOOGLE_GMAIL_ACCESS_TOKEN.",
  slack: "Set SLACK_USER_TOKEN or SLACK_BOT_TOKEN, and optionally SLACK_SIGNING_SECRET for events.",
  gong: "Set GONG_ACCESS_KEY + GONG_ACCESS_KEY_SECRET.",
  gtm_agent: "Set GTM_AGENT_BASE_URL and optional GTM_AGENT_API_KEY."
};

function connectorLabel(type: ConnectorHealthRow["connectorType"]): string {
  if (type === "gtm_agent") return "GTM Agent";
  return type.charAt(0).toUpperCase() + type.slice(1);
}

function statusLabel(status: ConnectorStatus): string {
  if (status === "connected") return "Connected";
  if (status === "configured") return "Configured";
  if (status === "degraded") return "Check Credentials";
  return "Missing Config";
}

export function ConnectorsClient() {
  const [rows, setRows] = useState<ConnectorHealthRow[]>([]);
  const [checkedAt, setCheckedAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void loadHealth(true);

    const timer = setInterval(() => {
      void loadHealth(true);
    }, 60_000);

    return () => clearInterval(timer);
  }, []);

  async function loadHealth(withProbe: boolean) {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch(
        withProbe ? "/api/connector-health?probe=true" : "/api/connector-health",
        { cache: "no-store" }
      );
      const payload = (await response.json()) as ConnectorResponse;
      if (!response.ok) {
        throw new Error("Unable to load connector health");
      }

      setRows(payload.data ?? []);
      setCheckedAt(payload.checkedAt ?? new Date().toISOString());
    } catch (cause) {
      setRows([]);
      setError(cause instanceof Error ? cause.message : "Unable to load connector health");
    } finally {
      setLoading(false);
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
          Auto-check runs when this page opens. Connected now: {connectedCount}/{rows.length}. Ready (configured
          or connected): {readyCount}/{rows.length}.
        </p>
        <div className="actions">
          <button type="button" onClick={() => void loadHealth(true)} disabled={loading}>
            {loading ? "Checking..." : "Re-check Connectors"}
          </button>
          <button type="button" onClick={() => void loadHealth(false)} disabled={loading}>
            Load Config Only
          </button>
        </div>
        {checkedAt ? <small>Last checked: {new Date(checkedAt).toLocaleString()}</small> : null}
      </section>

      {error ? <p className="error-banner">{error}</p> : null}

      <section className="connector-grid connector-grid-wide">
        {rows.map((row) => (
          <article key={row.connectorType} className="connector-item connector-item-wide">
            <div className="connector-header">
              <strong>{connectorLabel(row.connectorType)}</strong>
              <span className={`status-badge status-${row.status}`}>{statusLabel(row.status)}</span>
            </div>

            <div className="connector-meta">
              {row.mode ? <small>Mode: {row.mode}</small> : null}
              {row.lastIngestedAt ? (
                <small>Checked: {new Date(row.lastIngestedAt).toLocaleTimeString()}</small>
              ) : null}
            </div>

            {row.details ? <p>{row.details}</p> : null}
            {row.status === "missing_config" ? <p>{CONNECTOR_SETUP_HINTS[row.connectorType]}</p> : null}
          </article>
        ))}
      </section>
    </div>
  );
}

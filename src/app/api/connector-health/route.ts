import { NextResponse } from "next/server";
import { isSalesforceEnabled, probeSalesforceConnection } from "@/lib/connectors/salesforce";
import { isGmailEnabled, probeGmailConnection } from "@/lib/integrations/gmail";
import {
  isSlackEnabled,
  isSlackEventsEnabled,
  isSlackSearchEnabled,
  probeSlackConnection
} from "@/lib/integrations/slack";
import { isGongEnabled, probeGongConnection } from "@/lib/connectors/gong";
import { isGtmAgentEnabled, probeGtmAgentConnection } from "@/lib/integrations/gtm-agent";

type ConnectorHealthRow = {
  connectorType: "salesforce" | "gmail" | "slack" | "gong" | "gtm_agent";
  status: "missing_config" | "configured" | "connected" | "degraded";
  mode?: string;
  details?: string;
  lastIngestedAt: string;
};

function slackMode(): "search+events" | "events_only" | "search_only" | "disabled" {
  if (isSlackSearchEnabled() && isSlackEventsEnabled()) return "search+events";
  if (isSlackEventsEnabled()) return "events_only";
  if (isSlackSearchEnabled()) return "search_only";
  return "disabled";
}

async function buildHealthRows(withProbe: boolean, checkedAt: string): Promise<ConnectorHealthRow[]> {
  if (!withProbe) {
    return [
      {
        connectorType: "salesforce",
        status: isSalesforceEnabled() ? "configured" : "missing_config",
        lastIngestedAt: checkedAt
      },
      {
        connectorType: "gmail",
        status: isGmailEnabled() ? "configured" : "missing_config",
        lastIngestedAt: checkedAt
      },
      {
        connectorType: "slack",
        status: isSlackEnabled() ? "configured" : "missing_config",
        mode: slackMode(),
        lastIngestedAt: checkedAt
      },
      {
        connectorType: "gong",
        status: isGongEnabled() ? "configured" : "missing_config",
        lastIngestedAt: checkedAt
      },
      {
        connectorType: "gtm_agent",
        status: isGtmAgentEnabled() ? "configured" : "missing_config",
        lastIngestedAt: checkedAt
      }
    ];
  }

  const [salesforceProbe, gmailProbe, slackProbe, gongProbe, gtmProbe] = await Promise.all([
    probeSalesforceConnection(),
    probeGmailConnection(),
    probeSlackConnection(),
    probeGongConnection(),
    probeGtmAgentConnection()
  ]);

  return [
    {
      connectorType: "salesforce",
      status: isSalesforceEnabled()
        ? salesforceProbe.connected
          ? "connected"
          : "degraded"
        : "missing_config",
      details: salesforceProbe.message,
      lastIngestedAt: checkedAt
    },
    {
      connectorType: "gmail",
      status: isGmailEnabled() ? (gmailProbe.connected ? "connected" : "degraded") : "missing_config",
      details: gmailProbe.message,
      lastIngestedAt: checkedAt
    },
    {
      connectorType: "slack",
      status: isSlackEnabled() ? (slackProbe.connected ? "connected" : "degraded") : "missing_config",
      mode: slackProbe.mode,
      details: slackProbe.message,
      lastIngestedAt: checkedAt
    },
    {
      connectorType: "gong",
      status: isGongEnabled() ? (gongProbe.connected ? "connected" : "degraded") : "missing_config",
      details: gongProbe.message,
      lastIngestedAt: checkedAt
    },
    {
      connectorType: "gtm_agent",
      status: isGtmAgentEnabled() ? (gtmProbe.connected ? "connected" : "degraded") : "missing_config",
      details: gtmProbe.message,
      lastIngestedAt: checkedAt
    }
  ];
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const withProbe = searchParams.get("probe") === "true";
  const checkedAt = new Date().toISOString();
  const rows = await buildHealthRows(withProbe, checkedAt);

  return NextResponse.json({
    checkedAt,
    probe: withProbe,
    data: rows
  });
}

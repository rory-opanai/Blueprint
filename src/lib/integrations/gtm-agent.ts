import { DealSignal, SourceSignalQuery } from "@/lib/types";
import { fetchJson } from "@/lib/integrations/http";

type GtmSignalResponse = {
  total?: number;
  signals?: Array<{
    summary?: string;
    link?: string;
    timestamp?: string;
  }>;
  items?: Array<{
    summary?: string;
    link?: string;
    timestamp?: string;
  }>;
};

function gtmConfig(): { baseUrl: string; apiKey?: string } | null {
  const baseUrl = process.env.GTM_AGENT_BASE_URL;
  if (!baseUrl) return null;
  return { baseUrl, apiKey: process.env.GTM_AGENT_API_KEY };
}

export function isGtmAgentEnabled(): boolean {
  return Boolean(gtmConfig());
}

export async function probeGtmAgentConnection(): Promise<{ connected: boolean; message?: string }> {
  const config = gtmConfig();
  if (!config) {
    return { connected: false, message: "Missing GTM_AGENT_BASE_URL." };
  }

  const baseUrl = config.baseUrl.replace(/\/$/, "");
  const headers = {
    ...(config.apiKey ? { authorization: `Bearer ${config.apiKey}` } : {})
  };

  const paths = ["/health", "/status", ""];

  for (const path of paths) {
    try {
      const response = await fetch(`${baseUrl}${path}`, { headers });
      if (response.ok) {
        return { connected: true };
      }
    } catch {
      // Continue probing alternate endpoints.
    }
  }

  return {
    connected: false,
    message: "Unable to reach GTM Agent health/status endpoint."
  };
}

export async function fetchGtmAgentSignal(query: SourceSignalQuery): Promise<DealSignal | null> {
  const config = gtmConfig();
  if (!config) return null;

  try {
    const response = await fetchJson<GtmSignalResponse>(`${config.baseUrl.replace(/\/$/, "")}/deals/signals`, {
      method: "POST",
      headers: {
        ...(config.apiKey ? { authorization: `Bearer ${config.apiKey}` } : {})
      },
      body: JSON.stringify(query)
    });

    const rows = (response.signals ?? response.items ?? []).slice(0, 10);
    if (rows.length === 0) return null;

    const sorted = rows
      .map((row) => ({ ...row, ts: Date.parse(row.timestamp ?? "") || 0 }))
      .sort((a, b) => b.ts - a.ts);

    return {
      source: "gtm_agent",
      totalMatches: response.total ?? rows.length,
      highlights: sorted
        .map((row) => row.summary)
        .filter((summary): summary is string => Boolean(summary))
        .slice(0, 3),
      deepLinks: sorted
        .map((row) => row.link)
        .filter((link): link is string => Boolean(link))
        .slice(0, 3),
      lastActivityAt: sorted[0]?.ts ? new Date(sorted[0].ts).toISOString() : undefined
    };
  } catch (error) {
    console.error("gtm agent integration failed", error);
    return null;
  }
}

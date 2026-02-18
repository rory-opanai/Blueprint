import { DealSignal, SourceSignalQuery } from "@/lib/types";
import { fetchJson } from "@/lib/integrations/http";

type GongSearchResponse = {
  calls?: Array<{
    id?: string;
    title?: string;
    url?: string;
    started?: string;
    startedAt?: string;
    snippet?: string;
  }>;
  records?: Array<{
    id?: string;
    title?: string;
    url?: string;
    started?: string;
    snippet?: string;
  }>;
};

function gongCredentials(): { key: string; secret: string; baseUrl: string } | null {
  const key = process.env.GONG_ACCESS_KEY;
  const secret = process.env.GONG_ACCESS_KEY_SECRET;
  const baseUrl = process.env.GONG_API_BASE_URL ?? "https://api.gong.io";
  if (!key || !secret) return null;
  return { key, secret, baseUrl };
}

function gongAuthHeader(key: string, secret: string): string {
  return `Basic ${Buffer.from(`${key}:${secret}`).toString("base64")}`;
}

function summarize(items: GongSearchResponse["calls"]): DealSignal | null {
  const rows = items ?? [];
  if (rows.length === 0) return null;

  const sorted = rows
    .map((row) => ({ ...row, ts: Date.parse(row.startedAt ?? row.started ?? "") || 0 }))
    .sort((a, b) => b.ts - a.ts);

  return {
    source: "gong",
    totalMatches: rows.length,
    highlights: sorted
      .map((row) => row.snippet ?? row.title)
      .filter((text): text is string => Boolean(text))
      .slice(0, 3),
    deepLinks: sorted
      .map((row) => row.url)
      .filter((url): url is string => Boolean(url))
      .slice(0, 3),
    lastActivityAt: sorted[0]?.ts ? new Date(sorted[0].ts).toISOString() : undefined
  };
}

export function isGongEnabled(): boolean {
  return Boolean(gongCredentials());
}

export async function probeGongConnection(): Promise<{ connected: boolean; message?: string }> {
  const creds = gongCredentials();
  if (!creds) {
    return { connected: false, message: "Missing GONG_ACCESS_KEY or GONG_ACCESS_KEY_SECRET." };
  }

  const auth = gongAuthHeader(creds.key, creds.secret);

  try {
    await fetchJson<GongSearchResponse>(`${creds.baseUrl}/v2/calls/extensive`, {
      method: "POST",
      headers: {
        authorization: auth
      },
      body: JSON.stringify({
        filter: {
          fromDateTime: new Date(Date.now() - 1000 * 60 * 60 * 24 * 7).toISOString(),
          toDateTime: new Date().toISOString()
        },
        limit: 1
      })
    });

    return { connected: true };
  } catch (error) {
    return {
      connected: false,
      message: error instanceof Error ? error.message : "Gong probe failed"
    };
  }
}

export async function fetchGongSignal(query: SourceSignalQuery): Promise<DealSignal | null> {
  const creds = gongCredentials();
  if (!creds) return null;

  const customEndpoint = process.env.GONG_SIGNAL_ENDPOINT;
  const auth = gongAuthHeader(creds.key, creds.secret);

  try {
    if (customEndpoint) {
      const custom = await fetchJson<GongSearchResponse>(
        `${customEndpoint}?account=${encodeURIComponent(query.accountName)}&deal=${encodeURIComponent(
          query.opportunityName
        )}`,
        { headers: { authorization: auth } }
      );
      return summarize(custom.calls ?? custom.records);
    }

    const body = {
      filter: {
        fromDateTime: new Date(Date.now() - 1000 * 60 * 60 * 24 * 180).toISOString(),
        toDateTime: new Date().toISOString(),
        companyName: query.accountName
      },
      limit: 6
    };

    const response = await fetchJson<GongSearchResponse>(`${creds.baseUrl}/v2/calls/extensive`, {
      method: "POST",
      headers: {
        authorization: auth
      },
      body: JSON.stringify(body)
    });

    return summarize(response.calls ?? response.records);
  } catch (error) {
    console.error("gong integration failed", error);
    return null;
  }
}

export async function ingestGongEvidence(opportunityId: string) {
  const signal = await fetchGongSignal({
    accountName: opportunityId,
    opportunityName: opportunityId
  });

  return {
    opportunityId,
    lastIngestedAt: new Date().toISOString(),
    evidenceCount: signal?.totalMatches ?? 0,
    calls: signal?.deepLinks.map((deepLink, idx) => ({
      callId: `gong-${idx + 1}`,
      participants: [],
      deepLinks: [deepLink]
    })) ?? []
  };
}

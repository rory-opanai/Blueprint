import crypto from "node:crypto";
import { DealSignal, SourceSignalQuery } from "@/lib/types";
import { fetchJson } from "@/lib/integrations/http";
import { fetchSlackContextSignal, slackPermalink } from "@/lib/storage/slackUpdates";

type SlackSearchResponse = {
  ok: boolean;
  error?: string;
  messages?: {
    total?: number;
    matches?: Array<{
      text?: string;
      permalink?: string;
      ts?: string;
    }>;
  };
};

function slackToken(): string | undefined {
  return process.env.SLACK_USER_TOKEN ?? process.env.SLACK_BOT_TOKEN;
}

export function isSlackSearchEnabled(): boolean {
  return Boolean(slackToken());
}

export function isSlackEnabled(): boolean {
  return Boolean(isSlackSearchEnabled() || process.env.SLACK_SIGNING_SECRET);
}

export function isSlackEventsEnabled(): boolean {
  return Boolean(process.env.SLACK_SIGNING_SECRET);
}

export function slackTargetChannelId(): string | undefined {
  return process.env.SLACK_DEAL_UPDATES_CHANNEL_ID;
}

export function verifySlackSignature(
  rawBody: string,
  timestamp: string | null,
  signature: string | null
): boolean {
  const signingSecret = process.env.SLACK_SIGNING_SECRET;
  if (!signingSecret || !timestamp || !signature) return false;

  const epoch = Number(timestamp);
  if (!Number.isFinite(epoch)) return false;

  const ageSeconds = Math.abs(Math.floor(Date.now() / 1000) - epoch);
  if (ageSeconds > 60 * 5) return false;

  const base = `v0:${timestamp}:${rawBody}`;
  const expected = `v0=${crypto
    .createHmac("sha256", signingSecret)
    .update(base)
    .digest("hex")}`;

  const expectedBuffer = Buffer.from(expected);
  const signatureBuffer = Buffer.from(signature);
  if (expectedBuffer.length !== signatureBuffer.length) return false;

  return crypto.timingSafeEqual(expectedBuffer, signatureBuffer);
}

export function extractDealReference(text: string): string | undefined {
  const match = text.match(/\b(?:deal|opp|opportunity)\s*[:#-]\s*([a-z0-9-]+)/i);
  return match?.[1];
}

export function extractNamedField(
  text: string,
  field: "account" | "opportunity"
): string | undefined {
  const match = text.match(new RegExp(`\\b${field}\\s*:\\s*([^\\n|]+)`, "i"));
  return match?.[1]?.trim();
}

export function buildSlackPermalink(channelId: string, messageTs: string): string {
  return slackPermalink(channelId, messageTs);
}

export async function probeSlackConnection(): Promise<{
  connected: boolean;
  mode: "search+events" | "events_only" | "search_only" | "disabled";
  message?: string;
}> {
  const token = slackToken();
  const eventsEnabled = isSlackEventsEnabled();

  const mode: "search+events" | "events_only" | "search_only" | "disabled" =
    token && eventsEnabled
      ? "search+events"
      : eventsEnabled
        ? "events_only"
        : token
          ? "search_only"
          : "disabled";

  if (!token && !eventsEnabled) {
    return { connected: false, mode, message: "Missing Slack token and SLACK_SIGNING_SECRET." };
  }

  // Events-only mode can ingest Slack channel updates without outbound API calls.
  if (!token && eventsEnabled) {
    return { connected: true, mode };
  }

  try {
    const response = await fetch("https://slack.com/api/auth.test", {
      headers: {
        authorization: `Bearer ${token}`
      }
    });

    if (!response.ok) {
      return {
        connected: false,
        mode,
        message: `Slack auth probe failed (${response.status}).`
      };
    }

    const payload = (await response.json()) as { ok?: boolean; error?: string };
    if (!payload.ok) {
      return {
        connected: false,
        mode,
        message: payload.error ?? "Slack auth probe failed."
      };
    }

    return { connected: true, mode };
  } catch (error) {
    return {
      connected: false,
      mode,
      message: error instanceof Error ? error.message : "Slack probe failed"
    };
  }
}

export async function fetchSlackSignal(query: SourceSignalQuery): Promise<DealSignal | null> {
  const token = slackToken();
  const contextSignal = await fetchSlackContextSignal(query);
  if (!token) return contextSignal;

  const slackQuery = `${query.opportunityName} OR ${query.accountName}`;

  try {
    const response = await fetchJson<SlackSearchResponse>(
      `https://slack.com/api/search.messages?query=${encodeURIComponent(slackQuery)}&count=5&sort=timestamp&sort_dir=desc`,
      {
        headers: {
          authorization: `Bearer ${token}`
        }
      }
    );

    if (!response.ok) {
      throw new Error(response.error ?? "Unknown Slack API error");
    }

    const matches = response.messages?.matches ?? [];
    if (matches.length === 0) return contextSignal;

    const lastTs = matches
      .map((item) => Number(item.ts ?? 0))
      .filter((value) => Number.isFinite(value) && value > 0)
      .sort((a, b) => b - a)[0];

    const apiSignal: DealSignal = {
      source: "slack",
      totalMatches: response.messages?.total ?? matches.length,
      highlights: matches
        .map((item) => item.text?.replace(/<[^>]+>/g, "").trim())
        .filter((text): text is string => Boolean(text))
        .slice(0, 3),
      deepLinks: matches
        .map((item) => item.permalink)
        .filter((link): link is string => Boolean(link))
        .slice(0, 3),
      lastActivityAt: lastTs ? new Date(lastTs * 1000).toISOString() : undefined
    };

    if (!contextSignal) {
      return apiSignal;
    }

    const highlights = Array.from(
      new Set([...contextSignal.highlights, ...apiSignal.highlights])
    ).slice(0, 6);
    const deepLinks = Array.from(new Set([...contextSignal.deepLinks, ...apiSignal.deepLinks])).slice(
      0,
      6
    );

    return {
      source: "slack",
      totalMatches: contextSignal.totalMatches + apiSignal.totalMatches,
      highlights,
      deepLinks,
      lastActivityAt:
        [contextSignal.lastActivityAt, apiSignal.lastActivityAt]
          .filter((value): value is string => Boolean(value))
          .sort((a, b) => Date.parse(b) - Date.parse(a))[0] ?? contextSignal.lastActivityAt
    };
  } catch (error) {
    console.error("slack integration failed", error);
    return contextSignal;
  }
}

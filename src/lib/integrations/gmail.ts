import { DealSignal, SourceSignalQuery } from "@/lib/types";
import { fetchJson } from "@/lib/integrations/http";

type GmailMessage = { id: string; threadId: string };

type GmailListResponse = {
  messages?: GmailMessage[];
  resultSizeEstimate?: number;
};

type GmailMessageResponse = {
  id: string;
  snippet?: string;
  internalDate?: string;
};

export type GmailCredentialInput = {
  accessToken?: string;
};

function gmailToken(credential?: GmailCredentialInput): string | undefined {
  return credential?.accessToken ?? process.env.GOOGLE_GMAIL_ACCESS_TOKEN;
}

export function isGmailEnabled(credential?: GmailCredentialInput): boolean {
  return Boolean(gmailToken(credential));
}

export async function probeGmailConnection(
  credential?: GmailCredentialInput
): Promise<{ connected: boolean; message?: string }> {
  const token = gmailToken(credential);
  if (!token) {
    return { connected: false, message: "Missing GOOGLE_GMAIL_ACCESS_TOKEN." };
  }

  try {
    await fetchJson<Record<string, unknown>>("https://gmail.googleapis.com/gmail/v1/users/me/profile", {
      headers: { authorization: `Bearer ${token}` }
    });

    return { connected: true };
  } catch (error) {
    return {
      connected: false,
      message: error instanceof Error ? error.message : "Gmail probe failed"
    };
  }
}

export async function fetchGmailSignal(
  query: SourceSignalQuery,
  credential?: GmailCredentialInput
): Promise<DealSignal | null> {
  const token = gmailToken(credential);
  if (!token) return null;

  const gmailQuery = [
    `\"${query.opportunityName}\"`,
    `\"${query.accountName}\"`,
    "newer_than:180d"
  ].join(" OR ");

  try {
    const listUrl = `https://gmail.googleapis.com/gmail/v1/users/me/messages?q=${encodeURIComponent(
      gmailQuery
    )}&maxResults=5`;

    const list = await fetchJson<GmailListResponse>(listUrl, {
      headers: { authorization: `Bearer ${token}` }
    });

    if (!list.messages || list.messages.length === 0) return null;

    const details = await Promise.all(
      list.messages.map((message) =>
        fetchJson<GmailMessageResponse>(
          `https://gmail.googleapis.com/gmail/v1/users/me/messages/${message.id}?format=metadata`,
          { headers: { authorization: `Bearer ${token}` } }
        )
      )
    );

    const lastActivity = details
      .map((item) => Number(item.internalDate ?? 0))
      .filter((value) => Number.isFinite(value) && value > 0)
      .sort((a, b) => b - a)[0];

    return {
      source: "gmail",
      totalMatches: list.resultSizeEstimate ?? list.messages.length,
      highlights: details
        .map((item) => item.snippet)
        .filter((snippet): snippet is string => Boolean(snippet))
        .slice(0, 3),
      deepLinks: list.messages
        .slice(0, 3)
        .map((message) => `https://mail.google.com/mail/u/0/#all/${message.id}`),
      lastActivityAt: lastActivity ? new Date(lastActivity).toISOString() : undefined
    };
  } catch (error) {
    console.error("gmail integration failed", error);
    return null;
  }
}

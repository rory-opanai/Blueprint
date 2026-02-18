import { NextResponse } from "next/server";
import {
  buildSlackPermalink,
  extractDealReference,
  extractNamedField,
  isSlackEventsEnabled,
  verifySlackSignature
} from "@/lib/integrations/slack";
import { findSlackChannelOwners } from "@/lib/connectors/accounts";
import { invalidateSignalCache, listDealsForUser } from "@/lib/services/deal-aggregator";
import {
  findSlackThreadRootDealReference,
  upsertSlackDealUpdate
} from "@/lib/storage/slackUpdates";

type SlackEventPayload = {
  type: string;
  challenge?: string;
  event_id?: string;
  event?: {
    type?: string;
    subtype?: string;
    channel?: string;
    user?: string;
    text?: string;
    ts?: string;
    thread_ts?: string;
  };
};

function normalize(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function matchDealByContext(
  text: string,
  explicitDealRef: string | undefined,
  accountNameHint: string | undefined,
  opportunityNameHint: string | undefined,
  deals: Awaited<ReturnType<typeof listDealsForUser>>
): { opportunityId?: string; accountName?: string; opportunityName?: string } {
  const explicit = explicitDealRef?.toLowerCase();
  if (explicit) {
    const found = deals.find(
      (deal) =>
        deal.opportunityId.toLowerCase() === explicit ||
        (deal.sourceOpportunityId?.toLowerCase() ?? "") === explicit
    );

    if (found) {
      return {
        opportunityId: found.sourceOpportunityId ?? found.opportunityId,
        accountName: found.accountName,
        opportunityName: found.opportunityName
      };
    }
  }

  const textNormalized = normalize(text);
  const accountHintNormalized = normalize(accountNameHint ?? "");
  const opportunityHintNormalized = normalize(opportunityNameHint ?? "");

  const scored = deals
    .map((deal) => {
      const accountNormalized = normalize(deal.accountName);
      const opportunityNormalized = normalize(deal.opportunityName);
      let score = 0;

      if (accountHintNormalized && accountNormalized.includes(accountHintNormalized)) score += 3;
      if (opportunityHintNormalized && opportunityNormalized.includes(opportunityHintNormalized)) score += 3;
      if (textNormalized.includes(accountNormalized)) score += 2;
      if (textNormalized.includes(opportunityNormalized)) score += 2;

      return { deal, score };
    })
    .sort((a, b) => b.score - a.score);

  if (!scored[0] || scored[0].score < 2) {
    return {
      accountName: accountNameHint,
      opportunityName: opportunityNameHint
    };
  }

  return {
    opportunityId: scored[0].deal.sourceOpportunityId ?? scored[0].deal.opportunityId,
    accountName: scored[0].deal.accountName,
    opportunityName: scored[0].deal.opportunityName
  };
}

export async function POST(request: Request) {
  if (!isSlackEventsEnabled()) {
    return NextResponse.json(
      { error: "Slack events are not configured. Set SLACK_SIGNING_SECRET." },
      { status: 503 }
    );
  }

  const rawBody = await request.text();
  const timestamp = request.headers.get("x-slack-request-timestamp");
  const signature = request.headers.get("x-slack-signature");

  if (!verifySlackSignature(rawBody, timestamp, signature)) {
    return NextResponse.json({ error: "Invalid Slack signature" }, { status: 401 });
  }

  const payload = JSON.parse(rawBody) as SlackEventPayload;

  if (payload.type === "url_verification" && payload.challenge) {
    return NextResponse.json({ challenge: payload.challenge });
  }

  if (payload.type !== "event_callback" || !payload.event) {
    return NextResponse.json({ ok: true });
  }

  const event = payload.event;
  if (event.type !== "message" || event.subtype) {
    return NextResponse.json({ ok: true });
  }

  if (!event.channel || !event.ts || !event.text) {
    return NextResponse.json({ ok: true });
  }

  const subscriptions = await findSlackChannelOwners(event.channel);
  if (subscriptions.length === 0) {
    return NextResponse.json({ ok: true });
  }

  const explicitDealRef = extractDealReference(event.text);
  const accountHint = extractNamedField(event.text, "account");
  const opportunityHint = extractNamedField(event.text, "opportunity");
  const isThreadReply = Boolean(event.thread_ts && event.thread_ts !== event.ts);

  if (!isThreadReply && !explicitDealRef) {
    // Root posts must include `deal:<opportunityId>` to avoid ambiguous ingestion.
    return NextResponse.json({ ok: true });
  }

  await Promise.all(
    subscriptions.map(async (subscription) => {
      let inheritedFromThread:
        | { opportunityId?: string; accountName?: string; opportunityName?: string }
        | null = null;
      if (isThreadReply && event.thread_ts) {
        inheritedFromThread = await findSlackThreadRootDealReference({
          channelId: event.channel!,
          threadTs: event.thread_ts,
          userId: subscription.userId
        });
      }

      if (isThreadReply && !explicitDealRef && !inheritedFromThread?.opportunityId) {
        return;
      }

      const deals = await listDealsForUser({
        withSignals: false,
        viewerUserId: subscription.userId
      });
      const matched = matchDealByContext(
        event.text!,
        explicitDealRef ?? inheritedFromThread?.opportunityId,
        accountHint ?? inheritedFromThread?.accountName,
        opportunityHint ?? inheritedFromThread?.opportunityName,
        deals
      );

      await upsertSlackDealUpdate({
        eventId: payload.event_id ?? `${event.channel}:${event.ts}`,
        userId: subscription.userId,
        channelId: event.channel!,
        messageTs: event.ts!,
        threadTs: event.thread_ts,
        slackUserId: event.user,
        text: event.text!,
        permalink: buildSlackPermalink(event.channel!, event.ts!),
        opportunityId: matched.opportunityId ?? inheritedFromThread?.opportunityId,
        accountName: matched.accountName ?? inheritedFromThread?.accountName,
        opportunityName: matched.opportunityName ?? inheritedFromThread?.opportunityName,
        createdAt: new Date(Number(event.ts!.split(".")[0]) * 1000).toISOString()
      });

      invalidateSignalCache({
        accountName: matched.accountName ?? inheritedFromThread?.accountName,
        opportunityName: matched.opportunityName ?? inheritedFromThread?.opportunityName
      });
    })
  );

  return NextResponse.json({ ok: true });
}

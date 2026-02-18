import { DealSignal, SourceSignalQuery, UserRole } from "@/lib/types";
import { prisma } from "@/lib/prisma";

type SlackDealUpdateInput = {
  eventId: string;
  userId: string;
  channelId: string;
  messageTs: string;
  threadTs?: string;
  slackUserId?: string;
  text: string;
  permalink: string;
  opportunityId?: string;
  accountName?: string;
  opportunityName?: string;
  createdAt: string;
};

function normalize(value?: string): string {
  return (value ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export async function upsertSlackDealUpdate(update: SlackDealUpdateInput): Promise<void> {
  await prisma.slackDealUpdate.upsert({
    where: {
      channelId_messageTs: {
        channelId: update.channelId,
        messageTs: update.messageTs
      }
    },
    create: {
      eventId: update.eventId,
      userId: update.userId,
      channelId: update.channelId,
      messageTs: update.messageTs,
      threadTs: update.threadTs,
      slackUserId: update.slackUserId,
      text: update.text,
      permalink: update.permalink,
      opportunityId: update.opportunityId,
      accountName: update.accountName,
      opportunityName: update.opportunityName,
      createdAt: new Date(update.createdAt)
    },
    update: {
      eventId: update.eventId,
      userId: update.userId,
      threadTs: update.threadTs,
      slackUserId: update.slackUserId,
      text: update.text,
      permalink: update.permalink,
      opportunityId: update.opportunityId,
      accountName: update.accountName,
      opportunityName: update.opportunityName,
      createdAt: new Date(update.createdAt)
    }
  });
}

export async function findSlackThreadRootDealReference(input: {
  channelId: string;
  threadTs: string;
  userId: string;
}): Promise<{ opportunityId?: string; accountName?: string; opportunityName?: string } | null> {
  const row = await prisma.slackDealUpdate.findFirst({
    where: {
      channelId: input.channelId,
      messageTs: input.threadTs,
      userId: input.userId
    }
  });

  if (!row) return null;
  return {
    opportunityId: row.opportunityId ?? undefined,
    accountName: row.accountName ?? undefined,
    opportunityName: row.opportunityName ?? undefined
  };
}

export async function fetchSlackContextSignal(
  query: SourceSignalQuery,
  options?: { viewerUserId?: string; viewerRole?: UserRole }
): Promise<DealSignal | null> {
  const normalizedAccount = normalize(query.accountName);
  const normalizedOpportunity = normalize(query.opportunityName);
  const viewerRole = options?.viewerRole ?? "AD";
  const viewerId = options?.viewerUserId;

  const rows = await prisma.slackDealUpdate.findMany({
    where: {
      ...(viewerId && viewerRole !== "MANAGER"
        ? {
            userId: viewerId
          }
        : {}),
      OR: [
        ...(query.opportunityId
          ? [
              {
                opportunityId: query.opportunityId
              }
            ]
          : []),
        ...(normalizedAccount
          ? [
              {
                accountName: {
                  contains: normalizedAccount,
                  mode: "insensitive" as const
                }
              }
            ]
          : []),
        ...(normalizedOpportunity
          ? [
              {
                opportunityName: {
                  contains: normalizedOpportunity,
                  mode: "insensitive" as const
                }
              }
            ]
          : []),
        {
          text: {
            contains: query.accountName,
            mode: "insensitive"
          }
        },
        {
          text: {
            contains: query.opportunityName,
            mode: "insensitive"
          }
        }
      ]
    },
    orderBy: {
      createdAt: "desc"
    },
    take: 40
  });

  if (rows.length === 0) return null;

  const highlights = rows
    .map((row) => {
      const fromSelf = viewerId ? row.userId === viewerId : true;
      const managerSummaryOnly = viewerRole === "MANAGER" && !fromSelf;
      if (managerSummaryOnly) {
        return `Slack update captured (${new Date(row.createdAt).toLocaleDateString()}).`;
      }
      return row.text;
    })
    .slice(0, 4);

  const deepLinks = Array.from(new Set(rows.map((row) => row.permalink).filter(Boolean))).slice(0, 6);
  const hasOtherSources = Boolean(
    viewerId && rows.some((row) => row.userId !== viewerId)
  );

  return {
    source: "slack",
    totalMatches: rows.length,
    highlights,
    deepLinks,
    lastActivityAt: rows[0]?.createdAt.toISOString(),
    sourceOwner: hasOtherSources ? "other" : "self",
    visibility: hasOtherSources ? "manager_summary" : "owner_only"
  };
}

export function slackPermalink(channelId: string, messageTs: string): string {
  const ts = messageTs.replace(".", "");
  return `https://slack.com/archives/${channelId}/p${ts}`;
}

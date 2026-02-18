import { DealCard, ManualDealDraft } from "@/lib/types";
import { TAS_TOTAL_QUESTIONS } from "@/lib/tas-template";
import { prisma } from "@/lib/prisma";

type ManualDealRow = {
  id: string;
  accountName: string;
  opportunityName: string;
  stage: string;
  amount: { toNumber(): number };
  closeDate: Date;
  ownerName: string;
  ownerEmail: string;
  sourceOpportunityId: string | null;
};

function toDealCard(row: ManualDealRow): DealCard {
  return {
    opportunityId: row.id,
    sourceOpportunityId: row.sourceOpportunityId ?? undefined,
    origin: "manual",
    accountName: row.accountName,
    opportunityName: row.opportunityName,
    stage: row.stage,
    amount: row.amount.toNumber(),
    closeDate: row.closeDate.toISOString(),
    ownerEmail: row.ownerEmail,
    owners: { ad: row.ownerName },
    tasProgress: { answered: 0, total: TAS_TOTAL_QUESTIONS },
    evidenceCoverage: { backed: 0, total: TAS_TOTAL_QUESTIONS },
    risk: { count: 0, severity: "low" },
    needsReviewCount: 0,
    overdueCommitments: 0,
    topGaps: ["No TAS answers yet"],
    sourceSignals: [],
    consolidatedInsights: []
  };
}

export async function listManualDeals(input: {
  userId: string;
  ownerEmail?: string;
}): Promise<DealCard[]> {
  const rows = await prisma.manualDeal.findMany({
    where: {
      userId: input.userId,
      ...(input.ownerEmail
        ? {
            ownerEmail: {
              equals: input.ownerEmail,
              mode: "insensitive"
            }
          }
        : {})
    },
    orderBy: {
      closeDate: "asc"
    }
  });

  return rows.map((row) => toDealCard(row));
}

export async function getManualDealById(input: {
  opportunityId: string;
  userId: string;
}): Promise<DealCard | null> {
  const row = await prisma.manualDeal.findFirst({
    where: {
      id: input.opportunityId,
      userId: input.userId
    }
  });

  return row ? toDealCard(row) : null;
}

export async function createManualDeal(input: {
  userId: string;
  draft: ManualDealDraft;
  sourceOpportunityId?: string;
}): Promise<DealCard> {
  const row = await prisma.manualDeal.create({
    data: {
      userId: input.userId,
      accountName: input.draft.accountName,
      opportunityName: input.draft.opportunityName,
      stage: input.draft.stage,
      amount: input.draft.amount,
      closeDate: new Date(input.draft.closeDate),
      ownerName: input.draft.ownerName,
      ownerEmail: input.draft.ownerEmail,
      sourceOpportunityId: input.sourceOpportunityId
    }
  });

  return toDealCard(row);
}

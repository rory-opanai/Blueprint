import { TasQuestionState } from "@/lib/types";
import { prisma } from "@/lib/prisma";

function toTasState(row: {
  questionId: string;
  status: "EMPTY" | "MANUAL" | "SUGGESTED" | "CONFIRMED" | "STALE" | "CONTRADICTION";
  answer: string;
  updatedAt: Date;
  updatedBy: string | null;
  evidenceLinks: unknown;
}): TasQuestionState {
  const links = Array.isArray(row.evidenceLinks)
    ? row.evidenceLinks.filter((item): item is string => typeof item === "string")
    : [];

  return {
    questionId: row.questionId,
    status: row.status.toLowerCase() as TasQuestionState["status"],
    answer: row.answer,
    lastUpdatedAt: row.updatedAt.toISOString(),
    lastUpdatedBy: row.updatedBy ?? "Blueprint",
    evidence: links.map((deepLink, index) => ({
      id: `${row.questionId}-${index}`,
      label: `Evidence ${index + 1}`,
      deepLink,
      sourceType: "doc"
    }))
  };
}

export async function listManualTasAnswers(input: {
  dealId: string;
  userId: string;
}): Promise<TasQuestionState[]> {
  const rows = await prisma.manualTasAnswer.findMany({
    where: {
      dealId: input.dealId,
      userId: input.userId
    },
    orderBy: {
      questionId: "asc"
    }
  });

  return rows.map((row) =>
    toTasState({
      questionId: row.questionId,
      status: row.status,
      answer: row.answer,
      updatedAt: row.updatedAt,
      updatedBy: row.updatedBy,
      evidenceLinks: row.evidenceLinks
    })
  );
}

export async function upsertManualTasAnswer(input: {
  dealId: string;
  userId: string;
  questionId: string;
  answer: string;
  status?: "EMPTY" | "MANUAL" | "SUGGESTED" | "CONFIRMED" | "STALE" | "CONTRADICTION";
  updatedBy?: string;
  evidenceLinks?: string[];
}) {
  return prisma.manualTasAnswer.upsert({
    where: {
      dealId_questionId: {
        dealId: input.dealId,
        questionId: input.questionId
      }
    },
    create: {
      dealId: input.dealId,
      userId: input.userId,
      questionId: input.questionId,
      answer: input.answer,
      status: input.status ?? "CONFIRMED",
      updatedBy: input.updatedBy,
      evidenceLinks: input.evidenceLinks ?? []
    },
    update: {
      answer: input.answer,
      status: input.status ?? "CONFIRMED",
      updatedBy: input.updatedBy,
      evidenceLinks: input.evidenceLinks ?? []
    }
  });
}

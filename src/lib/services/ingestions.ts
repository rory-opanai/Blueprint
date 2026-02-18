import { prisma } from "@/lib/prisma";
import { TAS_TEMPLATE } from "@/lib/tas-template";
import { decryptSecret, encryptSecret } from "@/lib/security/encryption";
import { IngestionDeltaView, IngestionRunView, IngestionSourceType, TasExtractionField } from "@/lib/types";
import { extractTasFieldsFromContext } from "@/lib/services/tas-extractor";
import { upsertManualTasAnswer } from "@/lib/storage/manual-tas";

const CONFIDENCE_THRESHOLD = 0.65;
const MAX_DELTAS_PER_RUN = 12;

function normalized(input: string): string {
  return input.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function semanticallyEqual(left?: string | null, right?: string | null): boolean {
  if (!left && !right) return true;
  return normalized(left ?? "") === normalized(right ?? "");
}

function questionPrompt(questionId: string): string {
  return (
    TAS_TEMPLATE.flatMap((section) => section.questions).find((question) => question.id === questionId)?.prompt ??
    questionId
  );
}

export async function createIngestionRun(input: {
  dealId: string;
  userId: string;
  sourceType: IngestionSourceType;
  rawContext: string;
}) {
  const deal = await prisma.manualDeal.findFirst({
    where: {
      id: input.dealId,
      userId: input.userId
    }
  });
  if (!deal) {
    throw new Error("Deal not found or not accessible.");
  }

  const encrypted = encryptSecret(input.rawContext);
  const run = await prisma.ingestionRun.create({
    data: {
      dealId: input.dealId,
      submittedBy: input.userId,
      sourceType: input.sourceType,
      rawContextEnc: encrypted.ciphertext,
      status: "PROCESSING",
      model: process.env.OPENAI_MODEL ?? "gpt-4.1-mini"
    }
  });

  try {
    const extraction = await extractTasFieldsFromContext({ rawContext: input.rawContext });
    const currentAnswers = await prisma.manualTasAnswer.findMany({
      where: {
        dealId: input.dealId,
        userId: input.userId
      }
    });
    const currentByQuestion = new Map(currentAnswers.map((row) => [row.questionId, row.answer]));

    const allFieldsPayload = Object.fromEntries(
      extraction.fields.map((field) => [
        field.questionId,
        {
          proposedAnswer: field.proposedAnswer,
          confidence: field.confidence,
          evidenceSnippets: field.evidenceSnippets,
          reasoning: field.reasoning
        }
      ])
    );

    const nextVersion =
      (await prisma.ingestionSnapshot.count({
        where: {
          run: { dealId: input.dealId }
        }
      })) + 1;

    await prisma.ingestionSnapshot.create({
      data: {
        runId: run.id,
        version: nextVersion,
        parsedJson: allFieldsPayload
      }
    });

    const candidateDeltas = extraction.fields
      .filter((field) => field.confidence >= CONFIDENCE_THRESHOLD)
      .filter((field) => !semanticallyEqual(currentByQuestion.get(field.questionId), field.proposedAnswer))
      .sort((left, right) => right.confidence - left.confidence)
      .slice(0, MAX_DELTAS_PER_RUN);

    if (candidateDeltas.length > 0) {
      await prisma.ingestionDelta.createMany({
        data: candidateDeltas.map((field) => ({
          runId: run.id,
          dealId: input.dealId,
          questionId: field.questionId,
          oldValue: currentByQuestion.get(field.questionId),
          proposedValue: field.proposedAnswer,
          confidence: field.confidence,
          evidence: field.evidenceSnippets,
          reasoning: field.reasoning,
          status: "PENDING"
        }))
      });
    }

    await prisma.ingestionRun.update({
      where: { id: run.id },
      data: {
        status: "COMPLETED",
        model: extraction.model
      }
    });

    return {
      runId: run.id,
      deltaCount: candidateDeltas.length
    };
  } catch (error) {
    await prisma.ingestionRun.update({
      where: { id: run.id },
      data: {
        status: "FAILED",
        errorMessage: error instanceof Error ? error.message : "Ingestion failed"
      }
    });
    throw error;
  }
}

export async function listDealIngestionRuns(input: {
  dealId: string;
  userId: string;
}): Promise<IngestionRunView[]> {
  const rows = await prisma.ingestionRun.findMany({
    where: {
      dealId: input.dealId,
      submittedBy: input.userId
    },
    orderBy: {
      createdAt: "desc"
    },
    include: {
      deltas: true
    }
  });

  return rows.map((row) => ({
    id: row.id,
    dealId: row.dealId,
    sourceType: row.sourceType,
    status: row.status.toLowerCase() as IngestionRunView["status"],
    model: row.model,
    createdAt: row.createdAt.toISOString(),
    errorMessage: row.errorMessage ?? undefined,
    deltaCount: row.deltas.length
  }));
}

export async function listDealReviewQueue(input: {
  dealId: string;
  userId: string;
}): Promise<IngestionDeltaView[]> {
  const rows = await prisma.ingestionDelta.findMany({
    where: {
      dealId: input.dealId,
      run: {
        submittedBy: input.userId
      }
    },
    orderBy: [{ createdAt: "desc" }]
  });

  const priority: Record<string, number> = {
    PENDING: 0,
    ACCEPTED: 1,
    EDITED_ACCEPTED: 2,
    REJECTED: 3
  };

  return rows
    .sort((left, right) => (priority[left.status] ?? 10) - (priority[right.status] ?? 10))
    .map((row) => ({
      id: row.id,
      runId: row.runId,
      dealId: row.dealId,
      questionId: row.questionId,
    questionPrompt: questionPrompt(row.questionId),
    oldValue: row.oldValue ?? undefined,
    proposedValue: row.proposedValue,
    confidence: row.confidence,
    evidenceSnippets: Array.isArray(row.evidence)
      ? row.evidence.filter((item): item is string => typeof item === "string")
      : [],
    reasoning: row.reasoning,
    status: row.status.toLowerCase() as IngestionDeltaView["status"],
    createdAt: row.createdAt.toISOString(),
      decidedAt: row.decidedAt?.toISOString()
    }));
}

export async function applyReviewDecision(input: {
  deltaId: string;
  userId: string;
  userName?: string;
  action: "accept" | "edit_then_accept" | "reject";
  editedAnswer?: string;
}) {
  const delta = await prisma.ingestionDelta.findFirst({
    where: {
      id: input.deltaId,
      run: {
        submittedBy: input.userId
      }
    },
    include: {
      run: true
    }
  });

  if (!delta) {
    throw new Error("Review item not found.");
  }

  if (input.action === "reject") {
    const updated = await prisma.ingestionDelta.update({
      where: { id: input.deltaId },
      data: {
        status: "REJECTED",
        decidedBy: input.userId,
        decidedAt: new Date()
      }
    });
    return updated;
  }

  const answerToApply =
    input.action === "edit_then_accept" && input.editedAnswer ? input.editedAnswer : delta.proposedValue;

  await upsertManualTasAnswer({
    dealId: delta.dealId,
    userId: input.userId,
    questionId: delta.questionId,
    answer: answerToApply,
    status: "CONFIRMED",
    updatedBy: input.userName ?? "Blueprint",
    evidenceLinks: Array.isArray(delta.evidence)
      ? delta.evidence.filter((item): item is string => typeof item === "string")
      : []
  });

  const updated = await prisma.ingestionDelta.update({
    where: { id: input.deltaId },
    data: {
      proposedValue: answerToApply,
      status: input.action === "accept" ? "ACCEPTED" : "EDITED_ACCEPTED",
      decidedBy: input.userId,
      decidedAt: new Date()
    }
  });

  return updated;
}

export async function applyBulkReviewDecision(input: {
  dealId: string;
  userId: string;
  userName?: string;
  action: "accept" | "reject";
  minConfidence?: number;
}) {
  const pending = await prisma.ingestionDelta.findMany({
    where: {
      dealId: input.dealId,
      status: "PENDING",
      run: {
        submittedBy: input.userId
      },
      ...(typeof input.minConfidence === "number"
        ? {
            confidence: {
              gte: input.minConfidence
            }
          }
        : {})
    }
  });

  if (pending.length === 0) {
    return { affected: 0 };
  }

  const now = new Date();

  await prisma.$transaction(async (tx) => {
    if (input.action === "accept") {
      for (const delta of pending) {
        await tx.manualTasAnswer.upsert({
          where: {
            dealId_questionId: {
              dealId: delta.dealId,
              questionId: delta.questionId
            }
          },
          create: {
            dealId: delta.dealId,
            userId: input.userId,
            questionId: delta.questionId,
            answer: delta.proposedValue,
            status: "CONFIRMED",
            updatedBy: input.userName ?? "Blueprint",
            evidenceLinks: Array.isArray(delta.evidence)
              ? delta.evidence.filter((item): item is string => typeof item === "string")
              : []
          },
          update: {
            answer: delta.proposedValue,
            status: "CONFIRMED",
            updatedBy: input.userName ?? "Blueprint",
            evidenceLinks: Array.isArray(delta.evidence)
              ? delta.evidence.filter((item): item is string => typeof item === "string")
              : []
          }
        });
      }

      await tx.ingestionDelta.updateMany({
        where: {
          id: {
            in: pending.map((item) => item.id)
          }
        },
        data: {
          status: "ACCEPTED",
          decidedAt: now,
          decidedBy: input.userId
        }
      });
      return;
    }

    await tx.ingestionDelta.updateMany({
      where: {
        id: {
          in: pending.map((item) => item.id)
        }
      },
      data: {
        status: "REJECTED",
        decidedAt: now,
        decidedBy: input.userId
      }
    });
  });

  return { affected: pending.length };
}

export async function getDecryptedIngestionContext(input: {
  runId: string;
  userId: string;
}): Promise<string | null> {
  const row = await prisma.ingestionRun.findFirst({
    where: {
      id: input.runId,
      submittedBy: input.userId
    }
  });

  if (!row) return null;
  return decryptSecret(row.rawContextEnc);
}

export function mapFieldsForSnapshot(fields: TasExtractionField[]) {
  return Object.fromEntries(
    fields.map((field) => [
      field.questionId,
      {
        proposedAnswer: field.proposedAnswer,
        confidence: field.confidence,
        evidenceSnippets: field.evidenceSnippets,
        reasoning: field.reasoning
      }
    ])
  );
}

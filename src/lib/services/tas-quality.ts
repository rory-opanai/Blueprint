import { DealCard, TasQualityReport, TasQuestionState } from "@/lib/types";
import { TAS_TEMPLATE } from "@/lib/tas-template";

const DEFAULT_MODEL = process.env.OPENAI_QUALITY_MODEL ?? process.env.OPENAI_MODEL ?? "gpt-5.2";
const CACHE_TTL_MS = 1000 * 60 * 5;

const qualityCache = new Map<string, { expiresAt: number; report: TasQualityReport }>();

type LlmSectionQuality = {
  sectionId?: string;
  confidence?: number;
  rationale?: string;
  outstandingItems?: string[];
};

type LlmQuestionQuality = {
  questionId?: string;
  confidence?: number;
  verdict?: "confirmed" | "not_confirmed";
  rationale?: string;
};

function clamp(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

function sectionAnswerSet(sectionId: string, questions: TasQuestionState[]) {
  const ids = new Set(
    TAS_TEMPLATE.find((section) => section.id === sectionId)?.questions.map((question) => question.id) ?? []
  );
  return questions.filter((question) => ids.has(question.questionId));
}

function isLowValueAnswer(answer?: string): boolean {
  if (!answer) return true;
  const normalized = answer.toLowerCase();
  return (
    /unknown|not identified|not defined|tbd|unclear|no named|no explicit|not yet defined|not yet identified/.test(
      normalized
    ) || normalized.trim().length < 24
  );
}

function hasHedgedLanguage(answer?: string): boolean {
  if (!answer) return false;
  return /maybe|likely|probably|possibly|seems|appears|uncertain|assume|guess/i.test(answer);
}

function buildHeuristicQuestionQuality(question: TasQuestionState) {
  const answer = question.answer?.trim() ?? "";
  if (!answer) {
    return {
      questionId: question.questionId,
      confidence: 0,
      verdict: "not_confirmed" as const,
      rationale: "No answer is currently captured."
    };
  }

  const lowValue = isLowValueAnswer(answer);
  const hedged = hasHedgedLanguage(answer);
  const evidenceCount = question.evidence.length;
  const hasEvidence = evidenceCount > 0;

  let confidence = 0.62;
  if (question.status === "confirmed") confidence += 0.12;
  if (question.status === "manual") confidence += 0.06;
  if (hasEvidence) confidence += Math.min(0.22, evidenceCount * 0.08);
  if (answer.length >= 80) confidence += 0.08;
  if (lowValue) confidence -= 0.45;
  if (hedged) confidence -= 0.18;
  if (!hasEvidence) confidence -= 0.1;

  confidence = Math.max(0, Math.min(1, confidence));
  if (lowValue || hedged) confidence = Math.min(confidence, 0.64);
  if (!hasEvidence && answer.length < 40) confidence = Math.min(confidence, 0.58);

  return {
    questionId: question.questionId,
    confidence,
    verdict: confidence >= 0.72 && !lowValue ? ("confirmed" as const) : ("not_confirmed" as const),
    rationale:
      confidence >= 0.72 && !lowValue
        ? "Answer appears specific and sufficiently grounded."
        : "Answer is weak, unresolved, or lacks enough support."
  };
}

function heuristicReport(input: { deal: DealCard; questions: TasQuestionState[] }): TasQualityReport {
  const questionQuality = input.questions.map((question) => buildHeuristicQuestionQuality(question));
  const questionQualityById = new Map(questionQuality.map((question) => [question.questionId, question]));

  const sectionQuality = TAS_TEMPLATE.map((section) => {
    const rows = sectionAnswerSet(section.id, input.questions);
    const answered = rows.filter((row) => row.status !== "empty" && (row.answer ?? "").trim().length > 0).length;
    const evidence = rows.filter((row) => row.evidence.length > 0).length;
    const notConfirmed = rows.filter(
      (row) => questionQualityById.get(row.questionId)?.verdict === "not_confirmed"
    ).length;
    const base = rows.length === 0 ? 0 : answered / rows.length;
    const evidenceBoost = rows.length === 0 ? 0 : (evidence / rows.length) * 0.2;
    const notConfirmedPenalty = rows.length === 0 ? 0 : (notConfirmed / rows.length) * 0.35;
    let confidence = Math.max(0, Math.min(1, base + evidenceBoost - notConfirmedPenalty));

    const outstandingItems = rows
      .filter((row) => row.status === "empty" || questionQualityById.get(row.questionId)?.verdict === "not_confirmed")
      .slice(0, 3)
      .map((row) => {
        const prompt =
          section.questions.find((question) => question.id === row.questionId)?.prompt ?? row.questionId;
        return `Clarify: ${prompt}`;
      });

    if (outstandingItems.length > 0) {
      confidence = Math.min(confidence, 0.69);
    }

    return {
      sectionId: section.id,
      confidence,
      rationale:
        outstandingItems.length > 0
          ? "Section has unresolved or weakly supported answers."
          : "Section appears complete with no obvious unresolved placeholders.",
      outstandingItems
    };
  });

  const overallConfidence =
    sectionQuality.reduce((sum, section) => sum + section.confidence, 0) / Math.max(1, sectionQuality.length);
  const criticalFlags = sectionQuality
    .filter((section) => section.confidence < 0.55)
    .map((section) => {
      const title = TAS_TEMPLATE.find((entry) => entry.id === section.sectionId)?.title ?? section.sectionId;
      return `${title} has low confidence and needs validation.`;
    })
    .slice(0, 4);

  return {
    overallConfidence,
    criticalFlags,
    sectionQuality,
    questionQuality,
    generatedAt: new Date().toISOString()
  };
}

function getOutputText(payload: unknown): string {
  if (!payload || typeof payload !== "object") return "";
  const record = payload as Record<string, unknown>;
  if (typeof record.output_text === "string") return record.output_text;
  const output = Array.isArray(record.output) ? record.output : [];
  for (const block of output) {
    if (!block || typeof block !== "object") continue;
    const content = Array.isArray((block as Record<string, unknown>).content)
      ? ((block as Record<string, unknown>).content as Array<Record<string, unknown>>)
      : [];
    for (const part of content) {
      if (typeof part?.text === "string") return part.text;
    }
  }
  return "";
}

function parseJson(text: string): {
  overallConfidence?: number;
  criticalFlags?: string[];
  sectionQuality?: LlmSectionQuality[];
  questionQuality?: LlmQuestionQuality[];
} | null {
  try {
    return JSON.parse(text) as {
      overallConfidence?: number;
      criticalFlags?: string[];
      sectionQuality?: LlmSectionQuality[];
      questionQuality?: LlmQuestionQuality[];
    };
  } catch {
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    if (start < 0 || end <= start) return null;
    try {
      return JSON.parse(text.slice(start, end + 1)) as {
        overallConfidence?: number;
        criticalFlags?: string[];
        sectionQuality?: LlmSectionQuality[];
        questionQuality?: LlmQuestionQuality[];
      };
    } catch {
      return null;
    }
  }
}

export async function runTasQualityCheck(input: {
  deal: DealCard;
  questions: TasQuestionState[];
  cacheKey: string;
}): Promise<TasQualityReport> {
  const cached = qualityCache.get(input.cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.report;
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    const fallback = heuristicReport(input);
    qualityCache.set(input.cacheKey, { expiresAt: Date.now() + CACHE_TTL_MS, report: fallback });
    return fallback;
  }

  const sectionsPayload = TAS_TEMPLATE.map((section) => ({
    sectionId: section.id,
    title: section.title,
    questions: section.questions.map((question) => {
      const state = input.questions.find((row) => row.questionId === question.id);
      return {
        questionId: question.id,
        prompt: question.prompt,
        answer: state?.answer ?? "",
        status: state?.status ?? "empty",
        evidenceCount: state?.evidence.length ?? 0
      };
    })
  }));

  const schema = {
    type: "object",
    additionalProperties: false,
    properties: {
      overallConfidence: { type: "number", minimum: 0, maximum: 1 },
      criticalFlags: {
        type: "array",
        items: { type: "string" }
      },
      sectionQuality: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          properties: {
            sectionId: { type: "string" },
            confidence: { type: "number", minimum: 0, maximum: 1 },
            rationale: { type: "string" },
            outstandingItems: {
              type: "array",
              items: { type: "string" }
            }
          },
          required: ["sectionId", "confidence", "rationale", "outstandingItems"]
        }
      },
      questionQuality: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          properties: {
            questionId: { type: "string" },
            confidence: { type: "number", minimum: 0, maximum: 1 },
            verdict: { type: "string", enum: ["confirmed", "not_confirmed"] },
            rationale: { type: "string" }
          },
          required: ["questionId", "confidence", "verdict", "rationale"]
        }
      }
    },
    required: ["overallConfidence", "criticalFlags", "sectionQuality", "questionQuality"]
  };

  try {
    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        authorization: `Bearer ${apiKey}`,
        "content-type": "application/json"
      },
      body: JSON.stringify({
        model: DEFAULT_MODEL,
        reasoning: { effort: "medium" },
        input: [
          {
            role: "system",
            content:
              "You are a TAS quality validator. Be strict. Mark answers not_confirmed when they are generic, speculative, contradictory, unresolved, or unsupported. Never assign high confidence to unknown placeholders."
          },
          {
            role: "user",
            content: [
              {
                type: "input_text",
                text: `Evaluate this TAS blueprint.\nDeal:\n${JSON.stringify(
                  {
                    account: input.deal.accountName,
                    opportunity: input.deal.opportunityName,
                    stage: input.deal.stage
                  },
                  null,
                  2
                )}\n\nSections:\n${JSON.stringify(sectionsPayload, null, 2)}`
              }
            ]
          }
        ],
        text: {
          format: {
            type: "json_schema",
            name: "tas_quality_report",
            strict: true,
            schema
          }
        }
      })
    });

    if (!response.ok) {
      throw new Error(`quality check failed (${response.status})`);
    }

    const payload = (await response.json()) as Record<string, unknown>;
    const parsed = parseJson(getOutputText(payload));
    if (!parsed) {
      throw new Error("Unable to parse quality report.");
    }

    const fallbackQuestionQuality = new Map(
      input.questions.map((question) => [question.questionId, buildHeuristicQuestionQuality(question)])
    );

    const parsedQuestionQuality = Array.isArray(parsed.questionQuality) ? parsed.questionQuality : [];
    const questionQuality = input.questions.map((question) => {
      const row = parsedQuestionQuality.find((item) => item.questionId === question.questionId);
      const fallback = fallbackQuestionQuality.get(question.questionId)!;
      const answer = question.answer?.trim() ?? "";
      const lowValue = isLowValueAnswer(answer);
      const hedged = hasHedgedLanguage(answer);
      const evidenceCount = question.evidence.length;

      let confidence = row ? clamp(row.confidence) : fallback.confidence;
      if (lowValue || hedged) confidence = Math.min(confidence, 0.64);
      if (!answer) confidence = 0;
      if (evidenceCount === 0 && answer.length < 40) confidence = Math.min(confidence, 0.58);

      const verdict =
        !answer || lowValue || confidence < 0.72 || row?.verdict === "not_confirmed"
          ? ("not_confirmed" as const)
          : ("confirmed" as const);

      return {
        questionId: question.questionId,
        confidence,
        verdict,
        rationale:
          typeof row?.rationale === "string" && row.rationale.trim().length > 0
            ? row.rationale
            : fallback.rationale
      };
    });

    const questionQualityById = new Map(questionQuality.map((row) => [row.questionId, row]));
    const sectionQuality = TAS_TEMPLATE.map((section) => {
      const row = parsed.sectionQuality?.find((item) => item.sectionId === section.id);
      const sectionQuestions = sectionAnswerSet(section.id, input.questions);
      const lowValueCount = sectionQuestions.filter((question) => isLowValueAnswer(question.answer)).length;
      const evidenceCount = sectionQuestions.filter((question) => question.evidence.length > 0).length;
      const notConfirmedCount = sectionQuestions.filter(
        (question) => questionQualityById.get(question.questionId)?.verdict === "not_confirmed"
      ).length;
      const unansweredCount = sectionQuestions.filter(
        (question) => question.status === "empty" || !(question.answer ?? "").trim()
      ).length;
      const unresolvedRatio =
        sectionQuestions.length === 0
          ? 1
          : (lowValueCount + unansweredCount + notConfirmedCount) / sectionQuestions.length;
      const evidenceRatio = sectionQuestions.length === 0 ? 0 : evidenceCount / sectionQuestions.length;
      const llmConfidence = clamp(row?.confidence);

      let adjustedConfidence = llmConfidence;
      adjustedConfidence -= unresolvedRatio * 0.55;
      adjustedConfidence += evidenceRatio * 0.15;
      adjustedConfidence = Math.max(0, Math.min(1, adjustedConfidence));

      const outstandingItems = Array.isArray(row?.outstandingItems)
        ? row.outstandingItems.filter((item): item is string => typeof item === "string").slice(0, 4)
        : [];

      const derivedOutstanding = sectionQuestions
        .filter((question) => questionQualityById.get(question.questionId)?.verdict === "not_confirmed")
        .slice(0, 2)
        .map((question) => {
          const prompt =
            section.questions.find((entry) => entry.id === question.questionId)?.prompt ?? question.questionId;
          return `Clarify: ${prompt}`;
        });

      const combinedOutstanding = [...outstandingItems, ...derivedOutstanding].slice(0, 4);
      if (combinedOutstanding.length > 0) {
        adjustedConfidence = Math.min(adjustedConfidence, 0.69);
      }

      return {
        sectionId: section.id,
        confidence: adjustedConfidence,
        rationale: typeof row?.rationale === "string" ? row.rationale : "No rationale provided.",
        outstandingItems: combinedOutstanding
      };
    });

    const averageSectionConfidence =
      sectionQuality.reduce((sum, section) => sum + section.confidence, 0) / Math.max(1, sectionQuality.length);
    const notConfirmedRatio =
      questionQuality.filter((question) => question.verdict === "not_confirmed").length /
      Math.max(1, questionQuality.length);
    let overallConfidence = clamp(parsed.overallConfidence);
    overallConfidence = overallConfidence * 0.45 + averageSectionConfidence * 0.55;
    overallConfidence = Math.max(0, Math.min(1, overallConfidence - notConfirmedRatio * 0.25));

    const report: TasQualityReport = {
      overallConfidence,
      criticalFlags: Array.isArray(parsed.criticalFlags)
        ? parsed.criticalFlags.filter((item): item is string => typeof item === "string").slice(0, 6)
        : [],
      sectionQuality,
      questionQuality,
      generatedAt: new Date().toISOString()
    };

    qualityCache.set(input.cacheKey, { expiresAt: Date.now() + CACHE_TTL_MS, report });
    return report;
  } catch {
    const fallback = heuristicReport(input);
    qualityCache.set(input.cacheKey, { expiresAt: Date.now() + CACHE_TTL_MS, report: fallback });
    return fallback;
  }
}

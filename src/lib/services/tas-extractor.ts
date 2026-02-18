import { TAS_TEMPLATE } from "@/lib/tas-template";
import { TasExtractionField } from "@/lib/types";

const DEFAULT_MODEL = process.env.OPENAI_MODEL ?? "gpt-5.2";
const DEFAULT_REASONING_EFFORT = process.env.OPENAI_REASONING_EFFORT ?? "low";

type FieldPayload = {
  proposedAnswer?: string;
  confidence?: number;
  evidenceSnippets?: string[];
  reasoning?: string;
};

function questionList() {
  return TAS_TEMPLATE.flatMap((section) => section.questions);
}

function extractionSchema() {
  const properties: Record<string, unknown> = {};
  const required: string[] = [];

  for (const question of questionList()) {
    properties[question.id] = {
      type: "object",
      additionalProperties: false,
      properties: {
        proposedAnswer: { type: "string" },
        confidence: { type: "number", minimum: 0, maximum: 1 },
        evidenceSnippets: {
          type: "array",
          items: { type: "string" }
        },
        reasoning: { type: "string" }
      },
      required: ["proposedAnswer", "confidence", "evidenceSnippets", "reasoning"]
    };
    required.push(question.id);
  }

  return {
    type: "object",
    additionalProperties: false,
    properties,
    required
  };
}

function clampConfidence(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return 0.4;
  if (value < 0) return 0;
  if (value > 1) return 1;
  return value;
}

function extractOutputText(payload: unknown): string {
  if (!payload || typeof payload !== "object") return "";
  const candidate = payload as Record<string, unknown>;

  if (typeof candidate.output_text === "string") return candidate.output_text;

  const output = Array.isArray(candidate.output) ? candidate.output : [];
  for (const part of output) {
    if (!part || typeof part !== "object") continue;
    const content = Array.isArray((part as Record<string, unknown>).content)
      ? ((part as Record<string, unknown>).content as Array<Record<string, unknown>>)
      : [];
    for (const item of content) {
      if (typeof item?.text === "string") return item.text;
    }
  }

  return "";
}

function parseJsonObject(text: string): Record<string, FieldPayload> | null {
  const trimmed = text.trim();
  if (!trimmed) return null;

  try {
    return JSON.parse(trimmed) as Record<string, FieldPayload>;
  } catch {
    const first = trimmed.indexOf("{");
    const last = trimmed.lastIndexOf("}");
    if (first < 0 || last <= first) return null;
    try {
      return JSON.parse(trimmed.slice(first, last + 1)) as Record<string, FieldPayload>;
    } catch {
      return null;
    }
  }
}

function fallbackField(prompt: string, rawContext: string): Omit<TasExtractionField, "questionId"> {
  const excerpt = rawContext.trim().slice(0, 220);
  return {
    proposedAnswer: "Insufficient explicit evidence in provided context.",
    confidence: 0.4,
    evidenceSnippets: excerpt ? [excerpt] : [],
    reasoning: `No reliable statement found for: ${prompt}`
  };
}

export async function extractTasFieldsFromContext(input: {
  rawContext: string;
}): Promise<{
  model: string;
  fields: TasExtractionField[];
  parsedPayload: Record<string, FieldPayload> | null;
}> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("Missing OPENAI_API_KEY.");
  }

  const questions = questionList();
  const model = DEFAULT_MODEL;
  const reasoningEnabled =
    model.startsWith("gpt-5") || model.startsWith("o3") || model.startsWith("o4");

  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      authorization: `Bearer ${apiKey}`,
      "content-type": "application/json"
    },
    body: JSON.stringify({
      model,
      ...(reasoningEnabled
        ? {
            reasoning: {
              effort: DEFAULT_REASONING_EFFORT
            }
          }
        : {}),
      input: [
        {
          role: "system",
          content:
            "You extract TAS answers from raw deal context. Return concise factual outputs. Do not invent facts."
        },
        {
          role: "user",
          content: [
            {
              type: "input_text",
              text: `Return ALL TAS question fields as JSON.\nQuestions:\n${questions
                .map((question) => `${question.id}: ${question.prompt}`)
                .join("\n")}\n\nContext:\n${input.rawContext}`
            }
          ]
        }
      ],
      text: {
        format: {
          type: "json_schema",
          name: "tas_extraction",
          strict: true,
          schema: extractionSchema()
        }
      }
    })
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`LLM extraction failed (${response.status}): ${detail.slice(0, 240)}`);
  }

  const payload = (await response.json()) as Record<string, unknown>;
  const outputText = extractOutputText(payload);
  const parsed = parseJsonObject(outputText);

  const fields: TasExtractionField[] = questions.map((question) => {
    const field = parsed?.[question.id];
    const fallback = fallbackField(question.prompt, input.rawContext);
    return {
      questionId: question.id,
      proposedAnswer:
        typeof field?.proposedAnswer === "string" && field.proposedAnswer.trim()
          ? field.proposedAnswer.trim()
          : fallback.proposedAnswer,
      confidence: clampConfidence(field?.confidence ?? fallback.confidence),
      evidenceSnippets: Array.isArray(field?.evidenceSnippets)
        ? field.evidenceSnippets
            .filter((item): item is string => typeof item === "string" && item.trim().length > 0)
            .slice(0, 3)
        : fallback.evidenceSnippets,
      reasoning:
        typeof field?.reasoning === "string" && field.reasoning.trim()
          ? field.reasoning.trim()
          : fallback.reasoning
    };
  });

  return {
    model,
    fields,
    parsedPayload: parsed
  };
}

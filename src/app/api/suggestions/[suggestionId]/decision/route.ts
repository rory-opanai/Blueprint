import { NextResponse } from "next/server";
import { applySuggestionDecision } from "@/lib/services/suggestions";
import { writeTasAnswerToSalesforce } from "@/lib/connectors/salesforce";
import { suggestionDecisionSchema } from "@/lib/validation/schemas";
import { mockSuggestions } from "@/lib/mock-data";
import { AuthRequiredError, requireUserSession } from "@/lib/auth/guards";
import { viewerConnectorContext } from "@/lib/connectors/runtime";

const seenIdempotencyKeys = new Set<string>();

export async function POST(request: Request, { params }: { params: Promise<{ suggestionId: string }> }) {
  const { suggestionId } = await params;
  try {
    const viewer = await requireUserSession();
    const parsed = suggestionDecisionSchema.safeParse(await request.json());

    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    }

    const payload = parsed.data;
    if (seenIdempotencyKeys.has(payload.idempotencyKey)) {
      return NextResponse.json({ error: "Duplicate idempotency key" }, { status: 409 });
    }
    seenIdempotencyKeys.add(payload.idempotencyKey);

    const target = mockSuggestions.find((suggestion) => suggestion.id === suggestionId);
    if (!target) {
      return NextResponse.json({ error: "Suggestion not found" }, { status: 404 });
    }

    const connectors = await viewerConnectorContext(viewer.id);
    const updated = applySuggestionDecision(
      suggestionId,
      payload.action,
      payload.editedAnswer,
      payload.rejectReason
    );

    if (!updated) {
      return NextResponse.json({ error: "Unable to update suggestion" }, { status: 500 });
    }

    if (payload.action !== "reject") {
      await writeTasAnswerToSalesforce({
        opportunityId: target.opportunityId,
        questionId: target.tasQuestionId,
        answer:
          payload.action === "edit_then_accept"
            ? payload.editedAnswer ?? target.proposedAnswer
            : target.proposedAnswer,
        actor: payload.actor,
        evidenceLinks: target.evidencePointers.map((evidence) => evidence.deepLink),
        credential: connectors.mode === "legacy_env" ? undefined : connectors.salesforce
      });
    }

    return NextResponse.json({ data: updated });
  } catch (error) {
    if (error instanceof AuthRequiredError) {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to process suggestion decision" },
      { status: 500 }
    );
  }
}

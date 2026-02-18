import { NextResponse } from "next/server";
import { createHash } from "node:crypto";
import { AuthRequiredError, requireUserSession } from "@/lib/auth/guards";
import { getDealById } from "@/lib/services/deal-aggregator";
import { runTasQualityCheck } from "@/lib/services/tas-quality";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ opportunityId: string }> }
) {
  try {
    const viewer = await requireUserSession();
    const { opportunityId } = await params;
    const { searchParams } = new URL(request.url);
    const ownerEmail = searchParams.get("ownerEmail") ?? viewer.email;

    const detail = await getDealById(opportunityId, {
      ownerEmail,
      withSignals: false,
      viewerUserId: viewer.id,
      viewerEmail: viewer.email,
      viewerRole: viewer.role
    });

    if (!detail) {
      return NextResponse.json({ error: "Opportunity not found" }, { status: 404 });
    }

    const answerFingerprint = createHash("sha1")
      .update(
        detail.questions
          .map(
            (question) =>
              `${question.questionId}|${question.status}|${question.answer ?? ""}|${question.evidence.length}|${question.lastUpdatedAt ?? ""}`
          )
          .join("||")
      )
      .digest("hex");

    const report = await runTasQualityCheck({
      deal: detail.deal,
      questions: detail.questions,
      cacheKey: `${viewer.id}:${opportunityId}:${detail.deal.stage}:${answerFingerprint}`
    });

    return NextResponse.json({ data: report });
  } catch (error) {
    if (error instanceof AuthRequiredError) {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to run TAS quality check" },
      { status: 500 }
    );
  }
}

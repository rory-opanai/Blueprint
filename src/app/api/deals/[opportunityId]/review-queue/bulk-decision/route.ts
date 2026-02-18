import { NextResponse } from "next/server";
import { AuthRequiredError, requireUserSession } from "@/lib/auth/guards";
import { applyBulkReviewDecision } from "@/lib/services/ingestions";
import { ingestionBulkDecisionSchema } from "@/lib/validation/schemas";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ opportunityId: string }> }
) {
  try {
    const viewer = await requireUserSession();
    const { opportunityId } = await params;
    const parsed = ingestionBulkDecisionSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    }

    const result = await applyBulkReviewDecision({
      dealId: opportunityId,
      userId: viewer.id,
      userName: viewer.name,
      action: parsed.data.action,
      minConfidence: parsed.data.minConfidence
    });
    return NextResponse.json({ data: result });
  } catch (error) {
    if (error instanceof AuthRequiredError) {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to process bulk decision" },
      { status: 500 }
    );
  }
}

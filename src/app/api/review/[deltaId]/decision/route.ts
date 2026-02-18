import { NextResponse } from "next/server";
import { AuthRequiredError, requireUserSession } from "@/lib/auth/guards";
import { applyReviewDecision } from "@/lib/services/ingestions";
import { ingestionDeltaDecisionSchema } from "@/lib/validation/schemas";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ deltaId: string }> }
) {
  try {
    const viewer = await requireUserSession();
    const { deltaId } = await params;
    const parsed = ingestionDeltaDecisionSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    }

    const result = await applyReviewDecision({
      deltaId,
      userId: viewer.id,
      userName: viewer.name,
      action: parsed.data.action,
      editedAnswer: parsed.data.editedAnswer
    });
    return NextResponse.json({ data: result });
  } catch (error) {
    if (error instanceof AuthRequiredError) {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to process review decision" },
      { status: 500 }
    );
  }
}

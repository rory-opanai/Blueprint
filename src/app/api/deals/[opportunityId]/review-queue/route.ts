import { NextResponse } from "next/server";
import { AuthRequiredError, requireUserSession } from "@/lib/auth/guards";
import { listDealReviewQueue } from "@/lib/services/ingestions";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ opportunityId: string }> }
) {
  try {
    const viewer = await requireUserSession();
    const { opportunityId } = await params;
    const queue = await listDealReviewQueue({
      dealId: opportunityId,
      userId: viewer.id
    });
    return NextResponse.json({ data: queue });
  } catch (error) {
    if (error instanceof AuthRequiredError) {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to load review queue" },
      { status: 500 }
    );
  }
}

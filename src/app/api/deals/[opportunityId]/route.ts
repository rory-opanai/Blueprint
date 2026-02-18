import { NextResponse } from "next/server";
import { getDealById } from "@/lib/services/deal-aggregator";

export async function GET(request: Request, { params }: { params: Promise<{ opportunityId: string }> }) {
  const { opportunityId } = await params;
  const { searchParams } = new URL(request.url);

  const ownerEmail = searchParams.get("ownerEmail") ?? undefined;
  const withSignals = searchParams.get("withSignals") !== "false";

  try {
    const deal = await getDealById(opportunityId, { ownerEmail, withSignals });
    if (!deal) {
      return NextResponse.json({ error: "Opportunity not found" }, { status: 404 });
    }
    return NextResponse.json({ data: deal });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to fetch opportunity" },
      { status: 500 }
    );
  }
}

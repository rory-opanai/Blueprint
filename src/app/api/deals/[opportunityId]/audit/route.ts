import { NextResponse } from "next/server";
import { getDealById } from "@/lib/services/deal-aggregator";
import { calculateAudit } from "@/lib/services/audit";

export async function GET(request: Request, { params }: { params: Promise<{ opportunityId: string }> }) {
  const { opportunityId } = await params;
  const { searchParams } = new URL(request.url);
  const ownerEmail = searchParams.get("ownerEmail") ?? undefined;

  try {
    const deal = await getDealById(opportunityId, { ownerEmail, withSignals: true });
    if (!deal) {
      return NextResponse.json({ error: "Opportunity not found" }, { status: 404 });
    }

    const audit = calculateAudit(
      deal.deal.sourceOpportunityId ?? deal.deal.opportunityId,
      deal.deal.stage,
      deal.questions
    );

    return NextResponse.json({ data: audit });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to run audit" },
      { status: 500 }
    );
  }
}

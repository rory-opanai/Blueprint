import { NextResponse } from "next/server";
import { getDealById } from "@/lib/services/deal-aggregator";
import { AuthRequiredError, requireUserSession } from "@/lib/auth/guards";

export async function GET(request: Request, { params }: { params: Promise<{ opportunityId: string }> }) {
  const { opportunityId } = await params;
  const { searchParams } = new URL(request.url);

  const ownerEmailParam = searchParams.get("ownerEmail") ?? undefined;
  const withSignals = searchParams.get("withSignals") !== "false";

  try {
    const viewer = await requireUserSession();
    const ownerEmail = ownerEmailParam ?? viewer.email;
    const deal = await getDealById(opportunityId, {
      ownerEmail,
      withSignals,
      viewerUserId: viewer.id,
      viewerEmail: viewer.email,
      viewerRole: viewer.role
    });
    if (!deal) {
      return NextResponse.json({ error: "Opportunity not found" }, { status: 404 });
    }

    const managerRestricted =
      viewer.role === "MANAGER" &&
      deal.deal.ownerEmail &&
      viewer.email &&
      deal.deal.ownerEmail.toLowerCase() !== viewer.email.toLowerCase();

    if (!managerRestricted) {
      return NextResponse.json({ data: deal });
    }

    return NextResponse.json({
      data: {
        ...deal,
        deal: {
          ...deal.deal,
          sourceSignals: deal.deal.sourceSignals.map((signal) => ({
            ...signal,
            highlights: signal.highlights.map(() => `Summary available from ${signal.source}.`),
            visibility: "manager_summary" as const
          }))
        }
      }
    });
  } catch (error) {
    if (error instanceof AuthRequiredError) {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to fetch opportunity" },
      { status: 500 }
    );
  }
}

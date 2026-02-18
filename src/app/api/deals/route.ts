import { NextResponse } from "next/server";
import { createDealSchema } from "@/lib/validation/schemas";
import { createDealCard, listDealsForUser } from "@/lib/services/deal-aggregator";
import { AuthRequiredError, requireUserSession } from "@/lib/auth/guards";
import { viewerConnectorContext } from "@/lib/connectors/runtime";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const ownerEmailParam = searchParams.get("ownerEmail") ?? undefined;
  const withSignals = searchParams.get("withSignals") !== "false";

  try {
    const viewer = await requireUserSession();
    const ownerEmail = ownerEmailParam ?? viewer.email;
    const deals = await listDealsForUser({
      ownerEmail,
      withSignals,
      viewerUserId: viewer.id,
      viewerEmail: viewer.email,
      viewerRole: viewer.role
    });
    return NextResponse.json({ data: deals });
  } catch (error) {
    if (error instanceof AuthRequiredError) {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to list deals" },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const viewer = await requireUserSession();
    const payload = await request.json();
    const parsed = createDealSchema.safeParse(payload);

    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    }

    const connectorContext = await viewerConnectorContext(viewer.id);
    const deal = await createDealCard({
      draft: {
        ...parsed.data,
        ownerEmail: parsed.data.ownerEmail ?? viewer.email,
        ownerName: parsed.data.ownerName ?? viewer.name
      },
      viewerUserId: viewer.id,
      salesforceCredential:
        connectorContext.mode === "legacy_env" ? undefined : connectorContext.salesforce
    });
    return NextResponse.json({ data: deal }, { status: 201 });
  } catch (error) {
    if (error instanceof AuthRequiredError) {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to create deal" },
      { status: 500 }
    );
  }
}

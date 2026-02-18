import { NextResponse } from "next/server";
import { createDealSchema } from "@/lib/validation/schemas";
import { createDealCard, listDealsForUser } from "@/lib/services/deal-aggregator";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const ownerEmail = searchParams.get("ownerEmail") ?? undefined;
  const withSignals = searchParams.get("withSignals") !== "false";

  try {
    const deals = await listDealsForUser({ ownerEmail, withSignals });
    return NextResponse.json({ data: deals });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to list deals" },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  const payload = await request.json();
  const parsed = createDealSchema.safeParse(payload);

  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  try {
    const deal = await createDealCard(parsed.data);
    return NextResponse.json({ data: deal }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to create deal" },
      { status: 500 }
    );
  }
}

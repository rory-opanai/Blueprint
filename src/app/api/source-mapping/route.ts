import { NextResponse } from "next/server";
import { suggestSourcesForOpportunity } from "@/lib/services/source-mapping";
import { sourceMappingConfirmSchema } from "@/lib/validation/schemas";

const confirmed: Array<Record<string, unknown>> = [];

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const opportunityId = searchParams.get("opportunityId");
  if (!opportunityId) return NextResponse.json({ error: "opportunityId is required" }, { status: 400 });

  return NextResponse.json({ data: suggestSourcesForOpportunity(opportunityId) });
}

export async function POST(request: Request) {
  const parsed = sourceMappingConfirmSchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  confirmed.push({ ...parsed.data, confirmedAt: new Date().toISOString() });
  return NextResponse.json({ data: parsed.data }, { status: 201 });
}

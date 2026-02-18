import { NextResponse } from "next/server";
import { suggestSourcesForOpportunity } from "@/lib/services/source-mapping";
import { sourceMappingConfirmSchema } from "@/lib/validation/schemas";
import { AuthRequiredError, requireUserSession } from "@/lib/auth/guards";

const confirmed: Array<Record<string, unknown>> = [];

export async function GET(request: Request) {
  try {
    await requireUserSession();
    const { searchParams } = new URL(request.url);
    const opportunityId = searchParams.get("opportunityId");
    if (!opportunityId) return NextResponse.json({ error: "opportunityId is required" }, { status: 400 });

    return NextResponse.json({ data: suggestSourcesForOpportunity(opportunityId) });
  } catch (error) {
    if (error instanceof AuthRequiredError) {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to load source mappings" },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireUserSession();
    const parsed = sourceMappingConfirmSchema.safeParse(await request.json());
    if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

    confirmed.push({
      ...parsed.data,
      actor: parsed.data.actor || user.email,
      confirmedAt: new Date().toISOString()
    });
    return NextResponse.json({ data: parsed.data }, { status: 201 });
  } catch (error) {
    if (error instanceof AuthRequiredError) {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to confirm source mapping" },
      { status: 500 }
    );
  }
}

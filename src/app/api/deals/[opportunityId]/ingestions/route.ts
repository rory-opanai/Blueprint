import { NextResponse } from "next/server";
import { AuthRequiredError, requireUserSession } from "@/lib/auth/guards";
import { createIngestionRun, listDealIngestionRuns } from "@/lib/services/ingestions";
import { ingestionSubmitSchema } from "@/lib/validation/schemas";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ opportunityId: string }> }
) {
  try {
    const viewer = await requireUserSession();
    const { opportunityId } = await params;
    const runs = await listDealIngestionRuns({
      dealId: opportunityId,
      userId: viewer.id
    });
    return NextResponse.json({ data: runs });
  } catch (error) {
    if (error instanceof AuthRequiredError) {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to load ingestion runs" },
      { status: 500 }
    );
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ opportunityId: string }> }
) {
  try {
    const viewer = await requireUserSession();
    const { opportunityId } = await params;
    const parsed = ingestionSubmitSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    }

    const result = await createIngestionRun({
      dealId: opportunityId,
      userId: viewer.id,
      sourceType: parsed.data.sourceType,
      rawContext: parsed.data.rawContext
    });
    return NextResponse.json({ data: result }, { status: 201 });
  } catch (error) {
    if (error instanceof AuthRequiredError) {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to run ingestion" },
      { status: 500 }
    );
  }
}

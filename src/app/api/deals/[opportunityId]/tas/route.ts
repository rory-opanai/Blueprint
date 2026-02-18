import { NextResponse } from "next/server";
import { writeTasAnswerToSalesforce } from "@/lib/connectors/salesforce";
import { manualTasUpdateSchema } from "@/lib/validation/schemas";
import { AuthRequiredError, requireUserSession } from "@/lib/auth/guards";
import { viewerConnectorContext } from "@/lib/connectors/runtime";

export async function PATCH(request: Request, { params }: { params: Promise<{ opportunityId: string }> }) {
  try {
    const viewer = await requireUserSession();
    const { opportunityId } = await params;
    const parsed = manualTasUpdateSchema.safeParse(await request.json());

    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    }

    const connectors = await viewerConnectorContext(viewer.id);
    const result = await writeTasAnswerToSalesforce({
      opportunityId,
      ...parsed.data,
      credential: connectors.mode === "legacy_env" ? undefined : connectors.salesforce
    });
    return NextResponse.json({ data: result });
  } catch (error) {
    if (error instanceof AuthRequiredError) {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to write TAS answer" },
      { status: 500 }
    );
  }
}

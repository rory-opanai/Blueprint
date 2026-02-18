import { NextResponse } from "next/server";
import { writeCommitmentTaskToSalesforce } from "@/lib/connectors/salesforce";
import { commitmentCreateSchema } from "@/lib/validation/schemas";
import { AuthRequiredError, requireUserSession } from "@/lib/auth/guards";
import { viewerConnectorContext } from "@/lib/connectors/runtime";

export async function POST(request: Request) {
  try {
    const viewer = await requireUserSession();
    const parsed = commitmentCreateSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    }

    const connectors = await viewerConnectorContext(viewer.id);
    const task = await writeCommitmentTaskToSalesforce({
      ...parsed.data,
      credential: connectors.mode === "legacy_env" ? undefined : connectors.salesforce
    });
    return NextResponse.json({ data: task }, { status: 201 });
  } catch (error) {
    if (error instanceof AuthRequiredError) {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to create commitment" },
      { status: 500 }
    );
  }
}

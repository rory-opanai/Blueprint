import { NextResponse } from "next/server";
import { writeTasAnswerToSalesforce } from "@/lib/connectors/salesforce";
import { manualTasUpdateSchema } from "@/lib/validation/schemas";

export async function PATCH(request: Request, { params }: { params: Promise<{ opportunityId: string }> }) {
  const { opportunityId } = await params;
  const parsed = manualTasUpdateSchema.safeParse(await request.json());

  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  try {
    const result = await writeTasAnswerToSalesforce({ opportunityId, ...parsed.data });
    return NextResponse.json({ data: result });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to write TAS answer" },
      { status: 500 }
    );
  }
}

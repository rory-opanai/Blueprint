import { NextResponse } from "next/server";
import { writeCommitmentTaskToSalesforce } from "@/lib/connectors/salesforce";
import { commitmentCreateSchema } from "@/lib/validation/schemas";

export async function POST(request: Request) {
  const parsed = commitmentCreateSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  try {
    const task = await writeCommitmentTaskToSalesforce(parsed.data);
    return NextResponse.json({ data: task }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to create commitment" },
      { status: 500 }
    );
  }
}

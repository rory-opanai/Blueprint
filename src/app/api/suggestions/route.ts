import { NextResponse } from "next/server";
import { listSuggestions } from "@/lib/services/suggestions";
import { AuthRequiredError, requireUserSession } from "@/lib/auth/guards";

export async function GET(request: Request) {
  try {
    await requireUserSession();
    const { searchParams } = new URL(request.url);
    const opportunityId = searchParams.get("opportunityId") ?? undefined;
    const suggestions = listSuggestions(opportunityId);
    return NextResponse.json({ data: suggestions });
  } catch (error) {
    if (error instanceof AuthRequiredError) {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to load suggestions" },
      { status: 500 }
    );
  }
}

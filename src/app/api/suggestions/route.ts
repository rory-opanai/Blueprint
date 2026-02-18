import { NextResponse } from "next/server";
import { listSuggestions } from "@/lib/services/suggestions";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const opportunityId = searchParams.get("opportunityId") ?? undefined;
  const suggestions = listSuggestions(opportunityId);
  return NextResponse.json({ data: suggestions });
}

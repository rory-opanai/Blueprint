import { NextResponse } from "next/server";
import { fetchGongSignal, ingestGongEvidence } from "@/lib/connectors/gong";

export async function POST(request: Request) {
  const body = (await request.json()) as {
    opportunityId?: string;
    accountName?: string;
    opportunityName?: string;
    ownerEmail?: string;
  };

  try {
    if (body.accountName && body.opportunityName) {
      const signal = await fetchGongSignal({
        accountName: body.accountName,
        opportunityName: body.opportunityName,
        ownerEmail: body.ownerEmail
      });

      return NextResponse.json({ data: signal });
    }

    if (!body.opportunityId) {
      return NextResponse.json(
        { error: "Provide opportunityId or accountName + opportunityName" },
        { status: 400 }
      );
    }

    const ingest = await ingestGongEvidence(body.opportunityId);
    return NextResponse.json({ data: ingest });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to ingest Gong evidence" },
      { status: 500 }
    );
  }
}

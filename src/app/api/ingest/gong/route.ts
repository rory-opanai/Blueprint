import { NextResponse } from "next/server";
import { fetchGongSignal, ingestGongEvidence } from "@/lib/connectors/gong";
import { AuthRequiredError, requireUserSession } from "@/lib/auth/guards";
import { viewerConnectorContext } from "@/lib/connectors/runtime";

export async function POST(request: Request) {
  try {
    const viewer = await requireUserSession();
    const connectors = await viewerConnectorContext(viewer.id);
    if (connectors.mode !== "legacy_env" && !connectors.gongEnabled) {
      return NextResponse.json(
        { error: "Gong is not enabled for the current user." },
        { status: 400 }
      );
    }

    const body = (await request.json()) as {
      opportunityId?: string;
      accountName?: string;
      opportunityName?: string;
      ownerEmail?: string;
    };

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
    if (error instanceof AuthRequiredError) {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to ingest Gong evidence" },
      { status: 500 }
    );
  }
}

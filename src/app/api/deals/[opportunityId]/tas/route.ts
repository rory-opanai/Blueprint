import { NextResponse } from "next/server";
import { writeTasAnswerToSalesforce } from "@/lib/connectors/salesforce";
import { manualTasUpdateSchema } from "@/lib/validation/schemas";
import { AuthRequiredError, requireUserSession } from "@/lib/auth/guards";
import { viewerConnectorContext } from "@/lib/connectors/runtime";
import { getDealById } from "@/lib/services/deal-aggregator";
import { prisma } from "@/lib/prisma";
import { upsertManualTasAnswer } from "@/lib/storage/manual-tas";

export async function GET(request: Request, { params }: { params: Promise<{ opportunityId: string }> }) {
  try {
    const viewer = await requireUserSession();
    const { opportunityId } = await params;
    const { searchParams } = new URL(request.url);
    const ownerEmail = searchParams.get("ownerEmail") ?? viewer.email;
    const detail = await getDealById(opportunityId, {
      ownerEmail,
      withSignals: false,
      viewerUserId: viewer.id,
      viewerEmail: viewer.email,
      viewerRole: viewer.role
    });

    if (!detail) {
      return NextResponse.json({ error: "Opportunity not found" }, { status: 404 });
    }
    return NextResponse.json({ data: detail.questions });
  } catch (error) {
    if (error instanceof AuthRequiredError) {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to load TAS questions" },
      { status: 500 }
    );
  }
}

export async function PATCH(request: Request, { params }: { params: Promise<{ opportunityId: string }> }) {
  try {
    const viewer = await requireUserSession();
    const { opportunityId } = await params;
    const parsed = manualTasUpdateSchema.safeParse(await request.json());

    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    }

    const manualDeal = await prisma.manualDeal.findFirst({
      where: {
        id: opportunityId,
        userId: viewer.id
      }
    });

    if (manualDeal) {
      const result = await upsertManualTasAnswer({
        dealId: opportunityId,
        userId: viewer.id,
        questionId: parsed.data.questionId,
        answer: parsed.data.answer,
        updatedBy: parsed.data.actor,
        evidenceLinks: parsed.data.evidenceLinks,
        status: "MANUAL"
      });
      return NextResponse.json({ data: result });
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

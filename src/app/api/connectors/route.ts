import { NextResponse } from "next/server";
import { AuthRequiredError, requireUserSession } from "@/lib/auth/guards";
import { buildConnectorViewsForUser } from "@/lib/connectors/runtime";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const withProbe = searchParams.get("probe") !== "false";

  try {
    const user = await requireUserSession();
    const result = await buildConnectorViewsForUser({
      userId: user.id,
      probe: withProbe
    });

    return NextResponse.json({
      checkedAt: result.checkedAt,
      data: result.connectors,
      slackChannels: result.slackSubscriptions
    });
  } catch (error) {
    if (error instanceof AuthRequiredError) {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }

    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to load connectors" },
      { status: 500 }
    );
  }
}

import { NextResponse } from "next/server";
import { AuthRequiredError, requireUserSession } from "@/lib/auth/guards";
import { removeSlackChannelSubscription } from "@/lib/connectors/accounts";

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireUserSession();
    const { id } = await params;

    await removeSlackChannelSubscription({
      userId: user.id,
      id
    });

    return NextResponse.json({ data: { removed: true, id } });
  } catch (error) {
    if (error instanceof AuthRequiredError) {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to remove Slack channel" },
      { status: 500 }
    );
  }
}

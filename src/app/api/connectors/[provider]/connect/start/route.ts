import { NextResponse } from "next/server";
import { AuthRequiredError, requireUserSession } from "@/lib/auth/guards";
import { startConnectorOAuth, enableWorkspaceConnector } from "@/lib/connectors/oauth";
import { isConnectorProvider, isWorkspaceConfigured } from "@/lib/connectors/runtime";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ provider: string }> }
) {
  try {
    const user = await requireUserSession();
    const { provider: providerRaw } = await params;
    if (!isConnectorProvider(providerRaw)) {
      return NextResponse.json({ error: "Unsupported connector provider" }, { status: 404 });
    }

    if (providerRaw === "gong" || providerRaw === "gtm_agent") {
      if (!isWorkspaceConfigured(providerRaw)) {
        return NextResponse.json(
          {
            error:
              providerRaw === "gong"
                ? "Missing GONG_ACCESS_KEY or GONG_ACCESS_KEY_SECRET."
                : "Missing GTM_AGENT_BASE_URL."
          },
          { status: 400 }
        );
      }
      await enableWorkspaceConnector({
        userId: user.id,
        provider: providerRaw
      });
      return NextResponse.json({ data: { status: "connected", provider: providerRaw } });
    }

    const origin = new URL(request.url).origin;
    const redirectUrl = await startConnectorOAuth({
      userId: user.id,
      provider: providerRaw,
      origin
    });

    return NextResponse.json({ data: { redirectUrl } }, { status: 201 });
  } catch (error) {
    if (error instanceof AuthRequiredError) {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }

    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to start connector auth" },
      { status: 500 }
    );
  }
}

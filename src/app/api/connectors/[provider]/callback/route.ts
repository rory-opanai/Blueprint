import { NextResponse } from "next/server";
import { completeConnectorOAuth } from "@/lib/connectors/oauth";
import { isConnectorProvider } from "@/lib/connectors/runtime";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ provider: string }> }
) {
  const url = new URL(request.url);
  const { provider: providerRaw } = await params;
  if (!isConnectorProvider(providerRaw)) {
    return NextResponse.json({ error: "Unsupported connector provider" }, { status: 404 });
  }

  const state = url.searchParams.get("state");
  const code = url.searchParams.get("code") ?? undefined;
  const error = url.searchParams.get("error") ?? undefined;
  const appRedirect = new URL("/connectors", url.origin);

  if (!state) {
    appRedirect.searchParams.set("error", "Missing OAuth state");
    return NextResponse.redirect(appRedirect);
  }

  try {
    await completeConnectorOAuth({
      provider: providerRaw,
      state,
      code,
      error
    });
    appRedirect.searchParams.set("connected", providerRaw);
    return NextResponse.redirect(appRedirect);
  } catch (cause) {
    appRedirect.searchParams.set(
      "error",
      cause instanceof Error ? cause.message : "OAuth callback failed"
    );
    return NextResponse.redirect(appRedirect);
  }
}

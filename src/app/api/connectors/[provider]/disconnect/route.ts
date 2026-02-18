import { NextResponse } from "next/server";
import { AuthRequiredError, requireUserSession } from "@/lib/auth/guards";
import { disconnectConnectorAccount } from "@/lib/connectors/accounts";
import { isConnectorProvider } from "@/lib/connectors/runtime";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ provider: string }> }
) {
  try {
    const user = await requireUserSession();
    const { provider: providerRaw } = await params;
    if (!isConnectorProvider(providerRaw)) {
      return NextResponse.json({ error: "Unsupported connector provider" }, { status: 404 });
    }

    await disconnectConnectorAccount(user.id, providerRaw);
    return NextResponse.json({ data: { disconnected: true, provider: providerRaw } });
  } catch (error) {
    if (error instanceof AuthRequiredError) {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to disconnect connector" },
      { status: 500 }
    );
  }
}

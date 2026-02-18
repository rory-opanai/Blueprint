import { NextResponse } from "next/server";
import { z } from "zod";
import { AuthRequiredError, requireUserSession } from "@/lib/auth/guards";
import {
  decryptConnectorCredential,
  getConnectorAccountForUser,
  listSlackChannelSubscriptions,
  upsertSlackChannelSubscription
} from "@/lib/connectors/accounts";

const schema = z.object({
  channelId: z.string().min(2),
  channelName: z.string().min(1).optional()
});

async function validateSlackChannel(input: {
  accessToken: string;
  channelId: string;
}): Promise<{ ok: true; channelName?: string } | { ok: false; reason: string }> {
  try {
    const response = await fetch(
      `https://slack.com/api/conversations.info?channel=${encodeURIComponent(input.channelId)}`,
      {
        headers: {
          authorization: `Bearer ${input.accessToken}`
        }
      }
    );
    if (!response.ok) {
      return { ok: false, reason: `Slack API returned ${response.status}.` };
    }
    const payload = (await response.json()) as {
      ok?: boolean;
      error?: string;
      channel?: { name?: string };
    };
    if (!payload.ok) {
      return { ok: false, reason: payload.error ?? "Channel lookup failed." };
    }
    return { ok: true, channelName: payload.channel?.name };
  } catch {
    return { ok: false, reason: "Failed to reach Slack API for channel validation." };
  }
}

export async function GET() {
  try {
    const user = await requireUserSession();
    const rows = await listSlackChannelSubscriptions(user.id);
    return NextResponse.json({
      data: rows.map((row) => ({
        id: row.id,
        channelId: row.channelId,
        channelName: row.channelName ?? undefined,
        isActive: row.isActive,
        createdAt: row.createdAt.toISOString(),
        updatedAt: row.updatedAt.toISOString()
      }))
    });
  } catch (error) {
    if (error instanceof AuthRequiredError) {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to load Slack channels" },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireUserSession();
    const parsed = schema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    }

    const account = await getConnectorAccountForUser(user.id, "slack");
    if (!account || account.status !== "connected") {
      return NextResponse.json({ error: "Connect Slack before binding channels." }, { status: 400 });
    }
    const credential = decryptConnectorCredential(account.credential);
    if (!credential?.accessToken) {
      return NextResponse.json({ error: "Slack token missing. Reconnect Slack." }, { status: 400 });
    }

    const validated = await validateSlackChannel({
      accessToken: credential.accessToken,
      channelId: parsed.data.channelId
    });
    if (!validated.ok) {
      return NextResponse.json({ error: validated.reason }, { status: 400 });
    }

    const row = await upsertSlackChannelSubscription({
      userId: user.id,
      connectorAccountId: account.id,
      channelId: parsed.data.channelId,
      channelName: parsed.data.channelName ?? validated.channelName
    });

    return NextResponse.json(
      {
        data: {
          id: row.id,
          channelId: row.channelId,
          channelName: row.channelName ?? undefined,
          isActive: row.isActive,
          createdAt: row.createdAt.toISOString(),
          updatedAt: row.updatedAt.toISOString()
        }
      },
      { status: 201 }
    );
  } catch (error) {
    if (error instanceof AuthRequiredError) {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to bind Slack channel" },
      { status: 500 }
    );
  }
}

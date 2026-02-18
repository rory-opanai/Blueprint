import { NextResponse } from "next/server";
import { z } from "zod";
import { ConnectorAccountStatus } from "@prisma/client";
import { AuthRequiredError, requireUserSession } from "@/lib/auth/guards";
import {
  setConnectorCredential,
  upsertConnectorAccount
} from "@/lib/connectors/accounts";
import { probeSalesforceConnection } from "@/lib/connectors/salesforce";

const schema = z.object({
  instanceUrl: z.string().url(),
  accessToken: z.string().min(10),
  refreshToken: z.string().min(10).optional(),
  apiVersion: z.string().min(2).optional(),
  tasFieldMap: z.record(z.string(), z.string()).optional()
});

function parseTasFieldMapEnv(): Record<string, string> {
  const raw = process.env.SALESFORCE_TAS_FIELD_MAP;
  if (!raw) return {};
  try {
    return JSON.parse(raw) as Record<string, string>;
  } catch {
    return {};
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireUserSession();
    const parsed = schema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    }

    const probe = await probeSalesforceConnection({
      instanceUrl: parsed.data.instanceUrl,
      accessToken: parsed.data.accessToken,
      apiVersion: parsed.data.apiVersion
    });
    if (!probe.connected) {
      return NextResponse.json(
        { error: probe.message ?? "Salesforce token validation failed." },
        { status: 400 }
      );
    }

    const account = await upsertConnectorAccount({
      userId: user.id,
      provider: "salesforce",
      status: ConnectorAccountStatus.connected,
      lastError: null
    });

    await setConnectorCredential({
      connectorAccountId: account.id,
      accessToken: parsed.data.accessToken,
      refreshToken: parsed.data.refreshToken,
      metadata: {
        instanceUrl: parsed.data.instanceUrl,
        apiVersion: parsed.data.apiVersion ?? process.env.SALESFORCE_API_VERSION ?? "v60.0",
        tasObject: process.env.SALESFORCE_TAS_OBJECT ?? "Opportunity_Blueprint__c",
        tasOpportunityField: process.env.SALESFORCE_TAS_OPPORTUNITY_FIELD ?? "Opportunity__c",
        taskWhatIdField: process.env.SALESFORCE_TASK_WHATID_FIELD ?? "WhatId",
        tasFieldMap: parsed.data.tasFieldMap ?? parseTasFieldMapEnv()
      }
    });

    return NextResponse.json({
      data: {
        provider: "salesforce",
        status: "connected",
        mode: "manual_token"
      }
    });
  } catch (error) {
    if (error instanceof AuthRequiredError) {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to store manual Salesforce token" },
      { status: 500 }
    );
  }
}

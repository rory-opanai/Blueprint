import crypto from "node:crypto";
import { ConnectorAccountStatus, ConnectorProvider, Prisma } from "@prisma/client";
import {
  consumeConnectorOauthState,
  createConnectorOauthState,
  setConnectorCredential,
  upsertConnectorAccount
} from "@/lib/connectors/accounts";
import { providerScopesDefault } from "@/lib/connectors/runtime";

function randomState(): string {
  return crypto.randomUUID().replace(/-/g, "");
}

function ensureEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing ${name}.`);
  }
  return value;
}

function connectorRedirectUri(origin: string, provider: ConnectorProvider): string {
  return `${origin.replace(/\/$/, "")}/api/connectors/${provider}/callback`;
}

function asJsonValue(value: unknown): Prisma.InputJsonValue | undefined {
  if (value === undefined) return undefined;
  return value as Prisma.InputJsonValue;
}

function parseTasFieldMapEnv(): Record<string, string> {
  const raw = process.env.SALESFORCE_TAS_FIELD_MAP;
  if (!raw) return {};
  try {
    return JSON.parse(raw) as Record<string, string>;
  } catch {
    return {};
  }
}

async function startGoogleOAuth(input: {
  userId: string;
  provider: ConnectorProvider;
  origin: string;
}) {
  const state = randomState();
  const redirectUri = connectorRedirectUri(input.origin, input.provider);
  const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID ?? process.env.NEXTAUTH_GOOGLE_ID;
  if (!clientId) {
    throw new Error("Missing GOOGLE_OAUTH_CLIENT_ID or NEXTAUTH_GOOGLE_ID.");
  }

  await createConnectorOauthState({
    userId: input.userId,
    provider: input.provider,
    state,
    redirectUri
  });

  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("access_type", "offline");
  url.searchParams.set("prompt", "consent");
  url.searchParams.set("include_granted_scopes", "true");
  url.searchParams.set("scope", providerScopesDefault("gmail").join(" "));
  url.searchParams.set("state", state);
  return url.toString();
}

async function startSalesforceOAuth(input: {
  userId: string;
  provider: ConnectorProvider;
  origin: string;
}) {
  const state = randomState();
  const redirectUri = connectorRedirectUri(input.origin, input.provider);
  const clientId = process.env.SALESFORCE_OAUTH_CLIENT_ID ?? process.env.SALESFORCE_CLIENT_ID;
  if (!clientId) {
    throw new Error("Missing SALESFORCE_OAUTH_CLIENT_ID or SALESFORCE_CLIENT_ID.");
  }

  await createConnectorOauthState({
    userId: input.userId,
    provider: input.provider,
    state,
    redirectUri
  });

  const authorizeUrl =
    process.env.SALESFORCE_OAUTH_AUTHORIZE_URL ??
    "https://login.salesforce.com/services/oauth2/authorize";

  const url = new URL(authorizeUrl);
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", providerScopesDefault("salesforce").join(" "));
  url.searchParams.set("state", state);
  return url.toString();
}

async function startSlackOAuth(input: {
  userId: string;
  provider: ConnectorProvider;
  origin: string;
}) {
  const state = randomState();
  const redirectUri = connectorRedirectUri(input.origin, input.provider);
  const clientId = ensureEnv("SLACK_CLIENT_ID");

  await createConnectorOauthState({
    userId: input.userId,
    provider: input.provider,
    state,
    redirectUri
  });

  const url = new URL("https://slack.com/oauth/v2/authorize");
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("state", state);
  url.searchParams.set("user_scope", providerScopesDefault("slack").join(","));
  url.searchParams.set("scope", "channels:read,groups:read");
  return url.toString();
}

export async function startConnectorOAuth(input: {
  userId: string;
  provider: ConnectorProvider;
  origin: string;
}) {
  if (input.provider === "gmail") return startGoogleOAuth(input);
  if (input.provider === "salesforce") return startSalesforceOAuth(input);
  if (input.provider === "slack") return startSlackOAuth(input);
  throw new Error(`OAuth is not supported for ${input.provider}.`);
}

async function finalizeGoogleOAuth(input: {
  userId: string;
  code: string;
  redirectUri: string;
}) {
  const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID ?? process.env.NEXTAUTH_GOOGLE_ID;
  const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET ?? process.env.NEXTAUTH_GOOGLE_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error("Missing Google OAuth client credentials.");
  }
  const body = new URLSearchParams({
    code: input.code,
    client_id: clientId,
    client_secret: clientSecret,
    redirect_uri: input.redirectUri,
    grant_type: "authorization_code"
  });

  const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body
  });
  if (!tokenResponse.ok) {
    throw new Error(`Google token exchange failed (${tokenResponse.status}).`);
  }
  const tokenPayload = (await tokenResponse.json()) as {
    access_token?: string;
    refresh_token?: string;
    expires_in?: number;
    scope?: string;
  };
  if (!tokenPayload.access_token) {
    throw new Error("Google token exchange returned no access_token.");
  }

  const profileResponse = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/profile", {
    headers: { authorization: `Bearer ${tokenPayload.access_token}` }
  });
  if (!profileResponse.ok) {
    throw new Error(`Gmail profile probe failed (${profileResponse.status}).`);
  }
  const profile = (await profileResponse.json()) as {
    emailAddress?: string;
  };

  const account = await upsertConnectorAccount({
    userId: input.userId,
    provider: "gmail",
    status: ConnectorAccountStatus.connected,
    scopes: asJsonValue(tokenPayload.scope?.split(/\s+/).filter(Boolean)),
    externalUserId: profile.emailAddress,
    externalTenantId: "google",
    lastError: null
  });

  await setConnectorCredential({
    connectorAccountId: account.id,
    accessToken: tokenPayload.access_token,
    refreshToken: tokenPayload.refresh_token,
    expiresAt: tokenPayload.expires_in
      ? new Date(Date.now() + tokenPayload.expires_in * 1000)
      : undefined,
    metadata: asJsonValue({
      email: profile.emailAddress
    })
  });
}

async function finalizeSalesforceOAuth(input: {
  userId: string;
  code: string;
  redirectUri: string;
}) {
  const clientId = process.env.SALESFORCE_OAUTH_CLIENT_ID ?? process.env.SALESFORCE_CLIENT_ID;
  const clientSecret =
    process.env.SALESFORCE_OAUTH_CLIENT_SECRET ?? process.env.SALESFORCE_CLIENT_SECRET;
  const tokenUrl =
    process.env.SALESFORCE_OAUTH_TOKEN_URL ?? "https://login.salesforce.com/services/oauth2/token";
  if (!clientId || !clientSecret) {
    throw new Error("Missing Salesforce OAuth client credentials.");
  }

  const body = new URLSearchParams({
    code: input.code,
    client_id: clientId,
    client_secret: clientSecret,
    redirect_uri: input.redirectUri,
    grant_type: "authorization_code"
  });

  const tokenResponse = await fetch(tokenUrl, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body
  });
  if (!tokenResponse.ok) {
    throw new Error(`Salesforce token exchange failed (${tokenResponse.status}).`);
  }

  const tokenPayload = (await tokenResponse.json()) as {
    access_token?: string;
    refresh_token?: string;
    instance_url?: string;
    id?: string;
    scope?: string;
  };
  if (!tokenPayload.access_token || !tokenPayload.instance_url) {
    throw new Error("Salesforce token exchange returned incomplete credentials.");
  }

  const account = await upsertConnectorAccount({
    userId: input.userId,
    provider: "salesforce",
    status: ConnectorAccountStatus.connected,
    scopes: asJsonValue(tokenPayload.scope?.split(/\s+/).filter(Boolean)),
    externalUserId: tokenPayload.id,
    externalTenantId: tokenPayload.instance_url,
    lastError: null
  });

  await setConnectorCredential({
    connectorAccountId: account.id,
    accessToken: tokenPayload.access_token,
    refreshToken: tokenPayload.refresh_token,
    metadata: asJsonValue({
      instanceUrl: tokenPayload.instance_url,
      apiVersion: process.env.SALESFORCE_API_VERSION ?? "v60.0",
      tasObject: process.env.SALESFORCE_TAS_OBJECT ?? "Opportunity_Blueprint__c",
      tasOpportunityField: process.env.SALESFORCE_TAS_OPPORTUNITY_FIELD ?? "Opportunity__c",
      taskWhatIdField: process.env.SALESFORCE_TASK_WHATID_FIELD ?? "WhatId",
      tasFieldMap: parseTasFieldMapEnv()
    })
  });
}

async function finalizeSlackOAuth(input: {
  userId: string;
  code: string;
  redirectUri: string;
}) {
  const clientId = ensureEnv("SLACK_CLIENT_ID");
  const clientSecret = ensureEnv("SLACK_CLIENT_SECRET");
  const body = new URLSearchParams({
    code: input.code,
    client_id: clientId,
    client_secret: clientSecret,
    redirect_uri: input.redirectUri
  });

  const tokenResponse = await fetch("https://slack.com/api/oauth.v2.access", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body
  });
  if (!tokenResponse.ok) {
    throw new Error(`Slack token exchange failed (${tokenResponse.status}).`);
  }
  const tokenPayload = (await tokenResponse.json()) as {
    ok?: boolean;
    error?: string;
    access_token?: string;
    scope?: string;
    authed_user?: {
      id?: string;
      access_token?: string;
      scope?: string;
      refresh_token?: string;
      expires_in?: number;
    };
    team?: {
      id?: string;
      name?: string;
    };
  };
  if (!tokenPayload.ok) {
    throw new Error(tokenPayload.error ?? "Slack OAuth failed.");
  }

  const userToken = tokenPayload.authed_user?.access_token ?? tokenPayload.access_token;
  if (!userToken) {
    throw new Error("Slack OAuth did not return a user access token.");
  }

  const account = await upsertConnectorAccount({
    userId: input.userId,
    provider: "slack",
    status: ConnectorAccountStatus.connected,
    scopes: asJsonValue(
      (tokenPayload.authed_user?.scope ?? tokenPayload.scope)?.split(/[,\s]+/).filter(Boolean)
    ),
    externalUserId: tokenPayload.authed_user?.id,
    externalTenantId: tokenPayload.team?.id,
    lastError: null
  });

  await setConnectorCredential({
    connectorAccountId: account.id,
    accessToken: userToken,
    refreshToken: tokenPayload.authed_user?.refresh_token,
    expiresAt: tokenPayload.authed_user?.expires_in
      ? new Date(Date.now() + tokenPayload.authed_user.expires_in * 1000)
      : undefined,
    metadata: asJsonValue({
      teamId: tokenPayload.team?.id,
      teamName: tokenPayload.team?.name
    })
  });
}

export async function completeConnectorOAuth(input: {
  provider: ConnectorProvider;
  state: string;
  code?: string;
  error?: string;
}) {
  if (input.error) {
    throw new Error(`OAuth authorization failed: ${input.error}`);
  }
  if (!input.code) {
    throw new Error("Missing OAuth authorization code.");
  }

  const state = await consumeConnectorOauthState({
    provider: input.provider,
    state: input.state
  });
  if (!state) {
    throw new Error("OAuth state is invalid or expired.");
  }

  if (input.provider === "gmail") {
    await finalizeGoogleOAuth({
      userId: state.userId,
      code: input.code,
      redirectUri: state.redirectUri
    });
    return;
  }

  if (input.provider === "salesforce") {
    await finalizeSalesforceOAuth({
      userId: state.userId,
      code: input.code,
      redirectUri: state.redirectUri
    });
    return;
  }

  if (input.provider === "slack") {
    await finalizeSlackOAuth({
      userId: state.userId,
      code: input.code,
      redirectUri: state.redirectUri
    });
    return;
  }

  throw new Error(`OAuth callback is not supported for ${input.provider}.`);
}

export async function enableWorkspaceConnector(input: {
  userId: string;
  provider: "gong" | "gtm_agent";
}) {
  await upsertConnectorAccount({
    userId: input.userId,
    provider: input.provider,
    status: ConnectorAccountStatus.connected,
    scopes: [],
    lastError: null
  });
}

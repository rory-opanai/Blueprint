import { ConnectorAccountStatus, ConnectorProvider, Prisma, UserRole } from "@prisma/client";
import { ConnectorAccountView, ConnectorStatus, SlackChannelSubscriptionView } from "@/lib/types";
import {
  decryptConnectorCredential,
  listConnectorAccountsForUser,
  listSlackChannelSubscriptions,
  refreshConnectorHealth,
  setConnectorCredential,
  upsertConnectorAccount
} from "@/lib/connectors/accounts";
import {
  GmailCredentialInput,
  isGmailEnabled,
  probeGmailConnection
} from "@/lib/integrations/gmail";
import {
  SlackCredentialInput,
  isSlackEnabled,
  isSlackEventsEnabled,
  probeSlackConnection
} from "@/lib/integrations/slack";
import {
  SalesforceCredentialInput,
  isSalesforceEnabled,
  probeSalesforceConnection
} from "@/lib/connectors/salesforce";
import { isGongEnabled, probeGongConnection } from "@/lib/connectors/gong";
import { isGtmAgentEnabled, probeGtmAgentConnection } from "@/lib/integrations/gtm-agent";

export const CONNECTOR_PROVIDERS: ConnectorProvider[] = [
  "salesforce",
  "gmail",
  "slack",
  "gong",
  "gtm_agent"
];

export function isConnectorProvider(value: string): value is ConnectorProvider {
  return CONNECTOR_PROVIDERS.includes(value as ConnectorProvider);
}

export type ConnectorAuthMode = "user_scoped" | "legacy_env";

type ConnectorCredentialBundle = {
  accessToken?: string;
  refreshToken?: string;
  apiKey?: string;
  apiSecret?: string;
  expiresAt?: Date;
  metadata?: Prisma.JsonValue;
};

type RuntimeConnectorRow = {
  provider: ConnectorProvider;
  account: Awaited<ReturnType<typeof listConnectorAccountsForUser>>[number] | undefined;
  credential: ConnectorCredentialBundle | null;
};

type TokenRefreshResult = {
  accessToken: string;
  refreshToken?: string;
  expiresAt?: Date;
};

export type ViewerConnectorContext = {
  mode: ConnectorAuthMode;
  salesforce?: SalesforceCredentialInput;
  gmail?: GmailCredentialInput;
  slack?: SlackCredentialInput;
  gongEnabled: boolean;
  gtmAgentEnabled: boolean;
};

export function connectorAuthMode(): ConnectorAuthMode {
  return process.env.CONNECTOR_AUTH_MODE === "legacy_env" ? "legacy_env" : "user_scoped";
}

export function isWorkspaceConfigured(provider: ConnectorProvider): boolean {
  if (provider === "gong") {
    return Boolean(process.env.GONG_ACCESS_KEY && process.env.GONG_ACCESS_KEY_SECRET);
  }
  if (provider === "gtm_agent") {
    return Boolean(process.env.GTM_AGENT_BASE_URL);
  }
  return true;
}

function workspaceMissingMessage(provider: ConnectorProvider): string {
  if (provider === "gong") {
    return "Missing GONG_ACCESS_KEY or GONG_ACCESS_KEY_SECRET workspace secret.";
  }
  if (provider === "gtm_agent") {
    return "Missing GTM_AGENT_BASE_URL workspace setting.";
  }
  return "Workspace prerequisite missing.";
}

function asInputJson(value: Prisma.JsonValue | null | undefined): Prisma.InputJsonValue | undefined {
  if (value === null || value === undefined) return undefined;
  return value as Prisma.InputJsonValue;
}

function missingConfigMessage(provider: ConnectorProvider): string {
  if (provider === "salesforce") return "Connect Salesforce OAuth or add a manual access token.";
  if (provider === "gmail") return "Connect Gmail OAuth to ingest recent deal threads.";
  if (provider === "slack") return "Connect Slack OAuth and bind at least one Blueprint channel.";
  if (provider === "gong") return "Enable Gong for this user after workspace secrets are configured.";
  if (provider === "gtm_agent") return "Enable GTM Agent for this user after workspace settings are configured.";
  return "Connector is not configured.";
}

function parseSalesforceCredential(credential: ConnectorCredentialBundle | null): SalesforceCredentialInput | undefined {
  if (!credential?.accessToken) return undefined;
  const metadata =
    credential.metadata && typeof credential.metadata === "object" && !Array.isArray(credential.metadata)
      ? (credential.metadata as Record<string, unknown>)
      : {};

  return {
    accessToken: credential.accessToken,
    refreshToken: credential.refreshToken,
    instanceUrl:
      typeof metadata.instanceUrl === "string"
        ? metadata.instanceUrl
        : typeof metadata.instanceURL === "string"
          ? metadata.instanceURL
          : undefined,
    apiVersion: typeof metadata.apiVersion === "string" ? metadata.apiVersion : undefined,
    tasObject: typeof metadata.tasObject === "string" ? metadata.tasObject : undefined,
    tasOpportunityField:
      typeof metadata.tasOpportunityField === "string" ? metadata.tasOpportunityField : undefined,
    taskWhatIdField:
      typeof metadata.taskWhatIdField === "string" ? metadata.taskWhatIdField : undefined,
    tasFieldMap:
      metadata.tasFieldMap && typeof metadata.tasFieldMap === "object" && !Array.isArray(metadata.tasFieldMap)
        ? (metadata.tasFieldMap as Record<string, string>)
        : undefined
  };
}

function parseSlackCredential(credential: ConnectorCredentialBundle | null): SlackCredentialInput | undefined {
  if (!credential?.accessToken) return undefined;
  return { accessToken: credential.accessToken };
}

function parseGmailCredential(credential: ConnectorCredentialBundle | null): GmailCredentialInput | undefined {
  if (!credential?.accessToken) return undefined;
  return { accessToken: credential.accessToken };
}

async function refreshGoogleToken(refreshToken: string): Promise<TokenRefreshResult | null> {
  const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID ?? process.env.NEXTAUTH_GOOGLE_ID;
  const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET ?? process.env.NEXTAUTH_GOOGLE_SECRET;
  if (!clientId || !clientSecret) return null;

  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    grant_type: "refresh_token",
    refresh_token: refreshToken
  });

  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded"
    },
    body
  });

  if (!response.ok) return null;
  const payload = (await response.json()) as {
    access_token?: string;
    expires_in?: number;
    refresh_token?: string;
  };
  if (!payload.access_token) return null;

  return {
    accessToken: payload.access_token,
    refreshToken: payload.refresh_token ?? refreshToken,
    expiresAt: payload.expires_in ? new Date(Date.now() + payload.expires_in * 1000) : undefined
  };
}

async function refreshSalesforceToken(refreshToken: string): Promise<TokenRefreshResult | null> {
  const clientId = process.env.SALESFORCE_OAUTH_CLIENT_ID ?? process.env.SALESFORCE_CLIENT_ID;
  const clientSecret = process.env.SALESFORCE_OAUTH_CLIENT_SECRET ?? process.env.SALESFORCE_CLIENT_SECRET;
  const tokenUrl =
    process.env.SALESFORCE_OAUTH_TOKEN_URL ?? "https://login.salesforce.com/services/oauth2/token";
  if (!clientId || !clientSecret) return null;

  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    grant_type: "refresh_token",
    refresh_token: refreshToken
  });

  const response = await fetch(tokenUrl, {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded"
    },
    body
  });

  if (!response.ok) return null;
  const payload = (await response.json()) as {
    access_token?: string;
    refresh_token?: string;
  };
  if (!payload.access_token) return null;

  return {
    accessToken: payload.access_token,
    refreshToken: payload.refresh_token ?? refreshToken
  };
}

async function refreshIfNeeded(row: RuntimeConnectorRow): Promise<ConnectorCredentialBundle | null> {
  const account = row.account;
  if (!account) return null;

  const decrypted = decryptConnectorCredential(account.credential);
  if (!decrypted?.accessToken) return decrypted;
  if (!decrypted.expiresAt) return decrypted;
  if (decrypted.expiresAt.getTime() > Date.now() + 60_000) return decrypted;
  if (!decrypted.refreshToken) return decrypted;

  try {
    const refreshed =
      account.provider === "gmail"
        ? await refreshGoogleToken(decrypted.refreshToken)
        : account.provider === "salesforce"
          ? await refreshSalesforceToken(decrypted.refreshToken)
          : null;

    if (!refreshed) {
      await upsertConnectorAccount({
        userId: account.userId,
        provider: account.provider,
        status: ConnectorAccountStatus.expired,
        scopes: asInputJson(account.scopes),
        externalUserId: account.externalUserId ?? undefined,
        externalTenantId: account.externalTenantId ?? undefined,
        lastError: "Refresh token exchange failed."
      });
      return decrypted;
    }

    await setConnectorCredential({
      connectorAccountId: account.id,
      accessToken: refreshed.accessToken,
      refreshToken: refreshed.refreshToken ?? decrypted.refreshToken,
      expiresAt: refreshed.expiresAt,
      metadata: decrypted.metadata as Prisma.InputJsonValue
    });

    await upsertConnectorAccount({
      userId: account.userId,
      provider: account.provider,
      status: ConnectorAccountStatus.connected,
      scopes: asInputJson(account.scopes),
      externalUserId: account.externalUserId ?? undefined,
      externalTenantId: account.externalTenantId ?? undefined,
      lastError: null
    });

    return {
      ...decrypted,
      accessToken: refreshed.accessToken,
      refreshToken: refreshed.refreshToken ?? decrypted.refreshToken,
      expiresAt: refreshed.expiresAt ?? decrypted.expiresAt
    };
  } catch {
    await upsertConnectorAccount({
      userId: account.userId,
      provider: account.provider,
      status: ConnectorAccountStatus.expired,
      scopes: asInputJson(account.scopes),
      externalUserId: account.externalUserId ?? undefined,
      externalTenantId: account.externalTenantId ?? undefined,
      lastError: "Refresh flow failed."
    });
    return decrypted;
  }
}

async function runtimeRowsForUser(userId: string): Promise<RuntimeConnectorRow[]> {
  const accounts = await listConnectorAccountsForUser(userId);
  const byProvider = new Map(accounts.map((account) => [account.provider, account]));
  const rows: RuntimeConnectorRow[] = [];

  for (const provider of CONNECTOR_PROVIDERS) {
    const account = byProvider.get(provider);
    rows.push({
      provider,
      account,
      credential: account ? await refreshIfNeeded({ provider, account, credential: null }) : null
    });
  }

  return rows;
}

function statusForAccount(input: {
  account: RuntimeConnectorRow["account"];
  probeConnected?: boolean;
  workspaceConfigured: boolean;
}): ConnectorStatus {
  const account = input.account;
  if (!account || account.status === ConnectorAccountStatus.disconnected) {
    return "missing_config";
  }

  if (account.status === ConnectorAccountStatus.expired) {
    return "expired";
  }

  if (account.status === ConnectorAccountStatus.error) {
    return "degraded";
  }

  if (account.status === ConnectorAccountStatus.connected) {
    if (!input.workspaceConfigured) return "degraded";
    if (typeof input.probeConnected === "boolean") {
      return input.probeConnected ? "connected" : "degraded";
    }
    return "configured";
  }

  return "missing_config";
}

function actionForStatus(input: {
  status: ConnectorStatus;
  provider: ConnectorProvider;
  slackHasChannels: boolean;
}): ConnectorAccountView["action"] {
  if (input.status === "missing_config") return "connect";
  if (input.status === "expired") return "reconnect";
  if (input.status === "degraded") return "reconnect";
  if (input.provider === "slack" && !input.slackHasChannels) return "configure_channel";
  return "disconnect";
}

export async function buildConnectorViewsForUser(input: {
  userId: string;
  probe?: boolean;
}): Promise<{
  checkedAt: string;
  connectors: ConnectorAccountView[];
  slackSubscriptions: SlackChannelSubscriptionView[];
}> {
  const checkedAt = new Date().toISOString();
  const rows = await runtimeRowsForUser(input.userId);
  const subscriptions = await listSlackChannelSubscriptions(input.userId);
  const hasSlackChannels = subscriptions.some((row) => row.isActive);
  const withProbe = input.probe ?? true;

  const connectors = await Promise.all(
    rows.map(async (row): Promise<ConnectorAccountView> => {
      let probeConnected: boolean | undefined;
      let details: string | undefined;
      let mode: string | undefined;
      const workspaceConfigured = isWorkspaceConfigured(row.provider);

      if (withProbe && row.account?.status === ConnectorAccountStatus.connected) {
        if (row.provider === "salesforce") {
          const probe = await probeSalesforceConnection(parseSalesforceCredential(row.credential));
          probeConnected = probe.connected;
          details = probe.message;
        } else if (row.provider === "gmail") {
          const probe = await probeGmailConnection(parseGmailCredential(row.credential));
          probeConnected = probe.connected;
          details = probe.message;
        } else if (row.provider === "slack") {
          const probe = await probeSlackConnection({
            credential: parseSlackCredential(row.credential),
            requireEvents: true
          });
          probeConnected = probe.connected;
          details = probe.message;
          mode = probe.mode;
        } else if (row.provider === "gong") {
          const probe = await probeGongConnection();
          probeConnected = workspaceConfigured ? probe.connected : false;
          details = workspaceConfigured ? probe.message : workspaceMissingMessage(row.provider);
        } else if (row.provider === "gtm_agent") {
          const probe = await probeGtmAgentConnection();
          probeConnected = workspaceConfigured ? probe.connected : false;
          details = workspaceConfigured ? probe.message : workspaceMissingMessage(row.provider);
        }
      }

      const status = statusForAccount({
        account: row.account,
        probeConnected,
        workspaceConfigured
      });

      if (!workspaceConfigured) {
        details = workspaceMissingMessage(row.provider);
      } else if (!details && row.account?.lastError) {
        details = row.account.lastError;
      } else if (!details && status === "missing_config") {
        details = missingConfigMessage(row.provider);
      } else if (row.provider === "slack" && status === "connected" && !isSlackEventsEnabled()) {
        details = "Slack connected for search/read. Configure SLACK_SIGNING_SECRET to ingest channel events.";
      }

      await refreshConnectorHealth({
        userId: input.userId,
        connectorType: row.provider,
        status,
        details
      });

      return {
        connectorType: row.provider,
        status,
        mode,
        details,
        lastCheckedAt: row.account?.lastCheckedAt?.toISOString() ?? checkedAt,
        action: actionForStatus({
          status,
          provider: row.provider,
          slackHasChannels: hasSlackChannels
        }),
        isWorkspaceException: row.provider === "gong" || row.provider === "gtm_agent"
      };
    })
  );

  return {
    checkedAt,
    connectors,
    slackSubscriptions: subscriptions.map((subscription) => ({
      id: subscription.id,
      channelId: subscription.channelId,
      channelName: subscription.channelName ?? undefined,
      isActive: subscription.isActive,
      createdAt: subscription.createdAt.toISOString(),
      updatedAt: subscription.updatedAt.toISOString()
    }))
  };
}

export async function viewerConnectorContext(userId: string): Promise<ViewerConnectorContext> {
  const mode = connectorAuthMode();
  if (mode === "legacy_env") {
    return {
      mode,
      salesforce: isSalesforceEnabled() ? {} : undefined,
      gmail: isGmailEnabled() ? {} : undefined,
      slack: isSlackEnabled() ? {} : undefined,
      gongEnabled: isGongEnabled(),
      gtmAgentEnabled: isGtmAgentEnabled()
    };
  }

  const rows = await runtimeRowsForUser(userId);
  const byProvider = new Map(rows.map((row) => [row.provider, row]));

  const salesforce = byProvider.get("salesforce");
  const gmail = byProvider.get("gmail");
  const slack = byProvider.get("slack");
  const gong = byProvider.get("gong");
  const gtm = byProvider.get("gtm_agent");

  const salesforceCredential =
    salesforce?.account?.status === ConnectorAccountStatus.connected
      ? parseSalesforceCredential(salesforce.credential)
      : undefined;
  const gmailCredential =
    gmail?.account?.status === ConnectorAccountStatus.connected
      ? parseGmailCredential(gmail.credential)
      : undefined;
  const slackCredential =
    slack?.account?.status === ConnectorAccountStatus.connected
      ? parseSlackCredential(slack.credential)
      : undefined;

  return {
    mode,
    salesforce: salesforceCredential,
    gmail: gmailCredential,
    slack: slackCredential,
    gongEnabled:
      gong?.account?.status === ConnectorAccountStatus.connected && isWorkspaceConfigured("gong"),
    gtmAgentEnabled:
      gtm?.account?.status === ConnectorAccountStatus.connected && isWorkspaceConfigured("gtm_agent")
  };
}

export function providerRequiresOAuth(provider: ConnectorProvider): boolean {
  return provider === "salesforce" || provider === "gmail" || provider === "slack";
}

export function providerSupportsManualToken(provider: ConnectorProvider): boolean {
  return provider === "salesforce";
}

export function providerScopesDefault(provider: ConnectorProvider): string[] {
  if (provider === "gmail") {
    return ["https://www.googleapis.com/auth/gmail.readonly", "openid", "email", "profile"];
  }
  if (provider === "salesforce") {
    return ["api", "refresh_token"];
  }
  if (provider === "slack") {
    return [
      "search:read",
      "channels:history",
      "groups:history",
      "im:history",
      "mpim:history",
      "channels:read",
      "groups:read"
    ];
  }
  return [];
}

export function formatConnectorStatusLabel(status: ConnectorStatus): string {
  if (status === "connected") return "Connected";
  if (status === "configured") return "Configured";
  if (status === "degraded") return "Needs Attention";
  if (status === "expired") return "Needs Reauth";
  return "Not Connected";
}

export function roleFromSession(value?: string): UserRole {
  if (value === "SE" || value === "SA" || value === "MANAGER" || value === "AD") {
    return value;
  }
  return "AD";
}

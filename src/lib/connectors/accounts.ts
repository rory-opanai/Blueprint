import {
  ConnectorAccountStatus,
  ConnectorProvider,
  Prisma
} from "@prisma/client";
import crypto from "node:crypto";
import { prisma } from "@/lib/prisma";
import { encryptSecret, tryDecryptSecret } from "@/lib/security/encryption";

function hashState(state: string): string {
  return crypto.createHash("sha256").update(state).digest("hex");
}

export async function listConnectorAccountsForUser(userId: string) {
  return prisma.connectorAccount.findMany({
    where: { userId },
    include: {
      credential: true,
      slackSubscriptions: true
    },
    orderBy: {
      provider: "asc"
    }
  });
}

export async function getConnectorAccountForUser(userId: string, provider: ConnectorProvider) {
  return prisma.connectorAccount.findUnique({
    where: {
      userId_provider: {
        userId,
        provider
      }
    },
    include: {
      credential: true,
      slackSubscriptions: true
    }
  });
}

export async function upsertConnectorAccount(input: {
  userId: string;
  provider: ConnectorProvider;
  status: ConnectorAccountStatus;
  scopes?: Prisma.InputJsonValue;
  externalUserId?: string;
  externalTenantId?: string;
  lastError?: string | null;
}) {
  return prisma.connectorAccount.upsert({
    where: {
      userId_provider: {
        userId: input.userId,
        provider: input.provider
      }
    },
    create: {
      userId: input.userId,
      provider: input.provider,
      status: input.status,
      scopes: input.scopes,
      externalUserId: input.externalUserId,
      externalTenantId: input.externalTenantId,
      lastCheckedAt: new Date(),
      lastError: input.lastError ?? null
    },
    update: {
      status: input.status,
      scopes: input.scopes,
      externalUserId: input.externalUserId,
      externalTenantId: input.externalTenantId,
      lastCheckedAt: new Date(),
      lastError: input.lastError ?? null
    }
  });
}

export async function setConnectorCredential(input: {
  connectorAccountId: string;
  accessToken?: string;
  refreshToken?: string;
  apiKey?: string;
  apiSecret?: string;
  expiresAt?: Date;
  metadata?: Prisma.InputJsonValue;
}) {
  const accessTokenEnc = input.accessToken ? encryptSecret(input.accessToken) : null;
  const refreshTokenEnc = input.refreshToken ? encryptSecret(input.refreshToken) : null;
  const apiKeyEnc = input.apiKey ? encryptSecret(input.apiKey) : null;
  const apiSecretEnc = input.apiSecret ? encryptSecret(input.apiSecret) : null;

  return prisma.connectorCredential.upsert({
    where: {
      connectorAccountId: input.connectorAccountId
    },
    create: {
      connectorAccountId: input.connectorAccountId,
      accessTokenEnc: accessTokenEnc?.ciphertext,
      refreshTokenEnc: refreshTokenEnc?.ciphertext,
      apiKeyEnc: apiKeyEnc?.ciphertext,
      apiSecretEnc: apiSecretEnc?.ciphertext,
      encryptionVersion:
        accessTokenEnc?.version ??
        refreshTokenEnc?.version ??
        apiKeyEnc?.version ??
        apiSecretEnc?.version ??
        1,
      expiresAt: input.expiresAt,
      metadata: input.metadata
    },
    update: {
      accessTokenEnc: accessTokenEnc?.ciphertext ?? undefined,
      refreshTokenEnc: refreshTokenEnc?.ciphertext ?? undefined,
      apiKeyEnc: apiKeyEnc?.ciphertext ?? undefined,
      apiSecretEnc: apiSecretEnc?.ciphertext ?? undefined,
      encryptionVersion:
        accessTokenEnc?.version ??
        refreshTokenEnc?.version ??
        apiKeyEnc?.version ??
        apiSecretEnc?.version ??
        1,
      expiresAt: input.expiresAt,
      metadata: input.metadata,
      rotatedAt: new Date()
    }
  });
}

export function decryptConnectorCredential(
  credential?: {
    accessTokenEnc?: string | null;
    refreshTokenEnc?: string | null;
    apiKeyEnc?: string | null;
    apiSecretEnc?: string | null;
    expiresAt?: Date | null;
    metadata?: Prisma.JsonValue | null;
  } | null
) {
  if (!credential) return null;

  return {
    accessToken: tryDecryptSecret(credential.accessTokenEnc),
    refreshToken: tryDecryptSecret(credential.refreshTokenEnc),
    apiKey: tryDecryptSecret(credential.apiKeyEnc),
    apiSecret: tryDecryptSecret(credential.apiSecretEnc),
    expiresAt: credential.expiresAt ?? undefined,
    metadata: credential.metadata ?? undefined
  };
}

export async function disconnectConnectorAccount(userId: string, provider: ConnectorProvider) {
  const account = await getConnectorAccountForUser(userId, provider);
  if (!account) return null;

  await prisma.$transaction([
    prisma.connectorAccount.update({
      where: { id: account.id },
      data: {
        status: ConnectorAccountStatus.disconnected,
        lastError: null,
        lastCheckedAt: new Date()
      }
    }),
    prisma.connectorCredential.deleteMany({
      where: { connectorAccountId: account.id }
    }),
    prisma.slackChannelSubscription.updateMany({
      where: { connectorAccountId: account.id },
      data: { isActive: false }
    })
  ]);

  return account.id;
}

export async function createConnectorOauthState(input: {
  userId: string;
  provider: ConnectorProvider;
  state: string;
  redirectUri: string;
  pkceVerifier?: string;
  ttlSeconds?: number;
}) {
  const expiresAt = new Date(Date.now() + (input.ttlSeconds ?? 10 * 60) * 1000);

  await prisma.connectorOauthState.create({
    data: {
      userId: input.userId,
      provider: input.provider,
      stateHash: hashState(input.state),
      redirectUri: input.redirectUri,
      pkceVerifier: input.pkceVerifier,
      expiresAt
    }
  });
}

export async function consumeConnectorOauthState(input: {
  provider: ConnectorProvider;
  state: string;
}) {
  const stateHash = hashState(input.state);
  const row = await prisma.connectorOauthState.findUnique({
    where: { stateHash }
  });

  if (!row) return null;
  if (row.provider !== input.provider) return null;
  if (row.expiresAt.getTime() < Date.now()) {
    await prisma.connectorOauthState.delete({ where: { id: row.id } });
    return null;
  }

  await prisma.connectorOauthState.delete({ where: { id: row.id } });
  return row;
}

export async function listSlackChannelSubscriptions(userId: string) {
  return prisma.slackChannelSubscription.findMany({
    where: { userId, isActive: true },
    orderBy: { createdAt: "desc" }
  });
}

export async function upsertSlackChannelSubscription(input: {
  userId: string;
  connectorAccountId: string;
  channelId: string;
  channelName?: string;
}) {
  return prisma.slackChannelSubscription.upsert({
    where: {
      userId_channelId: {
        userId: input.userId,
        channelId: input.channelId
      }
    },
    create: {
      userId: input.userId,
      connectorAccountId: input.connectorAccountId,
      channelId: input.channelId,
      channelName: input.channelName,
      isActive: true
    },
    update: {
      connectorAccountId: input.connectorAccountId,
      channelName: input.channelName,
      isActive: true
    }
  });
}

export async function removeSlackChannelSubscription(input: {
  userId: string;
  id: string;
}) {
  await prisma.slackChannelSubscription.updateMany({
    where: {
      id: input.id,
      userId: input.userId
    },
    data: {
      isActive: false
    }
  });
}

export async function findSlackChannelOwners(channelId: string) {
  return prisma.slackChannelSubscription.findMany({
    where: {
      channelId,
      isActive: true
    },
    include: {
      user: true,
      connectorAccount: {
        include: {
          credential: true
        }
      }
    },
    orderBy: {
      createdAt: "asc"
    }
  });
}

export async function refreshConnectorHealth(input: {
  userId: string;
  connectorType: ConnectorProvider;
  status: string;
  details?: string;
}) {
  return prisma.connectorHealth.upsert({
    where: {
      userId_connectorType: {
        userId: input.userId,
        connectorType: input.connectorType
      }
    },
    create: {
      userId: input.userId,
      connectorType: input.connectorType,
      status: input.status,
      details: input.details,
      lastIngestedAt: new Date()
    },
    update: {
      status: input.status,
      details: input.details,
      lastIngestedAt: new Date()
    }
  });
}

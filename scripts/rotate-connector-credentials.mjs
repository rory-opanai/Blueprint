import { PrismaClient } from "@prisma/client";
import crypto from "node:crypto";

const prisma = new PrismaClient();
const ENCRYPTION_VERSION = 1;

function getEncryptionKey() {
  const raw = process.env.CONNECTOR_ENCRYPTION_KEY;
  if (!raw) {
    throw new Error("Missing CONNECTOR_ENCRYPTION_KEY.");
  }
  const key = Buffer.from(raw, "base64");
  if (key.length !== 32) {
    throw new Error("CONNECTOR_ENCRYPTION_KEY must be base64-encoded 32 bytes.");
  }
  return key;
}

function toUrlSafe(value) {
  return value
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function fromUrlSafe(value) {
  const padded = value
    .padEnd(value.length + ((4 - (value.length % 4)) % 4), "=")
    .replace(/-/g, "+")
    .replace(/_/g, "/");
  return Buffer.from(padded, "base64");
}

function encryptSecret(plain) {
  const key = getEncryptionKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return {
    ciphertext: [`v${ENCRYPTION_VERSION}`, toUrlSafe(iv), toUrlSafe(tag), toUrlSafe(encrypted)].join(".")
  };
}

function decryptSecret(payload) {
  const [, ivRaw, tagRaw, encryptedRaw] = payload.split(".");
  const key = getEncryptionKey();
  const iv = fromUrlSafe(ivRaw);
  const tag = fromUrlSafe(tagRaw);
  const encrypted = fromUrlSafe(encryptedRaw);
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
  return decrypted.toString("utf8");
}

function reencrypt(value) {
  if (value === undefined) return undefined;
  if (value === null) return null;
  const plain = decryptSecret(value);
  return encryptSecret(plain).ciphertext;
}

async function main() {
  const credentials = await prisma.connectorCredential.findMany({
    select: {
      id: true,
      accessTokenEnc: true,
      refreshTokenEnc: true,
      apiKeyEnc: true,
      apiSecretEnc: true
    }
  });

  for (const credential of credentials) {
    await prisma.connectorCredential.update({
      where: { id: credential.id },
      data: {
        accessTokenEnc: reencrypt(credential.accessTokenEnc),
        refreshTokenEnc: reencrypt(credential.refreshTokenEnc),
        apiKeyEnc: reencrypt(credential.apiKeyEnc),
        apiSecretEnc: reencrypt(credential.apiSecretEnc),
        encryptionVersion: 1,
        rotatedAt: new Date()
      }
    });
  }

  console.log(`Rotated ${credentials.length} connector credential records.`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

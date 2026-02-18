import crypto from "node:crypto";

const ENCRYPTION_VERSION = 1;

function getEncryptionKey(): Buffer {
  const raw = process.env.CONNECTOR_ENCRYPTION_KEY;
  if (!raw) {
    if (process.env.LOCAL_DEMO_BYPASS_AUTH === "true") {
      return crypto
        .createHash("sha256")
        .update(process.env.LOCAL_DEMO_USER_EMAIL ?? "blueprint-local-demo")
        .digest();
    }
    throw new Error("Missing CONNECTOR_ENCRYPTION_KEY.");
  }

  const key = Buffer.from(raw, "base64");
  if (key.length !== 32) {
    throw new Error("CONNECTOR_ENCRYPTION_KEY must be a base64-encoded 32-byte key.");
  }

  return key;
}

function toUrlSafe(value: Buffer): string {
  return value
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function fromUrlSafe(value: string): Buffer {
  const padded = value.padEnd(value.length + ((4 - (value.length % 4)) % 4), "=")
    .replace(/-/g, "+")
    .replace(/_/g, "/");
  return Buffer.from(padded, "base64");
}

export function encryptSecret(plain: string): { ciphertext: string; version: number } {
  const key = getEncryptionKey();
  const iv = crypto.randomBytes(12);

  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();

  const payload = [
    `v${ENCRYPTION_VERSION}`,
    toUrlSafe(iv),
    toUrlSafe(tag),
    toUrlSafe(encrypted)
  ].join(".");

  return {
    ciphertext: payload,
    version: ENCRYPTION_VERSION
  };
}

export function decryptSecret(payload: string): string {
  const [version, ivRaw, tagRaw, encryptedRaw] = payload.split(".");
  if (!version || !ivRaw || !tagRaw || !encryptedRaw) {
    throw new Error("Invalid encrypted payload format.");
  }

  const key = getEncryptionKey();
  const iv = fromUrlSafe(ivRaw);
  const tag = fromUrlSafe(tagRaw);
  const encrypted = fromUrlSafe(encryptedRaw);

  const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);

  const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
  return decrypted.toString("utf8");
}

export function tryDecryptSecret(payload?: string | null): string | undefined {
  if (!payload) return undefined;
  try {
    return decryptSecret(payload);
  } catch {
    return undefined;
  }
}

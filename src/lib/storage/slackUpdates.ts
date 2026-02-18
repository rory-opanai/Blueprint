import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { DealSignal, SourceSignalQuery } from "@/lib/types";

const SERVERLESS_ENV_HINTS = [
  process.env.VERCEL,
  process.env.AWS_LAMBDA_FUNCTION_NAME,
  process.env.LAMBDA_TASK_ROOT,
  process.env.RENDER
];

const STORE_DIR = process.env.BLUEPRINT_DATA_DIR
  ? path.resolve(process.env.BLUEPRINT_DATA_DIR)
  : SERVERLESS_ENV_HINTS.some(Boolean)
    ? "/tmp/blueprint-data"
    : path.join(process.cwd(), ".data");
const STORE_FILE = path.join(STORE_DIR, "slack-deal-updates.json");
let useInMemoryStore = false;
let inMemoryUpdates: SlackDealUpdate[] = [];

type SlackDealUpdate = {
  eventId: string;
  channelId: string;
  messageTs: string;
  userId?: string;
  text: string;
  permalink: string;
  opportunityId?: string;
  accountName?: string;
  opportunityName?: string;
  createdAt: string;
};

function isReadOnlyError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const code = (error as { code?: string }).code;
  const message = (error as { message?: string }).message ?? "";
  return (
    code === "EROFS" ||
    code === "EACCES" ||
    code === "EPERM" ||
    message.toLowerCase().includes("read-only file system")
  );
}

async function ensureStore(): Promise<void> {
  if (useInMemoryStore) return;

  try {
    await mkdir(STORE_DIR, { recursive: true });
  } catch (error) {
    if (isReadOnlyError(error)) {
      useInMemoryStore = true;
      return;
    }
    throw error;
  }

  try {
    await readFile(STORE_FILE, "utf8");
  } catch {
    try {
      await writeFile(STORE_FILE, "[]\n", "utf8");
    } catch (error) {
      if (isReadOnlyError(error)) {
        useInMemoryStore = true;
        return;
      }
      throw error;
    }
  }
}

async function readUpdates(): Promise<SlackDealUpdate[]> {
  if (useInMemoryStore) {
    return [...inMemoryUpdates];
  }

  await ensureStore();
  if (useInMemoryStore) {
    return [...inMemoryUpdates];
  }

  const raw = await readFile(STORE_FILE, "utf8");

  try {
    const parsed = JSON.parse(raw) as SlackDealUpdate[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function writeUpdates(updates: SlackDealUpdate[]): Promise<void> {
  if (useInMemoryStore) {
    inMemoryUpdates = [...updates];
    return;
  }

  await ensureStore();
  if (useInMemoryStore) {
    inMemoryUpdates = [...updates];
    return;
  }

  try {
    await writeFile(STORE_FILE, `${JSON.stringify(updates, null, 2)}\n`, "utf8");
  } catch (error) {
    if (isReadOnlyError(error)) {
      useInMemoryStore = true;
      inMemoryUpdates = [...updates];
      return;
    }
    throw error;
  }
}

export async function upsertSlackDealUpdate(update: SlackDealUpdate): Promise<void> {
  const updates = await readUpdates();
  const dedupeKey = `${update.channelId}:${update.messageTs}`;
  const existingIndex = updates.findIndex(
    (entry) => `${entry.channelId}:${entry.messageTs}` === dedupeKey || entry.eventId === update.eventId
  );

  if (existingIndex >= 0) {
    updates[existingIndex] = {
      ...updates[existingIndex],
      ...update
    };
  } else {
    updates.unshift(update);
  }

  await writeUpdates(updates.slice(0, 5000));
}

function normalize(value?: string): string {
  return (value ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export async function fetchSlackContextSignal(
  query: SourceSignalQuery
): Promise<DealSignal | null> {
  const updates = await readUpdates();
  if (updates.length === 0) return null;

  const oppId = query.opportunityId?.trim();
  const normalizedAccount = normalize(query.accountName);
  const normalizedOpportunity = normalize(query.opportunityName);

  const matched = updates.filter((update) => {
    if (oppId && update.opportunityId && update.opportunityId === oppId) return true;

    const updateAccount = normalize(update.accountName);
    const updateOpportunity = normalize(update.opportunityName);
    const text = normalize(update.text);

    const accountHit =
      Boolean(normalizedAccount) &&
      (updateAccount.includes(normalizedAccount) || text.includes(normalizedAccount));
    const opportunityHit =
      Boolean(normalizedOpportunity) &&
      (updateOpportunity.includes(normalizedOpportunity) || text.includes(normalizedOpportunity));

    return accountHit || opportunityHit;
  });

  if (matched.length === 0) return null;

  const highlights = matched
    .map((update) => update.text)
    .filter(Boolean)
    .slice(0, 4);

  const deepLinks = matched
    .map((update) => update.permalink)
    .filter(Boolean)
    .slice(0, 4);

  const lastActivityAt = matched
    .map((update) => Date.parse(update.createdAt))
    .filter((ts) => Number.isFinite(ts))
    .sort((a, b) => b - a)[0];

  return {
    source: "slack",
    totalMatches: matched.length,
    highlights,
    deepLinks,
    lastActivityAt: lastActivityAt ? new Date(lastActivityAt).toISOString() : undefined
  };
}

export function slackPermalink(channelId: string, messageTs: string): string {
  const ts = messageTs.replace(".", "");
  return `https://slack.com/archives/${channelId}/p${ts}`;
}

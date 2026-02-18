import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { DealCard, ManualDealDraft } from "@/lib/types";
import { TAS_TOTAL_QUESTIONS } from "@/lib/tas-template";

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
const STORE_FILE = path.join(STORE_DIR, "manual-deals.json");
let useInMemoryStore = false;
let inMemoryRecords: ManualDealRecord[] = [];

type ManualDealRecord = {
  id: string;
  accountName: string;
  opportunityName: string;
  stage: string;
  amount: number;
  closeDate: string;
  ownerName: string;
  ownerEmail: string;
  sourceOpportunityId?: string;
  createdAt: string;
  updatedAt: string;
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

async function readRecords(): Promise<ManualDealRecord[]> {
  if (useInMemoryStore) {
    return [...inMemoryRecords];
  }

  await ensureStore();
  if (useInMemoryStore) {
    return [...inMemoryRecords];
  }

  const raw = await readFile(STORE_FILE, "utf8");
  try {
    const parsed = JSON.parse(raw) as ManualDealRecord[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function writeRecords(records: ManualDealRecord[]): Promise<void> {
  if (useInMemoryStore) {
    inMemoryRecords = [...records];
    return;
  }

  await ensureStore();
  if (useInMemoryStore) {
    inMemoryRecords = [...records];
    return;
  }

  try {
    await writeFile(STORE_FILE, `${JSON.stringify(records, null, 2)}\n`, "utf8");
  } catch (error) {
    if (isReadOnlyError(error)) {
      useInMemoryStore = true;
      inMemoryRecords = [...records];
      return;
    }
    throw error;
  }
}

function toDealCard(record: ManualDealRecord): DealCard {
  return {
    opportunityId: record.id,
    sourceOpportunityId: record.sourceOpportunityId,
    origin: "manual",
    accountName: record.accountName,
    opportunityName: record.opportunityName,
    stage: record.stage,
    amount: record.amount,
    closeDate: record.closeDate,
    ownerEmail: record.ownerEmail,
    owners: { ad: record.ownerName },
    tasProgress: { answered: 0, total: TAS_TOTAL_QUESTIONS },
    evidenceCoverage: { backed: 0, total: TAS_TOTAL_QUESTIONS },
    risk: { count: 0, severity: "low" },
    needsReviewCount: 0,
    overdueCommitments: 0,
    topGaps: ["No TAS answers yet"],
    sourceSignals: [],
    consolidatedInsights: []
  };
}

export async function listManualDeals(ownerEmail?: string): Promise<DealCard[]> {
  const records = await readRecords();
  const filtered = ownerEmail
    ? records.filter((record) => record.ownerEmail.toLowerCase() === ownerEmail.toLowerCase())
    : records;
  return filtered.map(toDealCard);
}

export async function getManualDealById(opportunityId: string): Promise<DealCard | null> {
  const records = await readRecords();
  const match = records.find((record) => record.id === opportunityId);
  return match ? toDealCard(match) : null;
}

export async function createManualDeal(
  draft: ManualDealDraft,
  sourceOpportunityId?: string
): Promise<DealCard> {
  const records = await readRecords();
  const now = new Date().toISOString();

  const record: ManualDealRecord = {
    id: `manual-${randomUUID()}`,
    accountName: draft.accountName,
    opportunityName: draft.opportunityName,
    stage: draft.stage,
    amount: draft.amount,
    closeDate: draft.closeDate,
    ownerName: draft.ownerName,
    ownerEmail: draft.ownerEmail,
    sourceOpportunityId,
    createdAt: now,
    updatedAt: now
  };

  await writeRecords([record, ...records]);
  return toDealCard(record);
}

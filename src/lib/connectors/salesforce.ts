import { TAS_TEMPLATE } from "@/lib/tas-template";
import { DealCard, ManualDealDraft, TasQuestionState } from "@/lib/types";

type SalesforceQueryResponse<T> = {
  totalSize: number;
  done: boolean;
  records: T[];
};

type SalesforceOpportunityRecord = {
  Id: string;
  Name: string;
  StageName: string;
  Amount?: number;
  CloseDate?: string;
  Account?: { Name?: string };
  Owner?: { Name?: string; Email?: string };
};

type SalesforceCreateResponse = {
  id: string;
  success: boolean;
  errors: string[];
};

type SalesforceRuntimeConfig = {
  instanceUrl: string;
  accessToken: string;
  apiVersion: string;
  tasObject: string;
  tasOpportunityField: string;
  taskWhatIdField: string;
};

export type SalesforceCredentialInput = {
  instanceUrl?: string;
  accessToken?: string;
  refreshToken?: string;
  apiVersion?: string;
  tasObject?: string;
  tasOpportunityField?: string;
  taskWhatIdField?: string;
  tasFieldMap?: Record<string, string>;
};

function sfConfig(credential?: SalesforceCredentialInput): SalesforceRuntimeConfig | null {
  const instanceUrl = credential?.instanceUrl ?? process.env.SALESFORCE_INSTANCE_URL;
  const accessToken = credential?.accessToken ?? process.env.SALESFORCE_ACCESS_TOKEN;
  const apiVersion = credential?.apiVersion ?? process.env.SALESFORCE_API_VERSION ?? "v60.0";
  const tasObject = credential?.tasObject ?? process.env.SALESFORCE_TAS_OBJECT ?? "Opportunity_Blueprint__c";
  const tasOpportunityField =
    credential?.tasOpportunityField ?? process.env.SALESFORCE_TAS_OPPORTUNITY_FIELD ?? "Opportunity__c";
  const taskWhatIdField = credential?.taskWhatIdField ?? process.env.SALESFORCE_TASK_WHATID_FIELD ?? "WhatId";

  if (!instanceUrl || !accessToken) return null;
  return {
    instanceUrl: instanceUrl.replace(/\/$/, ""),
    accessToken,
    apiVersion,
    tasObject,
    tasOpportunityField,
    taskWhatIdField
  };
}

function parseTasFieldMap(credential?: SalesforceCredentialInput): Record<string, string> {
  if (credential?.tasFieldMap && Object.keys(credential.tasFieldMap).length > 0) {
    return credential.tasFieldMap;
  }

  const raw = process.env.SALESFORCE_TAS_FIELD_MAP;
  if (!raw) return {};

  try {
    const parsed = JSON.parse(raw) as Record<string, string>;
    return parsed;
  } catch {
    return {};
  }
}

function escapeSoql(value: string): string {
  return value.replace(/'/g, "\\'");
}

async function salesforceRequest<T>(
  path: string,
  init: RequestInit = {},
  credential?: SalesforceCredentialInput
): Promise<T> {
  const config = sfConfig(credential);
  if (!config) {
    throw new Error("Salesforce is not configured.");
  }

  const response = await fetch(`${config.instanceUrl}/services/data/${config.apiVersion}${path}`, {
    ...init,
    headers: {
      authorization: `Bearer ${config.accessToken}`,
      "content-type": "application/json",
      ...(init.headers ?? {})
    }
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Salesforce API error (${response.status}): ${body.slice(0, 280)}`);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return (await response.json()) as T;
}

async function querySalesforce<T>(soql: string, credential?: SalesforceCredentialInput): Promise<T[]> {
  const result = await salesforceRequest<SalesforceQueryResponse<T>>(
    `/query?q=${encodeURIComponent(soql)}`,
    {},
    credential
  );
  return result.records ?? [];
}

export function isSalesforceEnabled(credential?: SalesforceCredentialInput): boolean {
  return Boolean(sfConfig(credential));
}

export async function probeSalesforceConnection(
  credential?: SalesforceCredentialInput
): Promise<{
  connected: boolean;
  message?: string;
}> {
  if (!sfConfig(credential)) {
    return { connected: false, message: "Missing Salesforce instance URL or access token." };
  }

  try {
    await salesforceRequest<Record<string, unknown>>("/limits", {}, credential);
    return { connected: true };
  } catch (error) {
    return {
      connected: false,
      message: error instanceof Error ? error.message : "Salesforce probe failed"
    };
  }
}

export async function fetchOpportunitiesFromSalesforce(options?: {
  ownerEmail?: string;
  credential?: SalesforceCredentialInput;
}): Promise<DealCard[]> {
  if (!sfConfig(options?.credential)) {
    return [];
  }

  const ownerFilter = options?.ownerEmail
    ? ` AND Owner.Email = '${escapeSoql(options.ownerEmail)}'`
    : "";

  const soql = `SELECT Id, Name, StageName, Amount, CloseDate, Account.Name, Owner.Name, Owner.Email FROM Opportunity WHERE IsClosed = false${ownerFilter} ORDER BY CloseDate ASC LIMIT 100`;
  const records = await querySalesforce<SalesforceOpportunityRecord>(soql, options?.credential);

  return records.map((record) => ({
    opportunityId: record.Id,
    sourceOpportunityId: record.Id,
    origin: "salesforce",
    accountName: record.Account?.Name ?? "Unknown Account",
    opportunityName: record.Name,
    stage: record.StageName ?? "Discovery",
    amount: Number(record.Amount ?? 0),
    closeDate: record.CloseDate
      ? new Date(record.CloseDate).toISOString()
      : new Date(Date.now() + 1000 * 60 * 60 * 24 * 30).toISOString(),
    ownerEmail: record.Owner?.Email,
    owners: {
      ad: record.Owner?.Name ?? options?.ownerEmail ?? "Unknown Owner"
    },
    tasProgress: { answered: 0, total: 24 },
    evidenceCoverage: { backed: 0, total: 24 },
    risk: { count: 0, severity: "low" },
    needsReviewCount: 0,
    overdueCommitments: 0,
    topGaps: ["TAS data pending"],
    sourceSignals: [],
    consolidatedInsights: []
  }));
}

export async function createOpportunityInSalesforce(
  draft: ManualDealDraft,
  credential?: SalesforceCredentialInput
): Promise<{ opportunityId: string }> {
  if (!sfConfig(credential)) {
    throw new Error("Salesforce is not configured.");
  }

  const payload: Record<string, unknown> = {
    Name: draft.opportunityName,
    StageName: draft.stage,
    CloseDate: draft.closeDate.slice(0, 10),
    Amount: draft.amount
  };

  if (draft.salesforceAccountId) {
    payload.AccountId = draft.salesforceAccountId;
  }

  const created = await salesforceRequest<SalesforceCreateResponse>(
    "/sobjects/Opportunity",
    {
      method: "POST",
      body: JSON.stringify(payload)
    },
    credential
  );

  if (!created.success) {
    throw new Error(`Failed to create Opportunity: ${created.errors.join("; ")}`);
  }

  return { opportunityId: created.id };
}

export async function fetchTasStateFromSalesforce(
  opportunityId: string,
  credential?: SalesforceCredentialInput
): Promise<TasQuestionState[]> {
  const config = sfConfig(credential);
  if (!config) return [];

  const fieldMap = parseTasFieldMap(credential);
  if (Object.keys(fieldMap).length === 0) return [];

  const mappedFields = Array.from(new Set(Object.values(fieldMap))).join(", ");
  const soql = `SELECT Id, LastModifiedDate, LastModifiedBy.Name, ${mappedFields} FROM ${config.tasObject} WHERE ${config.tasOpportunityField} = '${escapeSoql(opportunityId)}' ORDER BY LastModifiedDate DESC LIMIT 1`;
  const rows = await querySalesforce<Record<string, unknown>>(soql, credential);
  const row = rows[0];
  if (!row) return [];

  const updatedAt = String(row.LastModifiedDate ?? "");
  const updatedBy =
    typeof row.LastModifiedBy === "object" && row.LastModifiedBy !== null
      ? String((row.LastModifiedBy as { Name?: string }).Name ?? "Salesforce")
      : "Salesforce";

  return TAS_TEMPLATE.flatMap((section) =>
    section.questions.map((question) => {
      const fieldName = fieldMap[question.id];
      const answerRaw = fieldName ? row[fieldName] : undefined;
      const answer = answerRaw ? String(answerRaw) : undefined;

      return {
        questionId: question.id,
        status: answer ? "manual" : "empty",
        answer,
        lastUpdatedAt: updatedAt || undefined,
        lastUpdatedBy: updatedBy,
        evidence: []
      } satisfies TasQuestionState;
    })
  );
}

async function findTasRecordId(opportunityId: string, credential?: SalesforceCredentialInput): Promise<string | null> {
  const config = sfConfig(credential);
  if (!config) return null;

  const soql = `SELECT Id FROM ${config.tasObject} WHERE ${config.tasOpportunityField} = '${escapeSoql(opportunityId)}' ORDER BY LastModifiedDate DESC LIMIT 1`;
  const rows = await querySalesforce<{ Id: string }>(soql, credential);
  return rows[0]?.Id ?? null;
}

export async function writeTasAnswerToSalesforce(input: {
  opportunityId: string;
  questionId: string;
  answer: string;
  actor: string;
  evidenceLinks: string[];
  credential?: SalesforceCredentialInput;
}) {
  const config = sfConfig(input.credential);
  if (!config) {
    throw new Error("Salesforce is not configured.");
  }

  const fieldMap = parseTasFieldMap(input.credential);
  const fieldName = fieldMap[input.questionId];
  if (!fieldName) {
    throw new Error(
      `Missing field map for ${input.questionId}. Configure SALESFORCE_TAS_FIELD_MAP or connector metadata.`
    );
  }

  const tasRecordId = await findTasRecordId(input.opportunityId, input.credential);

  if (tasRecordId) {
    await salesforceRequest(
      `/sobjects/${config.tasObject}/${tasRecordId}`,
      {
        method: "PATCH",
        body: JSON.stringify({ [fieldName]: input.answer })
      },
      input.credential
    );
  } else {
    await salesforceRequest(
      `/sobjects/${config.tasObject}`,
      {
        method: "POST",
        body: JSON.stringify({
          [config.tasOpportunityField]: input.opportunityId,
          [fieldName]: input.answer
        })
      },
      input.credential
    );
  }

  return {
    salesforceRecordId: tasRecordId ?? `${config.tasObject}:${input.opportunityId}`,
    updatedAt: new Date().toISOString(),
    actor: input.actor,
    evidenceLinks: input.evidenceLinks
  };
}

export async function writeCommitmentTaskToSalesforce(input: {
  opportunityId: string;
  title: string;
  owner: string;
  dueDate: string;
  credential?: SalesforceCredentialInput;
}) {
  const config = sfConfig(input.credential);
  if (!config) {
    throw new Error("Salesforce is not configured.");
  }

  const payload: Record<string, unknown> = {
    Subject: input.title,
    ActivityDate: input.dueDate.slice(0, 10),
    Status: "Not Started",
    Priority: "Normal",
    [config.taskWhatIdField]: input.opportunityId
  };

  const created = await salesforceRequest<SalesforceCreateResponse>(
    "/sobjects/Task",
    {
      method: "POST",
      body: JSON.stringify(payload)
    },
    input.credential
  );

  if (!created.success) {
    throw new Error(`Failed to create Task: ${created.errors.join("; ")}`);
  }

  return {
    taskId: created.id,
    ...input
  };
}

import { fetchGmailSignal, isGmailEnabled } from "@/lib/integrations/gmail";
import { fetchSlackSignal, isSlackEnabled } from "@/lib/integrations/slack";
import { fetchGtmAgentSignal, isGtmAgentEnabled } from "@/lib/integrations/gtm-agent";
import {
  createOpportunityInSalesforce,
  fetchOpportunitiesFromSalesforce,
  fetchTasStateFromSalesforce
} from "@/lib/connectors/salesforce";
import { fetchGongSignal, isGongEnabled } from "@/lib/connectors/gong";
import { viewerConnectorContext } from "@/lib/connectors/runtime";
import { TAS_TEMPLATE, TAS_TOTAL_QUESTIONS } from "@/lib/tas-template";
import {
  DealCard,
  DealDetail,
  DealListOptions,
  DealSignal,
  ManualDealDraft,
  RiskSeverity,
  TasQuestionState
} from "@/lib/types";
import { createManualDeal, getManualDealById, listManualDeals } from "@/lib/storage/manual-deals";
import { calculateAudit } from "@/lib/services/audit";
import { listSuggestions } from "@/lib/services/suggestions";
import { consolidateDealSignals } from "@/lib/services/signal-consolidator";

const signalCache = new Map<string, { expiresAt: number; payload: DealSignal[] }>();
const SIGNAL_CACHE_TTL_MS = 1000 * 60 * 5;

function currentGate(stage: string): "Discovery" | "Solutioning" | "Commit" {
  const normalized = stage.toLowerCase();
  if (normalized.includes("commit") || normalized.includes("closed")) return "Commit";
  if (normalized.includes("solution")) return "Solutioning";
  return "Discovery";
}

function stageRank(stage: "Discovery" | "Solutioning" | "Commit"): number {
  if (stage === "Commit") return 3;
  if (stage === "Solutioning") return 2;
  return 1;
}

function summarizeTas(stage: string, states: TasQuestionState[]): {
  answered: number;
  evidenceBacked: number;
  topGaps: string[];
  criticalGapCount: number;
} {
  const answered = states.filter((state) => state.status !== "empty").length;
  const evidenceBacked = states.filter((state) => state.evidence.length > 0).length;
  const gate = currentGate(stage);

  const requiredQuestions = TAS_TEMPLATE.flatMap((section) => section.questions).filter(
    (question) => stageRank(question.stageCriticalAt) <= stageRank(gate)
  );

  const criticalMissing = requiredQuestions.filter((question) => {
    const state = states.find((candidate) => candidate.questionId === question.id);
    return !state || state.status === "empty";
  });

  return {
    answered,
    evidenceBacked,
    topGaps: criticalMissing.map((missing) => missing.prompt).slice(0, 2),
    criticalGapCount: criticalMissing.length
  };
}

function inferRisk(criticalGaps: number, signals: DealSignal[]): { count: number; severity: RiskSeverity } {
  const lowSignal = signals.length === 0;
  const score = criticalGaps + (lowSignal ? 1 : 0);

  if (score >= 6) return { count: score, severity: "critical" };
  if (score >= 4) return { count: score, severity: "high" };
  if (score >= 2) return { count: score, severity: "medium" };
  return { count: score, severity: "low" };
}

async function collectSignals(
  deal: DealCard,
  withSignals: boolean,
  options: {
    connectors: Awaited<ReturnType<typeof viewerConnectorContext>>;
    viewerUserId?: string;
    viewerEmail?: string;
    viewerRole?: "AD" | "SE" | "SA" | "MANAGER";
  }
): Promise<DealSignal[]> {
  if (!withSignals) return [];

  const cacheKey = `${options.connectors.mode}:${options.viewerUserId ?? "anon"}:${options.viewerRole ?? "AD"}:${deal.accountName}:${deal.opportunityName}:${deal.ownerEmail ?? ""}`;
  const cached = signalCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.payload;
  }

  const query = {
    opportunityId: deal.sourceOpportunityId ?? deal.opportunityId,
    accountName: deal.accountName,
    opportunityName: deal.opportunityName,
    ownerEmail: deal.ownerEmail,
    viewerUserId: options.viewerUserId
  };

  const [gmail, slack, gong, gtm] =
    options.connectors.mode === "legacy_env"
      ? await Promise.all([
          isGmailEnabled() ? fetchGmailSignal(query) : Promise.resolve(null),
          isSlackEnabled() ? fetchSlackSignal(query) : Promise.resolve(null),
          isGongEnabled() ? fetchGongSignal(query) : Promise.resolve(null),
          isGtmAgentEnabled() ? fetchGtmAgentSignal(query) : Promise.resolve(null)
        ])
      : await Promise.all([
          options.connectors.gmail
            ? fetchGmailSignal(query, options.connectors.gmail)
            : Promise.resolve(null),
          options.connectors.slack
            ? fetchSlackSignal(query, {
                credential: options.connectors.slack,
                viewerUserId: options.viewerUserId,
                viewerRole: options.viewerRole
              })
            : Promise.resolve(null),
          options.connectors.gongEnabled ? fetchGongSignal(query) : Promise.resolve(null),
          options.connectors.gtmAgentEnabled ? fetchGtmAgentSignal(query) : Promise.resolve(null)
        ]);

  const payload = [gmail, slack, gong, gtm].filter(
    (signal): signal is DealSignal => Boolean(signal)
  );

  signalCache.set(cacheKey, {
    expiresAt: Date.now() + SIGNAL_CACHE_TTL_MS,
    payload
  });

  return payload;
}

export function invalidateSignalCache(criteria: {
  accountName?: string;
  opportunityName?: string;
}): void {
  if (!criteria.accountName && !criteria.opportunityName) return;

  const accountToken = (criteria.accountName ?? "").toLowerCase();
  const opportunityToken = (criteria.opportunityName ?? "").toLowerCase();

  for (const key of signalCache.keys()) {
    const keyLower = key.toLowerCase();
    if (
      (!accountToken || keyLower.includes(accountToken)) &&
      (!opportunityToken || keyLower.includes(opportunityToken))
    ) {
      signalCache.delete(key);
    }
  }
}

async function hydrateDeal(
  base: DealCard,
  withSignals: boolean,
  options: {
    connectors: Awaited<ReturnType<typeof viewerConnectorContext>>;
    viewerUserId?: string;
    viewerEmail?: string;
    viewerRole?: "AD" | "SE" | "SA" | "MANAGER";
  }
): Promise<DealCard> {
  const tasStates =
    base.origin === "salesforce" || base.sourceOpportunityId
      ? await fetchTasStateFromSalesforce(
          base.sourceOpportunityId ?? base.opportunityId,
          options.connectors.mode === "legacy_env" ? undefined : options.connectors.salesforce
        )
      : [];

  const signals = await collectSignals(base, withSignals, options);
  const tasSummary = summarizeTas(base.stage, tasStates);
  const pendingSuggestions = listSuggestions(base.sourceOpportunityId ?? base.opportunityId).filter(
    (suggestion) => suggestion.status === "pending"
  ).length;

  const managerRestricted =
    options.viewerRole === "MANAGER" &&
    options.viewerEmail &&
    base.ownerEmail &&
    base.ownerEmail.toLowerCase() !== options.viewerEmail.toLowerCase();

  const safeSignals = managerRestricted
    ? signals.map((signal) => ({
        ...signal,
        highlights: signal.highlights.map(() => `Summary available from ${signal.source}.`),
        visibility: "manager_summary" as const
      }))
    : signals;

  const risk = inferRisk(tasSummary.criticalGapCount, safeSignals);
  const consolidatedInsights = managerRestricted
    ? safeSignals.map((signal, index) => ({
        id: `${signal.source}-${index}`,
        category: "general" as const,
        summary: `${signal.totalMatches} ${signal.source} update(s) linked for this deal.`,
        normalizedSummary: `${signal.source}-${signal.totalMatches}`,
        sources: [signal.source],
        evidenceLinks: signal.deepLinks.slice(0, 3),
        occurrences: signal.totalMatches,
        lastActivityAt: signal.lastActivityAt
      }))
    : consolidateDealSignals(safeSignals);

  return {
    ...base,
    tasProgress: {
      answered: tasSummary.answered,
      total: TAS_TOTAL_QUESTIONS
    },
    evidenceCoverage: {
      backed: tasSummary.evidenceBacked,
      total: TAS_TOTAL_QUESTIONS
    },
    topGaps: tasSummary.topGaps.length > 0 ? tasSummary.topGaps : ["No critical TAS gaps detected"],
    risk,
    needsReviewCount: pendingSuggestions,
    sourceSignals: safeSignals,
    consolidatedInsights
  };
}

export async function listDealsForUser(options?: DealListOptions): Promise<DealCard[]> {
  const withSignals = options?.withSignals ?? true;
  const connectors = options?.viewerUserId
    ? await viewerConnectorContext(options.viewerUserId)
    : {
        mode: "legacy_env" as const,
        salesforce: undefined,
        gmail: undefined,
        slack: undefined,
        gongEnabled: true,
        gtmAgentEnabled: true
      };

  const [salesforceDeals, manualDeals] = await Promise.all([
    connectors.mode === "legacy_env"
      ? fetchOpportunitiesFromSalesforce({ ownerEmail: options?.ownerEmail })
      : connectors.salesforce
        ? fetchOpportunitiesFromSalesforce({
            ownerEmail: options?.ownerEmail,
            credential: connectors.salesforce
          })
        : Promise.resolve([]),
    options?.viewerUserId
      ? listManualDeals({
          userId: options.viewerUserId,
          ownerEmail: options?.ownerEmail
        })
      : Promise.resolve([])
  ]);

  const combined = [...manualDeals, ...salesforceDeals];
  const unique = new Map<string, DealCard>();

  for (const deal of combined) {
    const dedupeKey = deal.sourceOpportunityId ?? deal.opportunityId;
    if (!unique.has(dedupeKey) || unique.get(dedupeKey)?.origin === "manual") {
      unique.set(dedupeKey, deal);
    }
  }

  const hydrated = await Promise.all(
    Array.from(unique.values()).map((deal) =>
      hydrateDeal(deal, withSignals, {
        connectors,
        viewerUserId: options?.viewerUserId,
        viewerEmail: options?.viewerEmail,
        viewerRole: options?.viewerRole
      })
    )
  );

  return hydrated.sort((a, b) => {
    const aDate = Date.parse(a.closeDate) || Number.MAX_SAFE_INTEGER;
    const bDate = Date.parse(b.closeDate) || Number.MAX_SAFE_INTEGER;
    return aDate - bDate;
  });
}

export async function getDealById(
  opportunityId: string,
  options?: DealListOptions
): Promise<DealDetail | null> {
  const connectors = options?.viewerUserId
    ? await viewerConnectorContext(options.viewerUserId)
    : {
        mode: "legacy_env" as const,
        salesforce: undefined,
        gmail: undefined,
        slack: undefined,
        gongEnabled: true,
        gtmAgentEnabled: true
      };

  const [deals, manual] = await Promise.all([
    listDealsForUser({
      ownerEmail: options?.ownerEmail,
      withSignals: options?.withSignals,
      viewerUserId: options?.viewerUserId,
      viewerEmail: options?.viewerEmail,
      viewerRole: options?.viewerRole
    }),
    options?.viewerUserId
      ? getManualDealById({ opportunityId, userId: options.viewerUserId })
      : Promise.resolve(null)
  ]);

  const deal =
    deals.find((candidate) => candidate.opportunityId === opportunityId) ??
    deals.find((candidate) => candidate.sourceOpportunityId === opportunityId) ??
    (manual
      ? await hydrateDeal(manual, options?.withSignals ?? true, {
          connectors,
          viewerUserId: options?.viewerUserId,
          viewerEmail: options?.viewerEmail,
          viewerRole: options?.viewerRole
        })
      : null);

  if (!deal) return null;

  const questions =
    deal.origin === "salesforce" || deal.sourceOpportunityId
      ? await fetchTasStateFromSalesforce(
          deal.sourceOpportunityId ?? deal.opportunityId,
          connectors.mode === "legacy_env" ? undefined : connectors.salesforce
        )
      : TAS_TEMPLATE.flatMap((section) =>
          section.questions.map((question) => ({
            questionId: question.id,
            status: "empty" as const,
            evidence: []
          }))
        );

  const audit = calculateAudit(
    deal.sourceOpportunityId ?? deal.opportunityId,
    deal.stage,
    questions
  );

  return {
    deal,
    questions,
    audit
  };
}

export async function createDealCard(input: {
  draft: ManualDealDraft;
  viewerUserId: string;
  salesforceCredential?: Awaited<ReturnType<typeof viewerConnectorContext>>["salesforce"];
}): Promise<DealCard> {
  let createdSalesforceId: string | undefined;

  if (input.draft.createInSalesforce) {
    const created = await createOpportunityInSalesforce(input.draft, input.salesforceCredential);
    createdSalesforceId = created.opportunityId;
  }

  const createdManual = await createManualDeal({
    userId: input.viewerUserId,
    draft: input.draft,
    sourceOpportunityId: createdSalesforceId
  });
  const connectors = await viewerConnectorContext(input.viewerUserId);
  return hydrateDeal(createdManual, true, {
    connectors,
    viewerUserId: input.viewerUserId,
    viewerEmail: input.draft.ownerEmail
  });
}

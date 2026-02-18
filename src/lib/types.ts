export type UserRole = "AD" | "SE" | "SA" | "MANAGER";

export type TasStatus =
  | "empty"
  | "manual"
  | "suggested"
  | "confirmed"
  | "stale"
  | "contradiction";

export type SuggestionStatus =
  | "pending"
  | "accepted"
  | "edited_accepted"
  | "rejected";

export type RiskSeverity = "low" | "medium" | "high" | "critical";

export type SourceSystem = "gmail" | "slack" | "gong" | "gtm_agent";
export type InsightCategory =
  | "signer_path"
  | "economic_value"
  | "competition"
  | "timeline"
  | "risk"
  | "general";

export type TasQuestion = {
  id: string;
  sectionId: string;
  prompt: string;
  stageCriticalAt: "Discovery" | "Solutioning" | "Commit";
  autopopPriority: "high" | "medium" | "low";
};

export type TasSection = {
  id: string;
  title: string;
  questions: TasQuestion[];
};

export type DealSignal = {
  source: SourceSystem;
  totalMatches: number;
  highlights: string[];
  deepLinks: string[];
  lastActivityAt?: string;
};

export type ConsolidatedInsight = {
  id: string;
  category: InsightCategory;
  summary: string;
  normalizedSummary: string;
  sources: SourceSystem[];
  evidenceLinks: string[];
  occurrences: number;
  lastActivityAt?: string;
};

export type DealCard = {
  opportunityId: string;
  sourceOpportunityId?: string;
  origin: "salesforce" | "manual";
  accountName: string;
  opportunityName: string;
  stage: string;
  amount: number;
  closeDate: string;
  ownerEmail?: string;
  owners: { ad: string; se?: string; sa?: string };
  tasProgress: { answered: number; total: number };
  evidenceCoverage: { backed: number; total: number };
  risk: { count: number; severity: RiskSeverity };
  needsReviewCount: number;
  overdueCommitments: number;
  topGaps: string[];
  nextAction?: { owner: string; dueDate: string };
  sourceSignals: DealSignal[];
  consolidatedInsights: ConsolidatedInsight[];
};

export type ManualDealDraft = {
  accountName: string;
  opportunityName: string;
  stage: string;
  amount: number;
  closeDate: string;
  ownerName: string;
  ownerEmail: string;
  createInSalesforce?: boolean;
  salesforceAccountId?: string;
};

export type EvidenceChip = {
  id: string;
  label: string;
  deepLink: string;
  sourceType: "gong" | "slack" | "doc" | "email" | "gmail" | "gtm_agent";
};

export type TasQuestionState = {
  questionId: string;
  status: TasStatus;
  answer?: string;
  lastUpdatedAt?: string;
  lastUpdatedBy?: string;
  evidence: EvidenceChip[];
};

export type SuggestionDelta = {
  id: string;
  opportunityId: string;
  tasQuestionId: string;
  proposedAnswer: string;
  confidence: number;
  evidencePointers: EvidenceChip[];
  reasoningSummary: string;
  status: SuggestionStatus;
};

export type AuditFinding = {
  id: string;
  type: "critical_gap" | "contradiction" | "stale" | "recommendation";
  severity: RiskSeverity;
  message: string;
  questionId?: string;
  recommendedCommitment?: {
    title: string;
    owner: string;
    dueDate: string;
  };
};

export type AuditResult = {
  opportunityId: string;
  stage: string;
  completionBySection: Record<string, number>;
  evidenceCoverageBySection: Record<string, number>;
  completionOverall: number;
  evidenceCoverageOverall: number;
  criticalGaps: AuditFinding[];
  contradictions: AuditFinding[];
  staleFlags: AuditFinding[];
  recommendations: AuditFinding[];
};

export type DealDetail = {
  deal: DealCard;
  questions: TasQuestionState[];
  audit: AuditResult;
};

export type DealListOptions = {
  ownerEmail?: string;
  withSignals?: boolean;
};

export type SourceSignalQuery = {
  opportunityId?: string;
  accountName: string;
  opportunityName: string;
  ownerEmail?: string;
};

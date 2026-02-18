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
export type ConnectorProvider = "salesforce" | "gmail" | "slack" | "gong" | "gtm_agent";
export type ConnectorStatus = "missing_config" | "configured" | "connected" | "degraded" | "expired";
export type ConnectorAction = "connect" | "reconnect" | "disconnect" | "configure_channel";
export type SignalOwner = "self" | "other";
export type SignalVisibility = "owner_only" | "manager_summary";
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
  sourceOwner?: SignalOwner;
  visibility?: SignalVisibility;
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
  viewerUserId?: string;
  viewerEmail?: string;
  viewerRole?: UserRole;
};

export type SourceSignalQuery = {
  opportunityId?: string;
  accountName: string;
  opportunityName: string;
  ownerEmail?: string;
  viewerUserId?: string;
};

export type ConnectorAccountView = {
  connectorType: ConnectorProvider;
  status: ConnectorStatus;
  mode?: string;
  details?: string;
  lastCheckedAt?: string;
  lastSyncedAt?: string;
  action: ConnectorAction;
  isWorkspaceException?: boolean;
};

export type SlackChannelSubscriptionView = {
  id: string;
  channelId: string;
  channelName?: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};

export type IngestionSourceType = "call_notes" | "slack" | "email" | "doc" | "other" | "pasted_context";

export type IngestionDeltaStatus = "pending" | "accepted" | "edited_accepted" | "rejected";

export type TasExtractionField = {
  questionId: string;
  proposedAnswer: string;
  confidence: number;
  evidenceSnippets: string[];
  reasoning: string;
};

export type IngestionDeltaView = {
  id: string;
  runId: string;
  dealId: string;
  questionId: string;
  questionPrompt: string;
  oldValue?: string;
  proposedValue: string;
  confidence: number;
  evidenceSnippets: string[];
  reasoning: string;
  status: IngestionDeltaStatus;
  createdAt: string;
  decidedAt?: string;
};

export type IngestionRunView = {
  id: string;
  dealId: string;
  sourceType: string;
  status: "processing" | "completed" | "failed";
  model: string;
  createdAt: string;
  errorMessage?: string;
  deltaCount: number;
};

export type TasSectionQuality = {
  sectionId: string;
  confidence: number;
  rationale: string;
  outstandingItems: string[];
};

export type TasQuestionQuality = {
  questionId: string;
  confidence: number;
  verdict: "confirmed" | "not_confirmed";
  rationale: string;
};

export type TasQualityReport = {
  overallConfidence: number;
  criticalFlags: string[];
  sectionQuality: TasSectionQuality[];
  questionQuality: TasQuestionQuality[];
  generatedAt: string;
};

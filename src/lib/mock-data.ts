import { addDays, subDays } from "date-fns";
import { AuditResult, DealCard, SuggestionDelta, TasQuestionState } from "@/lib/types";
import { TAS_TEMPLATE } from "@/lib/tas-template";

const now = new Date();

export const mockDeals: DealCard[] = [
  {
    opportunityId: "006xx000001A1",
    sourceOpportunityId: "006xx000001A1",
    origin: "salesforce",
    accountName: "Northstar Bank",
    opportunityName: "Northstar Fraud Ops Copilot",
    stage: "Solutioning",
    amount: 1850000,
    closeDate: addDays(now, 37).toISOString(),
    ownerEmail: "maya@example.com",
    owners: { ad: "Maya Chen", se: "Jordan Ellis", sa: "Alex Rivera" },
    tasProgress: { answered: 15, total: 24 },
    evidenceCoverage: { backed: 9, total: 24 },
    risk: { count: 3, severity: "high" },
    needsReviewCount: 4,
    overdueCommitments: 1,
    topGaps: ["Signer path unclear", "Primary metric unconfirmed"],
    nextAction: { owner: "Maya Chen", dueDate: addDays(now, 2).toISOString() },
    sourceSignals: [],
    consolidatedInsights: []
  },
  {
    opportunityId: "006xx000001B2",
    sourceOpportunityId: "006xx000001B2",
    origin: "salesforce",
    accountName: "Aster Retail",
    opportunityName: "Aster CX AI Agent Rollout",
    stage: "Discovery",
    amount: 640000,
    closeDate: addDays(now, 52).toISOString(),
    ownerEmail: "drew@example.com",
    owners: { ad: "Drew Patel", se: "Rae Sullivan" },
    tasProgress: { answered: 8, total: 24 },
    evidenceCoverage: { backed: 4, total: 24 },
    risk: { count: 5, severity: "critical" },
    needsReviewCount: 2,
    overdueCommitments: 0,
    topGaps: ["Economic buyer unknown", "Competitor set missing"],
    nextAction: { owner: "Rae Sullivan", dueDate: addDays(now, 1).toISOString() },
    sourceSignals: [],
    consolidatedInsights: []
  }
];

export const mockQuestionStateByOpportunity: Record<string, TasQuestionState[]> = Object.fromEntries(
  mockDeals.map((deal) => {
    const states: TasQuestionState[] = TAS_TEMPLATE.flatMap((section) =>
      section.questions.map((question, idx) => {
        const answered = idx < deal.tasProgress.answered;
        const evidenceBacked = idx < deal.evidenceCoverage.backed;
        return {
          questionId: question.id,
          status: answered ? (evidenceBacked ? "confirmed" : "manual") : "empty",
          answer: answered ? `Current answer for ${question.prompt}` : undefined,
          lastUpdatedAt: answered ? subDays(now, idx % 7).toISOString() : undefined,
          lastUpdatedBy: answered ? "Blueprint System" : undefined,
          evidence: evidenceBacked
            ? [
                {
                  id: `${deal.opportunityId}-${question.id}-gong`,
                  label: "Gong 19:34",
                  deepLink: "https://gong.example/call/123?t=1174",
                  sourceType: "gong"
                }
              ]
            : []
        };
      })
    );

    if (deal.opportunityId === "006xx000001A1") {
      const q13 = states.find((state) => state.questionId === "q13");
      if (q13) {
        q13.status = "stale";
        q13.answer = "Signer likely CFO but path not validated";
      }
    }

    return [deal.opportunityId, states];
  })
);

export const mockSuggestions: SuggestionDelta[] = [
  {
    id: "sg-001",
    opportunityId: "006xx000001A1",
    tasQuestionId: "q13",
    proposedAnswer: "Confirmed signer path: CIO -> CFO -> CEO staff review.",
    confidence: 0.82,
    reasoningSummary:
      "Two recent Gong calls and one approval thread mention exact signature chain.",
    status: "pending",
    evidencePointers: [
      {
        id: "ev-1",
        label: "Gong call 14:22",
        deepLink: "https://gong.example/call/aaa?t=862",
        sourceType: "gong"
      },
      {
        id: "ev-2",
        label: "Gong call 39:04",
        deepLink: "https://gong.example/call/bbb?t=2344",
        sourceType: "gong"
      }
    ]
  },
  {
    id: "sg-002",
    opportunityId: "006xx000001A1",
    tasQuestionId: "q6",
    proposedAnswer:
      "Primary metric is fraud false-positive rate reduction from 7.4% to 3.0%.",
    confidence: 0.78,
    reasoningSummary:
      "Metric restated by VP Risk and Solutions Lead across two validation calls.",
    status: "pending",
    evidencePointers: [
      {
        id: "ev-3",
        label: "Gong call 08:03",
        deepLink: "https://gong.example/call/ccc?t=483",
        sourceType: "gong"
      }
    ]
  }
];

export const mockAuditByOpportunity: Record<string, AuditResult> = {
  "006xx000001A1": {
    opportunityId: "006xx000001A1",
    stage: "Solutioning",
    completionBySection: {
      "Strategic Initiative & CEO Priority": 80,
      "Economic Value & Consequences": 67,
      "Power, Politics, Signature & Partners": 63,
      "Vision Alignment": 100,
      "OpenAI Differentiation": 50,
      "Competitive Reality": 0
    },
    evidenceCoverageBySection: {
      "Strategic Initiative & CEO Priority": 40,
      "Economic Value & Consequences": 50,
      "Power, Politics, Signature & Partners": 25,
      "Vision Alignment": 100,
      "OpenAI Differentiation": 0,
      "Competitive Reality": 0
    },
    completionOverall: 62.5,
    evidenceCoverageOverall: 37.5,
    criticalGaps: [
      {
        id: "gap-1",
        type: "critical_gap",
        severity: "high",
        message: "Commit readiness risk: competitor set missing.",
        questionId: "q24"
      }
    ],
    contradictions: [
      {
        id: "con-1",
        type: "contradiction",
        severity: "medium",
        message: "Economic buyer named differently across calls.",
        questionId: "q12"
      }
    ],
    staleFlags: [
      {
        id: "stale-1",
        type: "stale",
        severity: "high",
        message: "Signer path older than 30 days while in Solutioning.",
        questionId: "q13"
      }
    ],
    recommendations: [
      {
        id: "rec-1",
        type: "recommendation",
        severity: "high",
        message: "Create commitment to validate signer chain before Commit gate.",
        recommendedCommitment: {
          title: "Confirm signer path with CFO office",
          owner: "Maya Chen",
          dueDate: addDays(now, 3).toISOString()
        }
      }
    ]
  }
};

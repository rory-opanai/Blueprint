import { differenceInDays, parseISO } from "date-fns";
import { mockAuditByOpportunity, mockQuestionStateByOpportunity } from "@/lib/mock-data";
import { TAS_TEMPLATE } from "@/lib/tas-template";
import { AuditFinding, AuditResult, TasQuestionState } from "@/lib/types";

const STAGE_ORDER = ["Discovery", "Solutioning", "Commit"] as const;

function stageIndex(stage: string): number {
  const idx = STAGE_ORDER.findIndex((entry) => entry.toLowerCase() === stage.toLowerCase());
  return idx === -1 ? 0 : idx;
}

export function calculateAudit(
  opportunityId: string,
  stage: string,
  providedStates?: TasQuestionState[]
): AuditResult {
  if (!providedStates && mockAuditByOpportunity[opportunityId]) {
    return mockAuditByOpportunity[opportunityId];
  }

  const states = providedStates ?? mockQuestionStateByOpportunity[opportunityId] ?? [];
  const completionBySection: Record<string, number> = {};
  const evidenceCoverageBySection: Record<string, number> = {};
  const findings: AuditFinding[] = [];

  let totalAnswered = 0;
  let totalEvidenceBacked = 0;

  for (const section of TAS_TEMPLATE) {
    const sectionStates = section.questions.map((question) =>
      states.find((state) => state.questionId === question.id)
    );

    const answered = sectionStates.filter((state) => state && state.status !== "empty").length;
    const evidence = sectionStates.filter((state) => state && state.evidence.length > 0).length;

    totalAnswered += answered;
    totalEvidenceBacked += evidence;
    completionBySection[section.title] = Math.round((answered / section.questions.length) * 100);
    evidenceCoverageBySection[section.title] = Math.round((evidence / section.questions.length) * 100);

    for (const question of section.questions) {
      const state = states.find((candidate) => candidate.questionId === question.id);
      if (!state || state.status === "empty") {
        if (stageIndex(stage) >= stageIndex(question.stageCriticalAt)) {
          findings.push({
            id: `gap-${question.id}`,
            type: "critical_gap",
            severity: stage === "Commit" ? "critical" : "high",
            message: `Missing required TAS answer: ${question.prompt}`,
            questionId: question.id
          });
        }
      }

      if (state?.lastUpdatedAt) {
        const ageDays = differenceInDays(new Date(), parseISO(state.lastUpdatedAt));
        if (ageDays > 30 && stageIndex(stage) > 0) {
          findings.push({
            id: `stale-${question.id}`,
            type: "stale",
            severity: "medium",
            message: `Answer for ${question.id} is stale (${ageDays} days old).`,
            questionId: question.id
          });
        }
      }
    }
  }

  const contradictions = detectContradictions(states);
  const criticalGaps = findings.filter((finding) => finding.type === "critical_gap");
  const staleFlags = findings.filter((finding) => finding.type === "stale");
  const recommendations = criticalGaps.slice(0, 3).map((gap) => ({
    id: `rec-${gap.id}`,
    type: "recommendation" as const,
    severity: gap.severity,
    message: `Create commitment to resolve: ${gap.message}`,
    recommendedCommitment: {
      title: `Resolve TAS gap ${gap.questionId}`,
      owner: "Deal Owner",
      dueDate: new Date(Date.now() + 1000 * 60 * 60 * 24 * 3).toISOString()
    }
  }));

  return {
    opportunityId,
    stage,
    completionBySection,
    evidenceCoverageBySection,
    completionOverall: Math.round((totalAnswered / 24) * 100),
    evidenceCoverageOverall: Math.round((totalEvidenceBacked / 24) * 100),
    criticalGaps,
    contradictions,
    staleFlags,
    recommendations
  };
}

function detectContradictions(states: TasQuestionState[]): AuditFinding[] {
  const byQuestion = new Map<string, TasQuestionState[]>();
  for (const state of states) {
    byQuestion.set(state.questionId, [...(byQuestion.get(state.questionId) ?? []), state]);
  }

  const output: AuditFinding[] = [];
  for (const [questionId, entries] of byQuestion) {
    const distinctAnswers = new Set(entries.map((entry) => entry.answer?.trim()).filter(Boolean));
    if (distinctAnswers.size > 1) {
      output.push({
        id: `con-${questionId}`,
        type: "contradiction",
        severity: "medium",
        message: `Conflicting answer variants detected for ${questionId}`,
        questionId
      });
    }
  }

  return output;
}

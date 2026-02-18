export type SourceCandidate = {
  sourceType: "gong" | "slack" | "gmail" | "gtm_agent";
  sourceRef: string;
  confidence: number;
};

export function suggestSourcesForOpportunity(opportunityId: string): SourceCandidate[] {
  const base = opportunityId.slice(-4).toLowerCase();

  return [
    { sourceType: "gong", sourceRef: `gong-call-collection-${base}`, confidence: 0.91 },
    { sourceType: "slack", sourceRef: `#deal-${base}`, confidence: 0.72 },
    { sourceType: "gmail", sourceRef: `gmail-query:${base}`, confidence: 0.68 },
    { sourceType: "gtm_agent", sourceRef: `gtm-agent/deals/${base}`, confidence: 0.66 }
  ];
}

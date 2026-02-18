import { mockSuggestions } from "@/lib/mock-data";
import { SuggestionDelta } from "@/lib/types";

const MAX_SUGGESTIONS_PER_DEAL_PER_DAY = 10;

export function listSuggestions(opportunityId?: string): SuggestionDelta[] {
  const filtered = opportunityId ? mockSuggestions.filter((s) => s.opportunityId === opportunityId) : mockSuggestions;
  return filtered.slice(0, MAX_SUGGESTIONS_PER_DEAL_PER_DAY);
}

export function applySuggestionDecision(
  suggestionId: string,
  action: "accept" | "edit_then_accept" | "reject",
  editedAnswer?: string,
  rejectReason?: string
): SuggestionDelta | undefined {
  const suggestion = mockSuggestions.find((s) => s.id === suggestionId);
  if (!suggestion) return undefined;

  if (action === "accept") suggestion.status = "accepted";
  if (action === "edit_then_accept") {
    suggestion.status = "edited_accepted";
    suggestion.proposedAnswer = editedAnswer ?? suggestion.proposedAnswer;
  }
  if (action === "reject") {
    suggestion.status = "rejected";
    suggestion.reasoningSummary = `${suggestion.reasoningSummary} (Rejected: ${rejectReason ?? "unspecified"})`;
  }

  return suggestion;
}

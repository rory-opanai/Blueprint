import { describe, expect, it } from "vitest";
import { applySuggestionDecision, listSuggestions } from "@/lib/services/suggestions";

describe("suggestions service", () => {
  it("caps suggestion list per deal/day", () => {
    const items = listSuggestions("006xx000001A1");
    expect(items.length).toBeLessThanOrEqual(10);
  });

  it("applies edit_then_accept correctly", () => {
    const updated = applySuggestionDecision("sg-001", "edit_then_accept", "Edited answer");
    expect(updated?.status).toBe("edited_accepted");
    expect(updated?.proposedAnswer).toBe("Edited answer");
  });
});

import { describe, expect, it } from "vitest";
import { calculateAudit } from "@/lib/services/audit";

describe("calculateAudit", () => {
  it("returns stage-gated audit shape", () => {
    const audit = calculateAudit("006xx000001A1", "Solutioning");
    expect(audit.opportunityId).toBe("006xx000001A1");
    expect(audit.completionOverall).toBeGreaterThan(0);
    expect(audit.evidenceCoverageOverall).toBeGreaterThanOrEqual(0);
    expect(Array.isArray(audit.criticalGaps)).toBe(true);
  });
});

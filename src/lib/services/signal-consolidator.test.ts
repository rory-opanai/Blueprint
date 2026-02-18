import { describe, expect, it } from "vitest";
import { consolidateDealSignals } from "@/lib/services/signal-consolidator";

describe("consolidateDealSignals", () => {
  it("deduplicates similar insights across sources", () => {
    const consolidated = consolidateDealSignals([
      {
        source: "slack",
        totalMatches: 1,
        highlights: ["Signer path confirmed through CFO and procurement"],
        deepLinks: ["https://slack.com/archives/c/p1"],
        lastActivityAt: "2026-02-17T10:00:00.000Z"
      },
      {
        source: "gong",
        totalMatches: 1,
        highlights: ["Signer path confirmed through CFO and procurement"],
        deepLinks: ["https://gong.example/call/1"],
        lastActivityAt: "2026-02-17T11:00:00.000Z"
      }
    ]);

    expect(consolidated.length).toBe(1);
    expect(consolidated[0]?.sources.sort()).toEqual(["gong", "slack"]);
    expect(consolidated[0]?.occurrences).toBe(2);
    expect(consolidated[0]?.category).toBe("signer_path");
  });
});

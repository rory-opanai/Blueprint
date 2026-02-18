import { ConsolidatedInsight, DealSignal, InsightCategory, SourceSystem } from "@/lib/types";

const STOP_WORDS = new Set([
  "a",
  "an",
  "the",
  "and",
  "or",
  "to",
  "for",
  "of",
  "in",
  "on",
  "with",
  "is",
  "are",
  "was",
  "were",
  "it",
  "this",
  "that"
]);

function normalizeText(input: string): string {
  const cleaned = input
    .toLowerCase()
    .replace(/https?:\/\/\S+/g, " ")
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((token) => token && !STOP_WORDS.has(token));

  return cleaned.join(" ").trim();
}

function classifyInsight(text: string): InsightCategory {
  const value = text.toLowerCase();

  if (/signer|signature|cfo|cio|buyer|procurement|approver/.test(value)) return "signer_path";
  if (/roi|metric|value|cost|savings|revenue|payback/.test(value)) return "economic_value";
  if (/competitor|competition|incumbent|displacement/.test(value)) return "competition";
  if (/next step|next action|due|timeline|deadline|close date/.test(value)) return "timeline";
  if (/risk|blocker|issue|concern|security|legal/.test(value)) return "risk";
  return "general";
}

function dedupeLinks(links: string[]): string[] {
  return Array.from(new Set(links.filter(Boolean)));
}

function similarity(a: string, b: string): number {
  const aSet = new Set(a.split(" ").filter(Boolean));
  const bSet = new Set(b.split(" ").filter(Boolean));
  if (aSet.size === 0 || bSet.size === 0) return 0;

  const intersection = Array.from(aSet).filter((token) => bSet.has(token)).length;
  const union = new Set([...aSet, ...bSet]).size;
  return intersection / union;
}

export function consolidateDealSignals(signals: DealSignal[]): ConsolidatedInsight[] {
  const bucket = new Map<
    string,
    {
      category: InsightCategory;
      summary: string;
      normalizedSummary: string;
      sources: Set<SourceSystem>;
      evidenceLinks: string[];
      occurrences: number;
      lastActivityAt?: string;
    }
  >();

  for (const signal of signals) {
    signal.highlights.forEach((highlight, index) => {
      const normalized = normalizeText(highlight);
      if (!normalized) return;

      const category = classifyInsight(normalized);
      const nearDuplicate = Array.from(bucket.keys()).find((key) => {
        const existing = bucket.get(key);
        if (!existing || existing.category !== category) return false;
        if (
          existing.normalizedSummary.includes(normalized) ||
          normalized.includes(existing.normalizedSummary)
        ) {
          return true;
        }

        return similarity(existing.normalizedSummary, normalized) >= 0.78;
      });

      const key = nearDuplicate ?? `${category}:${normalized}`;
      const evidence = signal.deepLinks[index] ?? signal.deepLinks[0];

      const existing = bucket.get(key);
      if (existing) {
        existing.occurrences += 1;
        existing.sources.add(signal.source);
        if (evidence) existing.evidenceLinks.push(evidence);

        if (signal.lastActivityAt) {
          const currentTs = existing.lastActivityAt ? Date.parse(existing.lastActivityAt) : 0;
          const incomingTs = Date.parse(signal.lastActivityAt);
          if (Number.isFinite(incomingTs) && incomingTs > currentTs) {
            existing.lastActivityAt = signal.lastActivityAt;
          }
        }
        return;
      }

      bucket.set(key, {
        category: classifyInsight(normalized),
        summary: highlight,
        normalizedSummary: normalized,
        sources: new Set([signal.source]),
        evidenceLinks: evidence ? [evidence] : [],
        occurrences: 1,
        lastActivityAt: signal.lastActivityAt
      });
    });
  }

  return Array.from(bucket.entries())
    .map(([id, entry]) => ({
      id,
      category: entry.category,
      summary: entry.summary,
      normalizedSummary: entry.normalizedSummary,
      sources: Array.from(entry.sources),
      evidenceLinks: dedupeLinks(entry.evidenceLinks),
      occurrences: entry.occurrences,
      lastActivityAt: entry.lastActivityAt
    }))
    .sort((a, b) => {
      if (b.occurrences !== a.occurrences) return b.occurrences - a.occurrences;
      const bTime = b.lastActivityAt ? Date.parse(b.lastActivityAt) : 0;
      const aTime = a.lastActivityAt ? Date.parse(a.lastActivityAt) : 0;
      return bTime - aTime;
    });
}

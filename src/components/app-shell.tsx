"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { FormEvent, ReactNode, useEffect, useMemo, useState } from "react";
import { DealCard } from "@/lib/types";

type SortMode = "updated" | "stage" | "risk";

const STAGE_RANK: Record<string, number> = {
  discovery: 1,
  solutioning: 2,
  commit: 3
};

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [deals, setDeals] = useState<DealCard[]>([]);
  const [ownerEmail, setOwnerEmail] = useState("");
  const [query, setQuery] = useState("");
  const [sortMode, setSortMode] = useState<SortMode>("updated");
  const [loadingDeals, setLoadingDeals] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [accountName, setAccountName] = useState("");
  const [opportunityName, setOpportunityName] = useState("");
  const [createError, setCreateError] = useState<string | null>(null);

  const activeDealId = pathname.startsWith("/deals/") ? pathname.split("/")[2] : null;

  useEffect(() => {
    void loadViewer();
  }, []);

  useEffect(() => {
    if (!ownerEmail) return;
    void loadDeals(ownerEmail);
  }, [ownerEmail]);

  async function loadViewer() {
    try {
      const response = await fetch("/api/me", { cache: "no-store" });
      const payload = (await response.json()) as { data?: { email?: string } };
      if (!response.ok) return;
      if (payload.data?.email) setOwnerEmail(payload.data.email);
    } catch {
      // allow manual mode
    }
  }

  async function loadDeals(email: string) {
    setLoadingDeals(true);
    try {
      const response = await fetch(`/api/deals?ownerEmail=${encodeURIComponent(email)}&withSignals=false`, {
        cache: "no-store"
      });
      const payload = (await response.json()) as { data?: DealCard[] };
      if (response.ok) {
        setDeals(payload.data ?? []);
      }
    } finally {
      setLoadingDeals(false);
    }
  }

  async function handleQuickCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setCreateError(null);
    try {
      const response = await fetch("/api/deals", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          accountName,
          opportunityName,
          stage: "Discovery",
          amount: 0,
          closeDate: new Date(Date.now() + 1000 * 60 * 60 * 24 * 30).toISOString(),
          ownerName: "Owner",
          ownerEmail
        })
      });
      const payload = (await response.json()) as { data?: DealCard; error?: string };
      if (!response.ok || !payload.data) {
        throw new Error(payload.error ?? "Unable to create deal");
      }
      setAccountName("");
      setOpportunityName("");
      setCreateOpen(false);
      await loadDeals(ownerEmail);
      router.push(`/deals/${payload.data.opportunityId}`);
    } catch (error) {
      setCreateError(error instanceof Error ? error.message : "Unable to create deal");
    }
  }

  const filteredDeals = useMemo(() => {
    const search = query.trim().toLowerCase();
    const scoped = search
      ? deals.filter(
          (deal) =>
            `${deal.accountName} ${deal.opportunityName} ${deal.stage}`.toLowerCase().includes(search)
        )
      : deals;

    return [...scoped].sort((left, right) => {
      if (sortMode === "risk") return right.risk.count - left.risk.count;
      if (sortMode === "stage") {
        return (
          (STAGE_RANK[right.stage.toLowerCase()] ?? 0) - (STAGE_RANK[left.stage.toLowerCase()] ?? 0)
        );
      }
      return Date.parse(left.closeDate) - Date.parse(right.closeDate);
    });
  }, [deals, query, sortMode]);

  return (
    <div className="codex-shell">
      <aside className="deal-rail">
        <div className="rail-top">
          <div className="rail-title">
            <strong>Blueprint</strong>
            <span>Threads</span>
          </div>
          <div className="rail-top-actions">
            <button type="button" className="ghost-btn icon-only" onClick={() => setCreateOpen((v) => !v)}>
              {createOpen ? "×" : "+"}
            </button>
          </div>
        </div>

        {createOpen ? (
          <form className="rail-create" onSubmit={handleQuickCreate}>
            <input
              value={accountName}
              onChange={(event) => setAccountName(event.target.value)}
              placeholder="Account"
              required
            />
            <input
              value={opportunityName}
              onChange={(event) => setOpportunityName(event.target.value)}
              placeholder="Opportunity"
              required
            />
            <button type="submit">Create</button>
            {createError ? <p className="inline-error">{createError}</p> : null}
          </form>
        ) : null}

        <div className="rail-controls">
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search deals"
            aria-label="Search deals"
          />
          <select value={sortMode} onChange={(event) => setSortMode(event.target.value as SortMode)}>
            <option value="updated">Sort: close date</option>
            <option value="stage">Sort: stage</option>
            <option value="risk">Sort: risk</option>
          </select>
        </div>

        <div className="rail-deals">
          {loadingDeals ? <p className="muted-line">Loading deals…</p> : null}
          {!loadingDeals && filteredDeals.length === 0 ? (
            <p className="muted-line">No deals yet. Create one to start.</p>
          ) : null}
          {filteredDeals.map((deal) => {
            const active = deal.opportunityId === activeDealId;
            return (
              <Link
                key={deal.opportunityId}
                href={`/deals/${deal.opportunityId}`}
                className={`rail-deal ${active ? "rail-deal-active" : ""}`}
              >
                <div className="rail-deal-main">
                  <span className="rail-folder-icon" aria-hidden="true">
                    🗂
                  </span>
                  <div>
                    <strong>{deal.accountName}</strong>
                    <p>{deal.opportunityName}</p>
                  </div>
                </div>
                <small className="rail-deal-meta">
                  {deal.needsReviewCount > 0 ? `${deal.needsReviewCount} pending` : deal.stage}
                </small>
              </Link>
            );
          })}
        </div>

        <div className="rail-links">
          <Link href="/dashboard">Dashboard</Link>
          <Link href="/review">Review Queue</Link>
          <Link href="/audit">Audit</Link>
        </div>
      </aside>

      <main className="workspace-main">{children}</main>
    </div>
  );
}

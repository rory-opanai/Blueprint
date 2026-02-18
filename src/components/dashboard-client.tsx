"use client";

import { FormEvent, useEffect, useState } from "react";
import { DealCard } from "@/lib/types";
import { DealCardView } from "@/components/deal-card";

const DEFAULT_STAGE = "Discovery";

export function DashboardClient() {
  const [ownerEmail, setOwnerEmail] = useState(process.env.NEXT_PUBLIC_DEFAULT_OWNER_EMAIL ?? "");
  const [deals, setDeals] = useState<DealCard[]>([]);
  const [loadingDeals, setLoadingDeals] = useState(false);
  const [loadingCreate, setLoadingCreate] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [accountName, setAccountName] = useState("");
  const [opportunityName, setOpportunityName] = useState("");
  const [stage, setStage] = useState(DEFAULT_STAGE);
  const [amount, setAmount] = useState("0");
  const [closeDate, setCloseDate] = useState(
    new Date(Date.now() + 1000 * 60 * 60 * 24 * 30).toISOString().slice(0, 10)
  );
  const [ownerName, setOwnerName] = useState("");
  const [createInSalesforce, setCreateInSalesforce] = useState(false);
  const [salesforceAccountId, setSalesforceAccountId] = useState("");

  const pendingReviews = deals.reduce((sum, deal) => sum + deal.needsReviewCount, 0);
  const highRiskDeals = deals.filter(
    (deal) => deal.risk.severity === "high" || deal.risk.severity === "critical"
  ).length;
  const overdueCommitments = deals.reduce((sum, deal) => sum + deal.overdueCommitments, 0);

  useEffect(() => {
    void loadViewerDefaults();
  }, []);

  useEffect(() => {
    if (ownerEmail) {
      void loadDeals(ownerEmail);
    }
  }, [ownerEmail]);

  async function loadViewerDefaults() {
    try {
      const response = await fetch("/api/me", { cache: "no-store" });
      const payload = (await response.json()) as {
        data?: { email?: string; name?: string };
      };
      if (!response.ok || !payload.data) return;

      setOwnerEmail((current) => current || payload.data?.email || "");
      setOwnerName((current) => current || payload.data?.name || "");
    } catch {
      // Keep manual fields editable if profile lookup fails.
    }
  }

  async function loadDeals(email: string) {
    setLoadingDeals(true);
    setError(null);

    try {
      const response = await fetch(
        `/api/deals?ownerEmail=${encodeURIComponent(email)}&withSignals=true`,
        { cache: "no-store" }
      );
      const payload = (await response.json()) as { data?: DealCard[]; error?: string };
      if (!response.ok) {
        throw new Error(payload.error ?? "Unable to load deals");
      }
      setDeals(payload.data ?? []);
    } catch (cause) {
      setDeals([]);
      setError(cause instanceof Error ? cause.message : "Unable to load deals");
    } finally {
      setLoadingDeals(false);
    }
  }

  async function handleCreateDeal(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoadingCreate(true);
    setError(null);

    try {
      const response = await fetch("/api/deals", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          accountName,
          opportunityName,
          stage,
          amount: Number(amount),
          closeDate: new Date(closeDate).toISOString(),
          ownerName,
          ownerEmail,
          createInSalesforce,
          salesforceAccountId: salesforceAccountId || undefined
        })
      });

      const payload = (await response.json()) as { error?: string };
      if (!response.ok) {
        throw new Error(payload.error ?? "Unable to create deal");
      }

      setAccountName("");
      setOpportunityName("");
      setAmount("0");
      setStage(DEFAULT_STAGE);
      setCloseDate(new Date(Date.now() + 1000 * 60 * 60 * 24 * 30).toISOString().slice(0, 10));
      await loadDeals(ownerEmail);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to create deal");
    } finally {
      setLoadingCreate(false);
    }
  }

  return (
    <div className="dashboard-stack">
      <section className="metrics-row metrics-row-dashboard">
        <article className="metric">
          <span>Active deals</span>
          <strong>{deals.length}</strong>
        </article>
        <article className="metric">
          <span>Pending reviews</span>
          <strong>{pendingReviews}</strong>
        </article>
        <article className="metric">
          <span>High risk deals</span>
          <strong>{highRiskDeals}</strong>
        </article>
        <article className="metric">
          <span>Overdue commitments</span>
          <strong>{overdueCommitments}</strong>
        </article>
      </section>

      <section className="control-bar card">
        <div>
          <label htmlFor="ownerEmail">Owner Email</label>
          <input
            id="ownerEmail"
            value={ownerEmail}
            onChange={(event) => setOwnerEmail(event.target.value)}
            placeholder="owner@company.com"
            type="email"
          />
        </div>
        <div>
          <label htmlFor="ownerName">Owner Name</label>
          <input
            id="ownerName"
            value={ownerName}
            onChange={(event) => setOwnerName(event.target.value)}
            placeholder="Account Director name"
          />
        </div>
        <div className="action-strip">
          <button type="button" onClick={() => void loadDeals(ownerEmail)} disabled={!ownerEmail || loadingDeals}>
            {loadingDeals ? "Loading..." : "Refresh Deals"}
          </button>
        </div>
      </section>

      <section className="card">
        <h3>Create Deal Card</h3>
        <form className="create-form" onSubmit={handleCreateDeal}>
          <label>
            Account
            <input
              value={accountName}
              onChange={(event) => setAccountName(event.target.value)}
              placeholder="Acme Corp"
              required
            />
          </label>
          <label>
            Opportunity
            <input
              value={opportunityName}
              onChange={(event) => setOpportunityName(event.target.value)}
              placeholder="AI Service Desk Rollout"
              required
            />
          </label>
          <label>
            Stage
            <select value={stage} onChange={(event) => setStage(event.target.value)}>
              <option value="Discovery">Discovery</option>
              <option value="Solutioning">Solutioning</option>
              <option value="Commit">Commit</option>
            </select>
          </label>
          <label>
            Amount
            <input
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
              type="number"
              min="0"
              step="1000"
              required
            />
          </label>
          <label>
            Close Date
            <input
              value={closeDate}
              onChange={(event) => setCloseDate(event.target.value)}
              type="date"
              required
            />
          </label>

          <label className="checkbox-row">
            <input
              checked={createInSalesforce}
              onChange={(event) => setCreateInSalesforce(event.target.checked)}
              type="checkbox"
            />
            Create Opportunity in Salesforce
          </label>

          {createInSalesforce ? (
            <label>
              Salesforce Account ID (optional)
              <input
                value={salesforceAccountId}
                onChange={(event) => setSalesforceAccountId(event.target.value)}
                placeholder="001..."
              />
            </label>
          ) : null}

          <button type="submit" disabled={loadingCreate || !ownerEmail || !ownerName}>
            {loadingCreate ? "Creating..." : "Create Card"}
          </button>
        </form>
      </section>

      {error ? <p className="error-banner">{error}</p> : null}

      <section className="card-grid">
        {deals.length === 0 ? (
          <article className="card">
            <h3>No deals found</h3>
            <p>
              Connect Salesforce and provide an owner email to pull active opportunities, or create a manual deal
              card above.
            </p>
          </article>
        ) : (
          deals.map((deal) => <DealCardView key={deal.opportunityId} deal={deal} />)
        )}
      </section>
    </div>
  );
}

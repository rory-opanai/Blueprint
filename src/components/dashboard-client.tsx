"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { DealCard } from "@/lib/types";

const DEFAULT_STAGE = "Discovery";
const DAY_MS = 24 * 60 * 60 * 1000;

type OnboardingStep = 1 | 2 | 3;

function fmtCurrency(value: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0
  }).format(value);
}

export function DashboardClient() {
  const router = useRouter();
  const [ownerEmail, setOwnerEmail] = useState(process.env.NEXT_PUBLIC_DEFAULT_OWNER_EMAIL ?? "");
  const [ownerName, setOwnerName] = useState("");
  const [deals, setDeals] = useState<DealCard[]>([]);
  const [loadingDeals, setLoadingDeals] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [onboardingOpen, setOnboardingOpen] = useState(false);
  const [onboardingStep, setOnboardingStep] = useState<OnboardingStep>(1);
  const [creatingDeal, setCreatingDeal] = useState(false);

  const [accountName, setAccountName] = useState("");
  const [opportunityName, setOpportunityName] = useState("");
  const [stage, setStage] = useState(DEFAULT_STAGE);
  const [amount, setAmount] = useState("0");
  const [closeDate, setCloseDate] = useState(
    new Date(Date.now() + 1000 * 60 * 60 * 24 * 30).toISOString().slice(0, 10)
  );
  const [createInSalesforce, setCreateInSalesforce] = useState(false);
  const [salesforceAccountId, setSalesforceAccountId] = useState("");
  const [onboardingContext, setOnboardingContext] = useState("");

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
      // keep editable
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
      if (!response.ok) throw new Error(payload.error ?? "Unable to load deals");
      setDeals(payload.data ?? []);
    } catch (cause) {
      setDeals([]);
      setError(cause instanceof Error ? cause.message : "Unable to load deals");
    } finally {
      setLoadingDeals(false);
    }
  }

  const metrics = useMemo(() => {
    const pendingReviews = deals.reduce((sum, deal) => sum + deal.needsReviewCount, 0);
    const highRiskDeals = deals.filter(
      (deal) => deal.risk.severity === "high" || deal.risk.severity === "critical"
    ).length;
    const overdueCommitments = deals.reduce((sum, deal) => sum + deal.overdueCommitments, 0);
    const totalPipeline = deals.reduce((sum, deal) => sum + deal.amount, 0);
    const largeDeals = deals.filter((deal) => deal.amount >= 1_000_000).length;
    const mediumDeals = deals.filter((deal) => deal.amount >= 250_000 && deal.amount < 1_000_000).length;
    const smallDeals = deals.filter((deal) => deal.amount < 250_000).length;

    const staleDeals = deals
      .map((deal) => {
        const lastActivity = deal.sourceSignals
          .map((signal) => Date.parse(signal.lastActivityAt ?? ""))
          .filter((value) => Number.isFinite(value) && value > 0)
          .sort((a, b) => b - a)[0];

        const daysSince = lastActivity ? Math.floor((Date.now() - lastActivity) / DAY_MS) : Number.POSITIVE_INFINITY;
        return { deal, daysSince };
      })
      .filter((item) => item.daysSince >= 7 || !Number.isFinite(item.daysSince))
      .sort((a, b) => b.daysSince - a.daysSince)
      .slice(0, 5);

    return {
      pendingReviews,
      highRiskDeals,
      overdueCommitments,
      totalPipeline,
      largeDeals,
      mediumDeals,
      smallDeals,
      staleDeals
    };
  }, [deals]);

  function resetOnboarding() {
    setOnboardingStep(1);
    setAccountName("");
    setOpportunityName("");
    setStage(DEFAULT_STAGE);
    setAmount("0");
    setCloseDate(new Date(Date.now() + 1000 * 60 * 60 * 24 * 30).toISOString().slice(0, 10));
    setCreateInSalesforce(false);
    setSalesforceAccountId("");
    setOnboardingContext("");
  }

  async function handleCreateDeal(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setCreatingDeal(true);
    setError(null);
    try {
      const createResponse = await fetch("/api/deals", {
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
      const createPayload = (await createResponse.json()) as { data?: DealCard; error?: string };
      if (!createResponse.ok || !createPayload.data) {
        throw new Error(createPayload.error ?? "Unable to create deal");
      }

      if (onboardingContext.trim().length >= 20) {
        await fetch(`/api/deals/${createPayload.data.opportunityId}/ingestions`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            sourceType: "pasted_context",
            rawContext: onboardingContext
          })
        });
      }

      await loadDeals(ownerEmail);
      setOnboardingOpen(false);
      resetOnboarding();
      router.push(`/deals/${createPayload.data.opportunityId}`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to create deal");
    } finally {
      setCreatingDeal(false);
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
          <span>Total pipeline</span>
          <strong>{fmtCurrency(metrics.totalPipeline)}</strong>
        </article>
        <article className="metric">
          <span>Pending reviews</span>
          <strong>{metrics.pendingReviews}</strong>
        </article>
        <article className="metric">
          <span>High risk deals</span>
          <strong>{metrics.highRiskDeals}</strong>
        </article>
        <article className="metric">
          <span>Overdue commitments</span>
          <strong>{metrics.overdueCommitments}</strong>
        </article>
        <article className="metric">
          <span>Deal size mix</span>
          <strong>
            L {metrics.largeDeals} · M {metrics.mediumDeals} · S {metrics.smallDeals}
          </strong>
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
        <div className="action-strip action-strip-dashboard">
          <button type="button" onClick={() => void loadDeals(ownerEmail)} disabled={!ownerEmail || loadingDeals}>
            {loadingDeals ? "Loading..." : "Refresh"}
          </button>
          <button
            type="button"
            onClick={() => setOnboardingOpen(true)}
            disabled={!ownerEmail || !ownerName}
          >
            New deal onboarding
          </button>
        </div>
      </section>

      <section className="card dashboard-callouts">
        <h3>Needs attention</h3>
        {metrics.staleDeals.length === 0 ? (
          <p>No stale deals. All visible opportunities have activity in the last 7 days.</p>
        ) : (
          <ul>
            {metrics.staleDeals.map(({ deal, daysSince }) => (
              <li key={deal.opportunityId}>
                <strong>{deal.accountName}</strong> · {deal.opportunityName} ·{" "}
                {Number.isFinite(daysSince) ? `${daysSince} days since last signal` : "no captured activity yet"}
              </li>
            ))}
          </ul>
        )}
      </section>

      {error ? <p className="error-banner">{error}</p> : null}

      {onboardingOpen ? (
        <div className="composer-backdrop" onClick={() => setOnboardingOpen(false)}>
          <div className="composer-modal onboarding-modal" onClick={(event) => event.stopPropagation()}>
            <form onSubmit={handleCreateDeal}>
              <div className="inline-heading">
                <h3>Deal onboarding</h3>
                <button type="button" className="ghost-btn" onClick={() => setOnboardingOpen(false)}>
                  Close
                </button>
              </div>

              <div className="onboarding-steps">
                <span className={onboardingStep === 1 ? "step-active" : ""}>1. Basics</span>
                <span className={onboardingStep === 2 ? "step-active" : ""}>2. Commercials</span>
                <span className={onboardingStep === 3 ? "step-active" : ""}>3. Context</span>
              </div>

              {onboardingStep === 1 ? (
                <div className="onboarding-grid">
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
                </div>
              ) : null}

              {onboardingStep === 2 ? (
                <div className="onboarding-grid">
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
                </div>
              ) : null}

              {onboardingStep === 3 ? (
                <label>
                  Optional context
                  <textarea
                    rows={10}
                    value={onboardingContext}
                    onChange={(event) => setOnboardingContext(event.target.value)}
                    placeholder="Paste any initial notes, email snippets, or call context. If provided, we will run an initial TAS extraction immediately."
                  />
                </label>
              ) : null}

              <div className="inline-heading">
                <button
                  type="button"
                  className="ghost-btn"
                  disabled={onboardingStep === 1}
                  onClick={() => setOnboardingStep((current) => Math.max(1, current - 1) as OnboardingStep)}
                >
                  Back
                </button>
                <div className="queue-toolbar">
                  <button type="button" className="ghost-btn" onClick={resetOnboarding}>
                    Reset
                  </button>
                  {onboardingStep < 3 ? (
                    <button
                      type="button"
                      onClick={() => setOnboardingStep((current) => Math.min(3, current + 1) as OnboardingStep)}
                    >
                      Next
                    </button>
                  ) : (
                    <button type="submit" disabled={creatingDeal || !ownerEmail || !ownerName}>
                      {creatingDeal ? "Creating..." : "Create deal"}
                    </button>
                  )}
                </div>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </div>
  );
}

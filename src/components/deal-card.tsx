"use client";

import Link from "next/link";
import { KeyboardEvent, MouseEvent } from "react";
import { useRouter } from "next/navigation";
import { DealCard } from "@/lib/types";
import { currency } from "@/lib/utils";

export function DealCardView({ deal }: { deal: DealCard }) {
  const router = useRouter();
  const dealHref = `/deals/${deal.opportunityId}`;

  function shouldIgnoreCardNavigation(target: EventTarget | null): boolean {
    if (!(target instanceof HTMLElement)) return false;
    return Boolean(target.closest("a,button,input,select,textarea,label"));
  }

  function openDeal() {
    router.push(dealHref);
  }

  function handleCardClick(event: MouseEvent<HTMLElement>) {
    if (shouldIgnoreCardNavigation(event.target)) return;
    openDeal();
  }

  function handleCardKeyDown(event: KeyboardEvent<HTMLElement>) {
    if (shouldIgnoreCardNavigation(event.target)) return;
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    openDeal();
  }

  return (
    <article
      className="card deal-card-clickable"
      role="link"
      tabIndex={0}
      onClick={handleCardClick}
      onKeyDown={handleCardKeyDown}
      aria-label={`Open deal ${deal.accountName} ${deal.opportunityName}`}
    >
      <header className="deal-header">
        <div>
          <h3>{deal.accountName}</h3>
          <p>{deal.opportunityName}</p>
        </div>
        <span className={`origin-badge origin-${deal.origin}`}>{deal.origin}</span>
      </header>

      <dl>
        <div>
          <dt>Stage</dt>
          <dd>{deal.stage}</dd>
        </div>
        <div>
          <dt>Amount</dt>
          <dd>{currency(deal.amount)}</dd>
        </div>
        <div>
          <dt>Close</dt>
          <dd>{new Date(deal.closeDate).toLocaleDateString()}</dd>
        </div>
        <div>
          <dt>TAS</dt>
          <dd>
            {deal.tasProgress.answered}/{deal.tasProgress.total}
          </dd>
        </div>
        <div>
          <dt>Evidence</dt>
          <dd>
            {deal.evidenceCoverage.backed}/{deal.evidenceCoverage.total}
          </dd>
        </div>
        <div>
          <dt>Needs review</dt>
          <dd>{deal.needsReviewCount}</dd>
        </div>
      </dl>

      <p className="gaps">Gaps: {deal.topGaps.join("; ")}</p>
      <p>
        Next: {deal.nextAction?.owner ?? "Unassigned"} by{" "}
        {deal.nextAction ? new Date(deal.nextAction.dueDate).toLocaleDateString() : "-"}
      </p>

      <div className="signal-block">
        <strong>Signals:</strong>
        {deal.sourceSignals.length === 0 ? (
          <p>No source signals yet.</p>
        ) : (
          <ul>
            {deal.sourceSignals.map((signal) => (
              <li key={signal.source}>
                {signal.source}: {signal.totalMatches} matches
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="signal-block">
        <strong>Consolidated insights:</strong>
        {deal.consolidatedInsights.length === 0 ? (
          <p>No consolidated insight yet.</p>
        ) : (
          <ul>
            {deal.consolidatedInsights.slice(0, 2).map((insight) => (
              <li key={insight.id}>
                {insight.summary} ({insight.sources.join(", ")})
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="actions">
        <Link href={dealHref}>Open Deal</Link>
        <Link href={`/walkthrough?deal=${deal.opportunityId}`}>Walkthrough</Link>
      </div>
    </article>
  );
}

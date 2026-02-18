import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { getDashboardData } from "@/lib/data/store";

export default async function WalkthroughPage({
  searchParams
}: {
  searchParams: Promise<{ deal?: string; ownerEmail?: string }>;
}) {
  const { deal, ownerEmail } = await searchParams;
  const deals = await getDashboardData({ ownerEmail, withSignals: true });
  const selected = deals.find((entry) => entry.opportunityId === deal) ?? deals[0];

  return (
    <AppShell>
      <section className="walkthrough">
        <header>
          <h2>Walkthrough Mode</h2>
          {selected ? (
            <p>
              {selected.accountName} - {selected.opportunityName}
            </p>
          ) : (
            <p>No deal selected.</p>
          )}
        </header>

        {!selected ? (
          <div className="walk-card">
            <h3>No deals available</h3>
            <p>Load deals on the dashboard first, then open walkthrough mode.</p>
          </div>
        ) : (
          <>
            <div className="walk-card">
              <h3>What we know</h3>
              <p>
                {selected.tasProgress.answered}/24 TAS answers are populated, {selected.evidenceCoverage.backed}/24
                evidence-backed.
              </p>
            </div>
            <div className="walk-card">
              <h3>What&apos;s missing</h3>
              <ul>{selected.topGaps.map((gap) => <li key={gap}>{gap}</li>)}</ul>
            </div>
            <div className="walk-card">
              <h3>What we&apos;ll do next</h3>
              <p>
                Owner: {selected.nextAction?.owner ?? "Unassigned"} by{" "}
                {selected.nextAction ? new Date(selected.nextAction.dueDate).toLocaleDateString() : "TBD"}
              </p>
              <Link href={`/deals/${selected.opportunityId}`}>Open full Blueprint</Link>
            </div>
          </>
        )}
      </section>
    </AppShell>
  );
}

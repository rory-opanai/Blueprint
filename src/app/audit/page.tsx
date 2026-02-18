import { AppShell } from "@/components/app-shell";
import { getDashboardData, getDealData } from "@/lib/data/store";

export default async function AuditPage({
  searchParams
}: {
  searchParams: Promise<{ ownerEmail?: string }>;
}) {
  const { ownerEmail } = await searchParams;
  const deals = await getDashboardData({ ownerEmail, withSignals: false });

  return (
    <AppShell>
      <section className="page-header">
        <h2>Audit Board</h2>
        <p>Stage-gated readiness with critical gaps, contradictions, and stale answers.</p>
      </section>
      <div className="audit-list">
        {deals.length === 0 ? (
          <article className="card">
            <h3>No deals to audit</h3>
            <p>Provide `ownerEmail` in the URL or create a card on the dashboard.</p>
          </article>
        ) : null}

        {await Promise.all(
          deals.map(async (deal) => {
            const detail = await getDealData(deal.opportunityId, { ownerEmail, withSignals: false });
            if (!detail) return null;

            const audit = detail.audit;
            return (
              <article key={deal.opportunityId} className="card">
                <h3>
                  {deal.accountName} - {deal.opportunityName}
                </h3>
                <p>
                  Completion: {audit.completionOverall}% | Evidence: {audit.evidenceCoverageOverall}%
                </p>
                <p>
                  Critical gaps: {audit.criticalGaps.length} | Contradictions: {audit.contradictions.length} |
                  Stale: {audit.staleFlags.length}
                </p>
                <ul>
                  {audit.recommendations.map((recommendation) => (
                    <li key={recommendation.id}>{recommendation.message}</li>
                  ))}
                </ul>
              </article>
            );
          })
        )}
      </div>
    </AppShell>
  );
}

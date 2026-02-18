import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { requireUserSession } from "@/lib/auth/guards";
import { listDealsForUser } from "@/lib/services/deal-aggregator";
import { listDealReviewQueue } from "@/lib/services/ingestions";

export default async function ReviewPage() {
  const viewer = await requireUserSession();
  const deals = await listDealsForUser({
    viewerUserId: viewer.id,
    viewerEmail: viewer.email,
    viewerRole: viewer.role,
    withSignals: false
  });

  const queueByDeal = await Promise.all(
    deals.map(async (deal) => ({
      deal,
      queue: await listDealReviewQueue({
        dealId: deal.opportunityId,
        userId: viewer.id
      })
    }))
  );

  const totalPending = queueByDeal.reduce(
    (sum, entry) => sum + entry.queue.filter((item) => item.status === "pending").length,
    0
  );

  return (
    <AppShell>
      <section className="page-header">
        <h2>Review Queue</h2>
        <p>{totalPending} pending deltas across your deals.</p>
      </section>
      <section className="queue">
        {queueByDeal.length === 0 ? (
          <article className="suggestion">
            <h3>No deals yet</h3>
            <p>Create a deal and submit context from the deal page.</p>
          </article>
        ) : (
          queueByDeal.map(({ deal, queue }) => (
            <article key={deal.opportunityId} className="suggestion">
              <h3>
                {deal.accountName} · {deal.opportunityName}
              </h3>
              <p>
                Pending: {queue.filter((item) => item.status === "pending").length} · Total: {queue.length}
              </p>
              {queue.slice(0, 5).map((item) => (
                <p key={item.id}>
                  {item.questionId}: {item.status} ({Math.round(item.confidence * 100)}%)
                </p>
              ))}
              <div className="actions">
                <Link href={`/deals/${deal.opportunityId}`}>Open deal workspace</Link>
              </div>
            </article>
          ))
        )}
      </section>
    </AppShell>
  );
}

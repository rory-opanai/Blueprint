import { notFound } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { QuestionCard } from "@/components/question-card";
import { TAS_TEMPLATE } from "@/lib/tas-template";
import { getDealData } from "@/lib/data/store";
import { currency } from "@/lib/utils";
import { requireUserSession } from "@/lib/auth/guards";

export default async function DealPage({
  params,
  searchParams
}: {
  params: Promise<{ opportunityId: string }>;
  searchParams: Promise<{ ownerEmail?: string }>;
}) {
  const { opportunityId } = await params;
  const { ownerEmail: ownerEmailParam } = await searchParams;
  const viewer = await requireUserSession();
  const ownerEmail = ownerEmailParam ?? viewer.email ?? undefined;
  const data = await getDealData(opportunityId, {
    ownerEmail,
    withSignals: true,
    viewerUserId: viewer.id,
    viewerEmail: viewer.email,
    viewerRole: viewer.role
  });

  if (!data) {
    notFound();
  }

  const managerRestricted =
    viewer.role === "MANAGER" &&
    data.deal.ownerEmail &&
    viewer.email &&
    data.deal.ownerEmail.toLowerCase() !== viewer.email.toLowerCase();

  return (
    <AppShell>
      <section className="page-header">
        <h2>
          {data.deal.accountName}: {data.deal.opportunityName}
        </h2>
        <p>
          {data.deal.stage} | {currency(data.deal.amount)} | Close{" "}
          {new Date(data.deal.closeDate).toLocaleDateString()}
        </p>
      </section>

      <section className="metrics-row">
        <div className="metric">
          <span>Completion</span>
          <strong>
            {data.deal.tasProgress.answered}/{data.deal.tasProgress.total}
          </strong>
        </div>
        <div className="metric">
          <span>Evidence</span>
          <strong>
            {data.deal.evidenceCoverage.backed}/{data.deal.evidenceCoverage.total}
          </strong>
        </div>
        <div className="metric">
          <span>Critical gaps</span>
          <strong>{data.audit.criticalGaps.length}</strong>
        </div>
      </section>

      <section className="section-block card">
        <h3>Source Signals</h3>
        {data.deal.sourceSignals.length === 0 ? (
          <p>No Gmail/Slack/Gong/GTM Agent signals were found for this deal.</p>
        ) : (
          <div className="signal-list">
            {data.deal.sourceSignals.map((signal) => (
              <article key={signal.source} className="signal-item">
                <h4>
                  {signal.source} ({signal.totalMatches})
                </h4>
                <p>
                  Last activity: {signal.lastActivityAt ? new Date(signal.lastActivityAt).toLocaleString() : "unknown"}
                </p>
                <ul>
                  {managerRestricted
                    ? signal.deepLinks.slice(0, 3).map((link) => (
                        <li key={`${signal.source}-${link}`}>
                          Summary available for this source.{" "}
                          <a href={link} target="_blank" rel="noreferrer">
                            Open evidence
                          </a>
                        </li>
                      ))
                    : signal.highlights.map((highlight) => (
                        <li key={`${signal.source}-${highlight}`}>{highlight}</li>
                      ))}
                </ul>
              </article>
            ))}
          </div>
        )}
      </section>

      <section className="section-block card">
        <h3>Consolidated Insights</h3>
        <p>Deduplicated, standardized statements merged across connectors and Slack updates.</p>
        {data.deal.consolidatedInsights.length === 0 ? (
          <p>No consolidated insight available yet.</p>
        ) : (
          <div className="signal-list">
            {data.deal.consolidatedInsights.map((insight) => (
              <article key={insight.id} className="signal-item">
                <h4>{insight.category}</h4>
                <p>{insight.summary}</p>
                <p>
                  Sources: {insight.sources.join(", ")} | Mentions: {insight.occurrences}
                </p>
              </article>
            ))}
          </div>
        )}
      </section>

      {TAS_TEMPLATE.map((section) => (
        <section key={section.id} className="section-block">
          <h3>{section.title}</h3>
          <div className="question-grid">
            {section.questions.map((question) => {
              const state = data.questions.find((entry) => entry.questionId === question.id);
              if (!state) return null;
              return <QuestionCard key={question.id} state={state} />;
            })}
          </div>
        </section>
      ))}

      <section className="section-block">
        <h3>Commitments</h3>
        <p>One next action is required in every stage gate.</p>
        {data.audit.recommendations.length === 0 ? (
          <p>No open commitments generated from the current audit.</p>
        ) : (
          <ul>
            {data.audit.recommendations.map((recommendation) => (
              <li key={recommendation.id}>{recommendation.message}</li>
            ))}
          </ul>
        )}
      </section>
    </AppShell>
  );
}

import { AppShell } from "@/components/app-shell";
import { listSuggestions } from "@/lib/services/suggestions";

export default function ReviewPage() {
  const suggestions = listSuggestions();

  return (
    <AppShell>
      <section className="page-header">
        <h2>Review Queue</h2>
        <p>Approve, edit-approve, or reject TAS updates before Salesforce write-back.</p>
      </section>
      <section className="queue">
        {suggestions.map((s) => (
          <article key={s.id} className="suggestion">
            <h3>{s.tasQuestionId} ({s.opportunityId})</h3>
            <p>{s.proposedAnswer}</p>
            <p>Confidence: {Math.round(s.confidence * 100)}%</p>
            <p>{s.reasoningSummary}</p>
            <div className="chips">
              {s.evidencePointers.map((e) => (
                <a key={e.id} href={e.deepLink} target="_blank" rel="noreferrer">{e.label}</a>
              ))}
            </div>
            <div className="actions">
              <button>Accept</button>
              <button>Edit + Accept</button>
              <button>Reject</button>
            </div>
          </article>
        ))}
      </section>
    </AppShell>
  );
}

import { TAS_TEMPLATE } from "@/lib/tas-template";
import { TasQuestionState } from "@/lib/types";

export function QuestionCard({ state }: { state: TasQuestionState }) {
  const question = TAS_TEMPLATE.flatMap((s) => s.questions).find((q) => q.id === state.questionId);

  return (
    <article className="question-card">
      <h4>{question?.prompt ?? state.questionId}</h4>
      <p>Status: <strong>{state.status}</strong></p>
      <p>{state.answer ?? "No answer yet"}</p>
      <p className="updated">Updated: {state.lastUpdatedAt ? new Date(state.lastUpdatedAt).toLocaleString() : "Never"} by {state.lastUpdatedBy ?? "-"}</p>
      <div className="chips">
        {state.evidence.map((chip) => (
          <a key={chip.id} href={chip.deepLink} target="_blank" rel="noreferrer">{chip.label}</a>
        ))}
      </div>
    </article>
  );
}

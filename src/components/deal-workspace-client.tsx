"use client";

import { FormEvent, KeyboardEvent, useCallback, useEffect, useMemo, useState } from "react";
import {
  DealDetail,
  IngestionDeltaView,
  IngestionRunView,
  TasQuestionState,
  TasQualityReport
} from "@/lib/types";
import { TAS_TEMPLATE } from "@/lib/tas-template";

type Props = {
  detail: DealDetail;
};

const SOURCE_OPTIONS = [
  { value: "pasted_context", label: "Pasted context" },
  { value: "call_notes", label: "Call notes" },
  { value: "slack", label: "Slack update" },
  { value: "email", label: "Email thread" },
  { value: "doc", label: "Document notes" },
  { value: "other", label: "Other" }
] as const;

function initialAnswersMap(questions: TasQuestionState[]) {
  return new Map(questions.map((question) => [question.questionId, question]));
}

export function DealWorkspaceClient({ detail }: Props) {
  const [questions, setQuestions] = useState<TasQuestionState[]>(detail.questions);
  const [queue, setQueue] = useState<IngestionDeltaView[]>([]);
  const [runs, setRuns] = useState<IngestionRunView[]>([]);
  const [composerOpen, setComposerOpen] = useState(false);
  const [sourceType, setSourceType] = useState("pasted_context");
  const [rawContext, setRawContext] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [busyDecisionId, setBusyDecisionId] = useState<string | null>(null);
  const [editedAnswers, setEditedAnswers] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [qualityReport, setQualityReport] = useState<TasQualityReport | null>(null);
  const [qualityLoading, setQualityLoading] = useState(false);
  const [editingQuestionId, setEditingQuestionId] = useState<string | null>(null);
  const [editedQuestionAnswer, setEditedQuestionAnswer] = useState("");
  const [savingQuestionId, setSavingQuestionId] = useState<string | null>(null);

  const answersByQuestion = useMemo(() => initialAnswersMap(questions), [questions]);

  const refreshQueues = useCallback(async () => {
    const [queueResponse, runsResponse] = await Promise.all([
      fetch(`/api/deals/${detail.deal.opportunityId}/review-queue`, { cache: "no-store" }),
      fetch(`/api/deals/${detail.deal.opportunityId}/ingestions`, { cache: "no-store" })
    ]);
    const queuePayload = (await queueResponse.json()) as { data?: IngestionDeltaView[] };
    const runsPayload = (await runsResponse.json()) as { data?: IngestionRunView[] };
    setQueue(queuePayload.data ?? []);
    setRuns(runsPayload.data ?? []);
  }, [detail.deal.opportunityId]);

  useEffect(() => {
    void refreshQueues();
  }, [refreshQueues]);

  const refreshQuality = useCallback(async () => {
    setQualityLoading(true);
    try {
      const response = await fetch(`/api/deals/${detail.deal.opportunityId}/quality-check`, {
        cache: "no-store"
      });
      const payload = (await response.json()) as { data?: TasQualityReport };
      if (response.ok && payload.data) {
        setQualityReport(payload.data);
      }
    } finally {
      setQualityLoading(false);
    }
  }, [detail.deal.opportunityId]);

  useEffect(() => {
    void refreshQuality();
  }, [detail.deal.opportunityId, refreshQuality]);

  async function refreshTas() {
    const response = await fetch(`/api/deals/${detail.deal.opportunityId}/tas`, {
      cache: "no-store"
    });
    const payload = (await response.json()) as { data?: TasQuestionState[] };
    if (response.ok && payload.data) {
      setQuestions(payload.data);
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (rawContext.trim().length < 20) {
      setError("Add at least 20 characters of context.");
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      const response = await fetch(`/api/deals/${detail.deal.opportunityId}/ingestions`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          sourceType,
          rawContext
        })
      });
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(payload.error ?? "Unable to process context");

      setRawContext("");
      setComposerOpen(false);
      await Promise.all([refreshQueues(), refreshTas(), refreshQuality()]);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to process context");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDecision(deltaId: string, action: "accept" | "edit_then_accept" | "reject") {
    setBusyDecisionId(deltaId);
    setError(null);
    try {
      const response = await fetch(`/api/review/${deltaId}/decision`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action,
          editedAnswer: editedAnswers[deltaId]
        })
      });
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(payload.error ?? "Unable to update review item");
      await Promise.all([refreshQueues(), refreshTas(), refreshQuality()]);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to update review item");
    } finally {
      setBusyDecisionId(null);
    }
  }

  async function handleBulkDecision(action: "accept" | "reject", minConfidence?: number) {
    setBusyDecisionId("bulk");
    setError(null);
    try {
      const response = await fetch(
        `/api/deals/${detail.deal.opportunityId}/review-queue/bulk-decision`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            action,
            minConfidence
          })
        }
      );
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(payload.error ?? "Unable to process bulk decision");
      await Promise.all([refreshQueues(), refreshTas(), refreshQuality()]);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to process bulk decision");
    } finally {
      setBusyDecisionId(null);
    }
  }

  function handleComposerKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Escape") {
      setComposerOpen(false);
      return;
    }
    if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
      const form = event.currentTarget.form;
      form?.requestSubmit();
    }
  }

  function startInlineEdit(questionId: string, currentAnswer?: string) {
    setEditingQuestionId(questionId);
    setEditedQuestionAnswer(currentAnswer ?? "");
    setError(null);
  }

  function cancelInlineEdit() {
    setEditingQuestionId(null);
    setEditedQuestionAnswer("");
  }

  async function saveInlineEdit(questionId: string) {
    const answer = editedQuestionAnswer.trim();
    if (answer.length < 3) {
      setError("Answer must be at least 3 characters.");
      return;
    }

    setSavingQuestionId(questionId);
    setError(null);
    try {
      const response = await fetch(`/api/deals/${detail.deal.opportunityId}/tas`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          questionId,
          answer,
          actor: detail.deal.owners.ad || "Blueprint User",
          evidenceLinks: []
        })
      });
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) {
        throw new Error(
          typeof payload.error === "string" ? payload.error : "Unable to save inline answer"
        );
      }
      setEditingQuestionId(null);
      setEditedQuestionAnswer("");
      await Promise.all([refreshTas(), refreshQuality()]);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to save inline answer");
    } finally {
      setSavingQuestionId(null);
    }
  }

  const pendingCount = queue.filter((item) => item.status === "pending").length;
  const sectionQualityMap = new Map(
    (qualityReport?.sectionQuality ?? []).map((section) => [section.sectionId, section])
  );
  const questionQualityMap = new Map(
    (qualityReport?.questionQuality ?? []).map((question) => [question.questionId, question])
  );

  function confidenceTone(value: number): "high" | "medium" | "low" {
    if (value >= 0.8) return "high";
    if (value >= 0.6) return "medium";
    return "low";
  }

  function getQuestionDisplayStatus(questionId: string, state?: TasQuestionState) {
    const answer = state?.answer?.trim() ?? "";
    const quality = questionQualityMap.get(questionId);
    if (!answer || state?.status === "empty") {
      return { badgeClass: "status-empty", label: "empty" };
    }
    if (quality && (quality.verdict === "not_confirmed" || quality.confidence < 0.72)) {
      return { badgeClass: "status-not_confirmed", label: "not confirmed" };
    }
    return {
      badgeClass: `status-${state?.status ?? "manual"}`,
      label: state?.status ?? "manual"
    };
  }

  return (
    <div className="deal-workspace">
      <section className="page-header">
        <h2>
          {detail.deal.accountName} · {detail.deal.opportunityName}
        </h2>
        <p>
          {detail.deal.stage} · {Math.round(detail.deal.risk.count)} risk signals ·{" "}
          {detail.deal.tasProgress.answered}/{detail.deal.tasProgress.total} answered
        </p>
      </section>

      <section className="card quality-panel">
        <div className="inline-heading">
          <h3>TAS Quality Agent</h3>
          <button type="button" className="ghost-btn" onClick={() => void refreshQuality()} disabled={qualityLoading}>
            {qualityLoading ? "Checking…" : "Re-check"}
          </button>
        </div>
        <p>
          Overall confidence:{" "}
          <strong>
            {qualityReport ? `${Math.round(qualityReport.overallConfidence * 100)}%` : "Not available"}
          </strong>
        </p>
        {qualityReport?.criticalFlags?.length ? (
          <ul>
            {qualityReport.criticalFlags.map((flag) => (
              <li key={flag}>{flag}</li>
            ))}
          </ul>
        ) : (
          <p className="muted-line">No critical flags detected by the latest quality pass.</p>
        )}
      </section>

      <section className="deal-grid">
        {TAS_TEMPLATE.map((section) => (
          <article key={section.id} className="deal-section-card">
            <header className="deal-section-header">
              <h3>{section.title}</h3>
              <div className="deal-section-meta">
                {sectionQualityMap.has(section.id) ? (
                  <span
                    className={`status-badge confidence-${confidenceTone(
                      sectionQualityMap.get(section.id)?.confidence ?? 0
                    )}`}
                  >
                    {Math.round((sectionQualityMap.get(section.id)?.confidence ?? 0) * 100)}% confidence
                  </span>
                ) : (
                  <span className="status-badge status-empty">No confidence score</span>
                )}
              </div>
            </header>
            {sectionQualityMap.get(section.id)?.outstandingItems?.length ? (
              <ul className="section-outstanding">
                {sectionQualityMap
                  .get(section.id)!
                  .outstandingItems.slice(0, 2)
                  .map((item) => (
                    <li key={`${section.id}-${item}`}>{item}</li>
                  ))}
              </ul>
            ) : null}
            <div className="deal-question-list">
              {section.questions.map((question) => {
                const state = answersByQuestion.get(question.id);
                const quality = questionQualityMap.get(question.id);
                const displayStatus = getQuestionDisplayStatus(question.id, state);
                const isEditing = editingQuestionId === question.id;
                const isSaving = savingQuestionId === question.id;
                return (
                  <div key={question.id} className="deal-question-row">
                    <div className="deal-question-content">
                      <p className="deal-question-prompt">{question.prompt}</p>
                      {isEditing ? (
                        <div className="inline-editor">
                          <textarea
                            value={editedQuestionAnswer}
                            onChange={(event) => setEditedQuestionAnswer(event.target.value)}
                            rows={4}
                            autoFocus
                            placeholder="Add a specific, evidence-grounded answer…"
                          />
                          <div className="inline-editor-actions">
                            <button
                              type="button"
                              className="ghost-btn"
                              onClick={cancelInlineEdit}
                              disabled={isSaving}
                            >
                              Cancel
                            </button>
                            <button
                              type="button"
                              onClick={() => void saveInlineEdit(question.id)}
                              disabled={isSaving}
                            >
                              {isSaving ? "Saving…" : "Save"}
                            </button>
                          </div>
                        </div>
                      ) : (
                        <p className="deal-question-answer">{state?.answer ?? "No answer yet"}</p>
                      )}
                      {quality?.verdict === "not_confirmed" ? (
                        <p className="deal-question-warning">{quality.rationale}</p>
                      ) : null}
                    </div>
                    <div className="deal-question-meta">
                      <span className={`status-badge ${displayStatus.badgeClass}`}>{displayStatus.label}</span>
                      {quality ? (
                        <span className={`status-badge confidence-${confidenceTone(quality.confidence)}`}>
                          {Math.round(quality.confidence * 100)}%
                        </span>
                      ) : null}
                      {!isEditing ? (
                        <button
                          type="button"
                          className="inline-edit-btn"
                          onClick={() => startInlineEdit(question.id, state?.answer)}
                          aria-label={`Edit answer for ${question.prompt}`}
                        >
                          ✎
                        </button>
                      ) : null}
                    </div>
                  </div>
                );
              })}
            </div>
          </article>
        ))}
      </section>

      {pendingCount > 0 ? (
        <section className="card review-queue-inline">
          <div className="inline-heading">
            <h3>Review Queue</h3>
            <div className="queue-toolbar">
              <button type="button" className="ghost-btn" onClick={() => void refreshQueues()}>
                Refresh
              </button>
              <button
                type="button"
                className="ghost-btn"
                disabled={busyDecisionId === "bulk"}
                onClick={() => void handleBulkDecision("accept")}
              >
                Accept all pending
              </button>
              <button
                type="button"
                className="ghost-btn"
                disabled={busyDecisionId === "bulk"}
                onClick={() => void handleBulkDecision("reject")}
              >
                Reject all pending
              </button>
            </div>
          </div>
          <p className="muted-line">Pending reviews: {pendingCount}</p>
          <div className="inline-review-list">
            {queue
              .filter((item) => item.status === "pending")
              .map((item) => (
                <article key={item.id} className="inline-review-item">
                  <h4>{item.questionPrompt}</h4>
                  <p className="inline-old">Current: {item.oldValue ?? "—"}</p>
                  <p className="inline-new">Proposed: {item.proposedValue}</p>
                  <p>Confidence: {Math.round(item.confidence * 100)}%</p>
                  <p>{item.reasoning}</p>
                  {item.evidenceSnippets.length > 0 ? (
                    <ul>
                      {item.evidenceSnippets.map((snippet) => (
                        <li key={`${item.id}-${snippet}`}>{snippet}</li>
                      ))}
                    </ul>
                  ) : null}
                  {item.status === "pending" ? (
                    <>
                      <textarea
                        value={editedAnswers[item.id] ?? item.proposedValue}
                        onChange={(event) =>
                          setEditedAnswers((current) => ({
                            ...current,
                            [item.id]: event.target.value
                          }))
                        }
                      />
                      <div className="actions">
                        <button
                          type="button"
                          disabled={busyDecisionId === item.id}
                          onClick={() => void handleDecision(item.id, "accept")}
                        >
                          Accept
                        </button>
                        <button
                          type="button"
                          disabled={busyDecisionId === item.id}
                          onClick={() => void handleDecision(item.id, "edit_then_accept")}
                        >
                          Edit + Accept
                        </button>
                        <button
                          type="button"
                          disabled={busyDecisionId === item.id}
                          onClick={() => void handleDecision(item.id, "reject")}
                        >
                          Reject
                        </button>
                      </div>
                    </>
                  ) : (
                    <p className="muted-line">Status: {item.status}</p>
                  )}
                </article>
              ))}
          </div>
        </section>
      ) : null}

      <section className="card">
        <h3>Ingestion history</h3>
        {runs.length === 0 ? (
          <p>No ingestion runs yet.</p>
        ) : (
          <ul className="ingestion-history">
            {runs.map((run) => (
              <li key={run.id}>
                {new Date(run.createdAt).toLocaleString()} · {run.sourceType} · {run.status} · {run.deltaCount} deltas
              </li>
            ))}
          </ul>
        )}
      </section>

      {error ? <p className="error-banner">{error}</p> : null}

      <button
        type="button"
        className="fab-compose"
        onClick={() => {
          setComposerOpen(true);
          void refreshQueues();
        }}
        aria-label="Add deal context"
      >
        <span className="fab-plus" aria-hidden="true">
          +
        </span>
        <span>Add deal context</span>
      </button>

      {composerOpen ? (
        <div className="composer-backdrop" onClick={() => setComposerOpen(false)}>
          <div className="composer-modal" onClick={(event) => event.stopPropagation()}>
            <form onSubmit={handleSubmit}>
              <div className="inline-heading">
                <h3>Add deal context</h3>
                <button type="button" className="ghost-btn" onClick={() => setComposerOpen(false)}>
                  Close
                </button>
              </div>
              <label>
                Source
                <select value={sourceType} onChange={(event) => setSourceType(event.target.value)}>
                  {SOURCE_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Paste context
                <textarea
                  value={rawContext}
                  onChange={(event) => setRawContext(event.target.value)}
                  onKeyDown={handleComposerKeyDown}
                  placeholder="Paste call notes, email thread summary, Slack updates, and decision context…"
                  rows={12}
                  required
                />
              </label>
              <div className="inline-heading">
                <small>{rawContext.length} chars · Cmd/Ctrl+Enter submits</small>
                <button type="submit" disabled={submitting}>
                  {submitting ? "Processing…" : "Run TAS extraction"}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </div>
  );
}

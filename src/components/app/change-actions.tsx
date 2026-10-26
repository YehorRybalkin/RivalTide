"use client";
import { Bookmark, BookmarkCheck, Check, RotateCw, ThumbsDown, ThumbsUp, X, CircleSlash } from "lucide-react";
import { SubmitButton } from "@/components/ui/submit-button";
import { ActionForm } from "./action-form";
import { feedbackAction, regenerateInsightAction, reviewChangeAction, saveInsightAction } from "@/app/app/[ws]/actions";

export function ChangeReviewActions({ ws, changeId, reviewStatus, feedback }: { ws: string; changeId: string; reviewStatus: string; feedback: string | null }) {
  const h = { ws, changeId };
  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="flex rounded-lg border border-border bg-surface p-0.5" role="group" aria-label="Feedback">
        <ActionForm action={feedbackAction} hidden={{ ...h, feedback: "relevant" }}>
          <SubmitButton variant="ghost" size="sm" aria-pressed={feedback === "relevant"} className={feedback === "relevant" ? "bg-primary-soft text-primary-soft-foreground" : ""}><ThumbsUp /> Relevant</SubmitButton>
        </ActionForm>
        <ActionForm action={feedbackAction} hidden={{ ...h, feedback: "irrelevant" }}>
          <SubmitButton variant="ghost" size="sm" aria-pressed={feedback === "irrelevant"} title="Not useful — similar content will be ignored on this page"><ThumbsDown /> Irrelevant</SubmitButton>
        </ActionForm>
        <ActionForm action={feedbackAction} hidden={{ ...h, feedback: "incorrect" }}>
          <SubmitButton variant="ghost" size="sm" aria-pressed={feedback === "incorrect"} title="The detection is wrong"><CircleSlash /> Incorrect</SubmitButton>
        </ActionForm>
      </div>
      {reviewStatus === "new" ? (
        <>
          <ActionForm action={reviewChangeAction} hidden={{ ...h, status: "reviewed" }}><SubmitButton variant="secondary" size="sm"><Check /> Mark reviewed</SubmitButton></ActionForm>
          <ActionForm action={reviewChangeAction} hidden={{ ...h, status: "dismissed" }}><SubmitButton variant="ghost" size="sm"><X /> Dismiss</SubmitButton></ActionForm>
        </>
      ) : (
        <ActionForm action={reviewChangeAction} hidden={{ ...h, status: "new" }}><SubmitButton variant="ghost" size="sm">Reopen</SubmitButton></ActionForm>
      )}
    </div>
  );
}

export function SaveInsightToggle({ ws, insightId, saved }: { ws: string; insightId: string; saved: boolean }) {
  return (
    <ActionForm action={saveInsightAction} hidden={{ ws, insightId, saved: String(!saved) }}>
      <SubmitButton variant="secondary" size="sm">{saved ? <><BookmarkCheck /> Saved for reports</> : <><Bookmark /> Save for reports</>}</SubmitButton>
    </ActionForm>
  );
}

export function RegenerateInsight({ ws, changeId, aiConfigured }: { ws: string; changeId: string; aiConfigured: boolean }) {
  return (
    <ActionForm action={regenerateInsightAction} hidden={{ ws, changeId }}>
      <SubmitButton variant="ghost" size="sm" pendingText="Analyzing…"><RotateCw /> {aiConfigured ? "Re-run analysis" : "Refresh summary"}</SubmitButton>
    </ActionForm>
  );
}

import { z } from "zod";

/** What the model is allowed to produce. Observed facts are NOT model output: they come from the verified change record. */
export const AiAnalysisSchema = z.object({
  title: z.string().describe("Short neutral headline (max 90 chars) describing the verified change"),
  importance: z.enum(["low", "medium", "high"]),
  interpretation: z.string().describe("Why this might matter. Hedged language; motivations are never stated as fact."),
  who_affected: z.string().describe("Which customer segments or competitors could be affected"),
  opportunities: z.array(z.string()).describe("Possible opportunities for the user (0-3)"),
  threats: z.array(z.string()).describe("Possible threats for the user (0-3)"),
  suggested_actions: z.array(z.string()).describe("Actions the user could evaluate (1-3), phrased as considerations"),
  uncertainty: z.string().describe("What remains unknown or could not be verified"),
});

export type AiAnalysis = z.infer<typeof AiAnalysisSchema>;

export interface InsightDraft extends AiAnalysis {
  observed_facts: string[];
  generated_by: "ai" | "deterministic";
  provider: string | null;
  model: string | null;
  input_tokens: number;
  output_tokens: number;
  estimated_cost_usd: number;
}

/** Bounded post-validation: trims sizes and removes links the model was not given. */
export function sanitizeAnalysis(a: AiAnalysis, allowedUrls: string[]): AiAnalysis {
  const allowed = new Set(allowedUrls);
  const clean = (s: string, max: number) =>
    s.replace(/https?:\/\/[^\s)]+/g, (u) => (allowed.has(u) ? u : "[link removed]")).trim().slice(0, max);
  const list = (xs: string[], n: number) => xs.map((x) => clean(x, 400)).filter(Boolean).slice(0, n);
  return {
    title: clean(a.title, 120),
    importance: a.importance,
    interpretation: clean(a.interpretation, 1500),
    who_affected: clean(a.who_affected, 600),
    opportunities: list(a.opportunities, 3),
    threats: list(a.threats, 3),
    suggested_actions: list(a.suggested_actions, 3),
    uncertainty: clean(a.uncertainty, 800) || "The reasons behind this change are not known.",
  };
}

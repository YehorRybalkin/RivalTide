import type { ChangeForAnalysis } from "./facts";
import { observedFacts } from "./facts";
import type { InsightDraft } from "./schema";

/** Rule-based insight used when AI is disabled, unavailable, or out of allowance. */
export function deterministicInsight(c: ChangeForAnalysis): InsightDraft {
  const facts = observedFacts(c);
  const base = {
    observed_facts: facts,
    generated_by: "deterministic" as const,
    provider: null,
    model: null,
    input_tokens: 0,
    output_tokens: 0,
    estimated_cost_usd: 0,
    importance: c.severity,
    title: c.summary.slice(0, 120),
    uncertainty: "This is an automated rule-based summary. The reasons behind the change are not known.",
  };
  const increases = c.evidence.priceChanges.filter((p) => p.kind === "amount_changed" && p.after && p.before && p.after.amount > p.before.amount);
  const decreases = c.evidence.priceChanges.filter((p) => p.kind === "amount_changed" && p.after && p.before && p.after.amount < p.before.amount);
  switch (c.category) {
    case "pricing":
      return {
        ...base,
        interpretation: increases.length
          ? `${c.competitorName} lists a higher price than before. Price increases can create room for alternatives positioned on value or affordability.`
          : decreases.length
            ? `${c.competitorName} lists a lower price than before, which may increase price pressure in overlapping segments.`
            : `${c.competitorName} changed how pricing is presented.`,
        who_affected: "Prospects comparing plans in the affected tier, and competitors selling to the same segment.",
        opportunities: increases.length ? ["Messaging that emphasizes your value relative to the new price point."] : [],
        threats: decreases.length ? ["Increased price pressure on comparable plans."] : [],
        suggested_actions: ["Review whether your plans target the same customer segment before considering any pricing response.", "Check the evidence to confirm which plans and billing periods are affected."],
      };
    case "announcement":
      return {
        ...base,
        interpretation: `${c.competitorName} published new content that may signal a launch or update.`,
        who_affected: "Customers evaluating similar capabilities.",
        opportunities: [],
        threats: [],
        suggested_actions: ["Read the announcement and assess overlap with your roadmap.", "Note whether it targets your core customer segment."],
      };
    case "features":
    case "product":
      return {
        ...base,
        interpretation: `${c.competitorName} updated how it describes its product or features. These are the competitor's own claims and have not been independently validated.`,
        who_affected: "Buyers comparing feature sets.",
        opportunities: [],
        threats: [],
        suggested_actions: ["Compare the described capability with your own offering.", "Update your comparison matrix if the capability is relevant."],
      };
    case "positioning":
      return {
        ...base,
        interpretation: `${c.competitorName} changed key messaging. Messaging shifts can indicate a change in target audience or emphasis, but the intent is unknown.`,
        who_affected: "Segments named or implied in the new messaging.",
        opportunities: [],
        threats: [],
        suggested_actions: ["Compare the new messaging with your own positioning.", "Watch for related changes on pricing or product pages."],
      };
    case "unclassified":
      return {
        ...base,
        interpretation: "RivalTide could not classify this change with enough confidence.",
        who_affected: "Unknown until reviewed.",
        opportunities: [],
        threats: [],
        suggested_actions: ["Review the before/after evidence and mark the change as relevant or irrelevant."],
      };
    default:
      return {
        ...base,
        interpretation: `General content on ${c.competitorName}'s site changed. This is usually low impact.`,
        who_affected: "Likely limited.",
        opportunities: [],
        threats: [],
        suggested_actions: ["Skim the evidence; mark as irrelevant to reduce similar alerts in future."],
      };
  }
}

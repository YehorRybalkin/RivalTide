import "server-only";
import { ZodError } from "zod";
import { EntitlementError } from "./billing/entitlements";
import { AppError } from "./services/errors";

export interface ActionState {
  ok?: boolean;
  error?: string;
  message?: string;
  fieldErrors?: Record<string, string>;
  data?: unknown;
}

export const initialState: ActionState = {};

/** Converts thrown errors into a safe, user-facing ActionState. Unknown errors are logged, not leaked. */
export function toActionError(e: unknown): ActionState {
  if (e && typeof e === "object" && "digest" in e && String((e as { digest: unknown }).digest).startsWith("NEXT_REDIRECT")) throw e;
  if (e instanceof ZodError) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of e.issues) {
      const key = issue.path.join(".") || "form";
      fieldErrors[key] ??= issue.message;
    }
    return { error: Object.values(fieldErrors)[0] ?? "Please check the form.", fieldErrors };
  }
  if (e instanceof AppError || e instanceof EntitlementError) return { error: e.message };
  console.error("[action] unexpected error", e);
  return { error: "Something went wrong. Please try again." };
}

export async function safeAction(fn: () => Promise<ActionState | void>): Promise<ActionState> {
  try {
    return (await fn()) ?? { ok: true };
  } catch (e) {
    return toActionError(e);
  }
}

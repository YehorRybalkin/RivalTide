"use client";
import { useActionState, useEffect, useRef } from "react";
import { toast } from "sonner";
import type { ActionState } from "@/server/actions";

type Action = (prev: ActionState, form: FormData) => Promise<ActionState>;

/**
 * Small wrapper for server actions: adds hidden fields, shows toasts for
 * results, and exposes pending state to SubmitButton via useFormStatus.
 */
export function ActionForm({ action, hidden, children, className, onSuccess, confirm, resetOnSuccess }: {
  action: Action;
  hidden?: Record<string, string>;
  children: React.ReactNode;
  className?: string;
  onSuccess?: (state: ActionState) => void;
  confirm?: string;
  resetOnSuccess?: boolean;
}) {
  const [state, formAction] = useActionState(action, {});
  const ref = useRef<HTMLFormElement>(null);
  const last = useRef<ActionState | null>(null);
  useEffect(() => {
    if (state === last.current || (!state.error && !state.message && !state.ok)) return;
    last.current = state;
    if (state.error) toast.error(state.error);
    else {
      if (state.message) toast.success(state.message);
      if (resetOnSuccess) ref.current?.reset();
      onSuccess?.(state);
    }
  }, [state, onSuccess, resetOnSuccess]);
  return (
    <form
      ref={ref}
      action={formAction}
      className={className}
      onSubmit={confirm ? (e) => { if (!window.confirm(confirm)) e.preventDefault(); } : undefined}
    >
      {Object.entries(hidden ?? {}).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
      {children}
    </form>
  );
}

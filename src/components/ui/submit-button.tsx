"use client";
import { Loader2 } from "lucide-react";
import { useFormStatus } from "react-dom";
import type * as React from "react";
import { Button } from "./button";

export function SubmitButton({ children, pendingText, ...props }: React.ComponentProps<typeof Button> & { pendingText?: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending || props.disabled} aria-busy={pending} {...props}>
      {pending ? <Loader2 className="animate-spin" aria-hidden /> : null}
      {pending && pendingText ? pendingText : children}
    </Button>
  );
}

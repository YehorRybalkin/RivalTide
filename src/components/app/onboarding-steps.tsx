import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

const STEPS = ["Create organization", "Create workspace", "Add a competitor", "Choose pages", "Run baseline check", "Monitoring status"];

export function OnboardingSteps({ current }: { current: number }) {
  return (
    <ol className="space-y-1" aria-label="Setup progress">
      {STEPS.map((s, i) => {
        const n = i + 1;
        const done = n < current;
        const active = n === current || (current === 1 && n === 2);
        return (
          <li key={s} className={cn("flex items-center gap-3 rounded-lg px-2 py-2 text-[13.5px]", active ? "font-medium text-foreground" : "text-muted")} aria-current={active ? "step" : undefined}>
            <span className={cn("flex size-6 items-center justify-center rounded-full border text-[11px] font-semibold", done ? "border-primary bg-primary text-white" : active ? "border-primary text-primary" : "border-border-strong")}>
              {done ? <Check className="size-3.5" /> : n}
            </span>
            {s}
          </li>
        );
      })}
    </ol>
  );
}

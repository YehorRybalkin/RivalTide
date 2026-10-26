"use client";
import { Monitor, Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

export function ThemeToggle({ className }: { className?: string }) {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const options = [
    { value: "light", icon: Sun, label: "Light" },
    { value: "dark", icon: Moon, label: "Dark" },
    { value: "system", icon: Monitor, label: "System" },
  ];
  return (
    <div role="radiogroup" aria-label="Theme" className={cn("inline-flex rounded-lg border border-border bg-surface p-0.5", className)}>
      {options.map((o) => (
        <button key={o.value} type="button" role="radio" aria-checked={mounted && theme === o.value} aria-label={o.label}
          onClick={() => setTheme(o.value)}
          className={cn("rounded-md p-1.5 text-muted transition-colors hover:text-foreground", mounted && theme === o.value && "bg-surface-2 text-foreground")}>
          <o.icon className="size-3.5" />
        </button>
      ))}
    </div>
  );
}

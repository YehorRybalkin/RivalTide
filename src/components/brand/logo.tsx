import { cn } from "@/lib/utils";

export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={cn("size-7", className)} aria-hidden>
      <rect width="32" height="32" rx="8" fill="#10B981" />
      <path d="M6 19.5c3.2 0 3.2-3 6.4-3s3.2 3 6.4 3 3.2-3 6.4-3" stroke="#0B1220" strokeWidth="2.4" fill="none" strokeLinecap="round" />
      <path d="M6 13.5c3.2 0 3.2-3 6.4-3s3.2 3 6.4 3 3.2-3 6.4-3" stroke="#fff" strokeWidth="2.4" fill="none" strokeLinecap="round" opacity=".9" />
    </svg>
  );
}

export function Logo({ className, light }: { className?: string; light?: boolean }) {
  return (
    <span className={cn("inline-flex items-center gap-2 font-semibold tracking-tight", light ? "text-white" : "text-foreground", className)}>
      <LogoMark />
      <span className="text-[15px]">RivalTide</span>
    </span>
  );
}

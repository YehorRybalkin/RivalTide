import type * as React from "react";
import { cn } from "@/lib/utils";

export function Table({ className, ...props }: React.ComponentProps<"table">) {
  return (
    <div className="w-full overflow-x-auto">
      <table className={cn("w-full caption-bottom text-[13px]", className)} {...props} />
    </div>
  );
}
export function THead({ className, ...props }: React.ComponentProps<"thead">) {
  return <thead className={cn("border-b border-border bg-surface-2/60 text-left text-xs font-medium text-muted", className)} {...props} />;
}
export function TH({ className, ...props }: React.ComponentProps<"th">) {
  return <th className={cn("h-9 px-4 font-medium whitespace-nowrap", className)} {...props} />;
}
export function TR({ className, ...props }: React.ComponentProps<"tr">) {
  return <tr className={cn("border-b border-border last:border-0 transition-colors hover:bg-surface-2/50", className)} {...props} />;
}
export function TD({ className, ...props }: React.ComponentProps<"td">) {
  return <td className={cn("px-4 py-3 align-middle", className)} {...props} />;
}

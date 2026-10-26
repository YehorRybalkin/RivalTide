import { Slot } from "radix-ui";
import { cva, type VariantProps } from "class-variance-authority";
import type * as React from "react";
import { cn } from "@/lib/utils";

export const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-lg text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:pointer-events-none disabled:opacity-50 [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        primary: "bg-primary text-primary-foreground hover:bg-primary-hover shadow-sm",
        secondary: "bg-surface text-foreground border border-border hover:bg-surface-2 shadow-sm",
        ghost: "text-foreground hover:bg-surface-2",
        subtle: "bg-surface-2 text-foreground hover:bg-border",
        danger: "bg-danger text-white hover:bg-danger/90 shadow-sm",
        link: "text-accent underline-offset-4 hover:underline px-0 h-auto",
      },
      size: { sm: "h-8 px-3 text-[13px]", md: "h-9 px-4", lg: "h-11 px-6 text-[15px]", icon: "h-9 w-9" },
    },
    defaultVariants: { variant: "primary", size: "md" },
  },
);

export function Button({ className, variant, size, asChild, ...props }: React.ComponentProps<"button"> & VariantProps<typeof buttonVariants> & { asChild?: boolean }) {
  const Comp = asChild ? Slot.Root : "button";
  return <Comp className={cn(buttonVariants({ variant, size }), className)} {...props} />;
}

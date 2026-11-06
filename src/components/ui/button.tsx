import * as React from "react";
import { Slot } from "radix-ui";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  [
    "relative inline-flex shrink-0 select-none items-center justify-center gap-2 whitespace-nowrap rounded-lg font-semibold",
    "transition-[color,background-color,box-shadow,transform] duration-150 ease-(--ease-out-soft) outline-none",
    "focus-visible:ring-[3px] focus-visible:ring-ring/45 focus-visible:ring-offset-2 focus-visible:ring-offset-background",
    "active:translate-y-px disabled:pointer-events-none disabled:opacity-50",
    "[&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-[1.15em]",
  ],
  {
    variants: {
      variant: {
        // Solid ink with a subtle "pressed key" bottom edge.
        default: "bg-primary text-primary-foreground shadow-(--shadow-press) hover:bg-primary/92",
        highlight: "bg-highlight text-highlight-foreground shadow-(--shadow-press) hover:brightness-[1.03]",
        destructive:
          "bg-destructive text-destructive-foreground shadow-(--shadow-press) hover:bg-destructive/92",
        outline: "border border-input bg-card text-foreground shadow-(--shadow-soft) hover:bg-sunken",
        secondary: "bg-primary-soft text-primary-soft-foreground hover:bg-primary-soft/80",
        ghost: "text-foreground hover:bg-sunken",
        link: "h-auto px-0 text-primary underline-offset-4 hover:underline",
      },
      size: {
        default: "h-11 px-4 text-sm", // 44px touch target
        sm: "h-9 rounded-md px-3 text-sm",
        lg: "h-14 rounded-xl px-6 text-base",
        icon: "size-11",
      },
    },
    defaultVariants: { variant: "default", size: "default" },
  },
);

export interface ButtonProps extends React.ComponentProps<"button">, VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

function Button({ className, variant, size, asChild = false, ...props }: ButtonProps) {
  const Comp = asChild ? Slot.Root : "button";
  return <Comp data-slot="button" className={cn(buttonVariants({ variant, size, className }))} {...props} />;
}

export { Button, buttonVariants };

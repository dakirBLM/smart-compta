"use client";

import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";
import * as React from "react";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 rounded-xl text-sm font-semibold transition-all duration-200 disabled:opacity-50 disabled:pointer-events-none focus:outline-none focus:ring-2 focus:ring-offset-1 active:scale-[0.98]",
  {
    variants: {
      variant: {
        primary:
          "bg-lime text-brand hover:bg-lime-hover shadow-sm hover:shadow-glow-sm focus:ring-lime",
        brand:
          "bg-brand text-white hover:bg-brand-dark focus:ring-brand shadow-sm hover:shadow-brand-glow/20",
        success:
          "bg-emerald-600 text-white hover:bg-emerald-700 focus:ring-emerald-500 shadow-sm",
        danger:
          "bg-rose-600 text-white hover:bg-rose-700 focus:ring-rose-500 shadow-sm",
        warning:
          "bg-amber-500 text-white hover:bg-amber-600 focus:ring-amber-500 shadow-sm",
        outline:
          "border border-gray-200 bg-white text-brand hover:bg-gray-50 hover:border-gray-300 focus:ring-brand/20",
        ghost:
          "text-brand hover:bg-lime-light/60 hover:text-brand focus:ring-lime",
        soft:
          "bg-lime-light text-brand hover:bg-lime/40 focus:ring-lime",
      },
      size: {
        xs: "h-7 px-2.5 text-xs rounded-lg",
        sm: "h-8 px-3 text-xs rounded-lg",
        md: "h-10 px-4 py-2",
        lg: "h-12 px-6 text-base rounded-2xl",
        xl: "h-14 px-8 text-lg rounded-2xl",
      },
    },
    defaultVariants: { variant: "primary", size: "md" },
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {}

export function Button({ className, variant, size, ...props }: ButtonProps) {
  return (
    <button className={cn(buttonVariants({ variant, size }), className)} {...props} />
  );
}

export const Input = React.forwardRef<
  HTMLInputElement,
  React.InputHTMLAttributes<HTMLInputElement> & { locked?: boolean }
>(({ className, locked, ...props }, ref) => (
  <input
    ref={ref}
    className={cn(
      "h-10 w-full rounded-xl border px-3.5 text-sm transition-all outline-none focus:border-brand focus:ring-2 focus:ring-lime/40",
      locked
        ? "border-danger bg-red-50 text-danger cursor-not-allowed"
        : "border-gray-200 bg-white hover:border-gray-300",
      className
    )}
    {...props}
  />
));
Input.displayName = "Input";

export function Label({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <label className={cn("mb-1.5 block text-xs font-semibold uppercase tracking-wider text-gray-600", className)}>
      {children}
    </label>
  );
}

export function Card({
  children,
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "rounded-2xl border border-gray-100/80 bg-white p-5 shadow-[0_4px_20px_-4px_rgba(31,61,53,0.06)] transition-all",
        className
      )}
      {...props}
    >
      {children}
    </div>
  );
}

export function Spinner({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "h-5 w-5 animate-spin rounded-full border-2 border-current border-t-transparent",
        className
      )}
    />
  );
}


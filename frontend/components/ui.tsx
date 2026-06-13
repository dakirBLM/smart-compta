"use client";

import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";
import * as React from "react";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-50 disabled:pointer-events-none focus:outline-none focus:ring-2 focus:ring-offset-1",
  {
    variants: {
      variant: {
        primary: "bg-brand text-white hover:bg-brand-dark focus:ring-brand",
        success: "bg-success text-white hover:bg-green-600 focus:ring-success",
        danger: "bg-danger text-white hover:bg-red-600 focus:ring-danger",
        warning: "bg-warning text-white hover:bg-amber-600 focus:ring-warning",
        outline: "border border-brand text-brand hover:bg-brand/5",
        ghost: "text-brand hover:bg-brand/10",
      },
      size: {
        sm: "h-8 px-3",
        md: "h-10 px-4",
        lg: "h-12 px-6 text-base",
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
      "h-10 w-full rounded-lg border px-3 text-sm outline-none focus:ring-2 focus:ring-brand/40",
      locked
        ? "border-danger bg-red-50 text-danger cursor-not-allowed"
        : "border-gray-300",
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
    <label className={cn("mb-1 block text-sm font-medium text-gray-700", className)}>
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
      className={cn("rounded-xl border border-gray-200 bg-white p-5 shadow-sm", className)}
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

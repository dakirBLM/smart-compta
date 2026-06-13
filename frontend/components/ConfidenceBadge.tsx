"use client";

import { AlertTriangle, CheckCircle2, XCircle } from "lucide-react";
import { cn } from "@/lib/utils";

export type ConfidenceLevel = "green" | "yellow" | "red";

export function confidenceLevel(score: number): ConfidenceLevel {
  if (score >= 90) return "green";
  if (score >= 60) return "yellow";
  return "red";
}

export function ConfidenceBadge({ score }: { score: number }) {
  const level = confidenceLevel(score);
  const map = {
    green: { cls: "bg-green-100 text-success", Icon: CheckCircle2, label: "Fiable" },
    yellow: { cls: "bg-amber-100 text-warning", Icon: AlertTriangle, label: "À vérifier" },
    red: { cls: "bg-red-100 text-danger", Icon: XCircle, label: "Révision requise" },
  }[level];
  const { Icon } = map;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-sm font-semibold",
        map.cls
      )}
    >
      <Icon size={16} />
      {score}% · {map.label}
    </span>
  );
}

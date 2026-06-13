"use client";

import { CheckCircle2, Clock, XCircle } from "lucide-react";
import { useI18n } from "@/lib/i18n-context";
import { Statut } from "@/lib/types";
import { cn } from "@/lib/utils";

export function StatusBadge({ statut }: { statut: Statut }) {
  const { t } = useI18n();
  const map = {
    valide: { cls: "bg-green-100 text-success", Icon: CheckCircle2, label: t("valide") },
    en_cours: { cls: "bg-amber-100 text-warning", Icon: Clock, label: t("enCours") },
    rejete: { cls: "bg-red-100 text-danger", Icon: XCircle, label: t("rejete") },
  }[statut];
  const { Icon } = map;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold",
        map.cls
      )}
    >
      <Icon size={14} />
      {map.label}
    </span>
  );
}

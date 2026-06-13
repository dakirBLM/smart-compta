"use client";

import { Languages } from "lucide-react";
import { useI18n } from "@/lib/i18n-context";
import { cn } from "@/lib/utils";

export function LanguageToggle({ className }: { className?: string }) {
  const { lang, toggle } = useI18n();
  return (
    <button
      onClick={toggle}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border border-current px-3 py-1.5 text-sm font-medium",
        className
      )}
      aria-label="Changer de langue"
    >
      <Languages size={16} />
      {lang === "fr" ? "FR" : "AR"} → {lang === "fr" ? "AR" : "FR"}
    </button>
  );
}

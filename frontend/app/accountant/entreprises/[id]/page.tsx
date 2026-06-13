"use client";

import { Download, Pencil, ScanLine } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { AppShell } from "@/components/AppShell";
import { Card } from "@/components/ui";
import { useI18n } from "@/lib/i18n-context";
import { useEntreprise } from "@/lib/useEntreprise";
import { cn } from "@/lib/utils";

export default function EntrepriseHome() {
  const { t } = useI18n();
  const router = useRouter();
  const { id, entreprise, annee } = useEntreprise();
  const [mode, setMode] = useState<"auto" | "manuel" | "scanner" | null>(null);

  const base = `/accountant/entreprises/${id}`;
  const qs = annee ? `?annee=${annee}` : "";

  const options = [
    {
      key: "auto" as const,
      title: t("auto"),
      action: t("importer"),
      icon: <Download size={28} />,
      go: () => router.push(`${base}/journaux/achat${qs}`),
    },
    {
      key: "manuel" as const,
      title: t("manuel"),
      action: t("saisir"),
      icon: <Pencil size={28} />,
      go: () => router.push(`${base}/journaux/achat${qs}`),
    },
    {
      key: "scanner" as const,
      title: t("scanner"),
      action: t("scanner"),
      icon: <ScanLine size={28} />,
      go: () => router.push(`${base}/scanner${qs}`),
    },
  ];

  return (
    <AppShell
      title={entreprise?.nom}
      entrepriseId={id}
      entrepriseName={entreprise?.nom}
      annee={annee}
    >
      <div className="mx-auto max-w-3xl">
        <h2 className="mb-6 text-center text-xl font-semibold text-brand">
          {t("pourLaComptabilite")} ▼
        </h2>
        <div className="grid gap-4 sm:grid-cols-3">
          {options.map((o) => (
            <Card
              key={o.key}
              className={cn(
                "cursor-pointer text-center transition-all hover:shadow-md",
                mode === o.key && "ring-2 ring-success"
              )}
              onMouseEnter={() => setMode(o.key)}
            >
              <button onClick={o.go} className="flex w-full flex-col items-center gap-3 py-4">
                <span
                  className={cn(
                    "flex h-16 w-16 items-center justify-center rounded-full",
                    o.key === "auto"
                      ? "bg-green-100 text-success"
                      : "bg-brand/10 text-brand"
                  )}
                >
                  {o.icon}
                </span>
                <span className="font-semibold text-brand">{o.title}</span>
                <span
                  className={cn(
                    "rounded-full px-4 py-1 text-sm",
                    o.key === "auto"
                      ? "bg-success text-white"
                      : "bg-brand text-white"
                  )}
                >
                  → {o.action}
                </span>
              </button>
            </Card>
          ))}
        </div>
      </div>
    </AppShell>
  );
}

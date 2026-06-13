"use client";

import { AppShell } from "@/components/AppShell";
import { ScannerFlow } from "@/components/ScannerFlow";
import { useI18n } from "@/lib/i18n-context";
import { useEntreprise } from "@/lib/useEntreprise";

export default function ScannerPage() {
  const { t } = useI18n();
  const { id, entreprise, annee } = useEntreprise();
  return (
    <AppShell
      title={t("scanner")}
      entrepriseId={id}
      entrepriseName={entreprise?.nom}
      annee={annee}
    >
      {id && <ScannerFlow entrepriseId={id} />}
    </AppShell>
  );
}

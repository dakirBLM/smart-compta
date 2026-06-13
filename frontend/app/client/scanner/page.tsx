"use client";

import { ClientScanner } from "@/components/ClientScanner";
import { ClientShell } from "@/components/ClientShell";
import { useI18n } from "@/lib/i18n-context";

export default function ClientScannerPage() {
  const { t } = useI18n();
  return (
    <ClientShell>
      <h2 className="mb-4 text-lg font-bold text-brand">{t("prendrePhoto")}</h2>
      <ClientScanner />
    </ClientShell>
  );
}

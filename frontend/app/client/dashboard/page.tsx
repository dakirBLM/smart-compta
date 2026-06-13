"use client";

import { Camera } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { ClientShell } from "@/components/ClientShell";
import { InvoiceCard } from "@/components/InvoiceCard";
import { Button } from "@/components/ui";
import { api } from "@/lib/api";
import { useI18n } from "@/lib/i18n-context";
import { Facture } from "@/lib/types";

export default function ClientDashboard() {
  const { t } = useI18n();
  const [factures, setFactures] = useState<Facture[]>([]);

  useEffect(() => {
    api.get<Facture[]>("/api/factures/").then(setFactures).catch(() => {});
  }, []);

  const total = factures.length || 1;
  const validated = factures.filter((f) => f.statut === "valide").length;
  const pct = Math.round((validated / total) * 100);
  const barColor =
    pct < 40 ? "bg-danger" : pct < 80 ? "bg-warning" : "bg-success";

  return (
    <ClientShell>
    
      

      {/* Capture button */}
      <Link href="/client/scanner">
        <Button size="lg" className="mb-6 w-full">
          <Camera size={20} /> {t("prendrePhoto")}
        </Button>
      </Link>

      {/* Rules in red */}
      <ul className="mb-6 list-inside list-disc rounded-xl bg-red-50 p-4 text-sm text-danger">
        <li>{t("reglePhotoClaire")}</li>
        <li>{t("reglePhotoSignee")}</li>
      </ul>

      {/* Invoice cards */}
      <div className="grid gap-3 sm:grid-cols-2">
        {factures.map((f) => (
          <InvoiceCard key={f.id} facture={f} />
        ))}
        {factures.length === 0 && (
          <p className="text-gray-400">{t("aucuneDonnee")}</p>
        )}
      </div>
    </ClientShell>
  );
}

"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { useEntreprise } from "@/lib/useEntreprise";

/** Redirige vers Mes factures (scanner + import fusionné). */
export default function ScannerPage() {
  const router = useRouter();
  const { id, annee } = useEntreprise();
  const qs = annee ? `?annee=${annee}` : "";

  useEffect(() => {
    if (id) router.replace(`/accountant/entreprises/${id}/factures${qs}`);
  }, [id, annee, qs, router]);

  return null;
}

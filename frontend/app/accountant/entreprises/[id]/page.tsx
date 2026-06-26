"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { useEntreprise } from "@/lib/useEntreprise";

/** Redirige vers le tableau de bord de l'entreprise. */
export default function EntrepriseHome() {
  const router = useRouter();
  const { id, annee } = useEntreprise();
  const qs = annee ? `?annee=${annee}` : "";

  useEffect(() => {
    if (id) router.replace(`/accountant/entreprises/${id}/dashboard${qs}`);
  }, [id, annee, qs, router]);

  return null;
}

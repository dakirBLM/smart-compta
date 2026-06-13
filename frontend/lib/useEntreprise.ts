"use client";

import { useParams, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { api } from "./api";
import { Entreprise } from "./types";

/** Loads the entreprise from the [id] route param and resolves the active
 * fiscal year from the ?annee query string (falling back to the active one). */
export function useEntreprise() {
  const params = useParams();
  const searchParams = useSearchParams();
  const id = Number(params.id);
  const [entreprise, setEntreprise] = useState<Entreprise | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;
    api
      .get<Entreprise>(`/api/entreprises/${id}/`)
      .then(setEntreprise)
      .finally(() => setLoading(false));
  }, [id]);

  const annee = (() => {
    const q = searchParams.get("annee");
    if (q) return Number(q);
    if (!entreprise) return undefined;
    return (
      entreprise.exercices.find((x) => x.is_active)?.annee ??
      entreprise.exercices[0]?.annee
    );
  })();

  return { id, entreprise, annee, loading };
}

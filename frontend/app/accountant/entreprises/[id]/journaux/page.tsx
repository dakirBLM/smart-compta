"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect } from "react";
import { useParams } from "next/navigation";

export default function JournauxIndex() {
  const params = useParams();
  const search = useSearchParams();
  const router = useRouter();
  useEffect(() => {
    const qs = search.get("annee") ? `?annee=${search.get("annee")}` : "";
    router.replace(`/accountant/entreprises/${params.id}/journaux/achat${qs}`);
  }, [params.id, router, search]);
  return null;
}

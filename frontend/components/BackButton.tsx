"use client";

import { ArrowLeft } from "lucide-react";
import { useRouter } from "next/navigation";

export function BackButton({ className }: { className?: string }) {
  const router = useRouter();
  return (
    <button
      onClick={() => router.back()}
      aria-label="Retour"
      title="Retour"
      className={
        "inline-flex items-center gap-1 rounded-lg px-2 py-1.5 text-sm text-brand hover:bg-black/5 " +
        (className ?? "")
      }
    >
      <ArrowLeft size={18} />
      <span className="hidden sm:inline">Retour</span>
    </button>
  );
}

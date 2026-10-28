"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

export default function ClientScannerPage() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/client/factures");
  }, [router]);
  return null;
}

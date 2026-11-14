"use client";

import { useParams } from "next/navigation";
import { InvoicePrintDocument } from "@/components/InvoicePrintDocument";

export default function PrintInvoicePage() {
  const params = useParams<{ id: string }>();
  return <InvoicePrintDocument invoiceId={params.id} />;
}

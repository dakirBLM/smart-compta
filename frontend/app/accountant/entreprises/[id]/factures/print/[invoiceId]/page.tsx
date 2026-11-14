"use client";

import { useParams } from "next/navigation";
import { InvoicePrintDocument } from "@/components/InvoicePrintDocument";

export default function AccountantPrintInvoicePage() {
  const params = useParams<{ invoiceId: string }>();
  return <InvoicePrintDocument invoiceId={params.invoiceId} />;
}

"use client";

import { FileText } from "lucide-react";
import { useState } from "react";
import { isPdfInvoiceUrl, resolveInvoiceFileUrl } from "@/lib/api";

export function InvoiceDocumentPreview({
  value,
  alt,
  className,
  imageClassName,
  placeholderClassName,
}: {
  value?: string | null;
  alt: string;
  className: string;
  imageClassName: string;
  placeholderClassName: string;
}) {
  const url = resolveInvoiceFileUrl(value);
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const canShowImage = !!url && !isPdfInvoiceUrl(url) && failedUrl !== url;

  return (
    <div className={className}>
      {canShowImage ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={url}
          alt={alt}
          className={imageClassName}
          onError={() => setFailedUrl(url)}
        />
      ) : (
        <div className={placeholderClassName} aria-label={alt}>
          <FileText size={22} />
        </div>
      )}
    </div>
  );
}

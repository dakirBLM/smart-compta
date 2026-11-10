"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui";
import { api, isPdfInvoiceUrl, resolveInvoiceFileUrl } from "@/lib/api";
import { useI18n } from "@/lib/i18n-context";
import { Facture } from "@/lib/types";

type PrintState = "loading" | "image" | "pdf" | "error";
type PrintError = "missing" | "invalid" | "preview" | "unavailable";

export function InvoicePrintDocument({ invoiceId }: { invoiceId: string }) {
  const { t } = useI18n();
  const [state, setState] = useState<PrintState>("loading");
  const [documentUrl, setDocumentUrl] = useState<string | null>(null);
  const [pdfViewerUrl, setPdfViewerUrl] = useState<string | null>(null);
  const [imageLoaded, setImageLoaded] = useState(false);
  const [imageAttempt, setImageAttempt] = useState(0);
  const [error, setError] = useState<PrintError>("unavailable");
  const autoPrinted = useRef(false);

  useEffect(() => {
    document.body.classList.add("invoice-print-mode");
    return () => document.body.classList.remove("invoice-print-mode");
  }, []);

  useEffect(() => {
    return () => {
      if (pdfViewerUrl) URL.revokeObjectURL(pdfViewerUrl);
    };
  }, [pdfViewerUrl]);

  useEffect(() => {
    let active = true;

    if (!/^\d+$/.test(invoiceId)) {
      setError("invalid");
      setState("error");
      return () => {
        active = false;
      };
    }

    api.get<Facture>(`/api/factures/${invoiceId}/`)
      .then((facture) => {
        if (!active) return;
        const url = resolveInvoiceFileUrl(facture.image_url);
        if (!url) {
          setError("missing");
          setState("error");
          return;
        }

        setDocumentUrl(url);
        setState(isPdfInvoiceUrl(url) ? "pdf" : "image");
      })
      .catch(() => {
        if (!active) return;
        setError("unavailable");
        setState("error");
      });

    return () => {
      active = false;
    };
  }, [invoiceId]);

  useEffect(() => {
    if (state !== "image" || !imageLoaded) return;
    if (autoPrinted.current) return;
    const timer = window.setTimeout(() => {
      autoPrinted.current = true;
      window.print();
    }, 200);
    return () => window.clearTimeout(timer);
  }, [imageLoaded, state]);

  function printImage() {
    if (imageLoaded) window.print();
  }

  function retryImage() {
    autoPrinted.current = false;
    setImageLoaded(false);
    setImageAttempt((attempt) => attempt + 1);
    setError("unavailable");
    setState("image");
  }

  async function handleImageError() {
    setImageLoaded(false);
    if (documentUrl) {
      try {
        const response = await fetch(documentUrl);
        if (response.ok) {
          const blob = await response.blob();
          const signature = await blob.slice(0, 5).text();
          if (
            blob.type.toLowerCase().includes("application/pdf") ||
            signature === "%PDF-"
          ) {
            const viewerUrl = URL.createObjectURL(
              new Blob([blob], { type: "application/pdf" })
            );
            setPdfViewerUrl(viewerUrl);
            setState("pdf");
            return;
          }
        }
      } catch {
        // Cross-origin storage may not allow fetch; the direct document link remains available.
      }
    }

    setError("preview");
    setState("error");
  }

  const errorMessage = {
    missing: t("documentFactureIndisponible"),
    invalid: t("documentFactureInvalide"),
    preview: t("apercuFactureIndisponible"),
    unavailable: t("documentFactureChargementEchec"),
  }[error];

  return (
    <main className="invoice-print-page min-h-screen bg-white p-4 text-center text-[#214f40]">
      {state === "loading" && <p role="status">{t("chargementDocumentFacture")}</p>}
      {state === "pdf" && documentUrl && (
        <section className="mx-auto max-w-lg space-y-4">
          <p role="status">{t("ouverturePdfFacture")}</p>
          <a
            href={pdfViewerUrl ?? documentUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center justify-center rounded-xl bg-[#1f3d35] px-4 py-2 text-sm font-semibold text-white hover:bg-[#142823]"
          >
            {t("ouvrirDocumentNavigateur")}
          </a>
        </section>
      )}
      {state === "image" && (
        <section className="invoice-print-document">
          {!imageLoaded && <p className="print:hidden" role="status">{t("chargementDocumentFacture")}</p>}
          <img
            key={imageAttempt}
            src={documentUrl ?? ""}
            alt={t("documentFactureAlt")}
            onLoad={() => setImageLoaded(true)}
            onError={() => void handleImageError()}
            className="invoice-print-image mx-auto max-h-[calc(100vh-7rem)] max-w-full object-contain"
          />
          <div className="print:hidden">
            <Button type="button" onClick={printImage} disabled={!imageLoaded}>
              {t("imprimerFacture")}
            </Button>
          </div>
        </section>
      )}
      {state === "error" && (
        <section className="mx-auto max-w-lg space-y-3">
          <p className="text-sm text-red-700" role="alert">{errorMessage}</p>
          {documentUrl && (
            <div className="flex flex-wrap justify-center gap-3">
              <Button type="button" variant="outline" onClick={retryImage}>
                {t("reessayerChargement")}
              </Button>
              <a
                href={documentUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center justify-center rounded-xl bg-[#1f3d35] px-4 py-2 text-sm font-semibold text-white hover:bg-[#142823]"
              >
                {t("ouvrirDocumentNavigateur")}
              </a>
            </div>
          )}
        </section>
      )}
    </main>
  );
}

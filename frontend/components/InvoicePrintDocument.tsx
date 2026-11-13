"use client";

import { useEffect, useRef, useState } from "react";
import { Printer, X } from "lucide-react";
import { Button } from "@/components/ui";
import { api, isPdfInvoiceUrl, resolveInvoiceFileUrl } from "@/lib/api";
import { useI18n } from "@/lib/i18n-context";
import { Facture } from "@/lib/types";

type PrintState = "loading" | "image" | "pdf" | "error";
type PrintError = "missing" | "invalid" | "preview" | "unavailable";

export function InvoicePrintDocument({
  invoiceId,
  onClose,
}: {
  invoiceId: string;
  onClose?: () => void;
}) {
  const { t } = useI18n();
  const [state, setState] = useState<PrintState>("loading");
  const [documentUrl, setDocumentUrl] = useState<string | null>(null);
  const [pdfViewerUrl, setPdfViewerUrl] = useState<string | null>(null);
  const [imageLoaded, setImageLoaded] = useState(false);
  const [imageAttempt, setImageAttempt] = useState(0);
  const [pdfLoaded, setPdfLoaded] = useState(false);
  const [pdfAttempt, setPdfAttempt] = useState(0);
  const [verifiedPdfSource, setVerifiedPdfSource] = useState<string | null>(null);
  const [printFailed, setPrintFailed] = useState(false);
  const [error, setError] = useState<PrintError>("unavailable");
  const autoPrinted = useRef(false);
  const pdfFrame = useRef<HTMLIFrameElement>(null);
  const isModal = Boolean(onClose);
  const pdfSource = pdfViewerUrl ?? `/api/factures/${invoiceId}/document`;

  useEffect(() => {
    document.body.classList.add("invoice-print-mode");
    return () => document.body.classList.remove("invoice-print-mode");
  }, []);

  useEffect(() => {
    if (!onClose) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

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
    if (!isModal || state !== "pdf" || !documentUrl) return;

    if (pdfViewerUrl) {
      setVerifiedPdfSource(pdfSource);
      return;
    }

    let active = true;
    fetch(pdfSource, {
      headers: { Range: "bytes=0-0" },
      cache: "no-store",
    })
      .then(async (response) => {
        const isPdf = response.headers
          .get("content-type")
          ?.toLowerCase()
          .includes("application/pdf");
        await response.body?.cancel();
        if (!response.ok || !isPdf) {
          throw new Error("Invoice PDF preview is unavailable.");
        }
        if (active) setVerifiedPdfSource(pdfSource);
      })
      .catch(() => {
        if (!active) return;
        setError("preview");
        setState("error");
      });

    return () => {
      active = false;
    };
  }, [documentUrl, isModal, pdfSource, pdfViewerUrl, state]);

  useEffect(() => {
    if (isModal || state !== "image" || !imageLoaded) return;
    if (autoPrinted.current) return;
    const timer = window.setTimeout(() => {
      autoPrinted.current = true;
      window.print();
    }, 200);
    return () => window.clearTimeout(timer);
  }, [imageLoaded, isModal, state]);

  function printImage() {
    if (imageLoaded) window.print();
  }

  function printModalDocument() {
    setPrintFailed(false);
    if (state === "image" && imageLoaded) {
      window.print();
      return;
    }

    if (state === "pdf" && pdfLoaded) {
      try {
        const printWindow = pdfFrame.current?.contentWindow;
        if (!printWindow) {
          setPrintFailed(true);
          return;
        }
        printWindow.print();
      } catch {
        setPrintFailed(true);
      }
    }
  }

  function retryImage() {
    autoPrinted.current = false;
    setImageLoaded(false);
    setImageAttempt((attempt) => attempt + 1);
    setError("unavailable");
    setState("image");
  }

  function retryPdf() {
    setPdfLoaded(false);
    setPdfAttempt((attempt) => attempt + 1);
    setState("pdf");
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

  if (isModal) {
    const canPrint =
      (state === "image" && imageLoaded) || (state === "pdf" && pdfLoaded);

    return (
      <div
        className="invoice-print-modal-overlay fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-4"
        onMouseDown={(event) => {
          if (event.target === event.currentTarget) onClose?.();
        }}
      >
        <div
          className="invoice-print-modal-panel flex max-h-[92vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl"
          role="dialog"
          aria-modal="true"
          aria-labelledby="invoice-print-title"
        >
          <header className="print:hidden flex shrink-0 items-center justify-between border-b px-5 py-3">
            <h2 id="invoice-print-title" className="text-base font-semibold text-brand">
              {t("documentFactureAlt")}
            </h2>
            <button
              type="button"
              onClick={onClose}
              aria-label={t("fermer")}
              className="rounded-full p-2 text-gray-500 hover:bg-gray-100 hover:text-brand"
            >
              <X size={20} />
            </button>
          </header>

          <div className="invoice-print-modal-preview min-h-0 flex-1 overflow-auto p-4 text-center text-[#214f40]">
            {state === "loading" && <p role="status">{t("chargementDocumentFacture")}</p>}
            {state === "pdf" && documentUrl && (
              <section className="invoice-print-document">
                {verifiedPdfSource !== pdfSource && (
                  <p className="print:hidden" role="status">
                    {t("chargementDocumentFacture")}
                  </p>
                )}
                {verifiedPdfSource === pdfSource && (
                  <iframe
                    key={`${pdfSource}-${pdfAttempt}`}
                    ref={pdfFrame}
                    src={pdfSource}
                    title={t("documentFactureAlt")}
                    className="invoice-print-pdf mx-auto h-[70vh] w-full border-0"
                    onLoad={() => setPdfLoaded(true)}
                    onError={() => {
                      setPdfLoaded(false);
                      setError("preview");
                      setState("error");
                    }}
                  />
                )}
              </section>
            )}
            {state === "image" && (
              <section className="invoice-print-document">
                {!imageLoaded && (
                  <p className="print:hidden" role="status">
                    {t("chargementDocumentFacture")}
                  </p>
                )}
                <img
                  key={imageAttempt}
                  src={documentUrl ?? ""}
                  alt={t("documentFactureAlt")}
                  onLoad={() => setImageLoaded(true)}
                  onError={() => void handleImageError()}
                  className="invoice-print-image mx-auto max-h-[70vh] max-w-full object-contain"
                />
              </section>
            )}
            {state === "error" && (
              <section className="mx-auto max-w-lg space-y-3">
                <p className="text-sm text-red-700" role="alert">{errorMessage}</p>
                {documentUrl && (
                  <Button
                    type="button"
                    variant="outline"
                    onClick={isPdfInvoiceUrl(documentUrl) ? retryPdf : retryImage}
                  >
                    {t("reessayerChargement")}
                  </Button>
                )}
              </section>
            )}
          </div>

          <footer className="print:hidden flex shrink-0 items-center justify-end gap-2 border-t px-5 py-3">
            {printFailed && (
              <p className="mr-auto text-sm text-red-700" role="alert">
                {t("impressionFactureEchec")}
              </p>
            )}
            <Button type="button" onClick={printModalDocument} disabled={!canPrint}>
              <Printer size={16} />
              {t("imprimerFacture")}
            </Button>
            <Button type="button" variant="outline" onClick={onClose}>
              {t("fermer")}
            </Button>
          </footer>
        </div>
      </div>
    );
  }

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

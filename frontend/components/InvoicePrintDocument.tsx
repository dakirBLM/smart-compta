"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui";
import { api } from "@/lib/api";
import { useI18n } from "@/lib/i18n-context";
import { Facture } from "@/lib/types";

type PrintState = "loading" | "image" | "opening-pdf" | "error";
type PrintError = "missing" | "invalid" | "unsupported" | "unavailable";
type DocumentUrl =
  | { url: string; type: "image" | "pdf" }
  | { error: "invalid" | "unsupported" };

function getDocumentUrl(value: string): DocumentUrl {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return { error: "invalid" };
  }

  if (url.protocol !== "https:" && url.protocol !== "http:") {
    return { error: "invalid" };
  }

  const extension = url.pathname.toLowerCase().split(".").pop();
  if (extension === "pdf") return { url: url.href, type: "pdf" };
  if (["jpg", "jpeg", "png"].includes(extension ?? "")) {
    return { url: url.href, type: "image" };
  }
  return { error: "unsupported" };
}

export function InvoicePrintDocument({ invoiceId }: { invoiceId: string }) {
  const { t } = useI18n();
  const [state, setState] = useState<PrintState>("loading");
  const [imageUrl, setImageUrl] = useState("");
  const [imageLoaded, setImageLoaded] = useState(false);
  const [error, setError] = useState<PrintError>("unavailable");

  useEffect(() => {
    document.body.classList.add("invoice-print-mode");
    return () => document.body.classList.remove("invoice-print-mode");
  }, []);

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
        if (!facture.image_url) {
          setError("missing");
          setState("error");
          return;
        }

        const document = getDocumentUrl(facture.image_url);
        if ("error" in document) {
          setError(document.error);
          setState("error");
          return;
        }
        if (document.type === "pdf") {
          setState("opening-pdf");
          window.location.replace(document.url);
          return;
        }

        setImageUrl(document.url);
        setState("image");
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
    const timer = window.setTimeout(() => window.print(), 200);
    return () => window.clearTimeout(timer);
  }, [imageLoaded, state]);

  function printImage() {
    if (imageLoaded) window.print();
  }

  const errorMessage = {
    missing: t("documentFactureIndisponible"),
    invalid: t("documentFactureInvalide"),
    unsupported: t("formatFactureNonPrisEnCharge"),
    unavailable: t("documentFactureChargementEchec"),
  }[error];

  return (
    <main className="invoice-print-page min-h-screen bg-white p-4 text-center text-[#214f40]">
      {state === "loading" && <p role="status">{t("chargementDocumentFacture")}</p>}
      {state === "opening-pdf" && <p role="status">{t("ouverturePdfFacture")}</p>}
      {state === "image" && (
        <section className="invoice-print-document">
          {!imageLoaded && <p className="print:hidden" role="status">{t("chargementDocumentFacture")}</p>}
          <img
            src={imageUrl}
            alt={t("documentFactureAlt")}
            onLoad={() => setImageLoaded(true)}
            onError={() => {
              setImageLoaded(false);
              setError("unavailable");
              setState("error");
            }}
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
        <p className="mx-auto max-w-lg text-sm text-red-700" role="alert">
          {errorMessage}
        </p>
      )}
    </main>
  );
}

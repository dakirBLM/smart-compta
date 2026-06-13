import { NextRequest, NextResponse } from "next/server";

/**
 * Server-side webhook bridge.
 *
 * Two responsibilities:
 *  1. POST with an image (multipart `file` or JSON `{ image }`): forward it to
 *     the AI extraction service at WEBHOOK_URL and return its JSON. The
 *     WEBHOOK_URL is a server-only env var and is NEVER exposed to the client.
 *  2. POST with an already-extracted JSON body: validate its structure and the
 *     debit === credit invariant, then echo it back for the client to confirm.
 *
 * Note: the primary scanner path in this app goes through Django
 * (/api/scanner/upload/), which also calls WEBHOOK_URL. This route exists per
 * the spec as a Next.js-side bridge and validator.
 */

const REQUIRED = [
  "fournisseur",
  "date_facture",
  "numero_facture",
  "montant_ht",
  "tva_pourcentage",
  "montant_tva",
  "montant_ttc",
  "journal",
  "confiance",
  "lignes",
] as const;

interface AILigne {
  compte: string;
  libelle: string;
  debit: number;
  credit: number;
}

export async function POST(request: NextRequest) {
  const contentType = request.headers.get("content-type") || "";

  // --- Case 1: an image is being uploaded → forward to the AI webhook. ---
  if (contentType.includes("multipart/form-data")) {
    const webhookUrl = process.env.WEBHOOK_URL;
    if (!webhookUrl) {
      return NextResponse.json(
        { error: "WEBHOOK_URL non configuré." },
        { status: 500 }
      );
    }
    const form = await request.formData();
    const upstream = await fetch(webhookUrl, { method: "POST", body: form });
    const data = await upstream.json();
    return validateAndRespond(data);
  }

  // --- Case 2: a JSON extraction (either to forward, or already extracted). ---
  const body = await request.json();

  // If it only carries an image payload, forward to the webhook.
  if (body && typeof body === "object" && "image" in body && !("lignes" in body)) {
    const webhookUrl = process.env.WEBHOOK_URL;
    if (!webhookUrl) {
      return NextResponse.json(
        { error: "WEBHOOK_URL non configuré." },
        { status: 500 }
      );
    }
    const upstream = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ image: body.image }),
    });
    const data = await upstream.json();
    return validateAndRespond(data);
  }

  return validateAndRespond(body);
}

function validateAndRespond(body: Record<string, unknown>) {
  // Structure validation.
  const missing = REQUIRED.filter((f) => !(f in body));
  if (missing.length) {
    return NextResponse.json(
      { error: `Champs manquants: ${missing.join(", ")}` },
      { status: 400 }
    );
  }

  // If the AI reported errors, block submission.
  const erreurs = (body.erreurs as string[]) || [];
  if (erreurs.length) {
    return NextResponse.json({ error: "Erreurs IA", erreurs }, { status: 400 });
  }

  // Debit must equal credit.
  const lignes = (body.lignes as AILigne[]) || [];
  const totalDebit = lignes.reduce((s, l) => s + Number(l.debit || 0), 0);
  const totalCredit = lignes.reduce((s, l) => s + Number(l.credit || 0), 0);
  if (Math.abs(totalDebit - totalCredit) > 0.01) {
    return NextResponse.json({ error: "Débit ≠ Crédit" }, { status: 400 });
  }

  return NextResponse.json({ success: true, data: body });
}

import { NextRequest, NextResponse } from "next/server";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
const API_ORIGIN = new URL(API_URL).origin;
const CLOUDINARY_ORIGIN = "https://res.cloudinary.com";
const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);

export const runtime = "nodejs";

function errorResponse(status: number, error: string) {
  return NextResponse.json(
    { error },
    {
      status,
      headers: { "Cache-Control": "private, no-store" },
    }
  );
}

function resolveTrustedDocumentUrl(value: string): URL | null {
  try {
    const url = new URL(value.trim(), API_URL);
    if (url.username || url.password) return null;

    const isApiMedia =
      url.origin === API_ORIGIN && url.pathname.startsWith("/media/");
    const isCloudinary = url.origin === CLOUDINARY_ORIGIN;
    return isApiMedia || isCloudinary ? url : null;
  } catch {
    return null;
  }
}

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  if (!/^\d+$/.test(params.id)) {
    return errorResponse(400, "Invalid invoice id.");
  }

  const token = request.cookies.get("sc_token")?.value;
  if (!token) return errorResponse(401, "Authentication required.");

  let invoiceResponse: Response;
  try {
    invoiceResponse = await fetch(
      `${API_URL.replace(/\/$/, "")}/api/factures/${params.id}/`,
      {
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store",
        signal: request.signal,
      }
    );
  } catch (error) {
    console.error("Invoice document authorization request failed", error);
    return errorResponse(502, "Invoice document service is unavailable.");
  }

  if (!invoiceResponse.ok) {
    return errorResponse(
      invoiceResponse.status === 401 ? 401 : 404,
      "Invoice document is unavailable."
    );
  }

  let imageUrl: unknown;
  try {
    const invoice = (await invoiceResponse.json()) as { image_url?: unknown };
    imageUrl = invoice.image_url;
  } catch (error) {
    console.error("Invoice document metadata response was invalid", error);
    return errorResponse(502, "Invoice document metadata is invalid.");
  }

  if (typeof imageUrl !== "string") {
    return errorResponse(404, "Invoice document is unavailable.");
  }

  let documentUrl = resolveTrustedDocumentUrl(imageUrl);
  if (!documentUrl || !documentUrl.pathname.toLowerCase().endsWith(".pdf")) {
    return errorResponse(404, "PDF invoice document is unavailable.");
  }

  const upstreamHeaders = new Headers();
  const range = request.headers.get("range");
  const ifRange = request.headers.get("if-range");
  if (range) upstreamHeaders.set("Range", range);
  if (ifRange) upstreamHeaders.set("If-Range", ifRange);

  let documentResponse: Response | null = null;
  for (let redirectCount = 0; redirectCount <= 3; redirectCount += 1) {
    try {
      documentResponse = await fetch(documentUrl, {
        headers: upstreamHeaders,
        cache: "no-store",
        redirect: "manual",
        signal: request.signal,
      });
    } catch (error) {
      console.error("Invoice PDF fetch failed", error);
      return errorResponse(502, "Invoice PDF could not be loaded.");
    }

    if (!REDIRECT_STATUSES.has(documentResponse.status)) break;
    const location = documentResponse.headers.get("location");
    if (!location || redirectCount === 3) {
      return errorResponse(502, "Invoice PDF redirect is invalid.");
    }

    let redirectedUrl: URL | null = null;
    try {
      redirectedUrl = resolveTrustedDocumentUrl(
        new URL(location, documentUrl).href
      );
    } catch {
      return errorResponse(502, "Invoice PDF redirect is invalid.");
    }
    if (!redirectedUrl || !redirectedUrl.pathname.toLowerCase().endsWith(".pdf")) {
      return errorResponse(502, "Invoice PDF redirect is not trusted.");
    }
    await documentResponse.body?.cancel();
    documentUrl = redirectedUrl;
  }

  if (!documentResponse) {
    return errorResponse(502, "Invoice PDF could not be loaded.");
  }
  if (!documentResponse.ok && documentResponse.status !== 416) {
    return errorResponse(502, "Invoice PDF could not be loaded.");
  }

  const headers = new Headers({
    "Content-Type": "application/pdf",
    "Content-Disposition": `inline; filename="invoice-${params.id}.pdf"`,
    "Cache-Control": "private, no-store",
    "X-Content-Type-Options": "nosniff",
    "Accept-Ranges": "bytes",
  });
  for (const name of ["content-length", "content-range", "etag", "last-modified"]) {
    const value = documentResponse.headers.get(name);
    if (value) headers.set(name, value);
  }

  return new Response(documentResponse.body, {
    status: documentResponse.status,
    headers,
  });
}

import { NextRequest, NextResponse } from "next/server";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const id = request.nextUrl.searchParams.get("id") || "";
  if (!/^\d+$/.test(id)) {
    return NextResponse.json({ error: "Lien invalide." }, { status: 400 });
  }
  const token = request.cookies.get("sc_token")?.value || "";
  if (!token) {
    return NextResponse.json({ error: "Connexion requise." }, { status: 401 });
  }

  let upstream: Response;
  try {
    upstream = await fetch(
      `${API_URL.replace(/\/$/, "")}/api/messages/attachments/${id}/download/?inline=1`,
      {
        headers: { Authorization: `Bearer ${token}` },
        redirect: "error",
        cache: "no-store",
      },
    );
  } catch {
    return NextResponse.json(
      { error: "Impossible d'ouvrir le PDF." },
      { status: 502 },
    );
  }
  if (!upstream.ok || !upstream.body) {
    return NextResponse.json(
      { error: "Impossible d'ouvrir le PDF." },
      { status: upstream.status || 502 },
    );
  }

  return new NextResponse(upstream.body, {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": "inline",
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

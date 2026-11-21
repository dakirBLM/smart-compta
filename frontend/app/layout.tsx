import type { Metadata } from "next";
import { AuthProvider } from "@/lib/auth-context";
import { I18nProvider } from "@/lib/i18n-context";
import "./globals.css";

export const metadata: Metadata = {
  title: "Comptia DZ — Votre comptabilité devient intelligente",
  description:
    "Une plateforme innovante basée sur l'intelligence artificielle, pour automatiser, simplifier et optimiser la gestion comptable de votre entreprise en Algérie.",
  icons: {
    icon: "/logo_web.png",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="fr" dir="ltr">
      <body>
        <I18nProvider>
          <AuthProvider>{children}</AuthProvider>
        </I18nProvider>
      </body>
    </html>
  );
}

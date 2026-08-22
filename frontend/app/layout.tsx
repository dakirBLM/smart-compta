import type { Metadata } from "next";
import { AuthProvider } from "@/lib/auth-context";
import { I18nProvider } from "@/lib/i18n-context";
import "./globals.css";

export const metadata: Metadata = {
  title: "Comptia DZ — Votre comptabilité devient intelligente",
  description: "Plateforme de gestion comptable bilingue (FR/AR) propulsée par l'intelligence artificielle.",
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

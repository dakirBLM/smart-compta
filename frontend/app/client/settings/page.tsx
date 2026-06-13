"use client";

import { ClientShell } from "@/components/ClientShell";
import { LanguageToggle } from "@/components/LanguageToggle";
import { Card } from "@/components/ui";
import { useAuth } from "@/lib/auth-context";
import { useI18n } from "@/lib/i18n-context";

export default function ClientSettings() {
  const { t } = useI18n();
  const { user } = useAuth();
  return (
    <ClientShell>
      <h2 className="mb-4 text-lg font-bold text-brand">{t("settings")}</h2>
      <Card className="max-w-md space-y-4">
        <div>
          <div className="text-sm text-gray-500">{t("nom")}</div>
          <div className="font-medium">{user?.username}</div>
        </div>
        <div>
          <div className="text-sm text-gray-500">Email</div>
          <div className="font-medium">{user?.email || "—"}</div>
        </div>
        <div className="flex items-center justify-between border-t pt-4">
          <span className="text-sm text-gray-500">Langue / اللغة</span>
          <LanguageToggle className="text-brand" />
        </div>
      </Card>
    </ClientShell>
  );
}

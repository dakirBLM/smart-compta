"use client";

import { LogOut } from "lucide-react";
import { ClientShell } from "@/components/ClientShell";
import { LanguageToggle } from "@/components/LanguageToggle";
import { Card } from "@/components/ui";
import { useAuth } from "@/lib/auth-context";
import { useI18n } from "@/lib/i18n-context";

export default function ClientSettings() {
  const { t } = useI18n();
  const { user, logout } = useAuth();
  return (
    <ClientShell>
      <div className="mx-auto max-w-lg">
        <p className="mb-4 text-xs font-bold uppercase tracking-[0.12em] text-[#285d4d]">{t("settings")}</p>
        <Card className="space-y-4 border-[#e5e9e6] shadow-[0_4px_18px_rgba(27,55,46,0.04)]">
          <div>
            <div className="text-sm text-[#69736f]">{t("nom")}</div>
            <div className="font-medium text-[#17221f]">{user?.username}</div>
          </div>
          <div>
            <div className="text-sm text-[#69736f]">Email</div>
            <div className="font-medium text-[#17221f]">{user?.email || "—"}</div>
          </div>
          <div className="flex items-center justify-between border-t border-[#e5e9e6] pt-4">
            <span className="text-sm text-[#69736f]">Langue / اللغة</span>
            <LanguageToggle className="text-[#214f40]" />
          </div>
        </Card>
        <button
          type="button"
          onClick={logout}
          className="mt-4 inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl border border-[#e5e9e6] bg-white text-sm font-semibold text-[#214f40] hover:border-[#c9d5d0]"
        >
          <LogOut size={16} />
          {t("logout")}
        </button>
      </div>
    </ClientShell>
  );
}

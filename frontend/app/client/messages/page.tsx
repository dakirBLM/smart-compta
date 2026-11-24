"use client";

import { ChatThread } from "@/components/ChatThread";
import { ClientShell } from "@/components/ClientShell";
import { useI18n } from "@/lib/i18n-context";

export default function ClientMessagesPage() {
  const { t } = useI18n();

  return (
    <ClientShell>
      <div className="mx-auto max-w-3xl">
        <h1 className="mb-4 text-xl font-semibold tracking-tight text-[#17221f]">{t("messages")}</h1>
        <div className="flex h-[calc(100dvh-12rem)] min-h-[400px] overflow-hidden rounded-2xl border border-[#e5e9e6] bg-white shadow-[0_4px_18px_rgba(27,55,46,0.025)]">
          <ChatThread url="/api/messages/" title={t("votreComptable")} className="flex" />
        </div>
      </div>
    </ClientShell>
  );
}

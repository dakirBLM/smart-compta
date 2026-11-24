"use client";

import { ChatThread } from "@/components/ChatThread";
import { ClientShell } from "@/components/ClientShell";
import { useI18n } from "@/lib/i18n-context";

export default function ClientMessagesPage() {
  const { t } = useI18n();

  return (
    <ClientShell title={t("messages")} fullBleed>
      <div className="flex h-full min-h-0 bg-white">
        <ChatThread url="/api/messages/" title={t("votreComptable")} className="flex" />
      </div>
    </ClientShell>
  );
}

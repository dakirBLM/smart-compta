"use client";

import { useEffect, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { ChatPanel } from "@/components/ChatPanel";
import { api } from "@/lib/api";
import { useI18n } from "@/lib/i18n-context";
import { Conversation } from "@/lib/types";
import { useEntreprise } from "@/lib/useEntreprise";

export default function MessagesPage() {
  const { t } = useI18n();
  const { id, entreprise, annee } = useEntreprise();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selectedClientId, setSelectedClientId] = useState<number | null>(null);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    function load() {
      api
        .get<Conversation[]>(`/api/entreprises/${id}/conversations/`)
        .then((data) => {
          if (cancelled) return;
          setConversations(data);
          // Wide screens open the first conversation. On phones the list comes first,
          // so nothing is opened (and marked as read) before the user picks it.
          if (data.length > 0 && window.matchMedia("(min-width: 768px)").matches) {
            setSelectedClientId((prev) => prev ?? data[0].client_id);
          }
        })
        .catch(() => {});
    }
    load();
    // Keep previews and unread counts fresh while the page is open.
    const interval = setInterval(load, 10000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [id]);

  return (
    <AppShell
      title={t("messages")}
      entrepriseId={id}
      entrepriseName={entreprise?.nom}
      annee={annee}
    >
      {id && (
        <ChatPanel
          entrepriseId={id}
          selectedClientId={selectedClientId}
          conversations={conversations}
          onSelectClient={setSelectedClientId}
        />
      )}
    </AppShell>
  );
}

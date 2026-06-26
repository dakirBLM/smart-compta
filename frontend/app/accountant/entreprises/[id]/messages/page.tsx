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
    api
      .get<Conversation[]>(`/api/entreprises/${id}/conversations/`)
      .then((data) => {
        setConversations(data);
        if (data.length > 0) {
          setSelectedClientId((prev) => prev ?? data[0].client_id);
        }
      })
      .catch(() => {});
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

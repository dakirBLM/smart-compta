"use client";

import { useEffect, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { ChatPanel } from "@/components/ChatPanel";
import { api } from "@/lib/api";
import { subscribeChatEvents } from "@/lib/chat-events";
import { useI18n } from "@/lib/i18n-context";
import { Conversation } from "@/lib/types";
import { useEntreprise } from "@/lib/useEntreprise";

/** Where to land on entry: the conversation with new messages, else the most recent one. */
function pickConversation(list: Conversation[]): Conversation | undefined {
  const time = (c: Conversation) => (c.last_message_at ? Date.parse(c.last_message_at) : 0);
  const unread = list.filter((c) => c.unread_count > 0);
  const pool = unread.length > 0 ? unread : list;
  return [...pool].sort((a, b) => time(b) - time(a))[0];
}

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
          // Land on the conversation with new messages (or the latest one), only once.
          const target = pickConversation(data);
          if (target) setSelectedClientId((prev) => prev ?? target.client_id);
        })
        .catch(() => {});
    }
    load();
    // Live events refresh previews and unread counts at once; the slow poll is
    // only a safety net if the stream is down.
    const unsubscribe = subscribeChatEvents((event) => {
      if (event.type === "resync" || event.entreprise === id) load();
    });
    const interval = setInterval(load, 30000);
    return () => {
      cancelled = true;
      clearInterval(interval);
      unsubscribe();
    };
  }, [id]);

  return (
    <AppShell
      title={t("messages")}
      entrepriseId={id}
      entrepriseName={entreprise?.nom}
      annee={annee}
      fullBleed
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

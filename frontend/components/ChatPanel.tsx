"use client";

import { Send } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Button, Input, Spinner } from "@/components/ui";
import { api } from "@/lib/api";
import { useI18n } from "@/lib/i18n-context";
import { ChatMessage, Conversation } from "@/lib/types";
import { cn, formatDateTime } from "@/lib/utils";

export function ChatPanel({
  entrepriseId,
  selectedClientId,
  conversations,
  onSelectClient,
}: {
  entrepriseId: number;
  selectedClientId: number | null;
  conversations: Conversation[];
  onSelectClient: (clientId: number) => void;
}) {
  const { t } = useI18n();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  const loadMessages = useCallback(async () => {
    if (!selectedClientId) return;
    setLoading(true);
    try {
      const data = await api.get<ChatMessage[]>(
        `/api/entreprises/${entrepriseId}/conversations/${selectedClientId}/messages/`
      );
      setMessages(data);
    } catch {
      setMessages([]);
    } finally {
      setLoading(false);
    }
  }, [entrepriseId, selectedClientId]);

  useEffect(() => {
    loadMessages();
    const interval = setInterval(loadMessages, 8000);
    return () => clearInterval(interval);
  }, [loadMessages]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function send() {
    if (!selectedClientId || !text.trim() || sending) return;
    setSending(true);
    try {
      const msg = await api.post<ChatMessage>(
        `/api/entreprises/${entrepriseId}/conversations/${selectedClientId}/messages/`,
        { content: text.trim() }
      );
      setMessages((prev) => [...prev, msg]);
      setText("");
    } finally {
      setSending(false);
    }
  }

  const selected = conversations.find((c) => c.client_id === selectedClientId);

  return (
    <div className="flex h-[calc(100vh-12rem)] min-h-[480px] overflow-hidden rounded-xl border bg-white shadow-sm">
      {/* Liste des conversations */}
      <div className="w-full max-w-xs shrink-0 border-r bg-gray-50">
        <div className="border-b bg-brand px-4 py-3 text-sm font-semibold text-white">
          {t("clients")}
        </div>
        <div className="overflow-y-auto max-h-full">
          {conversations.length === 0 && (
            <p className="p-4 text-sm text-gray-400">{t("aucuneDonnee")}</p>
          )}
          {conversations.map((c) => (
            <button
              key={c.client_id}
              onClick={() => onSelectClient(c.client_id)}
              className={cn(
                "flex w-full flex-col gap-0.5 border-b px-4 py-3 text-left transition-colors hover:bg-white",
                selectedClientId === c.client_id && "bg-white border-l-4 border-l-brand"
              )}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="font-semibold text-gray-800 truncate">{c.nom_client}</span>
                {c.unread_count > 0 && (
                  <span className="shrink-0 rounded-full bg-brand px-2 py-0.5 text-xs text-white">
                    {c.unread_count}
                  </span>
                )}
              </div>
              <span className="text-xs text-gray-400 truncate">
                {c.last_message || t("aucunMessage")}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* Zone de chat */}
      <div className="flex flex-1 flex-col min-w-0">
        {selectedClientId ? (
          <>
            <div className="border-b px-4 py-3 bg-gradient-to-r from-brand/5 to-transparent">
              <div className="font-semibold text-brand">{selected?.nom_client}</div>
              <div className="text-xs text-gray-400">{selected?.username}</div>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-gray-50/50">
              {loading && messages.length === 0 ? (
                <div className="flex justify-center py-8">
                  <Spinner className="h-6 w-6 text-brand" />
                </div>
              ) : messages.length === 0 ? (
                <p className="text-center text-sm text-gray-400 py-8">{t("aucunMessage")}</p>
              ) : (
                messages.map((m) => (
                  <div
                    key={m.id}
                    className={cn("flex", m.is_mine ? "justify-end" : "justify-start")}
                  >
                    <div
                      className={cn(
                        "max-w-[75%] rounded-2xl px-4 py-2 text-sm shadow-sm",
                        m.is_mine
                          ? "bg-brand text-white rounded-br-sm"
                          : "bg-white border text-gray-800 rounded-bl-sm"
                      )}
                    >
                      <p>{m.content}</p>
                      <p
                        className={cn(
                          "mt-1 text-[10px]",
                          m.is_mine ? "text-white/70" : "text-gray-400"
                        )}
                      >
                        {formatDateTime(m.created_at)}
                      </p>
                    </div>
                  </div>
                ))
              )}
              <div ref={bottomRef} />
            </div>

            <div className="border-t p-3 flex gap-2 bg-white">
              <Input
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder={t("ecrireMessage")}
                onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && send()}
                className="flex-1"
              />
              <Button onClick={send} disabled={!text.trim() || sending}>
                <Send size={16} /> {t("envoyerMessage")}
              </Button>
            </div>
          </>
        ) : (
          <div className="flex flex-1 items-center justify-center text-gray-400">
            {t("nouvelleConversation")}
          </div>
        )}
      </div>
    </div>
  );
}

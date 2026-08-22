"use client";

import { Send, User } from "lucide-react";
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
  const [error, setError] = useState("");
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
    setError("");
    setSending(true);
    try {
      const msg = await api.post<ChatMessage>(
        `/api/entreprises/${entrepriseId}/conversations/${selectedClientId}/messages/`,
        { content: text.trim() }
      );
      setMessages((prev) => [...prev, msg]);
      setText("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur lors de l'envoi du message");
    } finally {
      setSending(false);
    }
  }

  const selected = conversations.find((c) => c.client_id === selectedClientId);

  return (
    <div className="flex h-[calc(100vh-12rem)] min-h-[500px] overflow-hidden rounded-3xl border border-gray-200 bg-white shadow-card">
      {/* Liste des conversations */}
      <div className="w-full max-w-xs shrink-0 border-r border-gray-200 bg-[#F7FAF7]">
        <div className="border-b border-gray-200 bg-brand px-5 py-4 text-xs font-bold uppercase tracking-wider text-white flex items-center justify-between">
          <span>{t("clients")} ({conversations.length})</span>
        </div>
        <div className="overflow-y-auto max-h-[calc(100%-3rem)] divide-y divide-gray-100">
          {conversations.length === 0 && (
            <p className="p-5 text-xs text-gray-400 text-center">{t("aucuneDonnee")}</p>
          )}
          {conversations.map((c) => {
            const active = selectedClientId === c.client_id;
            return (
              <button
                key={c.client_id}
                onClick={() => onSelectClient(c.client_id)}
                className={cn(
                  "flex w-full flex-col gap-1 px-4 py-3.5 text-left transition-all",
                  active
                    ? "bg-white font-bold text-brand border-l-4 border-l-brand shadow-sm"
                    : "hover:bg-gray-100 text-gray-700"
                )}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-bold text-brand truncate">{c.nom_client}</span>
                  {c.unread_count > 0 && (
                    <span className="shrink-0 rounded-full bg-lime px-2 py-0.5 text-[10px] font-black text-brand shadow-glow-sm">
                      {c.unread_count}
                    </span>
                  )}
                </div>
                <span className="text-[11px] text-gray-400 truncate">
                  {c.last_message || t("aucunMessage")}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Zone de chat */}
      <div className="flex flex-1 flex-col min-w-0 bg-white">
        {selectedClientId ? (
          <>
            <div className="border-b border-gray-200 px-6 py-3.5 bg-gray-50 flex items-center justify-between">
              <div>
                <div className="font-bold text-brand text-sm">{selected?.nom_client}</div>
                <div className="text-[11px] text-gray-400">{selected?.username}</div>
              </div>
              <span className="rounded-full bg-emerald-100 px-2.5 py-0.5 text-[10px] font-bold text-emerald-800">
                Canal direct
              </span>
            </div>

            <div className="flex-1 overflow-y-auto p-5 space-y-3.5 bg-[#F9FBF9]">
              {error && (
                <div className="rounded-xl bg-rose-50 border border-rose-200 px-4 py-2.5 text-xs font-semibold text-rose-700">
                  {error}
                </div>
              )}
              {loading && messages.length === 0 ? (
                <div className="flex justify-center py-10">
                  <Spinner className="h-6 w-6 text-brand" />
                </div>
              ) : messages.length === 0 ? (
                <p className="text-center text-xs text-gray-400 py-10">{t("aucunMessage")}</p>
              ) : (
                messages.map((m) => (
                  <div
                    key={m.id}
                    className={cn("flex", m.is_mine ? "justify-end" : "justify-start")}
                  >
                    <div
                      className={cn(
                        "max-w-[75%] rounded-2xl px-4 py-2.5 text-xs shadow-sm",
                        m.is_mine
                          ? "bg-brand text-white rounded-br-none shadow-brand-glow"
                          : "bg-white border border-gray-200 text-gray-800 rounded-bl-none"
                      )}
                    >
                      <p className="leading-relaxed">{m.content}</p>
                      <p
                        className={cn(
                          "mt-1 text-[10px] text-right",
                          m.is_mine ? "text-white/60" : "text-gray-400"
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

            <div className="border-t border-gray-200 p-3.5 flex gap-2.5 bg-white">
              <Input
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder={t("ecrireMessage")}
                onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && send()}
                className="flex-1 text-xs"
              />
              <Button
                variant="primary"
                onClick={send}
                disabled={!text.trim() || sending}
                className="font-bold text-xs gap-1.5 shadow-glow-sm"
              >
                {sending ? <Spinner className="h-4 w-4 text-brand" /> : <Send size={15} />}
                <span>{t("envoyerMessage")}</span>
              </Button>
            </div>
          </>
        ) : (
          <div className="flex flex-1 items-center justify-center text-xs text-gray-400">
            {t("nouvelleConversation")}
          </div>
        )}
      </div>
    </div>
  );
}


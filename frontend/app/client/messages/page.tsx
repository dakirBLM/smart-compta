"use client";

import { Send } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { ClientShell } from "@/components/ClientShell";
import { Button, Input, Spinner } from "@/components/ui";
import { api } from "@/lib/api";
import { useI18n } from "@/lib/i18n-context";
import { ChatMessage } from "@/lib/types";
import { cn, formatDateTime } from "@/lib/utils";

export default function ClientMessagesPage() {
  const { t } = useI18n();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    try {
      const data = await api.get<ChatMessage[]>("/api/messages/");
      setMessages(data);
    } catch {
      setMessages([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const interval = setInterval(load, 8000);
    return () => clearInterval(interval);
  }, [load]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function send() {
    if (!text.trim() || sending) return;
    setError("");
    setSending(true);
    try {
      const msg = await api.post<ChatMessage>("/api/messages/", { content: text.trim() });
      setMessages((prev) => [...prev, msg]);
      setText("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur lors de l'envoi du message");
    } finally {
      setSending(false);
    }
  }

  return (
    <ClientShell>
      <div className="mx-auto max-w-2xl">
        <h1 className="mb-4 text-xl font-bold text-brand">{t("messages")}</h1>
        <div className="flex h-[calc(100vh-10rem)] min-h-[400px] flex-col overflow-hidden rounded-xl border bg-white shadow-sm">
          <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-gray-50/50">
            {error && (
              <div className="rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">
                {error}
              </div>
            )}
            {loading ? (
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
                      "max-w-[80%] rounded-2xl px-4 py-2 text-sm shadow-sm",
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
              <Send size={16} />
            </Button>
          </div>
        </div>
      </div>
    </ClientShell>
  );
}

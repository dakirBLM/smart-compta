"use client";

import { Search } from "lucide-react";
import { useMemo, useState } from "react";
import { ChatAvatar } from "@/components/ChatAvatar";
import { ChatThread } from "@/components/ChatThread";
import { useI18n } from "@/lib/i18n-context";
import { Conversation } from "@/lib/types";
import { cn } from "@/lib/utils";

function sameDay(a: Date, b: Date) {
  return (
    a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
  );
}

/** "14:05" for today, "22/11" for anything older. */
function shortTime(iso: string | null, locale: string) {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  if (sameDay(date, new Date())) {
    return date.toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit" });
  }
  return date.toLocaleDateString(locale, { day: "2-digit", month: "2-digit" });
}

/**
 * Accountant messaging: a conversation list (one per client) next to the open
 * thread. On small screens only one of the two is shown at a time.
 */
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
  const { t, lang } = useI18n();
  const locale = lang === "ar" ? "ar" : "fr-FR";
  const [query, setQuery] = useState("");
  // Small screens start on the list; opening a conversation switches to the thread.
  const [mobileThreadOpen, setMobileThreadOpen] = useState(false);

  const visibleConversations = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return conversations
      .filter(
        (c) =>
          !needle ||
          c.nom_client.toLowerCase().includes(needle) ||
          c.username.toLowerCase().includes(needle)
      )
      .sort((a, b) => {
        if (a.last_message_at && b.last_message_at) {
          return b.last_message_at.localeCompare(a.last_message_at);
        }
        if (a.last_message_at) return -1;
        if (b.last_message_at) return 1;
        return a.nom_client.localeCompare(b.nom_client);
      });
  }, [conversations, query]);

  const selected = conversations.find((c) => c.client_id === selectedClientId);
  const threadUrl = selected
    ? `/api/entreprises/${entrepriseId}/conversations/${selected.client_id}/messages/`
    : null;

  return (
    <div className="flex h-[calc(100dvh-9.5rem)] min-h-[440px] overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-card md:h-[calc(100vh-12rem)] md:min-h-[500px]">
      <aside
        className={cn(
          "min-h-0 w-full flex-col bg-brand-dark text-white md:flex md:w-72 md:shrink-0 lg:w-80",
          mobileThreadOpen ? "hidden" : "flex"
        )}
      >
        <div className="px-4 pb-2 pt-4">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-[15px] font-bold">{t("messagesDirects")}</h2>
            <span className="rounded-full bg-white/10 px-2 py-0.5 text-xs font-semibold text-white/70">
              {conversations.length}
            </span>
          </div>
          <label className="flex items-center gap-2 rounded-lg border border-white/15 bg-white/10 px-2.5 py-2 focus-within:border-white/40">
            <Search size={15} className="shrink-0 text-white/60" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t("rechercherConversation")}
              aria-label={t("rechercherConversation")}
              className="w-full bg-transparent text-base text-white outline-none placeholder:text-white/50 md:text-sm"
            />
          </label>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-2 pb-3 pt-1">
          {visibleConversations.length === 0 && (
            <p className="px-3 py-6 text-center text-xs text-white/50">
              {conversations.length === 0 ? t("aucuneDonnee") : t("aucunClientTrouve")}
            </p>
          )}
          {visibleConversations.map((c) => {
            const active = selectedClientId === c.client_id;
            // The open thread marks its messages as read, so never flag it as unread.
            const unread = active ? 0 : c.unread_count;
            return (
              <button
                key={c.client_id}
                type="button"
                onClick={() => {
                  onSelectClient(c.client_id);
                  setMobileThreadOpen(true);
                }}
                aria-current={active ? "true" : undefined}
                className={cn(
                  "flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-start transition-colors",
                  active ? "bg-lime text-brand-dark" : "text-white/85 hover:bg-white/10"
                )}
              >
                <ChatAvatar name={c.nom_client} />
                <span className="min-w-0 flex-1">
                  <span className="flex items-baseline justify-between gap-2">
                    <span className={cn("truncate text-sm", unread > 0 || active ? "font-bold" : "font-medium")}>
                      {c.nom_client}
                    </span>
                    <span className={cn("shrink-0 text-[11px]", active ? "text-brand-dark/70" : "text-white/50")}>
                      {shortTime(c.last_message_at, locale)}
                    </span>
                  </span>
                  <span className="flex items-center justify-between gap-2">
                    <span
                      className={cn(
                        "truncate text-xs",
                        active ? "text-brand-dark/75" : unread > 0 ? "text-white" : "text-white/55"
                      )}
                    >
                      {c.last_message || t("aucunMessage")}
                    </span>
                    {unread > 0 && (
                      <span className="shrink-0 rounded-full bg-lime px-1.5 py-px text-[11px] font-black text-brand-dark">
                        {unread}
                      </span>
                    )}
                  </span>
                </span>
              </button>
            );
          })}
        </div>
      </aside>

      <ChatThread
        url={threadUrl}
        title={selected?.nom_client ?? t("messages")}
        subtitle={selected?.username}
        peerName={selected?.nom_client}
        onBack={() => setMobileThreadOpen(false)}
        className={cn("md:flex", mobileThreadOpen ? "flex" : "hidden")}
      />
    </div>
  );
}

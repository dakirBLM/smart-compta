"use client";

import { Search } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ChatAvatar } from "@/components/ChatAvatar";
import { ChatThread } from "@/components/ChatThread";
import { ChatEvent } from "@/lib/chat-events";
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

const LIST_MAX_WIDTH = 320;
const LIST_MIN_WIDTH = 220;
// Dragging the list narrower than this closes it. Between this and the minimum
// it stays at the minimum, so it is either comfortable to read or hidden.
const LIST_SNAP_CLOSED_BELOW = 170;
const LIST_WIDTH_KEY = "chat_list_width";

/** True from the `md` breakpoint up, where list and thread sit side by side. */
function useIsDesktop() {
  const [isDesktop, setIsDesktop] = useState(false);
  useEffect(() => {
    const query = window.matchMedia("(min-width: 768px)");
    const update = () => setIsDesktop(query.matches);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);
  return isDesktop;
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
  const isDesktop = useIsDesktop();

  // The list can be dragged narrower (down to hidden) on wide screens.
  const [listWidth, setListWidth] = useState(LIST_MAX_WIDTH);
  const [resizing, setResizing] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const raw = window.localStorage.getItem(LIST_WIDTH_KEY);
    if (raw === null || !Number.isFinite(Number(raw))) return;
    const saved = Number(raw);
    setListWidth(saved <= 0 ? 0 : Math.min(LIST_MAX_WIDTH, Math.max(LIST_MIN_WIDTH, saved)));
  }, []);

  const applyListWidth = useCallback((width: number, persist: boolean) => {
    const next =
      width < LIST_SNAP_CLOSED_BELOW ? 0 : Math.min(LIST_MAX_WIDTH, Math.max(LIST_MIN_WIDTH, width));
    setListWidth(next);
    if (persist) window.localStorage.setItem(LIST_WIDTH_KEY, String(next));
    return next;
  }, []);

  function widthFromPointer(clientX: number) {
    const box = containerRef.current;
    if (!box) return LIST_MAX_WIDTH;
    const rect = box.getBoundingClientRect();
    const rtl = getComputedStyle(box).direction === "rtl";
    return rtl ? rect.right - clientX : clientX - rect.left;
  }

  function onHandlePointerDown(event: React.PointerEvent<HTMLDivElement>) {
    event.currentTarget.setPointerCapture(event.pointerId);
    setResizing(true);
  }

  function onHandlePointerMove(event: React.PointerEvent<HTMLDivElement>) {
    if (!resizing) return;
    applyListWidth(widthFromPointer(event.clientX), false);
  }

  function onHandlePointerUp(event: React.PointerEvent<HTMLDivElement>) {
    if (!resizing) return;
    event.currentTarget.releasePointerCapture(event.pointerId);
    setResizing(false);
    applyListWidth(widthFromPointer(event.clientX), true);
  }

  function onHandleKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    const rtl = containerRef.current ? getComputedStyle(containerRef.current).direction === "rtl" : false;
    const grow = rtl ? "ArrowLeft" : "ArrowRight";
    const shrink = rtl ? "ArrowRight" : "ArrowLeft";
    if (event.key === grow) applyListWidth(listWidth === 0 ? LIST_MIN_WIDTH : listWidth + 24, true);
    else if (event.key === shrink) applyListWidth(listWidth - 24 < LIST_MIN_WIDTH ? 0 : listWidth - 24, true);
    else if (event.key === "Home") applyListWidth(0, true);
    else if (event.key === "End") applyListWidth(LIST_MAX_WIDTH, true);
    else return;
    event.preventDefault();
  }

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
  // A thread hidden behind the list on a phone must not load: loading marks it as read.
  const threadVisible = isDesktop || mobileThreadOpen;
  const threadUrl =
    selected && threadVisible
      ? `/api/entreprises/${entrepriseId}/conversations/${selected.client_id}/messages/`
      : null;
  const threadClientId = selected?.client_id;
  const concernsThread = useCallback(
    (event: ChatEvent) =>
      event.type === "message" && event.entreprise === entrepriseId && event.client_id === threadClientId,
    [entrepriseId, threadClientId]
  );

  return (
    <div
      ref={containerRef}
      className={cn("flex h-full min-h-0 overflow-hidden bg-white", resizing && "select-none")}
      style={{ "--chat-list-width": `${listWidth}px` } as React.CSSProperties}
    >
      <aside
        className={cn(
          "min-h-0 w-full flex-col bg-[#f5f7f5] text-[#17221f] md:flex md:w-[var(--chat-list-width)] md:shrink-0 md:overflow-hidden",
          !resizing && "md:transition-[width] md:duration-150",
          mobileThreadOpen ? "hidden" : "flex"
        )}
      >
        <div className="px-4 pb-2 pt-4">
          <h2 className="mb-3 truncate text-[15px] font-bold">{t("messagesDirects")}</h2>
          <label className="flex items-center gap-2 rounded-lg border border-[#dfe5e1] bg-white px-2.5 py-2 focus-within:border-brand/50">
            <Search size={15} className="shrink-0 text-gray-400" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t("rechercherConversation")}
              aria-label={t("rechercherConversation")}
              className="w-full min-w-0 bg-transparent text-base text-[#17221f] outline-none placeholder:text-gray-400 md:text-sm"
            />
          </label>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-2 pb-3 pt-1">
          {visibleConversations.length === 0 && (
            <p className="px-3 py-6 text-center text-xs text-gray-500">
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
                  active
                    ? "bg-white shadow-[0_1px_2px_rgba(23,34,31,0.08)] ring-1 ring-[#dfe5e1]"
                    : "hover:bg-white/70"
                )}
              >
                <ChatAvatar name={c.nom_client} />
                <span className="min-w-0 flex-1">
                  <span className="flex items-baseline justify-between gap-2">
                    <span
                      className={cn(
                        "truncate text-sm text-[#17221f]",
                        unread > 0 || active ? "font-bold" : "font-medium"
                      )}
                    >
                      {c.nom_client}
                    </span>
                    <span className="shrink-0 text-[11px] text-gray-500">
                      {shortTime(c.last_message_at, locale)}
                    </span>
                  </span>
                  <span className="flex items-center justify-between gap-2">
                    <span
                      className={cn("truncate text-xs", unread > 0 ? "font-semibold text-[#17221f]" : "text-gray-500")}
                    >
                      {c.last_message || t("aucunMessage")}
                    </span>
                    {unread > 0 && (
                      <span className="shrink-0 rounded-full bg-brand px-1.5 py-px text-[11px] font-bold text-lime">
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

      {/* Drag to resize the list; drag it shut to hide it, double-click to toggle. */}
      <div
        role="separator"
        aria-orientation="vertical"
        aria-label="Redimensionner la liste des conversations"
        aria-valuemin={0}
        aria-valuemax={LIST_MAX_WIDTH}
        aria-valuenow={listWidth}
        tabIndex={0}
        onPointerDown={onHandlePointerDown}
        onPointerMove={onHandlePointerMove}
        onPointerUp={onHandlePointerUp}
        onPointerCancel={onHandlePointerUp}
        onDoubleClick={() => applyListWidth(listWidth === 0 ? LIST_MAX_WIDTH : 0, true)}
        onKeyDown={onHandleKeyDown}
        className={cn(
          "relative hidden w-px shrink-0 cursor-col-resize touch-none bg-[#e5e9e6] outline-none md:block",
          // Wider invisible grab area, and a hairline highlight on hover/drag.
          "before:absolute before:inset-y-0 before:-inset-x-1.5 before:content-['']",
          "after:absolute after:inset-y-0 after:left-0 after:w-px after:bg-transparent after:transition-colors after:content-[''] hover:after:bg-brand/50 focus-visible:after:bg-brand/50",
          resizing && "after:bg-brand/50"
        )}
      />

      <ChatThread
        url={threadUrl}
        title={selected?.nom_client ?? t("messages")}
        subtitle={selected?.username}
        eventMatches={concernsThread}
        onBack={() => setMobileThreadOpen(false)}
        onOpenList={listWidth === 0 ? () => applyListWidth(LIST_MAX_WIDTH, true) : undefined}
        className={cn("md:flex", mobileThreadOpen ? "flex" : "hidden")}
      />
    </div>
  );
}

import { useEffect, useState } from "react";
import { api } from "./api";
import { CHAT_READ_EVENT, subscribeChatEvents } from "./chat-events";

/** Slow safety refresh in case a live event is missed. */
const SAFETY_POLL_MS = 30_000;

/**
 * Number of messages waiting for the current user (for the navigation badge).
 * Refreshes on live chat events, after a thread is read, and on a slow poll.
 */
export function useUnreadMessages(url: string | null): number {
  const [count, setCount] = useState(0);

  useEffect(() => {
    if (!url) return;
    let cancelled = false;
    const refresh = () => {
      api
        .get<{ unread: number }>(url)
        .then((data) => {
          if (!cancelled) setCount(data.unread);
        })
        .catch(() => {
          // Keep the last known count; the next event or poll retries.
        });
    };
    refresh();
    const unsubscribe = subscribeChatEvents(refresh);
    window.addEventListener(CHAT_READ_EVENT, refresh);
    const timer = window.setInterval(refresh, SAFETY_POLL_MS);
    return () => {
      cancelled = true;
      unsubscribe();
      window.removeEventListener(CHAT_READ_EVENT, refresh);
      window.clearInterval(timer);
    };
  }, [url]);

  return url ? count : 0;
}

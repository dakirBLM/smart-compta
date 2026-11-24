"use client";

import { API_URL, getToken } from "./api";

/** What the server pushes when a thread has a new message (ids only). */
export interface ChatMessageEvent {
  type: "message";
  entreprise: number;
  client_id: number;
  message_id: number;
}

/** Sent locally after the stream reconnects: events may have been missed. */
export interface ChatResyncEvent {
  type: "resync";
}

export type ChatEvent = ChatMessageEvent | ChatResyncEvent;
type Handler = (event: ChatEvent) => void;

/**
 * Window event fired after a thread has been loaded. Loading marks the
 * messages as read on the server, so navigation badges must be refreshed.
 */
export const CHAT_READ_EVENT = "chat-read";

const handlers = new Set<Handler>();
let controller: AbortController | null = null;
let connected = false;

/** True while the live stream is open, so polling can slow down. */
export function isChatStreamConnected() {
  return connected;
}

function sleep(ms: number, signal: AbortSignal) {
  return new Promise<void>((resolve) => {
    const timer = setTimeout(resolve, ms);
    signal.addEventListener("abort", () => {
      clearTimeout(timer);
      resolve();
    });
  });
}

function emit(event: ChatEvent) {
  handlers.forEach((handler) => {
    try {
      handler(event);
    } catch {
      // One failing listener must not stop the others.
    }
  });
}

function parseFrame(frame: string) {
  const data = frame
    .split("\n")
    .filter((line) => line.startsWith("data:"))
    .map((line) => line.slice(5).trim())
    .join("\n");
  if (!data) return; // comment / keep-alive frame
  try {
    emit(JSON.parse(data) as ChatEvent);
  } catch {
    // Ignore malformed frames.
  }
}

async function run(signal: AbortSignal) {
  let delay = 1000;
  let hasConnectedBefore = false;
  while (!signal.aborted) {
    try {
      const token = getToken();
      if (!token) {
        await sleep(5000, signal);
        continue;
      }
      // fetch (not EventSource) so the JWT travels in a header, never in the URL.
      const response = await fetch(`${API_URL}/api/chat/stream/`, {
        headers: { Authorization: `Bearer ${token}`, Accept: "text/event-stream" },
        cache: "no-store",
        signal,
      });
      if (response.status === 401 || response.status === 403) return; // logged out
      if (!response.ok || !response.body) throw new Error(`stream ${response.status}`);

      connected = true;
      delay = 1000;
      if (hasConnectedBefore) emit({ type: "resync" });
      hasConnectedBefore = true;

      const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();
      let buffer = "";
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += value.replace(/\r\n/g, "\n");
        let end = buffer.indexOf("\n\n");
        while (end !== -1) {
          parseFrame(buffer.slice(0, end));
          buffer = buffer.slice(end + 2);
          end = buffer.indexOf("\n\n");
        }
      }
    } catch {
      if (signal.aborted) return;
    } finally {
      connected = false;
    }
    await sleep(delay, signal);
    delay = Math.min(delay * 2, 30000);
  }
}

/**
 * Listen to live chat events. All listeners share one connection, which opens
 * with the first listener and closes with the last. Returns an unsubscribe fn.
 */
export function subscribeChatEvents(handler: Handler): () => void {
  handlers.add(handler);
  if (!controller) {
    controller = new AbortController();
    void run(controller.signal);
  }
  return () => {
    handlers.delete(handler);
    if (handlers.size === 0 && controller) {
      controller.abort();
      controller = null;
      connected = false;
    }
  };
}

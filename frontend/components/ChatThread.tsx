"use client";

import { ChevronLeft, FileText, PanelLeftOpen, Paperclip, Send, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ChatAvatar } from "@/components/ChatAvatar";
import { Spinner } from "@/components/ui";
import { api, getToken } from "@/lib/api";
import { CHAT_READ_EVENT, ChatEvent, isChatStreamConnected, subscribeChatEvents } from "@/lib/chat-events";
import { useI18n } from "@/lib/i18n-context";
import { ChatMessage, MessageAttachment } from "@/lib/types";
import { cn } from "@/lib/utils";

const ATTACHMENT_ACCEPT = ".pdf,image/png,image/jpeg,image/webp";
const MAX_MESSAGE_ATTACHMENT_BYTES = 10 * 1024 * 1024;
const MAX_MESSAGE_ATTACHMENT_COUNT = 3;
const GROUP_WINDOW_MS = 5 * 60 * 1000;
// Live events (SSE) deliver new messages at once. Polling stays as a safety net:
// slow while the stream is open, fast while it is down.
const POLL_MS = 8000;
const POLL_WHEN_LIVE_MS = 60000;
const PIN_ON_OPEN_MS = 1500;

function isImageAttachment(filename: string, contentType: string) {
  return contentType.startsWith("image/") || /\.(png|jpe?g|webp)$/i.test(filename);
}

function validateAttachmentFile(file: File): string | null {
  if (file.size > MAX_MESSAGE_ATTACHMENT_BYTES) {
    return "Le fichier dépasse la taille maximale de 10 Mo.";
  }
  const allowedExtensions = [".pdf", ".png", ".jpg", ".jpeg", ".webp"];
  const fileName = file.name.toLowerCase();
  if (!allowedExtensions.some((extension) => fileName.endsWith(extension))) {
    return "Format non supporté. Utilisez un PDF, PNG, JPG ou WEBP.";
  }
  return null;
}

function getAttachmentSelectionError(files: File[]): string | null {
  if (files.length > MAX_MESSAGE_ATTACHMENT_COUNT) {
    return `Vous pouvez joindre jusqu'à ${MAX_MESSAGE_ATTACHMENT_COUNT} fichiers maximum.`;
  }
  const totalSize = files.reduce((total, file) => total + file.size, 0);
  if (totalSize > MAX_MESSAGE_ATTACHMENT_BYTES) {
    return "Le total des fichiers dépasse la limite de 10 Mo.";
  }
  return null;
}

function formatFileSize(size: number) {
  if (!size) return "0 KB";
  const units = ["B", "KB", "MB"];
  let value = size;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }
  return `${value.toFixed(value >= 10 || unitIndex === 0 ? 0 : 1)} ${units[unitIndex]}`;
}

function dayKey(date: Date) {
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
}

async function fetchBlobUrl(url: string): Promise<string> {
  const token = getToken();
  const response = await fetch(url, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!response.ok) throw new Error("Impossible d'ouvrir la pièce jointe.");
  return URL.createObjectURL(await response.blob());
}

/** Small preview of a file that is about to be sent. */
function PendingFile({ file, onRemove }: { file: File; onRemove: () => void }) {
  const isImage = isImageAttachment(file.name, file.type);
  const previewUrl = useMemo(() => (isImage ? URL.createObjectURL(file) : null), [file, isImage]);
  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  return (
    <div className="flex max-w-full items-center gap-2 rounded-lg border border-gray-200 bg-gray-50 py-1.5 pe-1.5 ps-2 text-xs text-gray-700">
      {previewUrl ? (
        <img src={previewUrl} alt="" className="h-8 w-8 shrink-0 rounded object-cover" />
      ) : (
        <FileText size={16} className="shrink-0 text-brand" />
      )}
      <div className="min-w-0">
        <div className="max-w-[10rem] truncate font-semibold text-[#17221f]">{file.name}</div>
        <div className="text-[11px] text-gray-500">{formatFileSize(file.size)}</div>
      </div>
      <button
        type="button"
        onClick={onRemove}
        aria-label="Supprimer la pièce jointe"
        className="grid h-6 w-6 shrink-0 place-items-center rounded text-gray-500 hover:bg-gray-200 hover:text-rose-600"
      >
        <X size={14} />
      </button>
    </div>
  );
}

/**
 * One direct-message thread in a Slack-like layout: header, message feed grouped
 * by sender and day, and a composer. Used by the accountant (one thread per
 * client) and by the client (one thread with the accountant).
 */
export function ChatThread({
  url,
  title,
  subtitle,
  eventMatches,
  onBack,
  onOpenList,
  className,
}: {
  /** Endpoint used to list (GET) and send (POST) messages. */
  url: string | null;
  title: string;
  subtitle?: string;
  /** Which live events concern this thread. Defaults to all of them. */
  eventMatches?: (event: ChatEvent) => boolean;
  /** Shows a back button on small screens when set. */
  onBack?: () => void;
  /** Shows a button (wide screens) to bring back a conversation list that was dragged shut. */
  onOpenList?: () => void;
  className?: string;
}) {
  const { t, lang } = useI18n();
  const locale = lang === "ar" ? "ar" : "fr-FR";
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [previewUrls, setPreviewUrls] = useState<Record<number, string>>({});
  const [previewAttachment, setPreviewAttachment] = useState<MessageAttachment | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const feedRef = useRef<HTMLDivElement>(null);
  const feedContentRef = useRef<HTMLDivElement>(null);
  const stickToBottomRef = useRef(true);
  // Right after a thread opens, keep the newest message in view while layout settles.
  const pinUntilRef = useRef(0);
  const objectUrlsRef = useRef<Record<number, string>>({});
  const eventMatchesRef = useRef(eventMatches);
  eventMatchesRef.current = eventMatches;

  // Load and poll the thread. Everything is reset when the thread changes.
  useEffect(() => {
    setMessages([]);
    setText("");
    setError("");
    setSelectedFiles([]);
    stickToBottomRef.current = true;
    if (!url) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    let latestRequest = 0;
    let lastLoadedAt = 0;
    let opening = true;
    setLoading(true);
    async function load() {
      const request = ++latestRequest;
      try {
        const data = await api.get<ChatMessage[]>(url as string);
        // Ignore answers that were overtaken by a newer request.
        if (!cancelled && request === latestRequest) {
          if (opening) {
            opening = false;
            stickToBottomRef.current = true;
            pinUntilRef.current = Date.now() + PIN_ON_OPEN_MS;
          }
          setMessages(data);
          lastLoadedAt = Date.now();
          window.dispatchEvent(new Event(CHAT_READ_EVENT));
        }
      } catch {
        // Keep what is already shown; the next poll or event retries.
      } finally {
        if (!cancelled && request === latestRequest) setLoading(false);
      }
    }
    load();
    const interval = setInterval(() => {
      if (isChatStreamConnected() && Date.now() - lastLoadedAt < POLL_WHEN_LIVE_MS) return;
      void load();
    }, POLL_MS);
    const unsubscribe = subscribeChatEvents((event) => {
      const matches = eventMatchesRef.current;
      if (event.type === "resync" || !matches || matches(event)) void load();
    });
    return () => {
      cancelled = true;
      clearInterval(interval);
      unsubscribe();
    };
  }, [url]);

  // Load image thumbnails once per attachment (they need the auth header).
  useEffect(() => {
    let cancelled = false;
    const missing = messages
      .flatMap((message) => message.attachments)
      .filter(
        (attachment) =>
          isImageAttachment(attachment.filename, attachment.content_type) &&
          !objectUrlsRef.current[attachment.id],
      );
    if (missing.length === 0) return;
    (async () => {
      for (const attachment of missing) {
        try {
          const objectUrl = await fetchBlobUrl(attachment.open_url);
          if (cancelled) {
            URL.revokeObjectURL(objectUrl);
            return;
          }
          objectUrlsRef.current[attachment.id] = objectUrl;
          setPreviewUrls({ ...objectUrlsRef.current });
        } catch {
          // The file can still be opened by clicking it.
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [messages]);

  useEffect(() => {
    const urls = objectUrlsRef.current;
    return () => {
      Object.values(urls).forEach((objectUrl) => URL.revokeObjectURL(objectUrl));
    };
  }, []);

  // Follow new messages only when the reader is already at the bottom. The
  // observer also covers late layout changes (fonts, thumbnails finishing).
  useEffect(() => {
    const feed = feedRef.current;
    const content = feedContentRef.current;
    if (!feed || !content) return;
    const toBottom = () => {
      if (stickToBottomRef.current || Date.now() < pinUntilRef.current) {
        feed.scrollTop = feed.scrollHeight;
      }
    };
    toBottom();
    const observer = new ResizeObserver(toBottom);
    observer.observe(content);
    return () => observer.disconnect();
  }, [messages, loading]);

  // Grow the composer with its content, up to a limit.
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  }, [text]);

  const openAttachment = useCallback(async (attachment: MessageAttachment) => {
    if (!attachment.open_url) return;
    setPreviewAttachment(attachment);
    setPreviewLoading(true);
    setPreviewUrl(null);
    try {
      setPreviewUrl(await fetchBlobUrl(attachment.open_url));
    } catch {
      setError("Impossible d'ouvrir la pièce jointe. Veuillez réessayer.");
      setPreviewAttachment(null);
    } finally {
      setPreviewLoading(false);
    }
  }, []);

  function closePreview() {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewAttachment(null);
    setPreviewUrl(null);
    setPreviewLoading(false);
  }

  function onFeedScroll() {
    const feed = feedRef.current;
    if (!feed) return;
    if (Date.now() < pinUntilRef.current) return;
    stickToBottomRef.current = feed.scrollHeight - feed.scrollTop - feed.clientHeight < 120;
  }

  function onFilesChosen(event: React.ChangeEvent<HTMLInputElement>) {
    const nextFiles = Array.from(event.target.files ?? []);
    event.target.value = "";
    const selectionError = getAttachmentSelectionError([...selectedFiles, ...nextFiles]);
    if (selectionError) {
      setError(selectionError);
      return;
    }
    for (const file of nextFiles) {
      const fileError = validateAttachmentFile(file);
      if (fileError) {
        setError(fileError);
        return;
      }
    }
    setError("");
    setSelectedFiles((current) => [...current, ...nextFiles]);
  }

  const selectionError = getAttachmentSelectionError(selectedFiles);
  const canSend =
    Boolean(url) && (Boolean(text.trim()) || selectedFiles.length > 0) && !sending && !selectionError;

  async function send() {
    if (!url || !canSend) return;
    setError("");
    setSending(true);
    try {
      const form = new FormData();
      if (text.trim()) form.append("content", text.trim());
      selectedFiles.forEach((file) => form.append("file", file));
      const message = await api.post<ChatMessage>(url, form);
      stickToBottomRef.current = true;
      setMessages((current) => [...current, message]);
      setText("");
      setSelectedFiles([]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur lors de l'envoi du message");
    } finally {
      setSending(false);
    }
  }

  function onComposerKeyDown(event: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key !== "Enter" || event.shiftKey || event.nativeEvent.isComposing) return;
    // On touch screens Enter adds a new line; the send button sends.
    if (!window.matchMedia("(pointer: fine)").matches) return;
    event.preventDefault();
    void send();
  }

  function dayLabel(date: Date) {
    const today = new Date();
    const yesterday = new Date();
    yesterday.setDate(today.getDate() - 1);
    if (dayKey(date) === dayKey(today)) return t("aujourdhui");
    if (dayKey(date) === dayKey(yesterday)) return t("hier");
    return date.toLocaleDateString(locale, {
      weekday: "long",
      day: "numeric",
      month: "long",
      ...(date.getFullYear() !== today.getFullYear() ? { year: "numeric" as const } : {}),
    });
  }

  const rows = messages.map((message, index) => {
    const date = new Date(message.created_at);
    const previous = messages[index - 1];
    const previousDate = previous ? new Date(previous.created_at) : null;
    const newDay = !previousDate || dayKey(previousDate) !== dayKey(date);
    const grouped =
      !newDay &&
      previous !== undefined &&
      previous.sender === message.sender &&
      date.getTime() - (previousDate as Date).getTime() < GROUP_WINDOW_MS;
    return { message, date, newDay, grouped };
  });

  const timeOf = (date: Date) => date.toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit" });

  return (
    <div className={cn("min-w-0 flex-1 flex-col bg-white", className ?? "flex")}>
      {previewAttachment && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/65 p-3 backdrop-blur-sm sm:p-4">
          <div className="relative w-full max-w-4xl rounded-2xl border border-white/10 bg-white shadow-2xl">
            <div className="flex items-center justify-between gap-3 border-b border-gray-200 px-4 py-3">
              <div className="truncate text-sm font-semibold text-gray-800">{previewAttachment.filename}</div>
              <button
                type="button"
                onClick={closePreview}
                className="rounded-lg border border-gray-200 px-2 py-1 text-xs font-semibold text-gray-600 hover:text-gray-900"
              >
                Fermer
              </button>
            </div>
            <div className="flex min-h-[320px] items-center justify-center bg-gray-50 p-3 sm:min-h-[420px] sm:p-4">
              {previewLoading ? (
                <div className="flex items-center gap-2 text-sm text-gray-500">
                  <Spinner className="h-5 w-5 text-brand" /> Chargement...
                </div>
              ) : previewUrl ? (
                isImageAttachment(previewAttachment.filename, previewAttachment.content_type) ? (
                  <img
                    src={previewUrl}
                    alt={previewAttachment.filename}
                    className="max-h-[75vh] max-w-full rounded-xl object-contain"
                  />
                ) : previewAttachment.content_type === "application/pdf" ||
                  /\.pdf$/i.test(previewAttachment.filename) ? (
                  <iframe
                    src={previewUrl}
                    title={previewAttachment.filename}
                    className="h-[75vh] w-full rounded-xl border-0"
                  />
                ) : (
                  <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-gray-300 bg-white px-8 py-10 text-center text-sm text-gray-600">
                    <FileText size={32} className="text-brand" />
                    <div className="font-semibold text-gray-800">Aperçu non disponible</div>
                    <div>Ce type de fichier ne peut pas être prévisualisé dans le navigateur.</div>
                  </div>
                )
              ) : null}
            </div>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="flex items-center gap-2.5 border-b border-gray-200 bg-white px-3 py-2.5 sm:px-5 sm:py-3">
        {onBack && (
          <button
            type="button"
            onClick={onBack}
            aria-label={t("retourConversations")}
            className="grid h-9 w-9 shrink-0 place-items-center rounded-lg text-brand hover:bg-gray-100 md:hidden"
          >
            <ChevronLeft size={22} className="rtl:rotate-180" />
          </button>
        )}
        {onOpenList && (
          <button
            type="button"
            onClick={onOpenList}
            aria-label={t("messagesDirects")}
            title={t("messagesDirects")}
            className="hidden h-9 w-9 shrink-0 place-items-center rounded-lg text-brand hover:bg-gray-100 md:grid"
          >
            <PanelLeftOpen size={20} className="rtl:-scale-x-100" />
          </button>
        )}
        <ChatAvatar name={title} />
        <div className="min-w-0">
          <div className="truncate text-[15px] font-bold leading-tight text-[#17221f]">{title}</div>
          {subtitle && <div className="truncate text-xs text-gray-500">{subtitle}</div>}
        </div>
      </div>

      {/* Feed */}
      <div
        ref={feedRef}
        onScroll={onFeedScroll}
        className="min-h-0 flex-1 overflow-y-auto overscroll-contain py-3"
      >
        <div ref={feedContentRef} className="flex min-h-full flex-col">
          {!url ? (
            <div className="flex flex-1 items-center justify-center px-6 text-center text-sm text-gray-400">
              {t("nouvelleConversation")}
            </div>
          ) : loading && messages.length === 0 ? (
            <div className="flex justify-center py-10">
              <Spinner className="h-6 w-6 text-brand" />
            </div>
          ) : messages.length === 0 ? (
            <p className="px-6 py-10 text-center text-sm text-gray-400">{t("aucunMessage")}</p>
          ) : (
            rows.map(({ message, date, newDay, grouped }) => {
              const name = message.sender_username;
              return (
                <div key={message.id}>
                  {newDay && (
                    <div className="relative my-3 flex items-center px-4 sm:px-5">
                      <div className="h-px flex-1 bg-gray-200" />
                      <span className="mx-3 rounded-full border border-gray-200 bg-white px-3 py-0.5 text-xs font-semibold capitalize text-gray-600">
                        {dayLabel(date)}
                      </span>
                      <div className="h-px flex-1 bg-gray-200" />
                    </div>
                  )}
                  <div
                    className={cn(
                      "group flex gap-3 px-4 hover:bg-gray-50 sm:px-5",
                      grouped ? "py-px" : "pb-px pt-2",
                    )}
                  >
                    <div className="w-9 shrink-0">
                      {grouped ? (
                        <span className="hidden pt-1 text-center text-[10px] leading-5 text-gray-400 group-hover:block">
                          {timeOf(date)}
                        </span>
                      ) : (
                        <ChatAvatar name={name} photoUrl={message.sender_photo} />
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      {!grouped && (
                        <div className="flex items-baseline gap-2">
                          <span className="truncate text-[15px] font-bold text-[#17221f]">{name}</span>
                          <span className="shrink-0 text-xs text-gray-400">{timeOf(date)}</span>
                        </div>
                      )}
                      {message.content ? (
                        <p className="whitespace-pre-wrap break-words text-[15px] leading-relaxed text-[#1d2b26]">
                          {message.content}
                        </p>
                      ) : null}
                      {message.attachments.length > 0 && (
                        <div className="mt-1.5 flex flex-wrap items-start gap-2">
                          {message.attachments.map((attachment) =>
                            isImageAttachment(attachment.filename, attachment.content_type) ? (
                              <button
                                key={attachment.id}
                                type="button"
                                onClick={() => void openAttachment(attachment)}
                                aria-label={attachment.filename}
                                className="block max-w-full overflow-hidden rounded-lg border border-gray-200 bg-gray-100"
                              >
                                {previewUrls[attachment.id] ? (
                                  <img
                                    src={previewUrls[attachment.id]}
                                    alt={attachment.filename}
                                    className="max-h-60 w-auto max-w-full object-contain"
                                  />
                                ) : (
                                  <span className="grid h-24 w-40 place-items-center text-gray-400">
                                    <Spinner className="h-5 w-5 text-brand" />
                                  </span>
                                )}
                              </button>
                            ) : (
                              <button
                                key={attachment.id}
                                type="button"
                                onClick={() => void openAttachment(attachment)}
                                className="flex max-w-full items-center gap-2.5 rounded-lg border border-gray-200 bg-white px-3 py-2 text-start hover:bg-gray-50"
                              >
                                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-brand-subtle text-brand">
                                  <FileText size={18} />
                                </span>
                                <span className="min-w-0">
                                  <span className="block truncate text-sm font-semibold text-brand">
                                    {attachment.filename}
                                  </span>
                                  <span className="block text-xs text-gray-500">
                                    {formatFileSize(attachment.size)}
                                  </span>
                                </span>
                              </button>
                            ),
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* Composer */}
      <div className="px-3 pb-3 pt-1 sm:px-5 sm:pb-4">
        {error && (
          <div
            role="alert"
            className="mb-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700"
          >
            {error}
          </div>
        )}
        <div
          className={cn(
            "rounded-xl border border-gray-300 bg-white transition-shadow focus-within:border-brand/60 focus-within:shadow-[0_0_0_3px_rgba(31,61,53,0.08)]",
            !url && "opacity-60",
          )}
        >
          {selectedFiles.length > 0 && (
            <div className="flex flex-wrap gap-2 px-3 pt-3">
              {selectedFiles.map((file, index) => (
                <PendingFile
                  key={`${file.name}-${index}`}
                  file={file}
                  onRemove={() => setSelectedFiles((current) => current.filter((item) => item !== file))}
                />
              ))}
            </div>
          )}
          <textarea
            ref={textareaRef}
            rows={1}
            value={text}
            disabled={!url}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={onComposerKeyDown}
            placeholder={t("ecrireMessage")}
            className="block w-full resize-none bg-transparent px-3 pb-1 pt-2.5 text-base leading-relaxed text-[#17221f] outline-none placeholder:text-gray-400 sm:text-[15px]"
          />
          <div className="flex items-center justify-between px-2 pb-2">
            <input
              ref={fileInputRef}
              type="file"
              hidden
              multiple
              accept={ATTACHMENT_ACCEPT}
              onChange={onFilesChosen}
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={!url || selectedFiles.length >= MAX_MESSAGE_ATTACHMENT_COUNT}
              aria-label={t("joindreFichier")}
              title={
                selectedFiles.length >= MAX_MESSAGE_ATTACHMENT_COUNT
                  ? "Limite de 3 fichiers atteinte"
                  : t("joindreFichier")
              }
              className="grid h-8 w-8 place-items-center rounded-lg text-gray-500 hover:bg-gray-100 hover:text-brand disabled:cursor-not-allowed disabled:opacity-40"
            >
              <Paperclip size={18} />
            </button>
            <button
              type="button"
              onClick={() => void send()}
              disabled={!canSend}
              aria-label={t("envoyerMessage")}
              title={t("envoyerMessage")}
              className={cn(
                "grid h-8 w-9 place-items-center rounded-lg transition-colors",
                canSend ? "bg-brand text-lime hover:bg-brand-light" : "bg-gray-100 text-gray-400",
              )}
            >
              {sending ? <Spinner className="h-4 w-4" /> : <Send size={16} className="rtl:-scale-x-100" />}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

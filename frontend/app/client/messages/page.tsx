"use client";

import { ExternalLink, FileText, Paperclip, Send, Trash2 } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { ClientShell } from "@/components/ClientShell";
import { Button, Input, Spinner } from "@/components/ui";
import { api, getToken } from "@/lib/api";
import { useI18n } from "@/lib/i18n-context";
import { ChatMessage } from "@/lib/types";
import { cn, formatDateTime } from "@/lib/utils";

const ATTACHMENT_ACCEPT = ".pdf,image/png,image/jpeg,image/webp,.doc,.docx,.xls,.xlsx";
const MAX_MESSAGE_ATTACHMENT_BYTES = 10 * 1024 * 1024;

function validateAttachmentFile(file: File | null): string | null {
  if (!file) return null;
  if (file.size > MAX_MESSAGE_ATTACHMENT_BYTES) {
    return "Le fichier dépasse la taille maximale de 10 Mo.";
  }
  const allowedExtensions = [".pdf", ".png", ".jpg", ".jpeg", ".webp", ".doc", ".docx", ".xls", ".xlsx"];
  const fileName = file.name.toLowerCase();
  const isAllowed = allowedExtensions.some((extension) => fileName.endsWith(extension));
  if (!isAllowed) {
    return "Format non supporté. Utilisez un PDF, PNG, JPG, WEBP, DOC, DOCX, XLS ou XLSX.";
  }
  return null;
}

function isImageAttachment(filename: string, contentType: string) {
  return contentType.startsWith("image/") || /\.(png|jpe?g|webp)$/i.test(filename);
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

export default function ClientMessagesPage() {
  const { t } = useI18n();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [attachmentPreviewUrls, setAttachmentPreviewUrls] = useState<Record<number, string>>({});
  const [previewAttachment, setPreviewAttachment] = useState<
    { id: number; filename: string; content_type: string; open_url: string } | null
  >(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  const openAttachment = useCallback(async (attachment: { id: number; open_url: string; filename: string; content_type: string }) => {
    const url = attachment.open_url || "";
    if (!url) return;
    setPreviewAttachment(attachment);
    setPreviewLoading(true);
    setPreviewUrl(null);
    const token = getToken();
    try {
      const response = await fetch(url, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!response.ok) {
        throw new Error("Impossible d'ouvrir la pièce jointe.");
      }
      const blob = await response.blob();
      const objectUrl = URL.createObjectURL(blob);
      setPreviewUrl(objectUrl);
    } catch {
      setError("Impossible d'ouvrir la pièce jointe. Veuillez réessayer.");
    } finally {
      setPreviewLoading(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    const imageAttachments = messages.flatMap((message) =>
      message.attachments.filter((attachment) =>
        isImageAttachment(attachment.filename, attachment.content_type)
      )
    );

    const nextUrls: Record<number, string> = { ...attachmentPreviewUrls };

    async function loadPreviews() {
      for (const attachment of imageAttachments) {
        if (nextUrls[attachment.id]) continue;
        try {
          const token = getToken();
          const response = await fetch(attachment.open_url, {
            headers: token ? { Authorization: `Bearer ${token}` } : {},
          });
          if (!response.ok) continue;
          const blob = await response.blob();
          const objectUrl = URL.createObjectURL(blob);
          if (!cancelled) {
            nextUrls[attachment.id] = objectUrl;
          }
        } catch {
          // Ignore preview failures; the open action still works when the user clicks the file.
        }
      }

      if (!cancelled) {
        setAttachmentPreviewUrls(nextUrls);
      }
    }

    loadPreviews();

    return () => {
      cancelled = true;
      for (const url of Object.values(nextUrls)) {
        URL.revokeObjectURL(url);
      }
    };
  }, [messages]);

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
    if ((!text.trim() && !selectedFile) || sending) return;
    setError("");
    setSending(true);
    try {
      const form = new FormData();
      if (text.trim()) form.append("content", text.trim());
      if (selectedFile) form.append("file", selectedFile);
      const msg = await api.post<ChatMessage>("/api/messages/", form);
      setMessages((prev) => [...prev, msg]);
      setText("");
      setSelectedFile(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur lors de l'envoi du message");
    } finally {
      setSending(false);
    }
  }

  return (
    <>
      {previewAttachment && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/65 p-4 backdrop-blur-sm">
          <div className="relative w-full max-w-4xl rounded-2xl border border-white/10 bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-gray-200 px-4 py-3">
              <div className="truncate text-sm font-semibold text-gray-800">{previewAttachment.filename}</div>
              <button
                type="button"
                onClick={() => {
                  setPreviewAttachment(null);
                  setPreviewUrl(null);
                  setPreviewLoading(false);
                }}
                className="rounded-lg border border-gray-200 px-2 py-1 text-xs font-semibold text-gray-600 hover:text-gray-900"
              >
                Fermer
              </button>
            </div>
            <div className="flex min-h-[420px] items-center justify-center bg-gray-50 p-4">
              {previewLoading ? (
                <div className="flex items-center gap-2 text-sm text-gray-500"><Spinner className="h-5 w-5 text-brand" /> Chargement...</div>
              ) : previewUrl ? (
                isImageAttachment(previewAttachment.filename, previewAttachment.content_type) ? (
                  <img src={previewUrl} alt={previewAttachment.filename} className="max-h-[75vh] max-w-full rounded-xl object-contain" />
                ) : previewAttachment.content_type === "application/pdf" || /\.pdf$/i.test(previewAttachment.filename) ? (
                  <iframe src={previewUrl} title={previewAttachment.filename} className="h-[75vh] w-full rounded-xl border-0" />
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
      <ClientShell>
      <div className="mx-auto max-w-2xl">
        <h1 className="mb-4 text-xl font-semibold tracking-tight text-[#17221f]">{t("messages")}</h1>
        <div className="flex h-[calc(100vh-12rem)] min-h-[400px] flex-col overflow-hidden rounded-2xl border border-[#e5e9e6] bg-white shadow-[0_4px_18px_rgba(27,55,46,0.025)]">
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
                        ? "bg-[#214f40] text-white rounded-br-sm"
                        : "bg-white border border-[#e5e9e6] text-[#17221f] rounded-bl-sm"
                    )}
                  >
                    {m.content ? <p>{m.content}</p> : null}
                    {m.attachments.length > 0 && (
                      <div className={cn("mt-2 space-y-2", m.content ? "pt-2 border-t border-white/20" : "") }>
                        {m.attachments.map((attachment) => {
                          const isImage = isImageAttachment(attachment.filename, attachment.content_type);
                          return (
                            <div
                              key={attachment.id}
                              className={cn(
                                "overflow-hidden rounded-xl border",
                                m.is_mine ? "border-white/20 bg-white/10" : "border-[#e5e9e6] bg-gray-50"
                              )}
                            >
                              {isImage ? (
                                <button
                                  type="button"
                                  onClick={() => openAttachment(attachment)}
                                  className="block w-full bg-black/5"
                                >
                                  <img
                                    src={attachmentPreviewUrls[attachment.id] || ""}
                                    alt={attachment.filename}
                                    className="h-36 w-full object-cover"
                                  />
                                </button>
                              ) : (
                                <div className="flex items-center gap-2 px-2.5 py-2">
                                  <div
                                    className={cn(
                                      "flex h-8 w-8 items-center justify-center rounded-lg",
                                      m.is_mine ? "bg-white/10 text-white" : "bg-white text-brand"
                                    )}
                                  >
                                    <FileText size={14} />
                                  </div>
                                  <button
                                    type="button"
                                    onClick={() => openAttachment(attachment)}
                                    className={cn(
                                      "max-w-full truncate text-left text-xs font-semibold underline-offset-2 hover:underline",
                                      m.is_mine ? "text-white" : "text-brand"
                                    )}
                                  >
                                    {attachment.filename}
                                  </button>
                                </div>
                              )}
                              <div className="flex items-center justify-between gap-2 px-2.5 py-2">
                                {!isImage && (
                                  <span className={cn("text-[10px]", m.is_mine ? "text-white/70" : "text-gray-500")}>
                                    {formatFileSize(attachment.size)}
                                  </span>
                                )}
                                <button
                                  type="button"
                                  className={cn("inline-flex items-center gap-1 text-[10px] font-semibold", m.is_mine ? "text-white/80 hover:text-white" : "text-brand hover:text-brand-dark")}
                                  onClick={() => openAttachment(attachment)}
                                >
                                  <ExternalLink size={12} />
                                  Ouvrir
                                </button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
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
          <div className="border-t bg-white p-3">
            {selectedFile && (
              <div className="mb-2 flex items-center justify-between gap-2 rounded-xl border border-[#e5e9e6] bg-gray-50 px-3 py-2 text-[11px] text-[#17221f]">
                <div className="min-w-0">
                  <div className="truncate font-semibold text-brand">{selectedFile.name}</div>
                  <div className="text-gray-500">{formatFileSize(selectedFile.size)}</div>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setSelectedFile(null);
                    if (fileInputRef.current) fileInputRef.current.value = "";
                  }}
                  className="inline-flex h-7 w-7 items-center justify-center rounded-lg border border-[#e5e9e6] bg-white text-gray-500 hover:text-rose-600"
                  aria-label="Supprimer la pièce jointe"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            )}
            <div className="flex gap-2">
              <input
                ref={fileInputRef}
                type="file"
                hidden
                accept={ATTACHMENT_ACCEPT}
                onChange={(event) => {
                  const file = event.target.files?.[0] ?? null;
                  const validationError = validateAttachmentFile(file);
                  if (validationError) {
                    setError(validationError);
                    setSelectedFile(null);
                    event.target.value = "";
                    return;
                  }
                  setError("");
                  setSelectedFile(file);
                  event.target.value = "";
                }}
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => fileInputRef.current?.click()}
                aria-label="Ajouter un fichier"
                title="Ajouter un fichier"
                className="shrink-0 border-dashed border-[#dfe5e1] bg-white p-2.5 text-brand"
              >
                <Paperclip size={15} />
              </Button>
              <Input
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder={t("ecrireMessage")}
                onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && send()}
                className="flex-1"
              />
              <Button onClick={send} disabled={(!text.trim() && !selectedFile) || sending}>
                {sending ? <Spinner className="h-4 w-4 text-brand" /> : <Send size={16} />}
              </Button>
            </div>
          </div>
        </div>
      </div>
    </ClientShell>
    </>
  );
}

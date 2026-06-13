"use client";

import { Check, ChevronDown, Globe } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Lang } from "@/lib/i18n";
import { useI18n } from "@/lib/i18n-context";
import { cn } from "@/lib/utils";

const LANGS: { code: Lang; label: string }[] = [
  { code: "fr", label: "Français" },
  { code: "ar", label: "العربية" },
];

/** Language switcher rendered as a dropdown list.
 * `compact` shows only the globe icon (for the narrow client rail). */
export function LanguageToggle({
  className,
  compact = false,
}: {
  className?: string;
  compact?: boolean;
}) {
  const { lang, setLang } = useI18n();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  const current = LANGS.find((l) => l.code === lang)!;

  return (
    <div ref={ref} className={cn("relative", className)}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label="Langue"
        className={cn(
          "flex items-center gap-2 rounded-lg border border-current/30 text-sm",
          compact ? "justify-center p-3" : "w-full justify-between px-3 py-2"
        )}
      >
        {compact ? (
          <Globe size={20} />
        ) : (
          <>
            <span className="flex items-center gap-2">
              <Globe size={16} /> {current.label}
            </span>
            <ChevronDown
              size={16}
              className={cn("transition-transform", open && "rotate-180")}
            />
          </>
        )}
      </button>

      {open && (
        <div
          className={cn(
            "absolute bottom-full z-50 mb-1 min-w-[150px] overflow-hidden rounded-lg border border-gray-200 bg-white text-gray-900 shadow-lg",
            compact ? "left-0" : "left-0 w-full"
          )}
        >
          {LANGS.map((l) => (
            <button
              key={l.code}
              type="button"
              onClick={() => {
                setLang(l.code);
                setOpen(false);
              }}
              className={cn(
                "flex w-full items-center justify-between px-3 py-2 text-sm hover:bg-gray-100",
                l.code === lang && "font-semibold"
              )}
            >
              {l.label}
              {l.code === lang && <Check size={14} />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

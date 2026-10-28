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
  plain = false,
}: {
  className?: string;
  compact?: boolean;
  /** Text only, without the bordered box. Used by the landing header. */
  plain?: boolean;
}) {
  const { lang, setLang } = useI18n();
  const [open, setOpen] = useState(false);
  const [dropUp, setDropUp] = useState(false);
  const [alignRight, setAlignRight] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  function placeMenu() {
    const box = ref.current?.getBoundingClientRect();
    if (!box) return;
    const menuWidth = 160;
    const menuHeight = 96;
    const roomBelow = window.innerHeight - box.bottom;
    const roomRight = window.innerWidth - box.left;
    setDropUp(roomBelow < menuHeight && box.top > roomBelow);
    setAlignRight(roomRight < menuWidth && box.right > roomRight);
  }

  const current = LANGS.find((l) => l.code === lang)!;

  return (
    <div ref={ref} className={cn("relative text-current", open && "z-50", className)}>
      <button
        type="button"
        onClick={() => {
          if (!open) placeMenu();
          setOpen((current) => !current);
        }}
        aria-label="Langue"
        className={cn(
          "flex items-center gap-2 text-sm",
          plain
            ? "bg-transparent px-1 py-1"
            : "rounded-lg border border-current/40",
          compact
            ? "justify-center p-3"
            : plain
              ? ""
              : "w-full justify-between px-3 py-2"
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
            "absolute z-50 min-w-[150px] overflow-hidden rounded-lg border border-gray-200 bg-white text-gray-900 shadow-lg",
            dropUp ? "bottom-full mb-1" : "top-full mt-1",
            alignRight ? "right-0" : "left-0",
            !compact && "w-full"
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

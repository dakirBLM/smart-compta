import { cn } from "@/lib/utils";

/** Small count shown on a navigation icon. Renders nothing when there is nothing waiting. */
export function UnreadBadge({ count, className }: { count: number; className?: string }) {
  if (count <= 0) return null;
  return (
    <span
      aria-label={`${count} non lu${count > 1 ? "s" : ""}`}
      className={cn(
        "pointer-events-none absolute -right-2 -top-1.5 grid min-h-[16px] min-w-[16px] place-items-center rounded-full bg-brand px-1 text-[9px] font-bold leading-none text-lime ring-2 ring-[#fbfcfb]",
        className
      )}
    >
      {count > 99 ? "99+" : count}
    </span>
  );
}

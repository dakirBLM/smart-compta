import { cn } from "@/lib/utils";

/** Same wordmark as the landing page header. */
export function BrandLogo({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-baseline gap-1.5 whitespace-nowrap font-['Poppins',sans-serif] text-[#171c1a]",
        className
      )}
    >
      <span className="text-[22px] font-semibold tracking-tight">Comptia</span>
      <span className="rounded-md bg-[#d7ef6a] px-1.5 py-0.5 text-[10px] font-bold text-[#173c32]">DZ</span>
    </span>
  );
}

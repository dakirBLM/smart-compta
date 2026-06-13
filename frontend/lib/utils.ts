import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Format a number as DZD: 1 234 567,00 DZD */
export function formatDZD(value: number | string | null | undefined): string {
  const n = Number(value ?? 0);
  const formatted = n
    .toLocaleString("fr-FR", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })
    .replace(/ | /g, " "); // normalize thin/no-break spaces
  return `${formatted} DZD`;
}

/** Format an ISO date (YYYY-MM-DD) as DD/MM/YYYY. */
export function formatDate(iso: string | null | undefined): string {
  if (!iso) return "";
  const [y, m, d] = iso.split("T")[0].split("-");
  if (!y || !m || !d) return iso;
  return `${d}/${m}/${y}`;
}

/** Convert DD/MM/YYYY -> YYYY-MM-DD for the API. */
export function toISODate(fr: string): string {
  if (!fr) return "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(fr)) return fr;
  const [d, m, y] = fr.split("/");
  if (!d || !m || !y) return fr;
  return `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
}

/** Total debit/credit helpers used to validate balance everywhere. */
export function sumLignes(lignes: { debit?: number; credit?: number }[]) {
  const debit = lignes.reduce((s, l) => s + Number(l.debit || 0), 0);
  const credit = lignes.reduce((s, l) => s + Number(l.credit || 0), 0);
  return { debit, credit, balanced: Math.abs(debit - credit) < 0.01 };
}

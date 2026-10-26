import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

const rtf = new Intl.RelativeTimeFormat("en", { numeric: "auto" });
export function timeAgo(date: Date | string | null | undefined): string {
  if (!date) return "Never";
  const d = typeof date === "string" ? new Date(date) : date;
  const diff = (d.getTime() - Date.now()) / 1000;
  const abs = Math.abs(diff);
  if (abs < 60) return rtf.format(Math.round(diff), "second");
  if (abs < 3600) return rtf.format(Math.round(diff / 60), "minute");
  if (abs < 86400) return rtf.format(Math.round(diff / 3600), "hour");
  if (abs < 86400 * 30) return rtf.format(Math.round(diff / 86400), "day");
  return formatDate(d);
}

export function formatDate(date: Date | string | null | undefined, withTime = false): string {
  if (!date) return "—";
  const d = typeof date === "string" ? new Date(date) : date;
  return new Intl.DateTimeFormat("en-GB", withTime ? { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" } : { dateStyle: "medium", timeZone: "UTC" }).format(d) + (withTime ? " UTC" : "");
}

export function hostname(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

export const CATEGORY_META: Record<string, { label: string; tone: "green" | "blue" | "violet" | "amber" | "pink" | "slate" | "red" }> = {
  pricing: { label: "Pricing", tone: "green" },
  product: { label: "Product", tone: "blue" },
  features: { label: "Features", tone: "violet" },
  positioning: { label: "Positioning", tone: "amber" },
  announcement: { label: "Announcement", tone: "pink" },
  general: { label: "General update", tone: "slate" },
  unclassified: { label: "Needs review", tone: "red" },
};

export const PAGE_TYPE_LABEL: Record<string, string> = {
  homepage: "Homepage", pricing: "Pricing", features: "Features", product: "Product", blog: "Blog",
  changelog: "Changelog", announcements: "Announcements", other: "Other",
};

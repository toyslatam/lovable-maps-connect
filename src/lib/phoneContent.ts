import { Establishment } from "@/types/establishment";

export const PHONE_UNIT_OPTIONS = [
  "kg",
  "kilos",
  "bulto",
  "bultos",
  "lb",
  "libra",
  "libras",
  "arroba",
  "arrobas",
  "unidad",
  "otro",
] as const;

export interface PhoneContentEntry {
  totalValue: string;
  totalUnit: string;
  bakeryValue: string;
  bakeryUnit: string;
  pastryValue: string;
  pastryUnit: string;
  updatedAt: string;
}

const STORAGE_KEY = "srq_phone_content_v1";

export function getEstablishmentKey(e: Establishment): string {
  return [e.recordDate, e.listaNombre, e.name, e.address, e.city].join("||");
}

export function loadPhoneContentMap(): Record<string, PhoneContentEntry> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, PhoneContentEntry>;
    return parsed || {};
  } catch {
    return {};
  }
}

export function savePhoneContentMap(map: Record<string, PhoneContentEntry>) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(map));
}

function toNumber(value: string): number | null {
  const m = value.match(/-?\d+(?:[.,]\d+)?/);
  if (!m) return null;
  return Number(m[0].replace(",", "."));
}

function unitToKgFactor(unit: string): number {
  const u = unit.toLowerCase();
  if (u.includes("kg") || u.includes("kilo")) return 0.08 * 12.5;
  if (u.includes("bulto")) return 4 * 12.5;
  if (u.includes("lb") || u.includes("libra")) return 0.0363 * 12.5;
  if (u.includes("arroba")) return 12.5;
  return 12.5;
}

export function phoneTextToKg(value: string, unit: string): number | null {
  const n = toNumber(value);
  if (n === null) return null;
  return n * unitToKgFactor(unit);
}

export function sheetTextToKg(text: string): number | null {
  const s = (text || "").toLowerCase();
  const n = toNumber(s);
  if (n === null) return null;
  if (s.includes("kg") || s.includes("kilo")) return n * (0.08 * 12.5);
  if (s.includes("bulto")) return n * (4 * 12.5);
  if (s.includes("lb") || s.includes("libra")) return n * (0.0363 * 12.5);
  if (s.includes("arroba")) return n * 12.5;
  return n * 12.5;
}


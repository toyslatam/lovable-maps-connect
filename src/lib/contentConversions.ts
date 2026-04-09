/** Factores a kg equivalente (harina), alineados con la hoja de cálculo. */
export function flourUnitToKgFactor(unitKey: string): number {
  const u = (unitKey || "").toLowerCase();
  if (u === "kg" || u.includes("kilo")) return 0.08 * 12.5;
  if (u.includes("bulto")) return 4 * 12.5;
  if (u === "lb" || u === "lbs") return 0.0363 * 125;
  if (u.includes("libra")) return 0.0363 * 12.5;
  if (u.includes("arroba")) return 12.5;
  return 12.5;
}

export const FLOUR_UNIT_OPTIONS = [
  { value: "kg", label: "kg" },
  { value: "bultos", label: "Bultos" },
  { value: "lb", label: "lb" },
  { value: "libra", label: "Libra" },
  { value: "arroba", label: "Arroba" },
] as const;

export type QuantityCardParseStatus = "ok" | "sin dato" | "formato ambiguo";

export function extractFirstNumber(text: string): number | null {
  const m = (text || "").trim().match(/-?\d+(?:[.,]\d+)?/);
  if (!m) return null;
  return Number(m[0].replace(",", "."));
}

/** Interpreta texto legacy de la hoja + unidad elegida en UI. */
export function parseFlourQuantity(
  rawText: string,
  unitSelected: string,
  sheetFallbackUnit?: string,
): { kg: number | null; status: QuantityCardParseStatus } {
  if (!String(rawText || "").trim()) return { kg: null, status: "sin dato" };
  if (String(rawText).includes("/")) return { kg: null, status: "formato ambiguo" };
  const qty = extractFirstNumber(rawText);
  if (qty === null) return { kg: null, status: "sin dato" };
  const u = (unitSelected || "").toLowerCase();
  const factor = flourUnitToKgFactor(u);
  return { kg: qty * factor, status: "ok" };
}

export function buildFlourSheetCell(numStr: string, unitKey: string): string {
  const n = String(numStr || "").trim();
  if (!n) return "";
  const u = unitKey || "kg";
  return `${n} ${u}`.trim();
}

/** Adivina unidad desde texto de celda existente. */
export function guessUnitFromText(raw: string): string {
  const s = (raw || "").toLowerCase();
  if (s.includes("bulto")) return "bultos";
  if (s.includes("arroba")) return "arroba";
  if (s.includes("libra")) return "libra";
  if (s.includes("lb")) return "lb";
  if (s.includes("kg") || s.includes("kilo")) return "kg";
  return "kg";
}

export function parseInitialNumAndUnit(
  rawText: string,
  sheetUnitBE?: string,
): { num: string; unit: string } {
  const num = extractFirstNumber(rawText);
  const numStr = num !== null ? String(num) : "";
  const unitFromCell = guessUnitFromText(rawText);
  const be = (sheetUnitBE || "").trim().toLowerCase();
  const unit =
    be && guessUnitFromText(be) !== "kg"
      ? guessUnitFromText(be)
      : unitFromCell;
  return { num: numStr, unit };
}

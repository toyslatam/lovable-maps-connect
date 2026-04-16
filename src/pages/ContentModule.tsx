import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { ContentAdvancedFilters } from "@/components/content/ContentAdvancedFilters";
import { ContentFilterBar } from "@/components/content/ContentFilterBar";
import { loadContentFilters, saveContentFilters } from "@/lib/contentModuleFilterStorage";
import { useData } from "@/context/DataContext";
import { Establishment } from "@/types/establishment";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Image as ImageIcon } from "lucide-react";
import { toast } from "sonner";
import { getEstablishmentKey, loadPhoneContentMap, phoneTextToKg } from "@/lib/phoneContent";
import { PHONE_STATUS_OPTIONS } from "@/lib/statusOptions";
import { invokeGoogleSheets } from "@/lib/invokeGoogleSheets";
import { buildFlourSheetCell, flourUnitToKgFactor, parseFlourQuantity, parseInitialNumAndUnit } from "@/lib/contentConversions";
import { HeaderContenido, inferBusinessKind } from "@/components/content/HeaderContenido";
import { CantidadesCard } from "@/components/content/CantidadesCard";
import type { LineStatus } from "@/components/content/CantidadesCard";
import { LevadurasGrid } from "@/components/content/LevadurasGrid";
import { GlobalOutcomeBadge, ValidationPanel } from "@/components/content/ValidationPanel";
import { ContentModalErrorBoundary } from "@/components/content/ContentModalErrorBoundary";

const CONTENT_STATUS_OPTIONS = PHONE_STATUS_OPTIONS;

function getSurveyor(row: Establishment): string {
  return (row.listaNombre || row.contactName || row.localizedBy || "Sin encuestador").trim();
}

function toNumber(value: string): number | null {
  const m = value.match(/-?\d+(?:[.,]\d+)?/);
  if (!m) return null;
  return Number(m[0].replace(",", "."));
}

type ParseStatus = "ok" | "sin dato" | "formato ambiguo";
type ParsedQuantity = { kg: number | null; status: ParseStatus };

function toKgByUnit(qty: number, unitText: string): number {
  const u = (unitText || "").toLowerCase();
  if (u.includes("kg") || u.includes("kilo")) return qty * (0.08 * 12.5);
  if (u.includes("bulto")) return qty * (4 * 12.5);
  if (u.includes("lb")) return qty * (0.0363 * 125);
  if (u.includes("libra")) return qty * (0.0363 * 12.5);
  if (u.includes("arroba")) return qty * 12.5;
  return qty * 12.5;
}

function parseQuantityToKg(text: string, fallbackUnit?: string): ParsedQuantity {
  const s = (text || "").toLowerCase().trim();
  const fb = (fallbackUnit || "").toLowerCase().trim();
  if (!s) return { kg: null, status: "sin dato" };
  if (s.includes("/")) return { kg: null, status: "formato ambiguo" };
  const qty = toNumber(s);
  if (qty === null) return { kg: null, status: "sin dato" };
  const mergedUnit = `${s} ${fb}`.trim();
  return { kg: toKgByUnit(qty, mergedUnit), status: "ok" };
}

function getDbStatus(row: Establishment): "Cumple" | "Falla" | "Sin dato" {
  const raw = (row.dbStatus || "").trim().toLowerCase();
  if (raw === "cumple") return "Cumple";
  if (raw === "falla") return "Falla";
  const cd = toNumber(row.flourKgStandardText) ?? parseQuantityToKg(row.flourTotalText, row.flourUnitBE).kg;
  const cg = toNumber(row.controlCGText);
  if (!cd || cg === null) return "Sin dato";
  return cg / cd < 0.15 ? "Cumple" : "Falla";
}

function getDcStatus(row: Establishment): "Cumple" | "Falla" | "Sin dato" {
  const raw = (row.dcStatus || "").trim().toLowerCase();
  if (raw === "cumple") return "Cumple";
  if (raw === "falla") return "Falla";
  const cg = toNumber(row.controlCGText);
  const ch = toNumber(row.controlCHText);
  if (cg === null && ch === null) return "Sin dato";
  return (cg !== null && cg > 19500) || (ch !== null && ch > 19500) ? "Falla" : "Cumple";
}

function getYeastQualityStatus(args: {
  flourKg: number | null;
  yeastTotalKg: number;
  productionType: "panaderia" | "pasteleria" | "mixto";
  businessTypeText?: string;
}): "Cumple" | "No cumple" | "No aplica" | "Sin dato" {
  if (inferBusinessKind(args.businessTypeText || "") === "pasteleria") return "No aplica";
  if (args.productionType === "pasteleria") return "No aplica";
  if (args.flourKg === null || args.flourKg <= 0) return "Sin dato";
  const ratio = args.yeastTotalKg / args.flourKg;
  if (!Number.isFinite(ratio)) return "Sin dato";
  return ratio < 0.005 || ratio > 0.05 ? "No cumple" : "Cumple";
}

function getYeastPriceStatus(prices: Array<number | null>): "Cumple" | "Falla" | "Sin dato" {
  const ps = prices.filter((p): p is number => p !== null && Number.isFinite(p));
  if (ps.length === 0) return "Sin dato";
  return ps.some((p) => p > 19500) ? "Falla" : "Cumple";
}

function getRule1Status(flourTotalText: string, bakeryQtyText: string, pastryQtyText: string, fallbackUnit?: string): "Correcta" | "Falla" | "Sin dato" {
  const m = parseQuantityToKg(flourTotalText, fallbackUnit).kg;
  const n = parseQuantityToKg(bakeryQtyText, fallbackUnit).kg;
  const o = parseQuantityToKg(pastryQtyText, fallbackUnit).kg;
  if (m === null || n === null || o === null) return "Sin dato";
  return Math.abs(m - (n + o)) <= 0.001 ? "Correcta" : "Falla";
}

function getPhotoCandidates(rawUrl: string): string[] {
  const url = (rawUrl || "").trim();
  if (!url) return [];
  const m = url.match(/\/file\/d\/([^/]+)/i) || url.match(/[?&]id=([^&]+)/i);
  const id = m?.[1];
  if (!id) return [url];
  return [
    `https://drive.google.com/thumbnail?id=${id}&sz=w1200`,
    `https://drive.google.com/uc?export=view&id=${id}`,
    url,
  ];
}

function showValue(value: string): string {
  const v = (value || "").trim();
  return v || "Sin dato";
}

function normalizeText(s: string): string {
  return (s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeDateOnly(value: string): string {
  const s = (value || "").trim();
  if (!s) return "";
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/);
  if (m) {
    const d = Number(m[1]);
    const mo = Number(m[2]);
    const y = m[3];
    if (d >= 1 && d <= 31 && mo >= 1 && mo <= 12) {
      return `${y}-${String(mo).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    }
  }
  const t = Date.parse(s);
  if (Number.isNaN(t)) return "";
  const d = new Date(t);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function parseYeastText(text: string): { quantity: number | null; price: number | null; unitHint: string } {
  const raw = (text || "").toLowerCase();
  const qMatch = raw.match(/cantidad\s*semanal\s*:\s*([0-9]+(?:[.,][0-9]+)?)/i);
  const pMatch = raw.match(/precio\s*de\s*compra\s*:\s*([0-9]+(?:[.,][0-9]+)?)/i);

  const quantity = qMatch ? Number(qMatch[1].replace(",", ".")) : toNumber(raw);
  const price = pMatch ? Number(pMatch[1].replace(",", ".")) : null;

  let unitHint = "";
  if (raw.includes("kg") || raw.includes("kilo")) unitHint = "kg";
  else if (raw.includes("lb") || raw.includes("libra")) unitHint = "lb";
  else if (raw.includes("g") && !raw.includes("kg")) unitHint = "g";

  return {
    quantity: Number.isFinite(quantity as number) ? (quantity as number) : null,
    price: Number.isFinite(price as number) ? (price as number) : null,
    unitHint,
  };
}

function lineStatusForCard(
  which: "flour" | "bakery" | "pastry",
  parseStatus: ParseStatus,
  rule1: ReturnType<typeof getRule1Status>,
): LineStatus {
  if (parseStatus === "formato ambiguo") return "warn";
  if (parseStatus === "sin dato") return "warn";
  if (rule1 === "Sin dato") return "warn";
  if (rule1 === "Correcta") return "ok";
  if (which === "flour") return "error";
  return "warn";
}

function computeGlobalOutcome(args: {
  rule1: ReturnType<typeof getRule1Status>;
  yeastQ: ReturnType<typeof getYeastQualityStatus>;
  yeastP: ReturnType<typeof getYeastPriceStatus>;
  db: ReturnType<typeof getDbStatus>;
  dc: ReturnType<typeof getDcStatus>;
  phoneCmp: string;
}): "cumple" | "revisar" | "no_cumple" {
  if (args.yeastQ === "No cumple" || args.yeastP === "Falla" || args.rule1 === "Falla" || args.db === "Falla" || args.dc === "Falla") {
    return "no_cumple";
  }
  if (args.phoneCmp === "No coincide") return "revisar";
  if (args.yeastQ === "Sin dato" || args.rule1 === "Sin dato" || args.db === "Sin dato" || args.dc === "Sin dato" || args.yeastP === "Sin dato") {
    return "revisar";
  }
  if (args.yeastQ === "No aplica") {
    if (args.rule1 === "Correcta" && args.yeastP === "Cumple" && args.db === "Cumple" && args.dc === "Cumple") return "cumple";
    return "revisar";
  }
  if (args.rule1 === "Correcta" && args.yeastQ === "Cumple" && args.yeastP === "Cumple" && args.db === "Cumple" && args.dc === "Cumple") {
    return "cumple";
  }
  return "revisar";
}

function stableContentKey(e: Establishment): string {
  return JSON.stringify({
    flourTotalText: e.flourTotalText,
    bakeryQtyText: e.bakeryQtyText,
    pastryQtyText: e.pastryQtyText,
    contentStatus: e.contentStatus,
    levapanText: e.levapanText,
    fleischmanText: e.fleischmanText,
    levasafText: e.levasafText,
    otherYeastText: e.otherYeastText,
    yeastAngelText: e.yeastAngelText,
    yeastPanificadorText: e.yeastPanificadorText,
    yeastFermipanText: e.yeastFermipanText,
    yeastGloripanText: e.yeastGloripanText,
    yeastInstafermText: e.yeastInstafermText,
    yeastInstantSuccText: e.yeastInstantSuccText,
    yeastMauripanText: e.yeastMauripanText,
    yeastSafInstantText: e.yeastSafInstantText,
    yeastSantillanaText: e.yeastSantillanaText,
    yeastOtherDryText: e.yeastOtherDryText,
  });
}

/** Solo cantidades + levaduras (sincroniza con `updateContentFields`). */
function stableQtyYeastKey(patch: {
  flourTotalText: string;
  bakeryQtyText: string;
  pastryQtyText: string;
  levapanText: string;
  fleischmanText: string;
  levasafText: string;
  otherYeastText: string;
  yeastAngelText: string;
  yeastPanificadorText: string;
  yeastFermipanText: string;
  yeastGloripanText: string;
  yeastInstafermText: string;
  yeastInstantSuccText: string;
  yeastMauripanText: string;
  yeastSafInstantText: string;
  yeastSantillanaText: string;
  yeastOtherDryText: string;
}): string {
  const t = (s: string) => (s || "").trim();
  return JSON.stringify({
    flourTotalText: t(patch.flourTotalText),
    bakeryQtyText: t(patch.bakeryQtyText),
    pastryQtyText: t(patch.pastryQtyText),
    levapanText: t(patch.levapanText),
    fleischmanText: t(patch.fleischmanText),
    levasafText: t(patch.levasafText),
    otherYeastText: t(patch.otherYeastText),
    yeastAngelText: t(patch.yeastAngelText),
    yeastPanificadorText: t(patch.yeastPanificadorText),
    yeastFermipanText: t(patch.yeastFermipanText),
    yeastGloripanText: t(patch.yeastGloripanText),
    yeastInstafermText: t(patch.yeastInstafermText),
    yeastInstantSuccText: t(patch.yeastInstantSuccText),
    yeastMauripanText: t(patch.yeastMauripanText),
    yeastSafInstantText: t(patch.yeastSafInstantText),
    yeastSantillanaText: t(patch.yeastSantillanaText),
    yeastOtherDryText: t(patch.yeastOtherDryText),
  });
}

function toKgFromYeastText(text: string): number | null {
  const parsed = parseYeastText(text);
  const n = parsed.quantity;
  if (n === null) return null;
  if (parsed.unitHint === "kg") return n;
  if (parsed.unitHint === "lb") return n * 0.453592;
  if (parsed.unitHint === "g") return n / 1000;
  return n;
}

export default function ContentModule() {
  const { establishments, updateEstablishment, fetchSheetPreview, connectedSheetId, connectedSheetTab } = useData();
  const [selectedSurveyors, setSelectedSurveyors] = useState<string[]>(
    () => loadContentFilters()?.selectedSurveyors ?? [],
  );
  const [establishmentInput, setEstablishmentInput] = useState(
    () => loadContentFilters()?.establishmentSearch ?? "",
  );
  const debouncedEstablishment = useDebouncedValue(establishmentInput, 280);
  const [brStateFilter, setBrStateFilter] = useState(
    () => loadContentFilters()?.brStateFilter ?? "__all__",
  );
  const [phoneStateFilter, setPhoneStateFilter] = useState(
    () => loadContentFilters()?.phoneStateFilter ?? "__all__",
  );
  const [dateFrom, setDateFrom] = useState(() => loadContentFilters()?.dateFrom ?? "");
  const [dateTo, setDateTo] = useState(() => loadContentFilters()?.dateTo ?? "");
  const [advSection, setAdvSection] = useState<"" | "advanced">(
    () => (loadContentFilters()?.advancedAccordionOpen ? "advanced" : ""),
  );
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [photoIdx, setPhotoIdx] = useState(0);
  const [contentStatus, setContentStatus] = useState("");
  const [flourNum, setFlourNum] = useState("");
  const [flourUnit, setFlourUnit] = useState("kg");
  const [bakeryNum, setBakeryNum] = useState("");
  const [bakeryUnit, setBakeryUnit] = useState("kg");
  const [pastryNum, setPastryNum] = useState("");
  const [pastryUnit, setPastryUnit] = useState("kg");
  const [levapanText, setLevapanText] = useState("");
  const [fleischmanText, setFleischmanText] = useState("");
  const [levasafText, setLevasafText] = useState("");
  const [otherYeastText, setOtherYeastText] = useState("");
  const [yeastAngelText, setYeastAngelText] = useState("");
  const [yeastPanificadorText, setYeastPanificadorText] = useState("");
  const [yeastFermipanText, setYeastFermipanText] = useState("");
  const [yeastGloripanText, setYeastGloripanText] = useState("");
  const [yeastInstafermText, setYeastInstafermText] = useState("");
  const [yeastInstantSuccText, setYeastInstantSuccText] = useState("");
  const [yeastMauripanText, setYeastMauripanText] = useState("");
  const [yeastSafInstantText, setYeastSafInstantText] = useState("");
  const [yeastSantillanaText, setYeastSantillanaText] = useState("");
  const [yeastOtherDryText, setYeastOtherDryText] = useState("");
  const [savingContentStatus, setSavingContentStatus] = useState(false);
  const [sheetSyncState, setSheetSyncState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const lastQtyYeastSavedRef = useRef<string>("");
  const autosaveRowIdRef = useRef<string | null>(null);
  const [photoZoomOpen, setPhotoZoomOpen] = useState(false);
  const [phoneMap, setPhoneMap] = useState(() => loadPhoneContentMap());

  const flourTotalText = useMemo(() => buildFlourSheetCell(flourNum, flourUnit), [flourNum, flourUnit]);
  const bakeryQtyText = useMemo(() => buildFlourSheetCell(bakeryNum, bakeryUnit), [bakeryNum, bakeryUnit]);
  const pastryQtyText = useMemo(() => buildFlourSheetCell(pastryNum, pastryUnit), [pastryNum, pastryUnit]);

  const surveyors = useMemo(() => {
    const set = new Set<string>();
    establishments.forEach((r) => set.add(getSurveyor(r)));
    return Array.from(set).filter(Boolean).sort((a, b) => a.localeCompare(b, "es"));
  }, [establishments]);

  const brStates = useMemo(() => {
    // Lista "oficial" (como la del desplegable) + extras detectados en la hoja.
    const official = [...PHONE_STATUS_OPTIONS];
    const officialNorm = new Set(official.map((s) => normalizeText(s)));

    const extras: string[] = [];
    const extrasNorm = new Set<string>();
    establishments.forEach((r) => {
      const raw = (r.contentStateBR || "").trim();
      if (!raw) return;
      const n = normalizeText(raw);
      if (!n) return;
      if (officialNorm.has(n)) return;
      if (extrasNorm.has(n)) return;
      extrasNorm.add(n);
      extras.push(raw);
    });

    extras.sort((a, b) => a.localeCompare(b, "es"));
    return [...official, ...extras];
  }, [establishments]);

  const phoneStates = useMemo(() => {
    const official = [...PHONE_STATUS_OPTIONS];
    const officialNorm = new Set(official.map((s) => normalizeText(s)));
    const extras: string[] = [];
    const extrasNorm = new Set<string>();
    establishments.forEach((r) => {
      const raw = (r.phoneStatus || "").trim();
      if (!raw) return;
      const n = normalizeText(raw);
      if (!n) return;
      if (officialNorm.has(n)) return;
      if (extrasNorm.has(n)) return;
      extrasNorm.add(n);
      extras.push(raw);
    });
    extras.sort((a, b) => a.localeCompare(b, "es"));
    return [...official, ...extras];
  }, [establishments]);

  const filteredRows = useMemo(() => {
    const q = debouncedEstablishment.trim().toLowerCase();
    return establishments.filter((r) => {
      if (selectedSurveyors.length > 0 && !selectedSurveyors.includes(getSurveyor(r))) return false;
      if (q && !(r.name || "").toLowerCase().includes(q)) return false;
      if (brStateFilter !== "__all__") {
        const rowState = normalizeText((r.contentStateBR || "").trim());
        if (brStateFilter === "__empty__") {
          if (rowState) return false;
        } else {
          const filterState = normalizeText(brStateFilter);
          if (rowState !== filterState) return false;
        }
      }
      if (phoneStateFilter !== "__all__") {
        const rowState = normalizeText((r.phoneStatus || "").trim());
        if (phoneStateFilter === "__empty__") {
          if (rowState) return false;
        } else {
          const filterState = normalizeText(phoneStateFilter);
          if (rowState !== filterState) return false;
        }
      }
      const d = normalizeDateOnly(r.recordDate);
      if (dateFrom && (!d || d < dateFrom)) return false;
      if (dateTo && (!d || d > dateTo)) return false;
      return true;
    });
  }, [establishments, selectedSurveyors, debouncedEstablishment, brStateFilter, phoneStateFilter, dateFrom, dateTo]);

  const activeFilterCount = useMemo(() => {
    let n = 0;
    if (selectedSurveyors.length > 0) n += 1;
    if (establishmentInput.trim()) n += 1;
    if (dateFrom) n += 1;
    if (dateTo) n += 1;
    if (brStateFilter !== "__all__") n += 1;
    if (phoneStateFilter !== "__all__") n += 1;
    return n;
  }, [selectedSurveyors.length, establishmentInput, dateFrom, dateTo, brStateFilter, phoneStateFilter]);

  const secondaryFiltersActiveCount = useMemo(() => {
    let n = 0;
    if (brStateFilter !== "__all__") n += 1;
    if (phoneStateFilter !== "__all__") n += 1;
    return n;
  }, [brStateFilter, phoneStateFilter]);

  useEffect(() => {
    saveContentFilters({
      selectedSurveyors,
      establishmentSearch: establishmentInput,
      dateFrom,
      dateTo,
      brStateFilter,
      phoneStateFilter,
      advancedAccordionOpen: advSection === "advanced",
    });
  }, [selectedSurveyors, establishmentInput, dateFrom, dateTo, brStateFilter, phoneStateFilter, advSection]);

  const grouped = useMemo(() => {
    const bySurveyor = new Map<string, Establishment[]>();
    filteredRows.forEach((r) => {
      const key = getSurveyor(r);
      const list = bySurveyor.get(key) || [];
      list.push(r);
      bySurveyor.set(key, list);
    });
    return Array.from(bySurveyor.entries())
      .sort(([a], [b]) => a.localeCompare(b, "es"))
      .map(([surveyor, rows]) => ({
        surveyor,
        rows: rows.sort((a, b) => (a.name || "").localeCompare(b.name || "", "es")),
      }));
  }, [filteredRows]);

  const patternMap = useMemo(() => {
    const map = new Map<string, number>();
    grouped.forEach((g) => {
      g.rows.forEach((r) => {
        const sig = `${g.surveyor}||${r.flourTotalText}||${r.bakeryQtyText}||${r.pastryQtyText}||${r.controlCGText}||${r.controlCHText}`;
        map.set(sig, (map.get(sig) || 0) + 1);
      });
    });
    return map;
  }, [grouped]);

  const selected = useMemo(() => {
    if (!selectedId) return null;
    return establishments.find((r) => r.id === selectedId) || null;
  }, [selectedId, establishments]);

  /** Radix Select exige que `value` exista en algún `SelectItem`; la hoja puede traer estados extra. */
  const headerContentStatusOptions = useMemo(() => {
    const seen = new Set<string>();
    const out: string[] = [];
    const add = (raw: string) => {
      const t = (raw || "").trim();
      // Evitar duplicar el ítem reservado del Select (Radix rompe con dos value="__empty__").
      if (!t || seen.has(t) || t === "__empty__") return;
      seen.add(t);
      out.push(t);
    };
    for (const s of CONTENT_STATUS_OPTIONS) add(s);
    add(contentStatus);
    add(selected?.contentStatus || "");
    return out;
  }, [contentStatus, selected?.contentStatus, selected?.id]);

  const phoneEntry = selected ? phoneMap[getEstablishmentKey(selected)] : undefined;

  const photoCandidates = useMemo(() => getPhotoCandidates(selected?.facadePhotoUrl || ""), [selected?.facadePhotoUrl]);
  const photoUrl = photoCandidates[photoIdx] || "";

  const selectedForRules = selected ? {
    ...selected,
    flourTotalText,
    bakeryQtyText,
    pastryQtyText,
    contentStatus,
  } : null;

  const phoneCompareStatus = selectedForRules ? (() => {
    const sheetTotal = parseQuantityToKg(selectedForRules.flourTotalText, selectedForRules.flourUnitBE).kg;
    const sheetBakery = parseQuantityToKg(selectedForRules.bakeryQtyText, selectedForRules.flourUnitBE).kg;
    const sheetPastry = parseQuantityToKg(selectedForRules.pastryQtyText, selectedForRules.flourUnitBE).kg;
    const phoneTotal = phoneTextToKg(phoneEntry?.totalValue || "", phoneEntry?.totalUnit || "kg");
    const phoneBakery = phoneTextToKg(phoneEntry?.bakeryValue || "", phoneEntry?.bakeryUnit || "kg");
    const phonePastry = phoneTextToKg(phoneEntry?.pastryValue || "", phoneEntry?.pastryUnit || "kg");
    const all = [[sheetTotal, phoneTotal], [sheetBakery, phoneBakery], [sheetPastry, phonePastry]];
    const comparable = all.every(([a, b]) => a !== null && b !== null);
    if (!comparable) return "Sin dato";
    const ok = all.every(([a, b]) => Math.abs((a as number) - (b as number)) <= (a as number) * 0.15 + 0.01);
    return ok ? "Coincide" : "No coincide";
  })() : "Sin dato";

  const flourCard = parseFlourQuantity(flourNum, flourUnit, selected?.flourUnitBE);
  const bakeryCard = parseFlourQuantity(bakeryNum, bakeryUnit, selected?.flourUnitBE);
  const pastryCard = parseFlourQuantity(pastryNum, pastryUnit, selected?.flourUnitBE);
  const flourKg = flourCard.kg ?? toNumber(selectedForRules?.flourKgStandardText || "");
  const bakeryKg = bakeryCard.kg;
  const pastryKg = pastryCard.kg;
  const productionType: "panaderia" | "pasteleria" | "mixto" = (() => {
    const hasBakery = (bakeryKg ?? 0) > 0;
    const hasPastry = (pastryKg ?? 0) > 0;
    if (hasBakery && hasPastry) return "mixto";
    if (hasBakery) return "panaderia";
    return "pasteleria";
  })();
  const levapanKg = toKgFromYeastText(levapanText) ?? 0;
  const fleischmanKg = toKgFromYeastText(fleischmanText) ?? 0;
  const levasafKg = toKgFromYeastText(levasafText) ?? 0;
  const otherYeastKg = toKgFromYeastText(otherYeastText) ?? 0;
  const yeastAngelKg = toKgFromYeastText(yeastAngelText) ?? 0;
  const yeastPanificadorKg = toKgFromYeastText(yeastPanificadorText) ?? 0;
  const yeastFermipanKg = toKgFromYeastText(yeastFermipanText) ?? 0;
  const yeastGloripanKg = toKgFromYeastText(yeastGloripanText) ?? 0;
  const yeastInstafermKg = toKgFromYeastText(yeastInstafermText) ?? 0;
  const yeastInstantSuccKg = toKgFromYeastText(yeastInstantSuccText) ?? 0;
  const yeastMauripanKg = toKgFromYeastText(yeastMauripanText) ?? 0;
  const yeastSafInstantKg = toKgFromYeastText(yeastSafInstantText) ?? 0;
  const yeastSantillanaKg = toKgFromYeastText(yeastSantillanaText) ?? 0;
  const yeastOtherDryKg = toKgFromYeastText(yeastOtherDryText) ?? 0;
  const levapanParsed = parseYeastText(levapanText);
  const fleischmanParsed = parseYeastText(fleischmanText);
  const levasafParsed = parseYeastText(levasafText);
  const otherYeastParsed = parseYeastText(otherYeastText);
  const yeastAngelParsed = parseYeastText(yeastAngelText);
  const yeastPanificadorParsed = parseYeastText(yeastPanificadorText);
  const yeastFermipanParsed = parseYeastText(yeastFermipanText);
  const yeastGloripanParsed = parseYeastText(yeastGloripanText);
  const yeastInstafermParsed = parseYeastText(yeastInstafermText);
  const yeastInstantSuccParsed = parseYeastText(yeastInstantSuccText);
  const yeastMauripanParsed = parseYeastText(yeastMauripanText);
  const yeastSafInstantParsed = parseYeastText(yeastSafInstantText);
  const yeastSantillanaParsed = parseYeastText(yeastSantillanaText);
  const yeastOtherDryParsed = parseYeastText(yeastOtherDryText);

  // Regla: "otras levaduras" se ponderan *3 (aplicado a Otras (fresca) y Otra Marca Seca).
  const yeastTotalKg = (
    levapanKg +
    fleischmanKg +
    levasafKg +
    (otherYeastKg * 3) +
    yeastAngelKg +
    yeastPanificadorKg +
    yeastFermipanKg +
    yeastGloripanKg +
    yeastInstafermKg +
    yeastInstantSuccKg +
    yeastMauripanKg +
    yeastSafInstantKg +
    yeastSantillanaKg +
    (yeastOtherDryKg * 3)
  );

  const yeastQualityStatus = getYeastQualityStatus({
    flourKg: flourKg ?? null,
    yeastTotalKg,
    productionType,
    businessTypeText: selected?.businessTypeText,
  });
  const yeastPriceStatus = getYeastPriceStatus([
    levapanParsed.price,
    fleischmanParsed.price,
    levasafParsed.price,
    otherYeastParsed.price,
    yeastAngelParsed.price,
    yeastPanificadorParsed.price,
    yeastFermipanParsed.price,
    yeastGloripanParsed.price,
    yeastInstafermParsed.price,
    yeastInstantSuccParsed.price,
    yeastMauripanParsed.price,
    yeastSafInstantParsed.price,
    yeastSantillanaParsed.price,
    yeastOtherDryParsed.price,
  ]);

  const rule1 = selectedForRules && selected
    ? getRule1Status(flourTotalText, bakeryQtyText, pastryQtyText, selected.flourUnitBE)
    : "Sin dato";
  const dbS = selectedForRules ? getDbStatus(selectedForRules) : "Sin dato";
  const dcS = selectedForRules ? getDcStatus(selectedForRules) : "Sin dato";
  const globalOutcome = selectedForRules && selected
    ? computeGlobalOutcome({
        rule1,
        yeastQ: yeastQualityStatus,
        yeastP: yeastPriceStatus,
        db: dbS,
        dc: dcS,
        phoneCmp: phoneCompareStatus,
      })
    : "revisar";
  const ratioDecimal = flourKg && flourKg > 0 ? yeastTotalKg / flourKg : null;
  const ratioRuleLabel =
    yeastQualityStatus === "No aplica"
      ? "No aplica (pastelería o tipo de negocio en columna H)."
      : "Rango permitido del ratio levadura ÷ harina: 0,005 – 0,050. Incluye ponderación ×3 en “otras” marcas.";

  const yeastQualityDetail =
    yeastQualityStatus === "No aplica"
      ? "Pastelería: no se evalúa el ratio harina/levadura."
      : yeastQualityStatus === "Cumple"
        ? `Cumple. Ratio ${ratioDecimal?.toFixed(4) ?? "—"}.`
        : yeastQualityStatus === "No cumple"
          ? `No cumple. Ratio ${ratioDecimal?.toFixed(4) ?? "—"} fuera de 0,005 – 0,050.`
          : `Sin dato suficiente. Ratio ${ratioDecimal?.toFixed(4) ?? "—"}.`;

  const priceDetail =
    yeastPriceStatus === "Cumple"
      ? "Ningún precio supera el umbral de control (19.500)."
      : yeastPriceStatus === "Falla"
        ? "Hay precios por encima del umbral (19.500)."
        : "Sin precios informados en las marcas.";

  const consistenciaDetail =
    rule1 === "Correcta"
      ? "La harina total es consistente con panadería + pastelería."
      : rule1 === "Falla"
        ? "La suma de panadería y pastelería no coincide con la harina total."
        : "Faltan datos o hay ambigüedad en cantidades.";

  const dbDetail = `DB estandarizado: ${dbS}. Controles CG/CH: ${dcS}.`;

  const yeastQualityOk = yeastQualityStatus === "Cumple";
  const yeastQualityWarn = yeastQualityStatus === "No aplica" || yeastQualityStatus === "Sin dato";
  const priceOk = yeastPriceStatus === "Cumple";
  const priceWarn = yeastPriceStatus === "Sin dato";
  const consistenciaOk = rule1 === "Correcta";
  const consistenciaWarn = rule1 === "Sin dato";
  const dbOk = dbS === "Cumple" && dcS === "Cumple";
  const dbWarn = dbS === "Sin dato" || dcS === "Sin dato";
  const phoneCompareOk = phoneCompareStatus === "Coincide";
  const phoneCompareWarn = phoneCompareStatus === "Sin dato";

  const flourLine = lineStatusForCard("flour", flourCard.status, rule1);
  const bakeryLine = lineStatusForCard("bakery", bakeryCard.status, rule1);
  const pastryLine = lineStatusForCard("pastry", pastryCard.status, rule1);

  const yeastValues = useMemo(
    () => ({
      levapan: levapanText,
      fleischman: fleischmanText,
      levasaf: levasafText,
      otherFresh: otherYeastText,
      angel: yeastAngelText,
      panificador: yeastPanificadorText,
      fermipan: yeastFermipanText,
      gloripan: yeastGloripanText,
      instaferm: yeastInstafermText,
      instantSucc: yeastInstantSuccText,
      mauripan: yeastMauripanText,
      safInstant: yeastSafInstantText,
      santillana: yeastSantillanaText,
      otherDry: yeastOtherDryText,
    }),
    [
      levapanText,
      fleischmanText,
      levasafText,
      otherYeastText,
      yeastAngelText,
      yeastPanificadorText,
      yeastFermipanText,
      yeastGloripanText,
      yeastInstafermText,
      yeastInstantSuccText,
      yeastMauripanText,
      yeastSafInstantText,
      yeastSantillanaText,
      yeastOtherDryText,
    ],
  );

  const handleYeastCellChange = useCallback((id: string, text: string) => {
    switch (id) {
      case "levapan": setLevapanText(text); break;
      case "fleischman": setFleischmanText(text); break;
      case "levasaf": setLevasafText(text); break;
      case "otherFresh": setOtherYeastText(text); break;
      case "angel": setYeastAngelText(text); break;
      case "panificador": setYeastPanificadorText(text); break;
      case "fermipan": setYeastFermipanText(text); break;
      case "gloripan": setYeastGloripanText(text); break;
      case "instaferm": setYeastInstafermText(text); break;
      case "instantSucc": setYeastInstantSuccText(text); break;
      case "mauripan": setYeastMauripanText(text); break;
      case "safInstant": setYeastSafInstantText(text); break;
      case "santillana": setYeastSantillanaText(text); break;
      case "otherDry": setYeastOtherDryText(text); break;
      default: break;
    }
  }, []);

  const qtyYeastSnapshot = useMemo(
    () =>
      stableQtyYeastKey({
        flourTotalText,
        bakeryQtyText,
        pastryQtyText,
        levapanText,
        fleischmanText,
        levasafText,
        otherYeastText,
        yeastAngelText,
        yeastPanificadorText,
        yeastFermipanText,
        yeastGloripanText,
        yeastInstafermText,
        yeastInstantSuccText,
        yeastMauripanText,
        yeastSafInstantText,
        yeastSantillanaText,
        yeastOtherDryText,
      }),
    [
      flourTotalText,
      bakeryQtyText,
      pastryQtyText,
      levapanText,
      fleischmanText,
      levasafText,
      otherYeastText,
      yeastAngelText,
      yeastPanificadorText,
      yeastFermipanText,
      yeastGloripanText,
      yeastInstafermText,
      yeastInstantSuccText,
      yeastMauripanText,
      yeastSafInstantText,
      yeastSantillanaText,
      yeastOtherDryText,
    ],
  );

  const debouncedQtyYeast = useDebouncedValue(qtyYeastSnapshot, 900);

  const draftQtyYeastRef = useRef({
    flourTotalText: "",
    bakeryQtyText: "",
    pastryQtyText: "",
    levapanText: "",
    fleischmanText: "",
    levasafText: "",
    otherYeastText: "",
    yeastAngelText: "",
    yeastPanificadorText: "",
    yeastFermipanText: "",
    yeastGloripanText: "",
    yeastInstafermText: "",
    yeastInstantSuccText: "",
    yeastMauripanText: "",
    yeastSafInstantText: "",
    yeastSantillanaText: "",
    yeastOtherDryText: "",
  });

  useLayoutEffect(() => {
    draftQtyYeastRef.current = {
      flourTotalText,
      bakeryQtyText,
      pastryQtyText,
      levapanText,
      fleischmanText,
      levasafText,
      otherYeastText,
      yeastAngelText,
      yeastPanificadorText,
      yeastFermipanText,
      yeastGloripanText,
      yeastInstafermText,
      yeastInstantSuccText,
      yeastMauripanText,
      yeastSafInstantText,
      yeastSantillanaText,
      yeastOtherDryText,
    };
  }, [
    flourTotalText,
    bakeryQtyText,
    pastryQtyText,
    levapanText,
    fleischmanText,
    levasafText,
    otherYeastText,
    yeastAngelText,
    yeastPanificadorText,
    yeastFermipanText,
    yeastGloripanText,
    yeastInstafermText,
    yeastInstantSuccText,
    yeastMauripanText,
    yeastSafInstantText,
    yeastSantillanaText,
    yeastOtherDryText,
  ]);

  useLayoutEffect(() => {
    if (!selected) {
      autosaveRowIdRef.current = null;
      return;
    }
    setContentStatus((selected.contentStatus || "").trim());
    const f = parseInitialNumAndUnit(selected.flourTotalText || "", selected.flourUnitBE);
    setFlourNum(f.num);
    setFlourUnit(f.unit);
    const b = parseInitialNumAndUnit(selected.bakeryQtyText || "", selected.flourUnitBE);
    setBakeryNum(b.num);
    setBakeryUnit(b.unit);
    const p = parseInitialNumAndUnit(selected.pastryQtyText || "", selected.flourUnitBE);
    setPastryNum(p.num);
    setPastryUnit(p.unit);
    setLevapanText(selected.levapanText || "");
    setFleischmanText(selected.fleischmanText || "");
    setLevasafText(selected.levasafText || "");
    setOtherYeastText(selected.otherYeastText || "");
    setYeastAngelText(selected.yeastAngelText || "");
    setYeastPanificadorText(selected.yeastPanificadorText || "");
    setYeastFermipanText(selected.yeastFermipanText || "");
    setYeastGloripanText(selected.yeastGloripanText || "");
    setYeastInstafermText(selected.yeastInstafermText || "");
    setYeastInstantSuccText(selected.yeastInstantSuccText || "");
    setYeastMauripanText(selected.yeastMauripanText || "");
    setYeastSafInstantText(selected.yeastSafInstantText || "");
    setYeastSantillanaText(selected.yeastSantillanaText || "");
    setYeastOtherDryText(selected.yeastOtherDryText || "");
    lastQtyYeastSavedRef.current = stableQtyYeastKey({
      flourTotalText: selected.flourTotalText || "",
      bakeryQtyText: selected.bakeryQtyText || "",
      pastryQtyText: selected.pastryQtyText || "",
      levapanText: selected.levapanText || "",
      fleischmanText: selected.fleischmanText || "",
      levasafText: selected.levasafText || "",
      otherYeastText: selected.otherYeastText || "",
      yeastAngelText: selected.yeastAngelText || "",
      yeastPanificadorText: selected.yeastPanificadorText || "",
      yeastFermipanText: selected.yeastFermipanText || "",
      yeastGloripanText: selected.yeastGloripanText || "",
      yeastInstafermText: selected.yeastInstafermText || "",
      yeastInstantSuccText: selected.yeastInstantSuccText || "",
      yeastMauripanText: selected.yeastMauripanText || "",
      yeastSafInstantText: selected.yeastSafInstantText || "",
      yeastSantillanaText: selected.yeastSantillanaText || "",
      yeastOtherDryText: selected.yeastOtherDryText || "",
    });
    autosaveRowIdRef.current = selected.id;
    setSheetSyncState("idle");
  }, [selected?.id]);

  useEffect(() => {
    const reload = () => setPhoneMap(loadPhoneContentMap());
    window.addEventListener("storage", reload);
    window.addEventListener("srq-phone-content-updated", reload);
    return () => {
      window.removeEventListener("storage", reload);
      window.removeEventListener("srq-phone-content-updated", reload);
    };
  }, []);

  const resolveRowNumber = async (row: Establishment): Promise<number | null> => {
    if (row.sheetRowNumber) return row.sheetRowNumber;
    try {
      const data = await invokeGoogleSheets({
        action: "findRow",
        sheetId: connectedSheetId,
        sheetTab: connectedSheetTab || undefined,
        name: row.name,
        address: row.address,
        recordDate: row.recordDate,
        listaNombre: row.listaNombre,
        locality: row.locality,
      });
      const n = Number(data.rowNumber || 0);
      if (Number.isFinite(n) && n >= 2) {
        updateEstablishment({ ...row, sheetRowNumber: n }, { skipAutoSync: true });
        return n;
      }
    } catch {
      // fallback below
    }

    try {
      const preview = await fetchSheetPreview();
      const values = preview.values || [];
      let bestRow = 0;
      let bestScore = -1;
      const tName = normalizeText(row.name);
      const tAddress = normalizeText(row.address);
      const tDate = normalizeDateOnly(row.recordDate);
      const tSurveyor = normalizeText(row.listaNombre);
      const tLocality = normalizeText(row.locality);

      for (let i = 0; i < values.length; i += 1) {
        const r = values[i] || [];
        const nName = normalizeText(String(r[37] || ""));
        if (!nName) continue;
        const nameMatch = nName === tName || nName.includes(tName) || tName.includes(nName);
        if (!nameMatch) continue;

        const nAddress = normalizeText(String(r[38] || ""));
        const nSurveyor = normalizeText(String(r[3] || ""));
        const nLocality = normalizeText(String(r[35] || ""));
        const nDate = normalizeDateOnly(String(r[0] || ""));

        let score = 10;
        if (tDate && nDate === tDate) score += 8;
        if (tAddress && (nAddress === tAddress || nAddress.includes(tAddress) || tAddress.includes(nAddress))) score += 6;
        if (tSurveyor && nSurveyor === tSurveyor) score += 4;
        if (tLocality && nLocality === tLocality) score += 3;

        if (score > bestScore) {
          bestScore = score;
          bestRow = i + 1;
        }
      }

      if (bestRow >= 2) {
        updateEstablishment({ ...row, sheetRowNumber: bestRow }, { skipAutoSync: true });
        return bestRow;
      }
    } catch {
      // ignore
    }

    return null;
  };

  const handleSaveContentStatus = async () => {
    if (!selected) return;
    const updated: Establishment = { ...selected, contentStatus: contentStatus.trim() };
    updateEstablishment(updated, { skipAutoSync: true });
    const rowNumber = await resolveRowNumber(updated);
    if (!rowNumber) {
      toast.error("Se guardó localmente, pero no se pudo sincronizar con Sheets (fila no encontrada)");
      return;
    }
    try {
      setSavingContentStatus(true);
      await invokeGoogleSheets({
        action: "updateStatus",
        sheetId: connectedSheetId,
        sheetTab: connectedSheetTab || undefined,
        rowNumber,
        contentStatus: updated.contentStatus,
      });
      toast.success("Estado contenido guardado");
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "No se pudo guardar");
    } finally {
      setSavingContentStatus(false);
    }
  };

  useEffect(() => {
    if (!selected || autosaveRowIdRef.current !== selected.id) return;
    if (debouncedQtyYeast === lastQtyYeastSavedRef.current) return;
    const d = draftQtyYeastRef.current;
    if (stableQtyYeastKey(d) !== debouncedQtyYeast) return;

    let cancelled = false;
    const trim = (s: string) => (s || "").trim();
    (async () => {
      try {
        setSheetSyncState("saving");
        const updated: Establishment = {
          ...selected,
          flourTotalText: trim(d.flourTotalText),
          bakeryQtyText: trim(d.bakeryQtyText),
          pastryQtyText: trim(d.pastryQtyText),
          levapanText: trim(d.levapanText),
          fleischmanText: trim(d.fleischmanText),
          levasafText: trim(d.levasafText),
          otherYeastText: trim(d.otherYeastText),
          yeastAngelText: trim(d.yeastAngelText),
          yeastPanificadorText: trim(d.yeastPanificadorText),
          yeastFermipanText: trim(d.yeastFermipanText),
          yeastGloripanText: trim(d.yeastGloripanText),
          yeastInstafermText: trim(d.yeastInstafermText),
          yeastInstantSuccText: trim(d.yeastInstantSuccText),
          yeastMauripanText: trim(d.yeastMauripanText),
          yeastSafInstantText: trim(d.yeastSafInstantText),
          yeastSantillanaText: trim(d.yeastSantillanaText),
          yeastOtherDryText: trim(d.yeastOtherDryText),
        };
        updateEstablishment(updated, { skipAutoSync: true });
        const rowNumber = await resolveRowNumber(updated);
        if (cancelled || autosaveRowIdRef.current !== selected.id) return;
        if (!rowNumber) {
          setSheetSyncState("error");
          toast.error("No se encontró la fila en Sheets. Los cambios quedaron solo en este dispositivo.");
          return;
        }
        await invokeGoogleSheets({
          action: "updateContentFields",
          sheetId: connectedSheetId,
          sheetTab: connectedSheetTab || undefined,
          rowNumber,
          flourTotalText: updated.flourTotalText,
          bakeryQtyText: updated.bakeryQtyText,
          pastryQtyText: updated.pastryQtyText,
          levapanText: updated.levapanText,
          fleischmanText: updated.fleischmanText,
          levasafText: updated.levasafText,
          otherYeastText: updated.otherYeastText,
          yeastAngelText: updated.yeastAngelText,
          yeastPanificadorText: updated.yeastPanificadorText,
          yeastFermipanText: updated.yeastFermipanText,
          yeastGloripanText: updated.yeastGloripanText,
          yeastInstafermText: updated.yeastInstafermText,
          yeastInstantSuccText: updated.yeastInstantSuccText,
          yeastMauripanText: updated.yeastMauripanText,
          yeastSafInstantText: updated.yeastSafInstantText,
          yeastSantillanaText: updated.yeastSantillanaText,
          yeastOtherDryText: updated.yeastOtherDryText,
        });
        if (cancelled || autosaveRowIdRef.current !== selected.id) return;
        lastQtyYeastSavedRef.current = debouncedQtyYeast;
        setSheetSyncState("saved");
        window.setTimeout(() => {
          setSheetSyncState((prev) => (prev === "saved" ? "idle" : prev));
        }, 2200);
      } catch (e: unknown) {
        if (!cancelled) {
          setSheetSyncState("error");
          toast.error(e instanceof Error ? e.message : "Error al sincronizar con Sheets");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [
    debouncedQtyYeast,
    selected,
    connectedSheetId,
    connectedSheetTab,
    updateEstablishment,
  ]);

  const kgInfoTooltip = useMemo(
    () => (
      <div className="space-y-2">
        <p className="font-medium text-foreground">Equivalencias a kg (harina), como en la hoja</p>
        <ul className="list-inside list-disc space-y-1 text-muted-foreground">
          <li>
            kg → factor <span className="font-mono text-foreground">{(0.08 * 12.5).toFixed(3)}</span>
          </li>
          <li>
            bultos → <span className="font-mono text-foreground">{(4 * 12.5).toFixed(1)}</span> por bulto
          </li>
          <li>
            lb → <span className="font-mono text-foreground">{(0.0363 * 125).toFixed(4)}</span>
          </li>
          <li>
            arroba → <span className="font-mono text-foreground">{flourUnitToKgFactor("arroba")}</span>
          </li>
        </ul>
        <p className="text-[10px] text-muted-foreground">
          Ratio levadura ÷ harina: entre 0,005 y 0,050 (levadura total ponderada, con ×3 en otras marcas). Pastelería pura: no aplica.
        </p>
      </div>
    ),
    [],
  );

  return (
    <div className="space-y-6">
      <div className="reveal-up">
        <h1 className="text-2xl font-bold">Contenido</h1>
        <p className="text-sm text-muted-foreground mt-1">Validación de cantidades por encuestador y establecimiento.</p>
      </div>

      <div className="reveal-up reveal-up-delay-1 overflow-hidden rounded-xl border border-border/80 bg-card shadow-sm">
        <ContentFilterBar
          surveyors={surveyors}
          selectedSurveyors={selectedSurveyors}
          onSelectedSurveyorsChange={setSelectedSurveyors}
          establishmentSearch={establishmentInput}
          onEstablishmentSearchChange={setEstablishmentInput}
          dateFrom={dateFrom}
          dateTo={dateTo}
          onDateFromChange={setDateFrom}
          onDateToChange={setDateTo}
          activeFilterCount={activeFilterCount}
          onClearAll={() => {
            setSelectedSurveyors([]);
            setEstablishmentInput("");
            setDateFrom("");
            setDateTo("");
            setBrStateFilter("__all__");
            setPhoneStateFilter("__all__");
            setAdvSection("");
          }}
        />
        <ContentAdvancedFilters
          brStates={brStates}
          phoneStates={phoneStates}
          brStateFilter={brStateFilter}
          phoneStateFilter={phoneStateFilter}
          onBrStateChange={setBrStateFilter}
          onPhoneStateChange={setPhoneStateFilter}
          openSection={advSection}
          onOpenSectionChange={setAdvSection}
          secondaryActiveCount={secondaryFiltersActiveCount}
        />
      </div>

      <div className="space-y-3">
        {grouped.map((g) => (
          <div key={g.surveyor} className="rounded-xl border bg-card p-3">
            <p className="text-sm font-semibold">{g.surveyor}</p>
            <div className="mt-2 space-y-2">
              {g.rows.map((r) => {
                const sig = `${g.surveyor}||${r.flourTotalText}||${r.bakeryQtyText}||${r.pastryQtyText}||${r.controlCGText}||${r.controlCHText}`;
                const hasPattern = (patternMap.get(sig) || 0) > 1;
                return (
                  <button
                    key={r.id}
                    type="button"
                    className={`w-full text-left rounded-lg border px-3 py-2 transition ${
                      selectedId === r.id ? "border-primary bg-primary/5" : "hover:border-primary/40"
                    }`}
                    onClick={() => { setSelectedId(r.id); setPhotoIdx(0); }}
                  >
                    <p className="text-sm font-medium truncate">{r.name}</p>
                    <p className="text-[11px] text-muted-foreground truncate">Estado contenido: {showValue(r.contentStatus)}</p>
                    <p className="text-xs text-muted-foreground truncate">
                      Total: {showValue(r.flourTotalText)} · Panadería: {showValue(r.bakeryQtyText)} · Pastelería: {showValue(r.pastryQtyText)}
                    </p>
                    {hasPattern ? <p className="text-[11px] text-amber-600 mt-1">Posible patrón repetido</p> : null}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
        {grouped.length === 0 ? (
          <div className="rounded-xl border bg-card p-6 text-sm text-muted-foreground text-center">No hay datos para mostrar.</div>
        ) : null}
      </div>

      <Dialog open={!!selected} onOpenChange={(open) => { if (!open) setSelectedId(null); }}>
        <DialogContent className="flex max-h-[min(92vh,900px)] w-[min(100vw-1.5rem,56rem)] max-w-5xl flex-col gap-0 overflow-hidden p-0 sm:rounded-lg">
          {!selected || !selectedForRules ? null : (
            <ContentModalErrorBoundary key={selected.id} onClose={() => setSelectedId(null)}>
              <div className="flex max-h-[min(92vh,900px)] flex-col bg-background">
                <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-4 pb-4 sm:p-6 sm:pb-6">
                <DialogHeader className="sr-only">
                  <DialogTitle>Validación de contenido · {selected.name}</DialogTitle>
                </DialogHeader>

                <div className="mb-4 flex flex-wrap items-center justify-end gap-2">
                  <GlobalOutcomeBadge status={globalOutcome} />
                </div>

                <HeaderContenido
                  name={selected.name || "Sin nombre"}
                  address={selected.address || ""}
                  city={selected.city || ""}
                  businessTypeRaw={selected.businessTypeText || selected.notes || ""}
                  contentStatusOptions={headerContentStatusOptions}
                  contentStatus={contentStatus}
                  onContentStatusChange={setContentStatus}
                  onSaveStatus={handleSaveContentStatus}
                  savingStatus={savingContentStatus}
                  globalStatus={globalOutcome}
                  kgInfoTooltip={kgInfoTooltip}
                />

                <p className="-mt-1 text-[11px] text-muted-foreground">
                  Referencia unidad encuesta (BE): {showValue(selected.flourUnitBE || "")} · Columnas hoja: M / N / O y levaduras R–AG
                </p>

                <div className="mt-4 grid gap-3 sm:grid-cols-3">
                  <CantidadesCard
                    title="Harina total"
                    num={flourNum}
                    unit={flourUnit}
                    onNumChange={setFlourNum}
                    onUnitChange={setFlourUnit}
                    kg={flourCard.kg}
                    parseStatus={flourCard.status}
                    lineStatus={flourLine}
                    footerHint={rule1 !== "Sin dato" ? "Debe alinearse con panadería + pastelería (regla M ≈ N + O)." : undefined}
                  />
                  <CantidadesCard
                    title="Panadería"
                    num={bakeryNum}
                    unit={bakeryUnit}
                    onNumChange={setBakeryNum}
                    onUnitChange={setBakeryUnit}
                    kg={bakeryCard.kg}
                    parseStatus={bakeryCard.status}
                    lineStatus={bakeryLine}
                  />
                  <CantidadesCard
                    title="Pastelería"
                    num={pastryNum}
                    unit={pastryUnit}
                    onNumChange={setPastryNum}
                    onUnitChange={setPastryUnit}
                    kg={pastryCard.kg}
                    parseStatus={pastryCard.status}
                    lineStatus={pastryLine}
                  />
                </div>

                <div className="mt-5 grid gap-5 lg:grid-cols-5">
                  <div className="space-y-4 lg:col-span-3">
                    <LevadurasGrid
                      values={yeastValues}
                      onChange={handleYeastCellChange}
                      getKgFromText={toKgFromYeastText}
                      flourKg={flourKg ?? null}
                      yeastTotalWeightedKg={yeastTotalKg}
                    />
                    <div className="rounded-xl border border-border/80 bg-card/50 p-4 text-sm shadow-sm">
                      <p className="text-xs font-medium text-muted-foreground">Telefónico vs hoja</p>
                      <div className="mt-3 grid gap-2 sm:grid-cols-3">
                        <p>
                          Total:{" "}
                          <span className="font-medium tabular-nums">
                            {showValue(phoneEntry?.totalValue || "")} {phoneEntry?.totalUnit || ""}
                          </span>
                        </p>
                        <p>
                          Panadería:{" "}
                          <span className="font-medium tabular-nums">
                            {showValue(phoneEntry?.bakeryValue || "")} {phoneEntry?.bakeryUnit || ""}
                          </span>
                        </p>
                        <p>
                          Pastelería:{" "}
                          <span className="font-medium tabular-nums">
                            {showValue(phoneEntry?.pastryValue || "")} {phoneEntry?.pastryUnit || ""}
                          </span>
                        </p>
                      </div>
                      <p className="mt-2 text-xs text-muted-foreground">
                        Comparación (±15%):{" "}
                        <span
                          className={
                            phoneCompareStatus === "Coincide"
                              ? "font-medium text-emerald-600"
                              : phoneCompareStatus === "No coincide"
                                ? "font-medium text-destructive"
                                : ""
                          }
                        >
                          {phoneCompareStatus}
                        </span>
                      </p>
                    </div>
                  </div>
                  <div className="lg:col-span-2">
                    <ValidationPanel
                      ratio={ratioDecimal}
                      ratioRuleLabel={ratioRuleLabel}
                      yeastQualityDetail={yeastQualityDetail}
                      yeastQualityOk={yeastQualityOk}
                      yeastQualityWarn={yeastQualityWarn}
                      priceDetail={priceDetail}
                      priceOk={priceOk}
                      priceWarn={priceWarn}
                      consistenciaDetail={consistenciaDetail}
                      consistenciaOk={consistenciaOk}
                      consistenciaWarn={consistenciaWarn}
                      dbDetail={dbDetail}
                      dbOk={dbOk}
                      dbWarn={dbWarn}
                      phoneCompareStatus={phoneCompareStatus}
                      phoneCompareOk={phoneCompareOk}
                      phoneCompareWarn={phoneCompareWarn}
                    />
                  </div>
                </div>

                <div className="mt-5 grid gap-4 lg:grid-cols-2">
                  <div className="rounded-xl border border-border/80 bg-muted/5 p-4 text-sm">
                    <p className="text-xs font-medium text-muted-foreground">Controles de cantidad (hoja)</p>
                    <p className="mt-2">
                      CD estandarizado: <span className="font-medium tabular-nums">{showValue(selected.flourKgStandardText)}</span>
                    </p>
                    <p className="mt-1">
                      Control CG: <span className="font-medium tabular-nums">{showValue(selected.controlCGText)}</span>
                    </p>
                    <p className="mt-1">
                      Control CH: <span className="font-medium tabular-nums">{showValue(selected.controlCHText)}</span>
                    </p>
                  </div>
                  <div className="rounded-xl border border-border/80 bg-card p-4">
                    <p className="text-sm font-medium mb-2 flex items-center gap-2">
                      <ImageIcon className="size-4 opacity-70" /> Fachada
                    </p>
                    {photoUrl ? (
                      <div className="space-y-2">
                        <button
                          type="button"
                          className="block w-full overflow-hidden rounded-lg border bg-muted/15"
                          onClick={() => setPhotoZoomOpen(true)}
                        >
                          <img
                            src={photoUrl}
                            alt={`Fachada de ${selected.name}`}
                            className="mx-auto max-h-48 w-full object-contain"
                            loading="lazy"
                            referrerPolicy="no-referrer"
                            onError={() => {
                              if (photoIdx < photoCandidates.length - 1) setPhotoIdx((v) => v + 1);
                              else setPhotoIdx(photoCandidates.length);
                            }}
                          />
                        </button>
                        <Button type="button" variant="outline" size="sm" className="h-8 text-xs" onClick={() => setPhotoZoomOpen(true)}>
                          Ampliar foto
                        </Button>
                      </div>
                    ) : (
                      <p className="text-sm text-muted-foreground">Sin foto disponible.</p>
                    )}
                    <p className="mt-2 break-all text-[10px] text-muted-foreground">{selected.facadePhotoUrl || "—"}</p>
                  </div>
                </div>
                </div>

                <div className="shrink-0 border-t border-border/80 bg-muted/30 px-4 py-2.5 sm:px-6">
                  <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-muted-foreground">
                    <span>
                      {sheetSyncState === "saving"
                        ? "Sincronizando con Google Sheets…"
                        : sheetSyncState === "saved"
                          ? "Guardado en Sheets y en este dispositivo."
                          : sheetSyncState === "error"
                            ? "Error al escribir en Sheets."
                            : "Se guarda solo unos segundos después de editar."}
                    </span>
                    <span className="font-mono tabular-nums opacity-80" title="Levadura total ponderada">
                      Σ lev ≈ {Number.isFinite(yeastTotalKg) ? yeastTotalKg.toFixed(2) : "—"} kg
                      {ratioDecimal !== null && Number.isFinite(ratioDecimal) && yeastQualityStatus !== "No aplica"
                        ? ` · r ${ratioDecimal.toFixed(4)}`
                        : ""}
                    </span>
                  </div>
                </div>
              </div>
            </ContentModalErrorBoundary>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={photoZoomOpen} onOpenChange={setPhotoZoomOpen}>
        <DialogContent className="max-w-6xl max-h-[95vh]">
          <DialogHeader>
            <DialogTitle>Foto de fachada ampliada</DialogTitle>
          </DialogHeader>
          <div className="w-full h-[80vh] rounded-md border bg-muted/20 overflow-hidden">
            {photoUrl ? (
              <img
                src={photoUrl}
                alt={`Fachada ampliada de ${selected?.name || ""}`}
                className="w-full h-full object-contain"
                loading="lazy"
                referrerPolicy="no-referrer"
              />
            ) : (
              <p className="text-sm text-muted-foreground p-4">No hay foto para ampliar.</p>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}


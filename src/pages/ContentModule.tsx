import { useEffect, useMemo, useState } from "react";
import { useData } from "@/context/DataContext";
import { Establishment } from "@/types/establishment";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertCircle, CheckCircle2, Image as ImageIcon, Info, Search, X } from "lucide-react";
import { toast } from "sonner";
import { getEstablishmentKey, loadPhoneContentMap, phoneTextToKg } from "@/lib/phoneContent";
import { PHONE_STATUS_OPTIONS } from "@/lib/statusOptions";
import { invokeGoogleSheets } from "@/lib/invokeGoogleSheets";

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
}): "Cumple" | "No cumple" | "No aplica" | "Sin dato" {
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

type YeastRange = { freshMinPct: number; freshMaxPct: number; dryMinPct: number; dryMaxPct: number };
const YEAST_RANGES: Record<"panaderia" | "pasteleria" | "mixto", YeastRange> = {
  panaderia: { freshMinPct: 0.01, freshMaxPct: 0.03, dryMinPct: 0.003, dryMaxPct: 0.01 },
  pasteleria: { freshMinPct: 0.01, freshMaxPct: 0.025, dryMinPct: 0.003, dryMaxPct: 0.009 },
  mixto: { freshMinPct: 0.015, freshMaxPct: 0.035, dryMinPct: 0.005, dryMaxPct: 0.012 },
};

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
  const [selectedSurveyors, setSelectedSurveyors] = useState<string[]>([]);
  const [surveyorPickerOpen, setSurveyorPickerOpen] = useState(false);
  const [surveyorSearch, setSurveyorSearch] = useState("");
  const [establishmentQuery, setEstablishmentQuery] = useState("");
  const [brStateFilter, setBrStateFilter] = useState("__all__");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [photoIdx, setPhotoIdx] = useState(0);
  const [contentStatus, setContentStatus] = useState("");
  const [flourTotalText, setFlourTotalText] = useState("");
  const [bakeryQtyText, setBakeryQtyText] = useState("");
  const [pastryQtyText, setPastryQtyText] = useState("");
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
  const [savingContentFields, setSavingContentFields] = useState(false);
  const [kgInfoOpen, setKgInfoOpen] = useState(false);
  const [photoZoomOpen, setPhotoZoomOpen] = useState(false);
  const [phoneMap, setPhoneMap] = useState(() => loadPhoneContentMap());

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

  const filteredRows = useMemo(() => {
    const q = establishmentQuery.trim().toLowerCase();
    return establishments.filter((r) => {
      if (selectedSurveyors.length > 0 && !selectedSurveyors.includes(getSurveyor(r))) return false;
      if (q && !(r.name || "").toLowerCase().includes(q)) return false;
      if (brStateFilter !== "__all__") {
        const rowState = normalizeText((r.contentStateBR || "").trim());
        const filterState = normalizeText(brStateFilter);
        if (rowState !== filterState) return false;
      }
      const d = normalizeDateOnly(r.recordDate);
      if (dateFrom && (!d || d < dateFrom)) return false;
      if (dateTo && (!d || d > dateTo)) return false;
      return true;
    });
  }, [establishments, selectedSurveyors, establishmentQuery, brStateFilter, dateFrom, dateTo]);

  const visibleSurveyors = useMemo(() => {
    const q = normalizeText(surveyorSearch);
    if (!q) return surveyors;
    return surveyors.filter((s) => normalizeText(s).includes(q));
  }, [surveyors, surveyorSearch]);

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
        rows: rows.sort((a, b) => a.name.localeCompare(b.name, "es")),
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

  const combinedStatus = selectedForRules
    ? (getDbStatus(selectedForRules) === "Cumple" && getDcStatus(selectedForRules) === "Cumple" ? "Cumple" : "Falla")
    : "Sin dato";

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

  const flourParsed = parseQuantityToKg(flourTotalText, selected?.flourUnitBE);
  const bakeryParsed = parseQuantityToKg(bakeryQtyText, selected?.flourUnitBE);
  const pastryParsed = parseQuantityToKg(pastryQtyText, selected?.flourUnitBE);
  const flourKg = flourParsed.kg ?? toNumber(selectedForRules?.flourKgStandardText || "");
  const bakeryKg = bakeryParsed.kg;
  const pastryKg = pastryParsed.kg;
  const productionType: "panaderia" | "pasteleria" | "mixto" = (() => {
    const hasBakery = (bakeryKg ?? 0) > 0;
    const hasPastry = (pastryKg ?? 0) > 0;
    if (hasBakery && hasPastry) return "mixto";
    if (hasBakery) return "panaderia";
    return "pasteleria";
  })();
  const yeastRange = YEAST_RANGES[productionType];
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
  const yeastPctEstimate = flourKg && flourKg > 0 ? (yeastTotalKg / flourKg) * 100 : null;
  const yeastInRange = yeastPctEstimate === null
    ? null
    : yeastPctEstimate >= (yeastRange.freshMinPct * 100) && yeastPctEstimate <= (yeastRange.freshMaxPct * 100);

  const yeastQualityStatus = getYeastQualityStatus({ flourKg: flourKg ?? null, yeastTotalKg, productionType });
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

  useEffect(() => {
    setContentStatus(selected?.contentStatus || "");
    setFlourTotalText(selected?.flourTotalText || "");
    setBakeryQtyText(selected?.bakeryQtyText || "");
    setPastryQtyText(selected?.pastryQtyText || "");
    setLevapanText(selected?.levapanText || "");
    setFleischmanText(selected?.fleischmanText || "");
    setLevasafText(selected?.levasafText || "");
    setOtherYeastText(selected?.otherYeastText || "");
    setYeastAngelText(selected?.yeastAngelText || "");
    setYeastPanificadorText(selected?.yeastPanificadorText || "");
    setYeastFermipanText(selected?.yeastFermipanText || "");
    setYeastGloripanText(selected?.yeastGloripanText || "");
    setYeastInstafermText(selected?.yeastInstafermText || "");
    setYeastInstantSuccText(selected?.yeastInstantSuccText || "");
    setYeastMauripanText(selected?.yeastMauripanText || "");
    setYeastSafInstantText(selected?.yeastSafInstantText || "");
    setYeastSantillanaText(selected?.yeastSantillanaText || "");
    setYeastOtherDryText(selected?.yeastOtherDryText || "");
  }, [
    selected?.id,
    selected?.contentStatus,
    selected?.flourTotalText,
    selected?.bakeryQtyText,
    selected?.pastryQtyText,
    selected?.levapanText,
    selected?.fleischmanText,
    selected?.levasafText,
    selected?.otherYeastText,
    selected?.yeastAngelText,
    selected?.yeastPanificadorText,
    selected?.yeastFermipanText,
    selected?.yeastGloripanText,
    selected?.yeastInstafermText,
    selected?.yeastInstantSuccText,
    selected?.yeastMauripanText,
    selected?.yeastSafInstantText,
    selected?.yeastSantillanaText,
    selected?.yeastOtherDryText,
  ]);

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

  const handleSaveContentFields = async () => {
    if (!selected) return;
    const updated: Establishment = {
      ...selected,
      flourTotalText: flourTotalText.trim(),
      bakeryQtyText: bakeryQtyText.trim(),
      pastryQtyText: pastryQtyText.trim(),
      levapanText: levapanText.trim(),
      fleischmanText: fleischmanText.trim(),
      levasafText: levasafText.trim(),
      otherYeastText: otherYeastText.trim(),
    };
    updateEstablishment(updated, { skipAutoSync: true });
    const rowNumber = await resolveRowNumber(updated);
    if (!rowNumber) {
      toast.error("Se guardó localmente, pero no se pudo sincronizar con Sheets (fila no encontrada)");
      return;
    }
    try {
      setSavingContentFields(true);
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
      });
      toast.success("Cantidades guardadas");
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "No se pudo guardar");
    } finally {
      setSavingContentFields(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="reveal-up">
        <h1 className="text-2xl font-bold">Contenido</h1>
        <p className="text-sm text-muted-foreground mt-1">Validación de cantidades por encuestador y establecimiento.</p>
      </div>

      <div className="grid lg:grid-cols-5 gap-3 reveal-up reveal-up-delay-1">
        <div className="space-y-2">
          <Label>Filtrar encuestador</Label>
          <Button type="button" variant="outline" className="h-10 w-full justify-between font-normal" onClick={() => setSurveyorPickerOpen(true)}>
            <span className="truncate">
              {selectedSurveyors.length === 0
                ? "Todos"
                : selectedSurveyors.length === 1
                  ? selectedSurveyors[0]
                  : `${selectedSurveyors.length} encuestadores`}
            </span>
            <Search className="w-4 h-4 text-muted-foreground" />
          </Button>
          {selectedSurveyors.length > 0 ? (
            <div className="flex flex-wrap gap-1">
              {selectedSurveyors.slice(0, 3).map((s) => (
                <span key={s} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-muted text-xs">
                  {s}
                  <button type="button" onClick={() => setSelectedSurveyors((prev) => prev.filter((x) => x !== s))}>
                    <X className="w-3 h-3" />
                  </button>
                </span>
              ))}
              {selectedSurveyors.length > 3 ? <span className="text-xs text-muted-foreground">+{selectedSurveyors.length - 3}</span> : null}
            </div>
          ) : null}
        </div>
        <div className="space-y-2">
          <Label>Búsqueda establecimiento</Label>
          <Input
            value={establishmentQuery}
            onChange={(e) => setEstablishmentQuery(e.target.value)}
            placeholder="Escribe nombre del establecimiento..."
            className="h-10"
          />
        </div>
        <div className="space-y-2">
          <Label>Fecha desde</Label>
          <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="h-10" />
        </div>
        <div className="space-y-2">
          <Label>Fecha hasta</Label>
          <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="h-10" />
        </div>
        <div className="space-y-2">
          <Label>Estado (BR)</Label>
          <Select value={brStateFilter} onValueChange={setBrStateFilter}>
            <SelectTrigger className="h-10"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">Todos</SelectItem>
              {brStates.map((s) => (
                <SelectItem key={s} value={s}>{s}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      <p className="text-xs text-muted-foreground -mt-2">El filtro de fechas usa la columna A (Respuesta iniciada), tomando solo día/mes/año.</p>

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

      <Dialog open={surveyorPickerOpen} onOpenChange={setSurveyorPickerOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Seleccionar encuestadores</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <Input
              value={surveyorSearch}
              onChange={(e) => setSurveyorSearch(e.target.value)}
              placeholder="Buscar encuestador..."
              className="h-10"
            />
            <div className="max-h-72 overflow-y-auto rounded-md border p-2 space-y-1">
              {visibleSurveyors.map((s) => {
                const checked = selectedSurveyors.includes(s);
                return (
                  <button
                    key={s}
                    type="button"
                    className={`w-full text-left px-2 py-1.5 rounded text-sm ${checked ? "bg-primary/10 text-primary" : "hover:bg-muted"}`}
                    onClick={() => {
                      setSelectedSurveyors((prev) => checked ? prev.filter((x) => x !== s) : [...prev, s]);
                    }}
                  >
                    {checked ? "✓ " : ""}{s}
                  </button>
                );
              })}
              {visibleSurveyors.length === 0 ? (
                <p className="text-sm text-muted-foreground p-2">Sin resultados.</p>
              ) : null}
            </div>
            <div className="flex items-center justify-between">
              <Button type="button" variant="outline" size="sm" onClick={() => setSelectedSurveyors([])}>
                Limpiar
              </Button>
              <Button type="button" size="sm" onClick={() => setSurveyorPickerOpen(false)}>
                Aplicar
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={!!selected} onOpenChange={(open) => { if (!open) setSelectedId(null); }}>
        <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto">
          {!selected || !selectedForRules ? null : (
            <div className="space-y-4">
              <DialogHeader>
                <DialogTitle>{selected.name}</DialogTitle>
                <p className="text-xs text-muted-foreground">{selected.city} · {selected.address}</p>
              </DialogHeader>

              <div className="rounded-lg border p-3">
                <p className="text-xs text-muted-foreground mb-2">Estado contenido</p>
                <div className="flex flex-col sm:flex-row gap-2 sm:items-center">
                  <Select value={contentStatus || "__empty__"} onValueChange={(v) => setContentStatus(v === "__empty__" ? "" : v)}>
                    <SelectTrigger className="h-9 sm:max-w-sm"><SelectValue placeholder="Selecciona estado" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__empty__">Sin estado</SelectItem>
                      {CONTENT_STATUS_OPTIONS.map((status) => <SelectItem key={status} value={status}>{status}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <Button type="button" size="sm" className="h-9" onClick={handleSaveContentStatus} disabled={savingContentStatus}>
                    {savingContentStatus ? "Guardando..." : "Guardar estado"}
                  </Button>
                  <Button type="button" variant="outline" size="sm" className="h-9 gap-1" onClick={() => setKgInfoOpen(true)}>
                    <Info className="w-4 h-4" /> Info kg
                  </Button>
                </div>
              </div>

              <div className="rounded-lg border p-3 space-y-3">
                <p className="text-xs text-muted-foreground">Cantidades editables (M, N, O, R, S, T, U)</p>
                <p className="text-[11px] text-muted-foreground">Unidad declarada BE: {showValue(selected.flourUnitBE || "")}</p>
                <div className="grid sm:grid-cols-3 gap-3">
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">Total de harina que consume</Label>
                    <Input value={flourTotalText} onChange={(e) => setFlourTotalText(e.target.value)} className="h-9" />
                    <p className="text-[11px] text-muted-foreground">
                      KG estimados: {flourKg === null ? "Sin dato" : flourKg.toFixed(2)} · Estado: {flourParsed.status}
                    </p>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">Elaborar panadería</Label>
                    <Input value={bakeryQtyText} onChange={(e) => setBakeryQtyText(e.target.value)} className="h-9" />
                    <p className="text-[11px] text-muted-foreground">
                      KG estimados: {bakeryKg === null ? "Sin dato" : bakeryKg.toFixed(2)} · Estado: {bakeryParsed.status}
                    </p>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">Elaborar pastelería</Label>
                    <Input value={pastryQtyText} onChange={(e) => setPastryQtyText(e.target.value)} className="h-9" />
                    <p className="text-[11px] text-muted-foreground">
                      KG estimados: {pastryKg === null ? "Sin dato" : pastryKg.toFixed(2)} · Estado: {pastryParsed.status}
                    </p>
                  </div>
                </div>
                <div className="grid sm:grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">Levapan</Label>
                    <Input value={levapanText} onChange={(e) => setLevapanText(e.target.value)} className="h-9" />
                    <p className="text-[11px] text-muted-foreground">
                      Cantidad: {levapanParsed.quantity ?? "Sin dato"} · Precio: {levapanParsed.price ?? "Sin dato"}
                    </p>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">Fleischman</Label>
                    <Input value={fleischmanText} onChange={(e) => setFleischmanText(e.target.value)} className="h-9" />
                    <p className="text-[11px] text-muted-foreground">
                      Cantidad: {fleischmanParsed.quantity ?? "Sin dato"} · Precio: {fleischmanParsed.price ?? "Sin dato"}
                    </p>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">Levasaf</Label>
                    <Input value={levasafText} onChange={(e) => setLevasafText(e.target.value)} className="h-9" />
                    <p className="text-[11px] text-muted-foreground">
                      Cantidad: {levasafParsed.quantity ?? "Sin dato"} · Precio: {levasafParsed.price ?? "Sin dato"}
                    </p>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">Otra Marca Fresca</Label>
                    <Input value={otherYeastText} onChange={(e) => setOtherYeastText(e.target.value)} className="h-9" />
                    <p className="text-[11px] text-muted-foreground">
                      Cantidad: {otherYeastParsed.quantity ?? "Sin dato"} · Precio: {otherYeastParsed.price ?? "Sin dato"}
                    </p>
                  </div>
                </div>
                <div className="rounded-md border bg-muted/20 p-2">
                  <p className="text-[11px] text-muted-foreground font-medium mb-2">Levaduras (secas / marcas)</p>
                  <div className="grid sm:grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <Label className="text-xs text-muted-foreground">Angel</Label>
                      <Input value={yeastAngelText} onChange={(e) => setYeastAngelText(e.target.value)} className="h-9" />
                      <p className="text-[11px] text-muted-foreground">Cantidad: {yeastAngelParsed.quantity ?? "Sin dato"} · Precio: {yeastAngelParsed.price ?? "Sin dato"}</p>
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs text-muted-foreground">El Panificador</Label>
                      <Input value={yeastPanificadorText} onChange={(e) => setYeastPanificadorText(e.target.value)} className="h-9" />
                      <p className="text-[11px] text-muted-foreground">Cantidad: {yeastPanificadorParsed.quantity ?? "Sin dato"} · Precio: {yeastPanificadorParsed.price ?? "Sin dato"}</p>
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs text-muted-foreground">Fermipan</Label>
                      <Input value={yeastFermipanText} onChange={(e) => setYeastFermipanText(e.target.value)} className="h-9" />
                      <p className="text-[11px] text-muted-foreground">Cantidad: {yeastFermipanParsed.quantity ?? "Sin dato"} · Precio: {yeastFermipanParsed.price ?? "Sin dato"}</p>
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs text-muted-foreground">Gloripan</Label>
                      <Input value={yeastGloripanText} onChange={(e) => setYeastGloripanText(e.target.value)} className="h-9" />
                      <p className="text-[11px] text-muted-foreground">Cantidad: {yeastGloripanParsed.quantity ?? "Sin dato"} · Precio: {yeastGloripanParsed.price ?? "Sin dato"}</p>
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs text-muted-foreground">Instaferm</Label>
                      <Input value={yeastInstafermText} onChange={(e) => setYeastInstafermText(e.target.value)} className="h-9" />
                      <p className="text-[11px] text-muted-foreground">Cantidad: {yeastInstafermParsed.quantity ?? "Sin dato"} · Precio: {yeastInstafermParsed.price ?? "Sin dato"}</p>
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs text-muted-foreground">Instant Succ</Label>
                      <Input value={yeastInstantSuccText} onChange={(e) => setYeastInstantSuccText(e.target.value)} className="h-9" />
                      <p className="text-[11px] text-muted-foreground">Cantidad: {yeastInstantSuccParsed.quantity ?? "Sin dato"} · Precio: {yeastInstantSuccParsed.price ?? "Sin dato"}</p>
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs text-muted-foreground">Mauripan</Label>
                      <Input value={yeastMauripanText} onChange={(e) => setYeastMauripanText(e.target.value)} className="h-9" />
                      <p className="text-[11px] text-muted-foreground">Cantidad: {yeastMauripanParsed.quantity ?? "Sin dato"} · Precio: {yeastMauripanParsed.price ?? "Sin dato"}</p>
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs text-muted-foreground">SAF Instant</Label>
                      <Input value={yeastSafInstantText} onChange={(e) => setYeastSafInstantText(e.target.value)} className="h-9" />
                      <p className="text-[11px] text-muted-foreground">Cantidad: {yeastSafInstantParsed.quantity ?? "Sin dato"} · Precio: {yeastSafInstantParsed.price ?? "Sin dato"}</p>
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs text-muted-foreground">Santillana</Label>
                      <Input value={yeastSantillanaText} onChange={(e) => setYeastSantillanaText(e.target.value)} className="h-9" />
                      <p className="text-[11px] text-muted-foreground">Cantidad: {yeastSantillanaParsed.quantity ?? "Sin dato"} · Precio: {yeastSantillanaParsed.price ?? "Sin dato"}</p>
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs text-muted-foreground">Otra Marca Seca</Label>
                      <Input value={yeastOtherDryText} onChange={(e) => setYeastOtherDryText(e.target.value)} className="h-9" />
                      <p className="text-[11px] text-muted-foreground">Cantidad: {yeastOtherDryParsed.quantity ?? "Sin dato"} · Precio: {yeastOtherDryParsed.price ?? "Sin dato"}</p>
                    </div>
                  </div>
                </div>
                <Button type="button" size="sm" className="h-9" onClick={handleSaveContentFields} disabled={savingContentFields}>
                  {savingContentFields ? "Guardando..." : "Guardar cantidades"}
                </Button>
              </div>

              <div className="rounded-lg border p-3">
                <p className="text-xs text-muted-foreground mb-2">Contenido obtenido por telefónico</p>
                <div className="grid sm:grid-cols-3 gap-3">
                  <p className="text-sm">Total: <span className="font-medium">{showValue(phoneEntry?.totalValue || "")} {phoneEntry?.totalUnit || ""}</span></p>
                  <p className="text-sm">Panadería: <span className="font-medium">{showValue(phoneEntry?.bakeryValue || "")} {phoneEntry?.bakeryUnit || ""}</span></p>
                  <p className="text-sm">Pastelería: <span className="font-medium">{showValue(phoneEntry?.pastryValue || "")} {phoneEntry?.pastryUnit || ""}</span></p>
                </div>
                <p className="text-xs text-muted-foreground mt-2">
                  Estado comparación telefónico vs hoja:{" "}
                  <span className={phoneCompareStatus === "Coincide" ? "text-emerald-600 font-medium" : phoneCompareStatus === "No coincide" ? "text-destructive font-medium" : ""}>
                    {phoneCompareStatus}
                  </span>
                </p>
              </div>

              <div className="grid sm:grid-cols-2 gap-3">
                <div className="rounded-lg border p-3">
                  <p className="text-xs text-muted-foreground">Total Cant Correctas</p>
                  <p className={`text-sm font-medium ${getRule1Status(flourTotalText, bakeryQtyText, pastryQtyText, selected.flourUnitBE) === "Falla" ? "text-destructive" : ""}`}>
                    {getRule1Status(flourTotalText, bakeryQtyText, pastryQtyText, selected.flourUnitBE)}
                  </p>
                </div>
                <div className="rounded-lg border p-3">
                  <p className="text-xs text-muted-foreground">Criterios (Contenido)</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Levadura vs Harina:{" "}
                    <span className={yeastQualityStatus === "Cumple" ? "text-emerald-600 font-medium" : yeastQualityStatus === "No cumple" ? "text-destructive font-medium" : ""}>
                      {yeastQualityStatus}
                    </span>
                    {" · "}
                    Precio de compra:{" "}
                    <span className={yeastPriceStatus === "Cumple" ? "text-emerald-600 font-medium" : yeastPriceStatus === "Falla" ? "text-destructive font-medium" : ""}>
                      {yeastPriceStatus}
                    </span>
                  </p>
                  <p className="text-[11px] text-muted-foreground mt-1">
                    Ratio = (Levaduras + Otras×3) / Harina · Rango: 0.5%–5% · Pastelería: No aplica
                  </p>
                </div>
              </div>

              <div className="rounded-lg border p-3 space-y-2">
                <p className="text-xs text-muted-foreground">Controles de cantidad</p>
                <p className="text-sm">Cantidad estandarizada (kg): <span className="font-medium">{showValue(selected.flourKgStandardText)}</span></p>
                <p className="text-sm">Control 1: <span className="font-medium">{showValue(selected.controlCGText)}</span></p>
                <p className="text-sm">Control 2: <span className="font-medium">{showValue(selected.controlCHText)}</span></p>
              </div>

              <div className="rounded-lg border p-3">
                <p className="text-sm font-medium mb-2 flex items-center gap-2"><ImageIcon className="w-4 h-4" /> Foto de fachada</p>
                {photoUrl ? (
                  <div className="space-y-2">
                    <img
                      src={photoUrl}
                      alt={`Fachada de ${selected.name}`}
                      className="w-full h-72 object-contain rounded-md border bg-muted/20 cursor-zoom-in"
                      loading="lazy"
                      referrerPolicy="no-referrer"
                      onClick={() => setPhotoZoomOpen(true)}
                      onError={() => {
                        if (photoIdx < photoCandidates.length - 1) setPhotoIdx((v) => v + 1);
                        else setPhotoIdx(photoCandidates.length);
                      }}
                    />
                    <Button type="button" variant="outline" size="sm" onClick={() => setPhotoZoomOpen(true)}>
                      Ampliar foto
                    </Button>
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">No se pudo cargar la foto con la URL proporcionada.</p>
                )}
                <p className="text-xs text-muted-foreground break-all mt-2">{selected.facadePhotoUrl || "—"}</p>
              </div>

              <div className="flex items-center gap-2 text-sm">
                {combinedStatus === "Cumple" ? (
                  <span className="inline-flex items-center gap-1 text-emerald-600"><CheckCircle2 className="w-4 h-4" /> Cumple validaciones</span>
                ) : (
                  <span className="inline-flex items-center gap-1 text-destructive"><AlertCircle className="w-4 h-4" /> Revisar datos</span>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={kgInfoOpen} onOpenChange={setKgInfoOpen}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>Guía rápida de kg y rangos de levadura</DialogTitle>
            <p className="text-xs text-muted-foreground">
              Tabla de referencia tipo negocio (como la guía compartida) y estimación con tus datos cargados.
            </p>
          </DialogHeader>
          <div className="space-y-3 text-sm">
            <div className="rounded-md border p-3 bg-muted/20">
              <p>Tipo detectado: <span className="font-medium capitalize">{productionType === "mixto" ? "Panadería + pastelería" : productionType}</span></p>
              <p>Harina total estimada: <span className="font-medium">{flourKg === null ? "Sin dato" : `${flourKg.toFixed(2)} kg`}</span></p>
              <p>
                Levadura total estimada (R+S+T+U):{" "}
                <span className="font-medium">{yeastTotalKg.toFixed(2)} kg</span>
                {yeastPctEstimate === null ? "" : ` · ${yeastPctEstimate.toFixed(2)}% sobre harina`}
              </p>
              <p className="text-xs mt-1">
                Estado rango:{" "}
                <span className={yeastInRange === null ? "" : yeastInRange ? "text-emerald-600 font-medium" : "text-destructive font-medium"}>
                  {yeastInRange === null ? "Sin dato" : yeastInRange ? "Dentro de rango" : "Fuera de rango"}
                </span>
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                Rango normal detectado: {(yeastRange.freshMinPct * 100).toFixed(1)}% - {(yeastRange.freshMaxPct * 100).toFixed(1)}% (fresca)
              </p>
            </div>
            <div className="overflow-auto rounded-md border">
              <table className="w-full text-xs">
                <thead className="bg-muted/30">
                  <tr>
                    <th className="text-left p-2">Tipo de negocio</th>
                    <th className="text-left p-2">Harina semanal</th>
                    <th className="text-left p-2">Bultos (50 kg)</th>
                    <th className="text-left p-2">Tipo producción</th>
                    <th className="text-left p-2">Levadura % normal</th>
                    <th className="text-left p-2">Levadura kg estimada</th>
                  </tr>
                </thead>
                <tbody>
                  {([
                    ["Pequeña (solo pan)", 200, 800, "panaderia", "Panadería"],
                    ["Pequeña mixta", 200, 800, "mixto", "Pan + pastelería"],
                    ["Pequeña (solo pastelería)", 200, 800, "pasteleria", "Pastelería"],
                  ] as const).map(([businessLabel, flourMin, flourMax, key, prodLabel]) => {
                    const r = YEAST_RANGES[key];
                    const minKg = flourMin * r.freshMinPct;
                    const maxKg = flourMax * r.freshMaxPct;
                    return (
                      <tr key={businessLabel} className="border-t">
                        <td className="p-2">{businessLabel}</td>
                        <td className="p-2">{flourMin} - {flourMax} kg</td>
                        <td className="p-2">{Math.round(flourMin / 50)} - {Math.round(flourMax / 50)}</td>
                        <td className="p-2">{prodLabel}</td>
                        <td className="p-2">{(r.freshMinPct * 100).toFixed(1)}% - {(r.freshMaxPct * 100).toFixed(1)}%</td>
                        <td className="p-2">{minKg.toFixed(1)} - {maxKg.toFixed(1)} kg</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
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


import { useEffect, useMemo, useState } from "react";
import { useData } from "@/context/DataContext";
import { Establishment } from "@/types/establishment";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DropdownMenu, DropdownMenuCheckboxItem, DropdownMenuContent, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertCircle, CheckCircle2, Image as ImageIcon, Info } from "lucide-react";
import { toast } from "sonner";
import { getEstablishmentKey, loadPhoneContentMap, phoneTextToKg, sheetTextToKg } from "@/lib/phoneContent";
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

function toKgFromContentText(text: string): number | null {
  const s = (text || "").toLowerCase().trim();
  if (!s || s.includes("/")) return null;
  const qty = toNumber(s);
  if (qty === null) return null;
  if (s.includes("kg") || s.includes("kilo")) return qty * (0.08 * 12.5);
  if (s.includes("bulto")) return qty * (4 * 12.5);
  if (s.includes("lb")) return qty * (0.0363 * 125);
  if (s.includes("libra")) return qty * (0.0363 * 12.5);
  if (s.includes("arroba")) return qty * 12.5;
  return qty * 12.5;
}

function getDbStatus(row: Establishment): "Cumple" | "Falla" | "Sin dato" {
  const raw = (row.dbStatus || "").trim().toLowerCase();
  if (raw === "cumple") return "Cumple";
  if (raw === "falla") return "Falla";
  const cd = toNumber(row.flourKgStandardText) ?? toKgFromContentText(row.flourTotalText);
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

function getRule1Status(flourTotalText: string, bakeryQtyText: string, pastryQtyText: string): "Correcta" | "Falla" | "Sin dato" {
  const m = toNumber(flourTotalText);
  const n = toNumber(bakeryQtyText);
  const o = toNumber(pastryQtyText);
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

type YeastRange = { freshMinPct: number; freshMaxPct: number; dryMinPct: number; dryMaxPct: number };
const YEAST_RANGES: Record<"panaderia" | "pasteleria" | "mixto", YeastRange> = {
  panaderia: { freshMinPct: 0.01, freshMaxPct: 0.03, dryMinPct: 0.003, dryMaxPct: 0.01 },
  pasteleria: { freshMinPct: 0.01, freshMaxPct: 0.025, dryMinPct: 0.003, dryMaxPct: 0.009 },
  mixto: { freshMinPct: 0.015, freshMaxPct: 0.035, dryMinPct: 0.005, dryMaxPct: 0.012 },
};

function toKgFromYeastText(text: string): number | null {
  const s = (text || "").toLowerCase();
  const n = toNumber(s);
  if (n === null) return null;
  if (s.includes("kg") || s.includes("kilo")) return n;
  if (s.includes("lb") || s.includes("libra")) return n * 0.453592;
  if (s.includes("g") && !s.includes("kg")) return n / 1000;
  return n;
}

export default function ContentModule() {
  const { establishments, updateEstablishment } = useData();
  const [selectedSurveyors, setSelectedSurveyors] = useState<string[]>([]);
  const [establishmentQuery, setEstablishmentQuery] = useState("");
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
  const [savingContentStatus, setSavingContentStatus] = useState(false);
  const [savingContentFields, setSavingContentFields] = useState(false);
  const [kgInfoOpen, setKgInfoOpen] = useState(false);
  const [phoneMap, setPhoneMap] = useState(() => loadPhoneContentMap());

  const surveyors = useMemo(() => {
    const set = new Set<string>();
    establishments.forEach((r) => set.add(getSurveyor(r)));
    return Array.from(set).filter(Boolean).sort((a, b) => a.localeCompare(b, "es"));
  }, [establishments]);

  const filteredRows = useMemo(() => {
    const q = establishmentQuery.trim().toLowerCase();
    return establishments.filter((r) => {
      if (selectedSurveyors.length > 0 && !selectedSurveyors.includes(getSurveyor(r))) return false;
      if (q && !(r.name || "").toLowerCase().includes(q)) return false;
      const d = (r.recordDate || "").trim();
      if (dateFrom && (!d || d < dateFrom)) return false;
      if (dateTo && (!d || d > dateTo)) return false;
      return true;
    });
  }, [establishments, selectedSurveyors, establishmentQuery, dateFrom, dateTo]);

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
    const sheetTotal = sheetTextToKg(selectedForRules.flourTotalText);
    const sheetBakery = sheetTextToKg(selectedForRules.bakeryQtyText);
    const sheetPastry = sheetTextToKg(selectedForRules.pastryQtyText);
    const phoneTotal = phoneTextToKg(phoneEntry?.totalValue || "", phoneEntry?.totalUnit || "kg");
    const phoneBakery = phoneTextToKg(phoneEntry?.bakeryValue || "", phoneEntry?.bakeryUnit || "kg");
    const phonePastry = phoneTextToKg(phoneEntry?.pastryValue || "", phoneEntry?.pastryUnit || "kg");
    const all = [[sheetTotal, phoneTotal], [sheetBakery, phoneBakery], [sheetPastry, phonePastry]];
    const comparable = all.every(([a, b]) => a !== null && b !== null);
    if (!comparable) return "Sin dato";
    const ok = all.every(([a, b]) => Math.abs((a as number) - (b as number)) <= (a as number) * 0.15 + 0.01);
    return ok ? "Coincide" : "No coincide";
  })() : "Sin dato";

  const flourKg = toKgFromContentText(flourTotalText) ?? toNumber(selectedForRules?.flourKgStandardText || "");
  const bakeryKg = toKgFromContentText(bakeryQtyText);
  const pastryKg = toKgFromContentText(pastryQtyText);
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
  const yeastTotalKg = levapanKg + fleischmanKg + levasafKg + otherYeastKg;
  const yeastPctEstimate = flourKg && flourKg > 0 ? (yeastTotalKg / flourKg) * 100 : null;

  useEffect(() => {
    setContentStatus(selected?.contentStatus || "");
    setFlourTotalText(selected?.flourTotalText || "");
    setBakeryQtyText(selected?.bakeryQtyText || "");
    setPastryQtyText(selected?.pastryQtyText || "");
    setLevapanText(selected?.levapanText || "");
    setFleischmanText(selected?.fleischmanText || "");
    setLevasafText(selected?.levasafText || "");
    setOtherYeastText(selected?.otherYeastText || "");
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

  const handleSaveContentStatus = async () => {
    if (!selected) return;
    if (!selected.sheetRowNumber) return toast.error("No se encontró la fila en Sheets para este registro");
    const updated: Establishment = { ...selected, contentStatus: contentStatus.trim() };
    updateEstablishment(updated, { skipAutoSync: true });
    try {
      setSavingContentStatus(true);
      await invokeGoogleSheets({
        action: "updateStatus",
        rowNumber: selected.sheetRowNumber,
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
    if (!selected.sheetRowNumber) return toast.error("No se encontró la fila en Sheets para este registro");
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
    try {
      setSavingContentFields(true);
      await invokeGoogleSheets({
        action: "updateContentFields",
        rowNumber: selected.sheetRowNumber,
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

      <div className="grid lg:grid-cols-4 gap-3 reveal-up reveal-up-delay-1">
        <div className="space-y-2">
          <Label>Filtrar encuestador</Label>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button type="button" variant="outline" className="h-10 w-full justify-start font-normal">
                {selectedSurveyors.length === 0
                  ? "Todos"
                  : selectedSurveyors.length === 1
                    ? selectedSurveyors[0]
                    : `${selectedSurveyors.length} seleccionados`}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent className="w-[320px] max-h-72 overflow-y-auto">
              {surveyors.map((s) => (
                <DropdownMenuCheckboxItem
                  key={s}
                  checked={selectedSurveyors.includes(s)}
                  onCheckedChange={(checked) => {
                    setSelectedSurveyors((prev) => (
                      checked ? [...prev, s] : prev.filter((x) => x !== s)
                    ));
                  }}
                >
                  {s}
                </DropdownMenuCheckboxItem>
              ))}
              {selectedSurveyors.length > 0 ? (
                <Button type="button" variant="ghost" size="sm" className="w-full mt-1" onClick={() => setSelectedSurveyors([])}>
                  Limpiar selección
                </Button>
              ) : null}
            </DropdownMenuContent>
          </DropdownMenu>
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
                <p className="text-xs text-muted-foreground">Cantidades editables (M, N, O, Q, R, S, T)</p>
                <div className="grid sm:grid-cols-3 gap-3">
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">Total de harina que consume</Label>
                    <Input value={flourTotalText} onChange={(e) => setFlourTotalText(e.target.value)} className="h-9" />
                    <p className="text-[11px] text-muted-foreground">KG estimados: {flourKg === null ? "Sin dato" : flourKg.toFixed(2)}</p>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">Elaborar panadería</Label>
                    <Input value={bakeryQtyText} onChange={(e) => setBakeryQtyText(e.target.value)} className="h-9" />
                    <p className="text-[11px] text-muted-foreground">KG estimados: {bakeryKg === null ? "Sin dato" : bakeryKg.toFixed(2)}</p>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">Elaborar pastelería</Label>
                    <Input value={pastryQtyText} onChange={(e) => setPastryQtyText(e.target.value)} className="h-9" />
                    <p className="text-[11px] text-muted-foreground">KG estimados: {pastryKg === null ? "Sin dato" : pastryKg.toFixed(2)}</p>
                  </div>
                </div>
                <div className="grid sm:grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">Levapan (Q)</Label>
                    <Input value={levapanText} onChange={(e) => setLevapanText(e.target.value)} className="h-9" />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">Fleischman (R)</Label>
                    <Input value={fleischmanText} onChange={(e) => setFleischmanText(e.target.value)} className="h-9" />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">Levasaf (S)</Label>
                    <Input value={levasafText} onChange={(e) => setLevasafText(e.target.value)} className="h-9" />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">Otras levaduras (T)</Label>
                    <Input value={otherYeastText} onChange={(e) => setOtherYeastText(e.target.value)} className="h-9" />
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
                  <p className={`text-sm font-medium ${getRule1Status(flourTotalText, bakeryQtyText, pastryQtyText) === "Falla" ? "text-destructive" : ""}`}>
                    {getRule1Status(flourTotalText, bakeryQtyText, pastryQtyText)}
                  </p>
                </div>
                <div className="rounded-lg border p-3">
                  <p className="text-xs text-muted-foreground">Cumple con Criterios</p>
                  <p className={`text-sm font-medium ${combinedStatus === "Falla" ? "text-destructive" : "text-emerald-600"}`}>{combinedStatus}</p>
                  <p className="text-xs text-muted-foreground mt-1">Criterio 1: {getDbStatus(selectedForRules)} · Criterio 2: {getDcStatus(selectedForRules)}</p>
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
                  <img
                    src={photoUrl}
                    alt={`Fachada de ${selected.name}`}
                    className="w-full h-72 object-contain rounded-md border bg-muted/20"
                    loading="lazy"
                    referrerPolicy="no-referrer"
                    onError={() => {
                      if (photoIdx < photoCandidates.length - 1) setPhotoIdx((v) => v + 1);
                      else setPhotoIdx(photoCandidates.length);
                    }}
                  />
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
                Levadura total estimada (Q+R+S+T):{" "}
                <span className="font-medium">{yeastTotalKg.toFixed(2)} kg</span>
                {yeastPctEstimate === null ? "" : ` · ${yeastPctEstimate.toFixed(2)}% sobre harina`}
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
    </div>
  );
}


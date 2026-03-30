import { useEffect, useMemo, useState } from "react";
import { useData } from "@/context/DataContext";
import { Establishment } from "@/types/establishment";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertCircle, CheckCircle2, Image as ImageIcon } from "lucide-react";
import { toast } from "sonner";
import { getEstablishmentKey, loadPhoneContentMap, phoneTextToKg, sheetTextToKg } from "@/lib/phoneContent";

const SURVEYOR_ALL = "__all__";
const CONTENT_STATUS_OPTIONS = [
  "Bueno",
  "Validar",
  "Malo",
  "OK PDV - No encuesta",
  "Hallazgo",
  "Sin contacto",
  "Bueno - No Telefono",
  "OK encuesta - No info",
  "Sin contenido",
  "NM, FS ó NE",
  "Sin numero",
] as const;

function getSurveyor(row: Establishment): string {
  return (row.listaNombre || row.contactName || row.localizedBy || "Sin encuestador").trim();
}

function toNumber(value: string): number | null {
  const m = value.match(/-?\d+(?:[.,]\d+)?/);
  if (!m) return null;
  return Number(m[0].replace(",", "."));
}

function parseKgFromFlourText(text: string): number | null {
  const s = (text || "").toLowerCase();
  const qty = toNumber(s);
  if (qty === null) return null;

  if (s.includes("kg") || s.includes("kilo")) return qty * (0.08 * 12.5);
  if (s.includes("bulto")) return qty * (4 * 12.5);
  if (s.includes("lb") || s.includes("libra")) return qty * (0.0363 * 12.5);
  if (s.includes("arroba")) return qty * 12.5;
  return qty * 12.5;
}

function getDbStatus(row: Establishment): "Cumple" | "Falla" | "Sin dato" {
  const raw = (row.dbStatus || "").trim().toLowerCase();
  if (raw === "cumple") return "Cumple";
  if (raw === "falla") return "Falla";

  const cd = toNumber(row.flourKgStandardText) ?? parseKgFromFlourText(row.flourTotalText);
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

function getRule1Status(row: Establishment): "Correcta" | "Falla" | "Sin dato" {
  const m = toNumber(row.flourTotalText);
  const n = toNumber(row.bakeryQtyText);
  const o = toNumber(row.pastryQtyText);
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

export default function ContentModule() {
  const { establishments, updateEstablishment, saveToSheets } = useData();
  const [surveyorFilter, setSurveyorFilter] = useState(SURVEYOR_ALL);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [photoIdx, setPhotoIdx] = useState(0);
  const [contentStatus, setContentStatus] = useState("");
  const [savingContentStatus, setSavingContentStatus] = useState(false);
  const [phoneMap, setPhoneMap] = useState(() => loadPhoneContentMap());

  const surveyors = useMemo(() => {
    const set = new Set<string>();
    establishments.forEach((r) => set.add(getSurveyor(r)));
    return Array.from(set).filter(Boolean).sort((a, b) => a.localeCompare(b, "es"));
  }, [establishments]);

  const grouped = useMemo(() => {
    const src = surveyorFilter === SURVEYOR_ALL
      ? establishments
      : establishments.filter((r) => getSurveyor(r) === surveyorFilter);

    const bySurveyor = new Map<string, Establishment[]>();
    src.forEach((r) => {
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
  }, [establishments, surveyorFilter]);

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

  const combinedStatus = selected
    ? (getDbStatus(selected) === "Cumple" && getDcStatus(selected) === "Cumple" ? "Cumple" : "Falla")
    : "Sin dato";
  const phoneCompareStatus = selected ? (() => {
    const sheetTotal = sheetTextToKg(selected.flourTotalText);
    const sheetBakery = sheetTextToKg(selected.bakeryQtyText);
    const sheetPastry = sheetTextToKg(selected.pastryQtyText);
    const phoneTotal = phoneTextToKg(phoneEntry?.totalValue || "", phoneEntry?.totalUnit || "kg");
    const phoneBakery = phoneTextToKg(phoneEntry?.bakeryValue || "", phoneEntry?.bakeryUnit || "kg");
    const phonePastry = phoneTextToKg(phoneEntry?.pastryValue || "", phoneEntry?.pastryUnit || "kg");
    const all = [
      [sheetTotal, phoneTotal],
      [sheetBakery, phoneBakery],
      [sheetPastry, phonePastry],
    ];
    const comparable = all.every(([a, b]) => a !== null && b !== null);
    if (!comparable) return "Sin dato";
    const ok = all.every(([a, b]) => Math.abs((a as number) - (b as number)) <= (a as number) * 0.15 + 0.01);
    return ok ? "Coincide" : "No coincide";
  })() : "Sin dato";

  useEffect(() => {
    setContentStatus(selected?.contentStatus || "");
  }, [selected?.id, selected?.contentStatus]);

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
    const updated: Establishment = { ...selected, contentStatus: contentStatus.trim() };
    const nextRows = establishments.map((row) => (row.id === updated.id ? updated : row));
    updateEstablishment(updated, { skipAutoSync: true });
    try {
      setSavingContentStatus(true);
      await saveToSheets(nextRows);
      toast.success("Estado contenido guardado");
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "No se pudo guardar");
    } finally {
      setSavingContentStatus(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="reveal-up">
        <h1 className="text-2xl font-bold">Contenido</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Validación de cantidades por encuestador y establecimiento.
        </p>
      </div>

      <div className="max-w-sm space-y-2 reveal-up reveal-up-delay-1">
        <Label>Filtrar encuestador</Label>
        <Select value={surveyorFilter} onValueChange={setSurveyorFilter}>
          <SelectTrigger className="h-10">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={SURVEYOR_ALL}>Todos</SelectItem>
            {surveyors.map((s) => (
              <SelectItem key={s} value={s}>{s}</SelectItem>
            ))}
          </SelectContent>
        </Select>
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
                      onClick={() => {
                        setSelectedId(r.id);
                        setPhotoIdx(0);
                      }}
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
            <div className="rounded-xl border bg-card p-6 text-sm text-muted-foreground text-center">
              No hay datos para mostrar.
            </div>
          ) : null}
      </div>

      <Dialog open={!!selected} onOpenChange={(open) => { if (!open) setSelectedId(null); }}>
        <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto">
          {!selected ? null : (
            <div className="space-y-4">
              <DialogHeader>
                <DialogTitle>{selected.name}</DialogTitle>
                <p className="text-xs text-muted-foreground">{selected.city} · {selected.address}</p>
              </DialogHeader>

              <div className="rounded-lg border p-3">
                <p className="text-xs text-muted-foreground mb-2">Estado contenido</p>
                <div className="flex flex-col sm:flex-row gap-2 sm:items-center">
                  <Select value={contentStatus || "__empty__"} onValueChange={(v) => setContentStatus(v === "__empty__" ? "" : v)}>
                    <SelectTrigger className="h-9 sm:max-w-sm">
                      <SelectValue placeholder="Selecciona estado" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__empty__">Sin estado</SelectItem>
                      {CONTENT_STATUS_OPTIONS.map((status) => (
                        <SelectItem key={status} value={status}>{status}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button
                    type="button"
                    size="sm"
                    className="h-9"
                    onClick={handleSaveContentStatus}
                    disabled={savingContentStatus}
                  >
                    {savingContentStatus ? "Guardando..." : "Guardar"}
                  </Button>
                </div>
              </div>

              <div className="grid sm:grid-cols-3 gap-3">
                <div className="rounded-lg border p-3">
                  <p className="text-xs text-muted-foreground">Total de harina que consume</p>
                  <p className="text-sm font-medium">{showValue(selected.flourTotalText)}</p>
                </div>
                <div className="rounded-lg border p-3">
                  <p className="text-xs text-muted-foreground">Elaborar panadería</p>
                  <p className="text-sm font-medium">{showValue(selected.bakeryQtyText)}</p>
                </div>
                <div className="rounded-lg border p-3">
                  <p className="text-xs text-muted-foreground">Elaborar pastelería</p>
                  <p className="text-sm font-medium">{showValue(selected.pastryQtyText)}</p>
                </div>
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
                  <p className={`text-sm font-medium ${getRule1Status(selected) === "Falla" ? "text-destructive" : ""}`}>{getRule1Status(selected)}</p>
                </div>
                <div className="rounded-lg border p-3">
                  <p className="text-xs text-muted-foreground">Cumple con Criterios</p>
                  <p className={`text-sm font-medium ${combinedStatus === "Falla" ? "text-destructive" : "text-emerald-600"}`}>{combinedStatus}</p>
                  <p className="text-xs text-muted-foreground mt-1">Criterio 1: {getDbStatus(selected)} · Criterio 2: {getDcStatus(selected)}</p>
                </div>
              </div>

              <div className="rounded-lg border p-3 space-y-2">
                <p className="text-xs text-muted-foreground">Controles de cantidad</p>
                <p className="text-sm">Cantidad estandarizada (kg): <span className="font-medium">{showValue(selected.flourKgStandardText)}</span></p>
                <p className="text-sm">Control 1: <span className="font-medium">{showValue(selected.controlCGText)}</span></p>
                <p className="text-sm">Control 2: <span className="font-medium">{showValue(selected.controlCHText)}</span></p>
              </div>

              <div className="rounded-lg border p-3">
                <p className="text-sm font-medium mb-2 flex items-center gap-2">
                  <ImageIcon className="w-4 h-4" /> Foto de fachada
                </p>
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
    </div>
  );
}


import { useDeferredValue, useEffect, useMemo, useState } from "react";
import { useData } from "@/context/DataContext";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Search, Phone, MessageCircle, Pencil, MapPin } from "lucide-react";
import EstablishmentForm from "@/components/EstablishmentForm";
import { Establishment } from "@/types/establishment";
import {
  PHONE_UNIT_OPTIONS, PhoneContentEntry, getEstablishmentKey, loadPhoneContentMap,
  savePhoneContentMap, phoneTextToKg, sheetTextToKg,
} from "@/lib/phoneContent";
import { toast } from "sonner";
import { PHONE_STATUS_OPTIONS } from "@/lib/statusOptions";
import { invokeGoogleSheets } from "@/lib/invokeGoogleSheets";

const PhoneModule = () => {
  const { establishments, updateEstablishment } = useData();
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<Establishment | undefined>();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [phoneMap, setPhoneMap] = useState<Record<string, PhoneContentEntry>>(() => loadPhoneContentMap());
  const [phoneStatusDraft, setPhoneStatusDraft] = useState("");
  const [savingPhoneStatus, setSavingPhoneStatus] = useState(false);
  const [draft, setDraft] = useState<PhoneContentEntry>({
    totalValue: "",
    totalUnit: "kg",
    bakeryValue: "",
    bakeryUnit: "kg",
    pastryValue: "",
    pastryUnit: "kg",
    updatedAt: "",
  });
  const deferredSearch = useDeferredValue(search);

  const selected = selectedId ? establishments.find((e) => e.id === selectedId) : undefined;
  const selectedKey = selected ? getEstablishmentKey(selected) : "";
  const selectedPhone = selectedKey ? phoneMap[selectedKey] : undefined;

  useEffect(() => {
    if (!selected) return;
    setPhoneStatusDraft(selected.phoneStatus || "");
    setDraft(selectedPhone || {
      totalValue: "",
      totalUnit: "kg",
      bakeryValue: "",
      bakeryUnit: "kg",
      pastryValue: "",
      pastryUnit: "kg",
      updatedAt: "",
    });
  }, [selected?.id, selectedPhone]);

  const handleSavePhoneStatus = async () => {
    if (!selected) return;
    if (!selected.sheetRowNumber) {
      toast.error("No se encontró la fila en Sheets para este registro");
      return;
    }
    const updated: Establishment = { ...selected, phoneStatus: phoneStatusDraft.trim() };
    updateEstablishment(updated, { skipAutoSync: true });
    try {
      setSavingPhoneStatus(true);
      await invokeGoogleSheets({
        action: "updateStatus",
        rowNumber: selected.sheetRowNumber,
        phoneStatus: updated.phoneStatus,
      });
      toast.success("Estado telefónico guardado");
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "No se pudo guardar");
    } finally {
      setSavingPhoneStatus(false);
    }
  };

  const filtered = useMemo(() => {
    if (!deferredSearch.trim()) return establishments;
    const q = deferredSearch.toLowerCase();
    return establishments.filter(
      (e) =>
        e.name.toLowerCase().includes(q) ||
        e.contactName.toLowerCase().includes(q) ||
        e.phone.includes(q)
    );
  }, [establishments, deferredSearch]);

  const sendWhatsApp = (e: Establishment) => {
    const phone = e.phone.replace(/[^0-9]/g, "");
    const message = encodeURIComponent(
      `Hola ${e.contactName}, te contacto respecto al establecimiento "${e.name}" ubicado en ${e.address}.`
    );
    window.open(`https://wa.me/${phone}?text=${message}`, "_blank");
  };

  return (
    <div className="space-y-6">
      <div className="reveal-up">
        <h1 className="text-2xl font-bold">Contactos telefónicos</h1>
        <p className="text-muted-foreground text-sm mt-1">Gestiona la información de contacto y envía mensajes por WhatsApp</p>
      </div>

      <div className="relative reveal-up reveal-up-delay-1">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          placeholder="Buscar por nombre, contacto o teléfono..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-10 h-10 max-w-md"
        />
      </div>

      <div className="grid lg:grid-cols-5 gap-4 reveal-up reveal-up-delay-2">
        <div className="lg:col-span-2 space-y-2">
        {filtered.length === 0 ? (
          <div className="col-span-full text-center py-12 text-muted-foreground">
            <Phone className="w-10 h-10 mx-auto mb-3 opacity-40" />
            <p className="font-medium">Sin resultados</p>
          </div>
        ) : (
          filtered.map((e) => (
            <div
              key={e.id}
              className={`p-3 rounded-lg border bg-card hover:shadow-sm transition-all duration-200 hover:border-primary/20 cursor-pointer ${
                selectedId === e.id ? "border-primary bg-primary/5" : ""
              }`}
              onClick={() => setSelectedId(e.id)}
            >
              <div className="flex items-start justify-between mb-2">
                <div className="min-w-0">
                  <h3 className="font-semibold text-sm truncate">{e.name}</h3>
                  <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                    <MapPin className="w-3 h-3 shrink-0" />
                    <span className="truncate">{e.address}</span>
                  </p>
                </div>
                <button
                  onClick={(ev) => {
                    ev.stopPropagation();
                    setEditing(e);
                  }}
                  className="p-1.5 rounded-md hover:bg-muted transition-colors text-muted-foreground shrink-0"
                >
                  <Pencil className="w-3.5 h-3.5" />
                </button>
              </div>

              <div className="space-y-1 mb-3">
                <div className="flex items-center gap-2">
                  <Phone className="w-3.5 h-3.5 text-primary shrink-0" />
                  <span className="text-sm font-mono">{e.phone || "—"}</span>
                </div>
                <div className="text-sm">
                  <span className="text-muted-foreground">Contacto: </span>
                  <span className="font-medium">{e.contactName || "—"}</span>
                </div>
                <div className="text-xs">
                  <span className="text-muted-foreground">Estado telefónico: </span>
                  <span className="font-medium">{e.phoneStatus || "Sin estado"}</span>
                </div>
                {e.notes && (
                  <p className="text-xs text-muted-foreground bg-muted rounded-md p-2 leading-relaxed">{e.notes}</p>
                )}
              </div>

              <Button
                onClick={(ev) => {
                  ev.stopPropagation();
                  sendWhatsApp(e);
                }}
                disabled={!e.phone}
                className="w-full gap-2 bg-success hover:bg-success/90 text-success-foreground h-8 text-xs"
                size="sm"
              >
                <MessageCircle className="w-4 h-4" />
                WhatsApp
              </Button>
            </div>
          ))
        )}
        </div>

        <div className="lg:col-span-3 rounded-xl border bg-card p-4">
          {!selected ? (
            <p className="text-sm text-muted-foreground">Selecciona un establecimiento para capturar contenido telefónico.</p>
          ) : (
            <div className="space-y-4">
              <div>
                <p className="text-xs uppercase tracking-wide text-muted-foreground">Establecimiento</p>
                <h3 className="text-lg font-semibold">{selected.name}</h3>
                <p className="text-xs text-muted-foreground">{selected.city} · {selected.address}</p>
              </div>

              <div className="rounded-lg border p-3 space-y-2">
                <p className="text-sm font-medium">Estado telefónico (BS)</p>
                <div className="flex flex-col sm:flex-row gap-2 sm:items-center">
                  <Select value={phoneStatusDraft || "__empty__"} onValueChange={(v) => setPhoneStatusDraft(v === "__empty__" ? "" : v)}>
                    <SelectTrigger className="h-9 sm:max-w-sm">
                      <SelectValue placeholder="Selecciona estado telefónico" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__empty__">Sin estado</SelectItem>
                      {PHONE_STATUS_OPTIONS.map((status) => (
                        <SelectItem key={status} value={status}>{status}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button
                    type="button"
                    size="sm"
                    className="h-9"
                    onClick={handleSavePhoneStatus}
                    disabled={savingPhoneStatus}
                  >
                    {savingPhoneStatus ? "Guardando..." : "Guardar estado"}
                  </Button>
                </div>
              </div>

              <div className="grid md:grid-cols-2 gap-4">
                <div className="rounded-lg border p-3 space-y-2">
                  <p className="text-sm font-medium">Contenido de hoja (referencia)</p>
                  <p className="text-xs">Total harina: <span className="font-medium">{selected.flourTotalText || "Sin dato"}</span></p>
                  <p className="text-xs">Panadería: <span className="font-medium">{selected.bakeryQtyText || "Sin dato"}</span></p>
                  <p className="text-xs">Pastelería: <span className="font-medium">{selected.pastryQtyText || "Sin dato"}</span></p>
                </div>
                <div className="rounded-lg border p-3 space-y-2">
                  <p className="text-sm font-medium">Contenido obtenido por telefónico</p>
                  {[
                    { key: "total", label: "Total harina", value: draft.totalValue, unit: draft.totalUnit },
                    { key: "bakery", label: "Panadería", value: draft.bakeryValue, unit: draft.bakeryUnit },
                    { key: "pastry", label: "Pastelería", value: draft.pastryValue, unit: draft.pastryUnit },
                  ].map((field) => (
                    <div key={field.key} className="grid grid-cols-[1fr_140px] gap-2 items-center">
                      <div className="space-y-1">
                        <Label className="text-xs text-muted-foreground">{field.label}</Label>
                        <Input
                          value={field.value}
                          onChange={(ev) => {
                            const next = { ...draft } as PhoneContentEntry;
                            if (field.key === "total") next.totalValue = ev.target.value;
                            if (field.key === "bakery") next.bakeryValue = ev.target.value;
                            if (field.key === "pastry") next.pastryValue = ev.target.value;
                            setDraft({ ...next, updatedAt: new Date().toISOString() });
                          }}
                          placeholder="Cantidad"
                          className="h-8 text-xs"
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs text-muted-foreground">Unidad</Label>
                        <Select
                          value={field.unit}
                          onValueChange={(v) => {
                            const next = { ...draft } as PhoneContentEntry;
                            if (field.key === "total") next.totalUnit = v;
                            if (field.key === "bakery") next.bakeryUnit = v;
                            if (field.key === "pastry") next.pastryUnit = v;
                            setDraft({ ...next, updatedAt: new Date().toISOString() });
                          }}
                        >
                          <SelectTrigger className="h-8 text-xs">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {PHONE_UNIT_OPTIONS.map((u) => (
                              <SelectItem key={u} value={u}>{u}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  ))}
                  <Button
                    type="button"
                    size="sm"
                    className="h-8 text-xs"
                    onClick={() => {
                      if (!selectedKey) return;
                      const nextMap = { ...phoneMap, [selectedKey]: { ...draft, updatedAt: new Date().toISOString() } };
                      setPhoneMap(nextMap);
                      savePhoneContentMap(nextMap);
                      window.dispatchEvent(new Event("srq-phone-content-updated"));
                      toast.success("Contenido telefónico guardado");
                    }}
                  >
                    Guardar contenido telefónico
                  </Button>
                </div>
              </div>

              <div className="rounded-lg border p-3">
                <p className="text-sm font-medium mb-2">Comparación VS hoja</p>
                {(() => {
                  const sheetTotal = sheetTextToKg(selected.flourTotalText);
                  const sheetBakery = sheetTextToKg(selected.bakeryQtyText);
                  const sheetPastry = sheetTextToKg(selected.pastryQtyText);
                  const phoneTotal = phoneTextToKg(draft.totalValue, draft.totalUnit);
                  const phoneBakery = phoneTextToKg(draft.bakeryValue, draft.bakeryUnit);
                  const phonePastry = phoneTextToKg(draft.pastryValue, draft.pastryUnit);
                  const all = [
                    [sheetTotal, phoneTotal],
                    [sheetBakery, phoneBakery],
                    [sheetPastry, phonePastry],
                  ];
                  const comparable = all.every(([a, b]) => a !== null && b !== null);
                  const ok = comparable && all.every(([a, b]) => Math.abs((a as number) - (b as number)) <= (a as number) * 0.15 + 0.01);
                  return (
                    <div className="text-sm">
                      <p className={`font-medium ${ok ? "text-emerald-600" : "text-destructive"}`}>
                        {comparable ? (ok ? "Coincide" : "No coincide") : "Sin datos suficientes para comparar"}
                      </p>
                      <p className="text-xs text-muted-foreground mt-1">Comparación en kg estandarizados (tolerancia 15%).</p>
                    </div>
                  );
                })()}
              </div>
            </div>
          )}
        </div>
      </div>

      {editing && (
        <EstablishmentForm
          initial={editing}
          onSave={(data) => {
            if ("id" in data) updateEstablishment(data);
          }}
          onClose={() => setEditing(undefined)}
        />
      )}
    </div>
  );
};

export default PhoneModule;

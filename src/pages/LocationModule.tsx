import { useEffect, useMemo, useRef, useState } from "react";
import { useData } from "@/context/DataContext";
import { useAuth } from "@/context/AuthContext";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Search, Plus, MapPin, Navigation, Pencil, Trash2, Calendar, ChevronDown } from "lucide-react";
import EstablishmentForm from "@/components/EstablishmentForm";
import { Establishment } from "@/types/establishment";
import { formatRecordDateEs } from "@/lib/dateOnly";
import { toast } from "sonner";

const FILTER_ALL = "__all__";

type SearchField = "address" | "coords";
type MapSearchMode = "establishment" | "address" | "coords";
const LOCALIZED_STATUS_OPTIONS = ["Correcta", "Corregida", "Cercana", "Recuperada", "Sin datos"] as const;

function getMapQuery(e: Establishment, mode: MapSearchMode): string {
  const city = e.city?.trim();
  if (mode === "establishment") {
    const name = e.name?.trim();
    const address = e.address?.trim();
    if (name && city) return `${name}, ${city}`;
    return name || (address && city ? `${address}, ${city}` : address) || `${e.latitude},${e.longitude}`;
  }
  if (mode === "address") {
    const address = e.address?.trim();
    if (address && city) return `${address}, ${city}`;
    return address || `${e.latitude},${e.longitude}`;
  }
  return `${e.latitude},${e.longitude}`;
}

function mapEmbedUrl(query: string): string {
  return `https://maps.google.com/maps?output=embed&q=${encodeURIComponent(query)}`;
}

function extractGoogleDriveFileId(url: string): string | null {
  const s = url.trim();
  if (!s) return null;

  let m = s.match(/\/file\/d\/([^/]+)/i);
  if (m?.[1]) return m[1];

  m = s.match(/[?&]id=([^&]+)/i);
  if (m?.[1]) return m[1];

  return null;
}

function facadeImageCandidates(rawUrl: string): string[] {
  const url = rawUrl.trim();
  if (!url) return [];

  const id = extractGoogleDriveFileId(url);
  if (!id) return [url];

  // Distintas variantes porque algunos links de Drive bloquean hotlink según permisos.
  return [
    `https://drive.google.com/thumbnail?id=${id}&sz=w1200`,
    `https://drive.google.com/uc?export=view&id=${id}`,
    `https://lh3.googleusercontent.com/d/${id}=w1200`,
    url,
  ];
}

function openGoogleMaps(e: Establishment, mode: MapSearchMode) {
  const q = getMapQuery(e, mode);
  window.open(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}`, "_blank");
}

function MapsMenu({ establishment }: { establishment: Establishment }) {
  const hasName = Boolean(establishment.name?.trim());
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          onClick={(ev) => ev.stopPropagation()}
          className="p-1.5 rounded-md hover:bg-muted transition-colors text-primary inline-flex items-center gap-0.5"
          title="Abrir en Google Maps"
        >
          <Navigation className="w-3.5 h-3.5" />
          <ChevronDown className="w-3 h-3 opacity-70" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuItem
          disabled={!hasName}
          onClick={() => openGoogleMaps(establishment, "establishment")}
        >
          Por establecimiento (nombre)
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => openGoogleMaps(establishment, "address")}>
          Por dirección
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => openGoogleMaps(establishment, "coords")}>
          Por coordenadas (lat, long)
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

const LocationModule = () => {
  const { user } = useAuth();
  const { establishments, addEstablishment, updateEstablishment, deleteEstablishment, saveToSheets } = useData();
  const [search, setSearch] = useState("");
  const [searchField, setSearchField] = useState<SearchField>("address");
  const [filterEstName, setFilterEstName] = useState<string>(FILTER_ALL);
  const [filterDateFrom, setFilterDateFrom] = useState(""); // YYYY-MM-DD
  const [filterDateTo, setFilterDateTo] = useState(""); // YYYY-MM-DD
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Establishment | undefined>();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [mapSearchMode, setMapSearchMode] = useState<MapSearchMode>("coords");
  const [mapLoadError, setMapLoadError] = useState(false);
  const [facadeCandidateIndex, setFacadeCandidateIndex] = useState(0);
  const [localizedStatus, setLocalizedStatus] = useState("");
  const [localizedBy, setLocalizedBy] = useState("");
  const [savingLocalized, setSavingLocalized] = useState(false);
  const detailsPanelRef = useRef<HTMLDivElement | null>(null);

  const establishmentNames = useMemo(() => {
    const names = new Set<string>();
    establishments.forEach((e) => {
      const n = e.name?.trim();
      if (n) names.add(n);
    });
    return Array.from(names).sort((a, b) => a.localeCompare(b, "es"));
  }, [establishments]);

  const processed = useMemo(() => {
    let list = [...establishments];

    if (filterEstName !== FILTER_ALL) {
      list = list.filter((e) => (e.name?.trim() ?? "") === filterEstName);
    }

    if (filterDateFrom || filterDateTo) {
      list = list.filter((e) => {
        const d = e.recordDate;
        if (!d) return false;
        if (filterDateFrom && d < filterDateFrom) return false;
        if (filterDateTo && d > filterDateTo) return false;
        return true;
      });
    }

    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter((e) => {
        if (searchField === "address") {
          return `${e.address} ${e.city || ""}`.toLowerCase().includes(q);
        }
        return `${e.latitude},${e.longitude}`.includes(q);
      });
    }

    list.sort((a, b) => {
      const da = a.recordDate || "";
      const db = b.recordDate || "";
      if (da !== db) return db.localeCompare(da);
      return a.name.localeCompare(b.name, "es");
    });

    return list;
  }, [establishments, filterEstName, filterDateFrom, filterDateTo, search, searchField]);

  const selected = selectedId ? processed.find((e) => e.id === selectedId) : undefined;
  const selectedQuery = selected ? getMapQuery(selected, mapSearchMode) : "";
  const facadeCandidates = useMemo(
    () => facadeImageCandidates(selected?.facadePhotoUrl || ""),
    [selected?.facadePhotoUrl]
  );
  const activeFacadeUrl = facadeCandidates[facadeCandidateIndex] || "";

  const mapSrc = useMemo(() => {
    const target = selected;
    if (!target) return mapEmbedUrl("10.48,-66.87");
    return mapEmbedUrl(getMapQuery(target, mapSearchMode));
  }, [mapSearchMode, selected]);

  useEffect(() => {
    setMapLoadError(false);
  }, [mapSrc]);

  useEffect(() => {
    setFacadeCandidateIndex(0);
  }, [selected?.id, selected?.facadePhotoUrl]);

  useEffect(() => {
    if (!selected) {
      setLocalizedStatus("");
      setLocalizedBy("");
      return;
    }
    setLocalizedStatus(selected.localizedStatus || "");
    setLocalizedBy(selected.localizedBy || user?.name || "");
  }, [selected?.id, selected?.localizedStatus, selected?.localizedBy, user?.name]);

  const handleSelectEstablishment = (id: string) => {
    setSelectedId(id);
    setTimeout(() => {
      detailsPanelRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 50);
  };

  const handleSaveLocalized = async () => {
    if (!selected) return;
    const updated: Establishment = {
      ...selected,
      localizedStatus: localizedStatus.trim(),
      localizedBy: localizedBy.trim() || (user?.name || ""),
    };
    const nextRows = establishments.map((row) => (row.id === updated.id ? updated : row));
    updateEstablishment(updated, { skipAutoSync: true });
    try {
      setSavingLocalized(true);
      await saveToSheets(nextRows);
      toast.success("Localización guardada en Google Sheets");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "No se pudo guardar";
      toast.error(msg);
    } finally {
      setSavingLocalized(false);
    }
  };

  const searchFields: { value: SearchField; label: string }[] = [
    { value: "address", label: "Dirección" },
    { value: "coords", label: "Coordenadas" },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 reveal-up">
        <div>
          <h1 className="text-2xl font-bold">Localización</h1>
          <p className="text-muted-foreground text-sm mt-1">
            {processed.length} de {establishments.length} establecimientos (orden: fecha más reciente primero)
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button onClick={() => { setEditing(undefined); setShowForm(true); }} className="gap-2" size="sm">
            <Plus className="w-4 h-4" />
            Nuevo
          </Button>
        </div>
      </div>

      {/* Filtro por rango de fechas (columna A, solo día) */}
      <div className="flex flex-col gap-3 rounded-lg border bg-card p-4 reveal-up reveal-up-delay-1">
        <div className="space-y-1">
          <Label className="flex items-center gap-2 text-sm font-medium">
            <Calendar className="w-4 h-4" />
            Filtrar por rango de fechas
          </Label>
          <p className="text-xs text-muted-foreground">
            Fecha tomada de la columna A (solo día). Puedes usar solo &quot;desde&quot;, solo &quot;hasta&quot; o ambos. Los registros sin fecha no aparecen al filtrar.
          </p>
        </div>
        <div className="flex flex-col sm:flex-row sm:items-end gap-3 flex-wrap">
          <div className="space-y-2 flex-1 min-w-[160px] sm:max-w-[200px]">
            <Label htmlFor="filter-from" className="text-xs text-muted-foreground">Desde</Label>
            <Input
              id="filter-from"
              type="date"
              value={filterDateFrom}
              onChange={(e) => setFilterDateFrom(e.target.value)}
              className="h-10"
            />
          </div>
          <div className="space-y-2 flex-1 min-w-[160px] sm:max-w-[200px]">
            <Label htmlFor="filter-to" className="text-xs text-muted-foreground">Hasta</Label>
            <Input
              id="filter-to"
              type="date"
              value={filterDateTo}
              onChange={(e) => setFilterDateTo(e.target.value)}
              className="h-10"
            />
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="shrink-0"
            disabled={!filterDateFrom && !filterDateTo}
            onClick={() => {
              setFilterDateFrom("");
              setFilterDateTo("");
            }}
          >
            Quitar filtro
          </Button>
        </div>
      </div>

      {/* Filtro por nombre del establecimiento (columna AL) + búsqueda texto */}
      <div className="flex flex-col gap-4 reveal-up reveal-up-delay-1">
        <div className="space-y-2 max-w-xl">
          <Label htmlFor="filter-est-name" className="text-sm font-medium">
            Nombre del establecimiento
          </Label>
          <Select value={filterEstName} onValueChange={setFilterEstName}>
            <SelectTrigger id="filter-est-name" className="h-10 w-full sm:max-w-md">
              <SelectValue placeholder="Todos los establecimientos" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={FILTER_ALL}>Todos los establecimientos</SelectItem>
              {establishmentNames.map((name) => (
                <SelectItem key={name} value={name}>
                  {name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">
            Elige un establecimiento en la lista o deja &quot;Todos&quot; para ver todos. La búsqueda de texto solo aplica a dirección o coordenadas.
          </p>
        </div>

        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder={`Buscar por ${searchFields.find((f) => f.value === searchField)?.label.toLowerCase()}...`}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-10 h-10"
            />
          </div>
          <div className="flex rounded-lg border bg-card p-0.5 gap-0.5 shrink-0">
            {searchFields.map((f) => (
              <button
                key={f.value}
                type="button"
                onClick={() => setSearchField(f.value)}
                className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                  searchField === f.value ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Lista de establecimientos (arriba) */}
      <div className="space-y-2 reveal-up reveal-up-delay-2">
          {processed.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <MapPin className="w-10 h-10 mx-auto mb-3 opacity-40" />
              <p className="font-medium">Sin resultados</p>
              <p className="text-sm mt-1">Ajusta el establecimiento, fechas o la búsqueda</p>
            </div>
          ) : (
            processed.map((e) => (
              <div
                key={e.id}
                role="button"
                tabIndex={0}
                onClick={() => handleSelectEstablishment(e.id)}
                onKeyDown={(ev) => {
                  if (ev.key === "Enter" || ev.key === " ") {
                    ev.preventDefault();
                    handleSelectEstablishment(e.id);
                  }
                }}
                className={`p-4 rounded-xl border cursor-pointer transition-all duration-200 hover:shadow-md active:scale-[0.98] ${
                  selected?.id === e.id ? "border-primary bg-primary/5 shadow-sm" : "bg-card hover:border-primary/30"
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-[10px] uppercase tracking-wide text-muted-foreground font-medium">
                      Nombre del establecimiento (columna AL)
                    </p>
                    <h3 className="font-semibold text-sm truncate leading-tight mt-0.5">{e.name}</h3>
                    {e.listaNombre ? (
                      <p className="text-xs text-muted-foreground mt-1 truncate">
                        Nombre (lista col. D): <span className="font-medium text-foreground">{e.listaNombre}</span>
                      </p>
                    ) : null}
                    <p className="text-xs text-muted-foreground mt-1">
                      Fecha: <span className="font-medium text-foreground">{formatRecordDateEs(e.recordDate)}</span>
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5 truncate">{e.address}</p>
                    {e.city ? (
                      <p className="text-xs text-muted-foreground/80 mt-0.5 truncate">Ciudad: {e.city}</p>
                    ) : null}
                    <p className="text-xs text-muted-foreground/60 mt-1 font-mono">
                      {e.latitude.toFixed(4)}, {e.longitude.toFixed(4)}
                    </p>
                    {e.localizedStatus ? (
                      <p className="text-xs mt-1">
                        <span className="px-2 py-0.5 rounded-full bg-primary/10 text-primary font-medium">
                          {e.localizedStatus}
                        </span>
                        {e.localizedBy ? (
                          <span className="text-muted-foreground ml-2">por {e.localizedBy}</span>
                        ) : null}
                      </p>
                    ) : null}
                  </div>
                  <div className="flex gap-1 shrink-0">
                    <MapsMenu establishment={e} />
                    <button
                      type="button"
                      onClick={(ev) => { ev.stopPropagation(); setEditing(e); setShowForm(true); }}
                      className="p-1.5 rounded-md hover:bg-muted transition-colors text-muted-foreground"
                    >
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={(ev) => { ev.stopPropagation(); deleteEstablishment(e.id); }}
                      className="p-1.5 rounded-md hover:bg-destructive/10 transition-colors text-destructive"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            ))
          )}
      </div>

      {/* Panel inferior: aparece al hacer clic en un registro */}
      <div ref={detailsPanelRef} className="reveal-up reveal-up-delay-3">
        {selected ? (
          <div className="space-y-3">
          <div className="mb-3 flex items-center gap-2 flex-wrap">
            <span className="text-xs text-muted-foreground">Mapa por:</span>
            <button
              type="button"
              onClick={() => setMapSearchMode("establishment")}
              className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                mapSearchMode === "establishment"
                  ? "bg-primary text-primary-foreground"
                  : "border text-muted-foreground hover:text-foreground"
              }`}
            >
              Nombre establecimiento
            </button>
            <button
              type="button"
              onClick={() => setMapSearchMode("address")}
              className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                mapSearchMode === "address"
                  ? "bg-primary text-primary-foreground"
                  : "border text-muted-foreground hover:text-foreground"
              }`}
            >
              Dirección
            </button>
            <button
              type="button"
              onClick={() => setMapSearchMode("coords")}
              className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                mapSearchMode === "coords"
                  ? "bg-primary text-primary-foreground"
                  : "border text-muted-foreground hover:text-foreground"
              }`}
            >
              Coordenadas
            </button>
          </div>
          <div className="grid lg:grid-cols-4 gap-4">
            <div className="lg:col-span-3 rounded-xl overflow-hidden border bg-card shadow-sm" style={{ height: "480px" }}>
              <iframe
                key={`${selected.id}-${mapSearchMode}-${selectedQuery}`}
                src={mapSrc}
                width="100%"
                height="100%"
                style={{ border: 0 }}
                allowFullScreen
                loading="lazy"
                referrerPolicy="no-referrer-when-downgrade"
                title="Mapa de ubicación"
                onError={() => setMapLoadError(true)}
              />
            </div>
            <div className="rounded-xl border bg-card p-4 text-sm text-muted-foreground space-y-3">
              <p className="font-medium text-foreground mb-1">Foto de fachada</p>
              {selected.facadePhotoUrl?.trim() ? (
                <img
                  src={activeFacadeUrl}
                  alt={`Fachada de ${selected.name}`}
                  className="w-full h-44 object-cover rounded-lg border"
                  loading="lazy"
                  referrerPolicy="no-referrer"
                  onError={() => {
                    if (facadeCandidateIndex < facadeCandidates.length - 1) {
                      setFacadeCandidateIndex((v) => v + 1);
                    }
                  }}
                />
              ) : (
                <p className="text-xs">Sin foto en la columna AU.</p>
              )}
              <p className="text-xs break-all">URL: {selected.facadePhotoUrl || "—"}</p>
              {selected.facadePhotoUrl?.trim() && !activeFacadeUrl ? (
                <p className="text-xs text-destructive">No se pudo generar URL de previsualización.</p>
              ) : null}
            </div>
          </div>
            <div className="mt-1 flex flex-col gap-2 text-sm text-muted-foreground">
              <div className="flex items-center gap-2 flex-wrap">
                <MapPin className="w-3.5 h-3.5 text-primary shrink-0" />
                <span className="font-medium text-foreground">{selected.name}</span>
                <span className="text-xs">({formatRecordDateEs(selected.recordDate)})</span>
                {selected.listaNombre ? (
                  <span className="text-xs text-muted-foreground">· Lista D: {selected.listaNombre}</span>
                ) : null}
              </div>
              <span className="text-xs pl-6">{selected.address}</span>
              {selected.city ? (
                <span className="text-xs pl-6">Ciudad: {selected.city}</span>
              ) : null}
              <div className="pl-6 pt-2 grid sm:grid-cols-3 gap-2 items-end">
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">Localizado (BV)</Label>
                  <Select value={localizedStatus || "__empty__"} onValueChange={(v) => setLocalizedStatus(v === "__empty__" ? "" : v)}>
                    <SelectTrigger className="h-8 text-xs">
                      <SelectValue placeholder="Selecciona estado" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__empty__">Sin estado</SelectItem>
                      {LOCALIZED_STATUS_OPTIONS.map((status) => (
                        <SelectItem key={status} value={status}>{status}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1 sm:col-span-2">
                  <Label className="text-xs text-muted-foreground">Localizado por (BW)</Label>
                  <div className="flex gap-2">
                    <Input
                      value={localizedBy}
                      onChange={(e) => setLocalizedBy(e.target.value)}
                      placeholder="Nombre de usuario"
                      className="h-8 text-xs"
                    />
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-8 text-xs shrink-0"
                      onClick={() => setLocalizedBy(user?.name || "")}
                    >
                      Mi nombre
                    </Button>
                  </div>
                </div>
              </div>
              <div className="pl-6">
                <Button
                  type="button"
                  size="sm"
                  className="h-8 text-xs"
                  onClick={handleSaveLocalized}
                  disabled={savingLocalized}
                >
                  {savingLocalized ? "Guardando..." : "Guardar localización"}
                </Button>
              </div>
              <div className="pl-6 flex flex-wrap items-center gap-2 pt-1">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-8 text-xs"
                  onClick={() => openGoogleMaps(selected, mapSearchMode)}
                >
                  Abrir Google Maps ({mapSearchMode === "establishment" ? "establecimiento" : mapSearchMode === "address" ? "dirección" : "coordenadas"})
                </Button>
                {mapLoadError ? (
                  <span className="text-xs text-destructive">No se pudo cargar el iframe; usa el botón para abrir Maps en pestaña nueva.</span>
                ) : null}
              </div>
            </div>
          </div>
        ) : (
          <div className="rounded-xl border bg-card p-8 text-center text-muted-foreground">
            Selecciona un establecimiento de la lista para mostrar el mapa.
          </div>
        )}
      </div>

      {showForm && (
        <EstablishmentForm
          initial={editing}
          onSave={(data) => {
            if ("id" in data) updateEstablishment(data);
            else addEstablishment(data);
          }}
          onClose={() => setShowForm(false)}
        />
      )}
    </div>
  );
};

export default LocationModule;

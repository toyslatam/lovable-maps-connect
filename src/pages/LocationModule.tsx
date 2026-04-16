import { useEffect, useMemo, useState } from "react";
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
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Command,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Search, Plus, MapPin, Navigation, Pencil, Trash2, Calendar, ChevronDown, ChevronsUpDown, Check } from "lucide-react";
import { cn } from "@/lib/utils";
import EstablishmentForm from "@/components/EstablishmentForm";
import { Establishment } from "@/types/establishment";
import { formatRecordDateEs } from "@/lib/dateOnly";
import { toast } from "sonner";
import { GoogleMap, MarkerF, useJsApiLoader } from "@react-google-maps/api";
import { invokeGoogleSheets } from "@/lib/invokeGoogleSheets";

const FILTER_ALL = "__all__";
const USER_DIRECTORY_KEY = "geotrack_user_directory_names";

/** Búsqueda flexible: minúsculas y sin marcas diacríticas. */
function normalizeForSearch(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

const EST_COMBO_INITIAL = 150;
const EST_COMBO_SEARCH_MAX = 400;
const USER_COMBO_INITIAL = 50;
const USER_COMBO_SEARCH_MAX = 200;

function readUserDirectory(): string[] {
  try {
    const raw = localStorage.getItem(USER_DIRECTORY_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((v): v is string => typeof v === "string")
      .map((v) => v.trim())
      .filter(Boolean);
  } catch {
    return [];
  }
}

function writeUserDirectory(names: string[]) {
  try {
    localStorage.setItem(USER_DIRECTORY_KEY, JSON.stringify(names));
  } catch {
    // ignore quota / privacy mode
  }
}

type SearchField = "address" | "coords";
type MapSearchMode = "establishment" | "address" | "coords";
const LOCALIZED_STATUS_OPTIONS = ["Correcta", "Corregida", "Cercana", "Recuperada", "Sin datos"] as const;
const GOOGLE_LIBRARIES: ("places")[] = ["places"];

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

function openStreetView(e: Establishment) {
  const lat = Number.isFinite(e.latitude) ? e.latitude : 0;
  const lng = Number.isFinite(e.longitude) ? e.longitude : 0;
  const url = `https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=${lat},${lng}`;
  window.open(url, "_blank");
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
  const { establishments, addEstablishment, updateEstablishment, deleteEstablishment } = useData();
  const [search, setSearch] = useState("");
  const [searchField, setSearchField] = useState<SearchField>("address");
  const [filterEstName, setFilterEstName] = useState<string>(FILTER_ALL);
  const [estNameOpen, setEstNameOpen] = useState(false);
  const [estComboSearch, setEstComboSearch] = useState("");
  const [filterDateFrom, setFilterDateFrom] = useState(""); // YYYY-MM-DD
  const [filterDateTo, setFilterDateTo] = useState(""); // YYYY-MM-DD
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Establishment | undefined>();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [mapSearchMode, setMapSearchMode] = useState<MapSearchMode>("coords");
  const [mapLoadError, setMapLoadError] = useState(false);
  const [facadeCandidateIndex, setFacadeCandidateIndex] = useState(0);
  const [facadeViewerOpen, setFacadeViewerOpen] = useState(false);
  const [mapCenter, setMapCenter] = useState<{ lat: number; lng: number }>({ lat: 10.48, lng: -66.87 });
  const [mapZoom, setMapZoom] = useState(14);
  const [localizedStatus, setLocalizedStatus] = useState("");
  const [localizedBy, setLocalizedBy] = useState("");
  const [localizedByOpen, setLocalizedByOpen] = useState(false);
  const [localizedBySearch, setLocalizedBySearch] = useState("");
  const [newUserOpen, setNewUserOpen] = useState(false);
  const [newUserName, setNewUserName] = useState("");
  const [savingLocalized, setSavingLocalized] = useState(false);
  const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY || "";
  const { isLoaded: isMapLoaded, loadError: mapApiError } = useJsApiLoader({
    id: "srq-google-map",
    googleMapsApiKey: apiKey,
    libraries: GOOGLE_LIBRARIES,
  });

  const establishmentNames = useMemo(() => {
    const names = new Set<string>();
    establishments.forEach((e) => {
      const n = e.name?.trim();
      if (n) names.add(n);
    });
    return Array.from(names).sort((a, b) => a.localeCompare(b, "es"));
  }, [establishments]);

  const establishmentNameCombo = useMemo(() => {
    const q = normalizeForSearch(estComboSearch.trim());
    const total = establishmentNames.length;
    if (!q) {
      const items = establishmentNames.slice(0, EST_COMBO_INITIAL);
      return {
        items,
        hint:
          total > EST_COMBO_INITIAL
            ? `Mostrando los primeros ${EST_COMBO_INITIAL} de ${total.toLocaleString("es-VE")}. Escribe para buscar en todos.`
            : null,
      };
    }
    const matched = establishmentNames.filter((n) => normalizeForSearch(n).includes(q));
    const sliced = matched.slice(0, EST_COMBO_SEARCH_MAX);
    return {
      items: sliced,
      hint:
        matched.length > EST_COMBO_SEARCH_MAX
          ? `Mostrando ${EST_COMBO_SEARCH_MAX} de ${matched.length.toLocaleString("es-VE")} coincidencias. Acota la búsqueda si hace falta.`
          : matched.length === 0
            ? null
            : `${matched.length.toLocaleString("es-VE")} coincidencia${matched.length === 1 ? "" : "s"}`,
    };
  }, [establishmentNames, estComboSearch]);

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

  const localizedByOptions = useMemo(() => {
    const fromStorage = readUserDirectory();
    const fromData = new Set<string>();
    establishments.forEach((e) => {
      const a = e.localizedBy?.trim();
      if (a) fromData.add(a);
      const b = e.listaNombre?.trim();
      if (b) fromData.add(b);
    });
    const all = new Set<string>([...fromStorage, ...Array.from(fromData)]);
    if (user?.name?.trim()) all.add(user.name.trim());
    return Array.from(all).sort((a, b) => a.localeCompare(b, "es"));
  }, [establishments, user?.name]);

  const localizedByCombo = useMemo(() => {
    const q = normalizeForSearch(localizedBySearch.trim());
    const total = localizedByOptions.length;
    if (!q) {
      return {
        items: localizedByOptions.slice(0, USER_COMBO_INITIAL),
        hint:
          total > USER_COMBO_INITIAL
            ? `Mostrando los primeros ${USER_COMBO_INITIAL} de ${total.toLocaleString("es-VE")}. Escribe para buscar.`
            : null,
        matchedCount: total,
        query: "",
      };
    }
    const matched = localizedByOptions.filter((n) => normalizeForSearch(n).includes(q));
    return {
      items: matched.slice(0, USER_COMBO_SEARCH_MAX),
      hint:
        matched.length > USER_COMBO_SEARCH_MAX
          ? `Mostrando ${USER_COMBO_SEARCH_MAX} de ${matched.length.toLocaleString("es-VE")} coincidencias.`
          : matched.length === 0
            ? null
            : `${matched.length.toLocaleString("es-VE")} coincidencia${matched.length === 1 ? "" : "s"}`,
      matchedCount: matched.length,
      query: localizedBySearch.trim(),
    };
  }, [localizedByOptions, localizedBySearch]);

  const mapSrc = useMemo(() => {
    const target = selected;
    if (!target) return mapEmbedUrl("10.48,-66.87");
    return mapEmbedUrl(getMapQuery(target, mapSearchMode));
  }, [mapSearchMode, selected]);

  useEffect(() => {
    setMapLoadError(false);
  }, [mapSrc]);

  useEffect(() => {
    if (!selected) return;
    if (mapSearchMode === "coords") {
      setMapCenter({ lat: selected.latitude, lng: selected.longitude });
      setMapZoom(17);
      return;
    }
    const g = (window as any).google;
    if (!isMapLoaded || !g?.maps?.Geocoder) return;

    const geocoder = new g.maps.Geocoder();
    geocoder.geocode({ address: getMapQuery(selected, mapSearchMode) }, (results: any[], status: string) => {
      if (status === "OK" && results?.[0]?.geometry?.location) {
        const p = results[0].geometry.location;
        setMapCenter({ lat: p.lat(), lng: p.lng() });
        setMapZoom(17);
        return;
      }
      setMapCenter({ lat: selected.latitude, lng: selected.longitude });
      setMapZoom(16);
    });
  }, [selected?.id, selected?.latitude, selected?.longitude, selectedQuery, mapSearchMode, isMapLoaded]);

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
  };

  const handleSaveLocalized = async () => {
    if (!selected) return;
    if (!selected.sheetRowNumber) {
      toast.error("No se encontró la fila en Sheets para este registro");
      return;
    }
    const updated: Establishment = {
      ...selected,
      localizedStatus: localizedStatus.trim(),
      localizedBy: localizedBy.trim() || (user?.name || ""),
    };
    updateEstablishment(updated, { skipAutoSync: true });
    try {
      setSavingLocalized(true);
      await invokeGoogleSheets({
        action: "updateStatus",
        rowNumber: selected.sheetRowNumber,
        localizedStatus: updated.localizedStatus,
        localizedBy: updated.localizedBy,
      });
      toast.success("Localización guardada en Google Sheets");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "No se pudo guardar";
      toast.error(msg);
    } finally {
      setSavingLocalized(false);
    }
  };

  const handleCreateUser = () => {
    const name = newUserName.trim();
    if (!name) {
      toast.error("Escribe un nombre");
      return;
    }
    const existing = readUserDirectory();
    const merged = Array.from(new Set([...existing, name])).sort((a, b) => a.localeCompare(b, "es"));
    writeUserDirectory(merged);
    setLocalizedBy(name);
    setNewUserName("");
    setNewUserOpen(false);
    toast.success("Usuario agregado");
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
          <Popover
            open={estNameOpen}
            onOpenChange={(open) => {
              setEstNameOpen(open);
              if (!open) setEstComboSearch("");
            }}
          >
            <PopoverTrigger asChild>
              <Button
                id="filter-est-name"
                type="button"
                variant="outline"
                role="combobox"
                aria-expanded={estNameOpen}
                className="h-10 w-full sm:max-w-md justify-between font-normal px-3"
              >
                <span className="truncate text-left">
                  {filterEstName === FILTER_ALL
                    ? "Todos los establecimientos"
                    : filterEstName}
                </span>
                <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
              </Button>
            </PopoverTrigger>
            <PopoverContent
              className="p-0 w-[min(100vw-2rem,28rem)] z-[100]"
              align="start"
              sideOffset={4}
            >
              <Command shouldFilter={false}>
                <CommandInput
                  placeholder="Buscar por nombre, palabra o número…"
                  value={estComboSearch}
                  onValueChange={setEstComboSearch}
                />
                {establishmentNameCombo.hint && (
                  <p className="px-3 py-2 text-[11px] text-muted-foreground border-b border-border">
                    {establishmentNameCombo.hint}
                  </p>
                )}
                <CommandList>
                  <CommandGroup>
                    <CommandItem
                      value={FILTER_ALL}
                      onSelect={() => {
                        setFilterEstName(FILTER_ALL);
                        setEstNameOpen(false);
                        setEstComboSearch("");
                      }}
                    >
                      <Check
                        className={cn(
                          "mr-2 h-4 w-4 shrink-0",
                          filterEstName === FILTER_ALL ? "opacity-100" : "opacity-0"
                        )}
                      />
                      Todos los establecimientos
                    </CommandItem>
                    {establishmentNameCombo.items.map((name) => (
                      <CommandItem
                        key={name}
                        value={name}
                        onSelect={() => {
                          setFilterEstName(name);
                          setEstNameOpen(false);
                          setEstComboSearch("");
                        }}
                      >
                        <Check
                          className={cn(
                            "mr-2 h-4 w-4 shrink-0",
                            filterEstName === name ? "opacity-100" : "opacity-0"
                          )}
                        />
                        <span className="truncate">{name}</span>
                      </CommandItem>
                    ))}
                  </CommandGroup>
                  {estComboSearch.trim() && establishmentNameCombo.items.length === 0 && (
                    <p className="px-3 py-3 text-center text-sm text-muted-foreground border-t border-border">
                      No hay coincidencias. Prueba otra palabra, parte del nombre o el número.
                    </p>
                  )}
                </CommandList>
              </Command>
            </PopoverContent>
          </Popover>
          <p className="text-xs text-muted-foreground">
            Abre el listado y escribe para filtrar entre miles de nombres (ignora acentos). La búsqueda inferior sigue aplicando solo a dirección o coordenadas.
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
                        Encuestador (col. D): <span className="font-medium text-foreground">{e.listaNombre}</span>
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

      <Dialog open={!!selected} onOpenChange={(open) => { if (!open) setSelectedId(null); }}>
        <DialogContent className="max-w-6xl max-h-[92vh] overflow-y-auto">
          {!selected ? null : (
            <div className="space-y-3">
              <div className="mb-2 flex items-center gap-2 flex-wrap">
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
                  {apiKey && isMapLoaded && !mapApiError ? (
                    <GoogleMap
                      mapContainerStyle={{ width: "100%", height: "100%" }}
                      center={mapCenter}
                      zoom={mapZoom}
                      options={{
                        streetViewControl: true,
                        fullscreenControl: true,
                        mapTypeControl: true,
                      }}
                    >
                      <MarkerF position={mapCenter} />
                    </GoogleMap>
                  ) : (
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
                  )}
                </div>
                <div className="rounded-xl border bg-card p-4 text-sm text-muted-foreground space-y-3">
                  <p className="font-medium text-foreground mb-1">Foto de fachada</p>
                  {selected.facadePhotoUrl?.trim() ? (
                    <button
                      type="button"
                      className="w-full text-left"
                      onClick={() => setFacadeViewerOpen(true)}
                      title="Ver foto en grande"
                    >
                      <img
                        src={activeFacadeUrl}
                        alt={`Fachada de ${selected.name}`}
                        className="w-full h-44 object-contain rounded-lg border bg-muted/20 hover:opacity-95 transition"
                        loading="lazy"
                        referrerPolicy="no-referrer"
                        onError={() => {
                          if (facadeCandidateIndex < facadeCandidates.length - 1) {
                            setFacadeCandidateIndex((v) => v + 1);
                          }
                        }}
                      />
                      <span className="mt-2 inline-flex text-xs text-primary">Ver en grande</span>
                    </button>
                  ) : (
                    <p className="text-xs">Sin foto en la columna AU.</p>
                  )}
                  <p className="text-xs break-all">URL: {selected.facadePhotoUrl || "—"}</p>
                </div>
              </div>
              <div className="mt-1 flex flex-col gap-2 text-sm text-muted-foreground">
                <div className="flex items-center gap-2 flex-wrap">
                  <MapPin className="w-3.5 h-3.5 text-primary shrink-0" />
                  <span className="font-medium text-foreground">{selected.name}</span>
                  <span className="text-xs">({formatRecordDateEs(selected.recordDate)})</span>
                  {selected.listaNombre ? (
                    <span className="text-xs text-muted-foreground">· Encuestador D: {selected.listaNombre}</span>
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
                    <div className="flex gap-2 items-center">
                      <Popover
                        open={localizedByOpen}
                        onOpenChange={(open) => {
                          setLocalizedByOpen(open);
                          if (!open) setLocalizedBySearch("");
                        }}
                      >
                        <PopoverTrigger asChild>
                          <Button
                            type="button"
                            variant="outline"
                            role="combobox"
                            aria-expanded={localizedByOpen}
                            className="h-8 text-xs justify-between px-2 w-full"
                          >
                            <span className="truncate text-left">
                              {localizedBy.trim() ? localizedBy : "Selecciona / busca usuario"}
                            </span>
                            <ChevronsUpDown className="ml-2 h-3.5 w-3.5 shrink-0 opacity-50" />
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent className="p-0 w-[min(100vw-2rem,26rem)] z-[120]" align="start">
                          <Command shouldFilter={false}>
                            <CommandInput
                              placeholder="Buscar usuario… (ignora acentos)"
                              value={localizedBySearch}
                              onValueChange={setLocalizedBySearch}
                            />
                            {localizedByCombo.hint && (
                              <p className="px-3 py-2 text-[11px] text-muted-foreground border-b border-border">
                                {localizedByCombo.hint}
                              </p>
                            )}
                            <CommandList>
                              <CommandGroup>
                                {user?.name?.trim() ? (
                                  <CommandItem
                                    value={`__me__${user.name}`}
                                    onSelect={() => {
                                      setLocalizedBy(user.name);
                                      setLocalizedByOpen(false);
                                      setLocalizedBySearch("");
                                    }}
                                  >
                                    <Check
                                      className={cn(
                                        "mr-2 h-4 w-4 shrink-0",
                                        localizedBy.trim() === user.name.trim() ? "opacity-100" : "opacity-0",
                                      )}
                                    />
                                    Mi nombre ({user.name})
                                  </CommandItem>
                                ) : null}

                                {localizedByCombo.query && localizedByCombo.matchedCount === 0 ? (
                                  <CommandItem
                                    value={`__use__${localizedByCombo.query}`}
                                    onSelect={() => {
                                      setLocalizedBy(localizedByCombo.query || "");
                                      setLocalizedByOpen(false);
                                      setLocalizedBySearch("");
                                    }}
                                  >
                                    <Check className="mr-2 h-4 w-4 shrink-0 opacity-0" />
                                    Usar: <span className="ml-1 font-medium">{localizedByCombo.query}</span>
                                  </CommandItem>
                                ) : null}

                                {localizedByCombo.items.map((name) => (
                                  <CommandItem
                                    key={name}
                                    value={name}
                                    onSelect={() => {
                                      setLocalizedBy(name);
                                      setLocalizedByOpen(false);
                                      setLocalizedBySearch("");
                                    }}
                                  >
                                    <Check
                                      className={cn(
                                        "mr-2 h-4 w-4 shrink-0",
                                        localizedBy.trim() === name.trim() ? "opacity-100" : "opacity-0",
                                      )}
                                    />
                                    <span className="truncate">{name}</span>
                                  </CommandItem>
                                ))}
                              </CommandGroup>

                              {localizedBySearch.trim() && localizedByCombo.items.length === 0 && (
                                <p className="px-3 py-3 text-center text-sm text-muted-foreground border-t border-border">
                                  No hay coincidencias.
                                </p>
                              )}
                            </CommandList>
                          </Command>
                        </PopoverContent>
                      </Popover>

                      <Popover open={newUserOpen} onOpenChange={setNewUserOpen}>
                        <PopoverTrigger asChild>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="h-8 w-8 p-0 shrink-0"
                            title="Crear usuario rápido"
                          >
                            <Plus className="w-4 h-4" />
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-72 z-[130]" align="end">
                          <div className="space-y-2">
                            <p className="text-sm font-medium">Crear usuario</p>
                            <Input
                              value={newUserName}
                              onChange={(e) => setNewUserName(e.target.value)}
                              placeholder="Nombre (ej. María López)"
                              className="h-9"
                            />
                            <div className="flex justify-end gap-2">
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                onClick={() => {
                                  setNewUserName("");
                                  setNewUserOpen(false);
                                }}
                              >
                                Cancelar
                              </Button>
                              <Button type="button" size="sm" onClick={handleCreateUser}>
                                Guardar
                              </Button>
                            </div>
                          </div>
                        </PopoverContent>
                      </Popover>
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
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-8 text-xs"
                    onClick={() => openStreetView(selected)}
                  >
                    Street View
                  </Button>
                  {!apiKey ? (
                    <span className="text-xs text-amber-600">Sin `VITE_GOOGLE_MAPS_API_KEY`; usando mapa embebido sin controles completos.</span>
                  ) : null}
                  {mapLoadError ? (
                    <span className="text-xs text-destructive">No se pudo cargar el mapa embebido; usa abrir en pestaña nueva.</span>
                  ) : null}
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Visor grande de foto de fachada */}
      <Dialog open={facadeViewerOpen} onOpenChange={setFacadeViewerOpen}>
        <DialogContent className="max-w-5xl">
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="font-medium truncate">Fachada · {selected?.name || "Establecimiento"}</p>
                {facadeCandidates.length > 1 ? (
                  <p className="text-xs text-muted-foreground">
                    Fuente {facadeCandidateIndex + 1} de {facadeCandidates.length}
                  </p>
                ) : null}
              </div>
              {facadeCandidates.length > 1 ? (
                <div className="flex gap-2 shrink-0">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={facadeCandidateIndex <= 0}
                    onClick={() => setFacadeCandidateIndex((v) => Math.max(0, v - 1))}
                  >
                    Anterior
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={facadeCandidateIndex >= facadeCandidates.length - 1}
                    onClick={() => setFacadeCandidateIndex((v) => Math.min(facadeCandidates.length - 1, v + 1))}
                  >
                    Siguiente
                  </Button>
                </div>
              ) : null}
            </div>

            {selected?.facadePhotoUrl?.trim() ? (
              <img
                src={activeFacadeUrl}
                alt={`Fachada de ${selected.name}`}
                className="w-full max-h-[75vh] object-contain rounded-lg border bg-muted/20"
                loading="lazy"
                referrerPolicy="no-referrer"
                onError={() => {
                  if (facadeCandidateIndex < facadeCandidates.length - 1) {
                    setFacadeCandidateIndex((v) => v + 1);
                  }
                }}
              />
            ) : (
              <p className="text-sm text-muted-foreground">Sin foto.</p>
            )}

            {selected?.facadePhotoUrl ? (
              <p className="text-xs break-all text-muted-foreground">URL original: {selected.facadePhotoUrl}</p>
            ) : null}
          </div>
        </DialogContent>
      </Dialog>

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

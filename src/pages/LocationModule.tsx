import { useState, useMemo } from "react";
import { useData } from "@/context/DataContext";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Search, Plus, MapPin, Navigation, Pencil, Trash2, Download, Upload, Loader2 } from "lucide-react";
import EstablishmentForm from "@/components/EstablishmentForm";
import { Establishment } from "@/types/establishment";

type SearchField = "name" | "address" | "coords";

const LocationModule = () => {
  const { establishments, addEstablishment, updateEstablishment, deleteEstablishment, importFromSheets, exportToSheets, isSyncing } = useData();
  const [search, setSearch] = useState("");
  const [searchField, setSearchField] = useState<SearchField>("name");
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Establishment | undefined>();
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const filtered = useMemo(() => {
    if (!search.trim()) return establishments;
    const q = search.toLowerCase();
    return establishments.filter((e) => {
      if (searchField === "name") return e.name.toLowerCase().includes(q);
      if (searchField === "address") return e.address.toLowerCase().includes(q);
      return `${e.latitude},${e.longitude}`.includes(q);
    });
  }, [establishments, search, searchField]);

  const selected = selectedId ? establishments.find((e) => e.id === selectedId) : filtered[0];

  const openInGoogleMaps = (e: Establishment) => {
    window.open(`https://www.google.com/maps?q=${e.latitude},${e.longitude}`, "_blank");
  };

  const mapSrc = selected
    ? `https://www.google.com/maps?q=${selected.latitude},${selected.longitude}&z=15&output=embed`
    : `https://www.google.com/maps?q=${filtered[0]?.latitude || 10.48},${filtered[0]?.longitude || -66.87}&z=10&output=embed`;

  const searchFields: { value: SearchField; label: string }[] = [
    { value: "name", label: "Nombre" },
    { value: "address", label: "Dirección" },
    { value: "coords", label: "Coordenadas" },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 reveal-up">
        <div>
          <h1 className="text-2xl font-bold">Localización</h1>
          <p className="text-muted-foreground text-sm mt-1">{establishments.length} establecimientos registrados</p>
        </div>
        <Button onClick={() => { setEditing(undefined); setShowForm(true); }} className="gap-2">
          <Plus className="w-4 h-4" />
          Nuevo
        </Button>
      </div>

      {/* Search bar */}
      <div className="flex flex-col sm:flex-row gap-3 reveal-up reveal-up-delay-1">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder={`Buscar por ${searchFields.find((f) => f.value === searchField)?.label.toLowerCase()}...`}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10 h-10"
          />
        </div>
        <div className="flex rounded-lg border bg-card p-0.5 gap-0.5">
          {searchFields.map((f) => (
            <button
              key={f.value}
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

      <div className="grid lg:grid-cols-5 gap-6">
        {/* List */}
        <div className="lg:col-span-2 space-y-2 reveal-up reveal-up-delay-2">
          {filtered.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <MapPin className="w-10 h-10 mx-auto mb-3 opacity-40" />
              <p className="font-medium">Sin resultados</p>
              <p className="text-sm mt-1">Intenta buscar por otro campo</p>
            </div>
          ) : (
            filtered.map((e) => (
              <div
                key={e.id}
                onClick={() => setSelectedId(e.id)}
                className={`p-4 rounded-xl border cursor-pointer transition-all duration-200 hover:shadow-md active:scale-[0.98] ${
                  selected?.id === e.id ? "border-primary bg-primary/5 shadow-sm" : "bg-card hover:border-primary/30"
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <h3 className="font-semibold text-sm truncate">{e.name}</h3>
                    <p className="text-xs text-muted-foreground mt-0.5 truncate">{e.address}</p>
                    <p className="text-xs text-muted-foreground/60 mt-1 font-mono">
                      {e.latitude.toFixed(4)}, {e.longitude.toFixed(4)}
                    </p>
                  </div>
                  <div className="flex gap-1 shrink-0">
                    <button
                      onClick={(ev) => { ev.stopPropagation(); openInGoogleMaps(e); }}
                      className="p-1.5 rounded-md hover:bg-muted transition-colors text-primary"
                      title="Abrir en Google Maps"
                    >
                      <Navigation className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={(ev) => { ev.stopPropagation(); setEditing(e); setShowForm(true); }}
                      className="p-1.5 rounded-md hover:bg-muted transition-colors text-muted-foreground"
                    >
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                    <button
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

        {/* Map */}
        <div className="lg:col-span-3 reveal-up reveal-up-delay-3">
          <div className="rounded-xl overflow-hidden border bg-card shadow-sm" style={{ height: "480px" }}>
            <iframe
              src={mapSrc}
              width="100%"
              height="100%"
              style={{ border: 0 }}
              allowFullScreen
              loading="lazy"
              referrerPolicy="no-referrer-when-downgrade"
              title="Mapa de ubicación"
            />
          </div>
          {selected && (
            <div className="mt-3 flex items-center gap-2 text-sm text-muted-foreground">
              <MapPin className="w-3.5 h-3.5 text-primary" />
              <span className="font-medium text-foreground">{selected.name}</span>
              <span>— {selected.address}</span>
            </div>
          )}
        </div>
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

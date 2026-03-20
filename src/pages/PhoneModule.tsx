import { useState, useMemo } from "react";
import { useData } from "@/context/DataContext";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Search, Phone, MessageCircle, Pencil, MapPin } from "lucide-react";
import EstablishmentForm from "@/components/EstablishmentForm";
import { Establishment } from "@/types/establishment";

const PhoneModule = () => {
  const { establishments, updateEstablishment } = useData();
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<Establishment | undefined>();

  const filtered = useMemo(() => {
    if (!search.trim()) return establishments;
    const q = search.toLowerCase();
    return establishments.filter(
      (e) =>
        e.name.toLowerCase().includes(q) ||
        e.contactName.toLowerCase().includes(q) ||
        e.phone.includes(q)
    );
  }, [establishments, search]);

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

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 reveal-up reveal-up-delay-2">
        {filtered.length === 0 ? (
          <div className="col-span-full text-center py-12 text-muted-foreground">
            <Phone className="w-10 h-10 mx-auto mb-3 opacity-40" />
            <p className="font-medium">Sin resultados</p>
          </div>
        ) : (
          filtered.map((e) => (
            <div
              key={e.id}
              className="p-5 rounded-xl border bg-card hover:shadow-md transition-all duration-200 hover:border-primary/20"
            >
              <div className="flex items-start justify-between mb-3">
                <div className="min-w-0">
                  <h3 className="font-semibold text-sm truncate">{e.name}</h3>
                  <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                    <MapPin className="w-3 h-3 shrink-0" />
                    <span className="truncate">{e.address}</span>
                  </p>
                </div>
                <button
                  onClick={() => setEditing(e)}
                  className="p-1.5 rounded-md hover:bg-muted transition-colors text-muted-foreground shrink-0"
                >
                  <Pencil className="w-3.5 h-3.5" />
                </button>
              </div>

              <div className="space-y-2 mb-4">
                <div className="flex items-center gap-2">
                  <Phone className="w-3.5 h-3.5 text-primary shrink-0" />
                  <span className="text-sm font-mono">{e.phone || "—"}</span>
                </div>
                <div className="text-sm">
                  <span className="text-muted-foreground">Contacto: </span>
                  <span className="font-medium">{e.contactName || "—"}</span>
                </div>
                {e.notes && (
                  <p className="text-xs text-muted-foreground bg-muted rounded-md p-2 leading-relaxed">{e.notes}</p>
                )}
              </div>

              <Button
                onClick={() => sendWhatsApp(e)}
                disabled={!e.phone}
                className="w-full gap-2 bg-success hover:bg-success/90 text-success-foreground"
                size="sm"
              >
                <MessageCircle className="w-4 h-4" />
                Enviar WhatsApp
              </Button>
            </div>
          ))
        )}
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

import { useState } from "react";
import { Establishment } from "@/types/establishment";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { X } from "lucide-react";

interface Props {
  initial?: Establishment;
  onSave: (data: Omit<Establishment, "id"> | Establishment) => void;
  onClose: () => void;
}

const todayYmd = () => new Date().toISOString().slice(0, 10);

export default function EstablishmentForm({ initial, onSave, onClose }: Props) {
  const [form, setForm] = useState({
    recordDate: initial?.recordDate || todayYmd(),
    listaNombre: initial?.listaNombre || "",
    name: initial?.name || "",
    address: initial?.address || "",
    latitude: initial?.latitude?.toString() || "",
    longitude: initial?.longitude?.toString() || "",
    phone: initial?.phone || "",
    contactName: initial?.contactName || "",
    notes: initial?.notes || "",
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const data = {
      ...form,
      recordDate: form.recordDate.trim() || todayYmd(),
      listaNombre: form.listaNombre.trim(),
      latitude: parseFloat(form.latitude),
      longitude: parseFloat(form.longitude),
    };
    if (initial) {
      onSave({ ...data, id: initial.id });
    } else {
      onSave(data);
    }
    onClose();
  };

  const update = (key: string, value: string) => setForm((p) => ({ ...p, [key]: value }));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-foreground/20 backdrop-blur-sm" style={{ animation: 'fadeIn 200ms ease-out' }}>
      <div className="bg-card rounded-xl shadow-xl border w-full max-w-lg max-h-[90vh] overflow-y-auto reveal-up">
        <div className="flex items-center justify-between p-5 border-b">
          <h3 className="text-lg font-semibold">{initial ? "Editar" : "Nuevo"} establecimiento</h3>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-muted transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          <div className="space-y-2">
            <Label>Fecha del registro (solo día)</Label>
            <Input
              type="date"
              value={form.recordDate}
              onChange={(e) => update("recordDate", e.target.value)}
              required
            />
            <p className="text-xs text-muted-foreground">Equivale a la columna A en Sheets (se ignora la hora).</p>
          </div>

          <div className="space-y-2">
            <Label>Nombre (columna D — lista desplegable)</Label>
            <Input
              value={form.listaNombre}
              onChange={(e) => update("listaNombre", e.target.value)}
              placeholder="Valor del desplegable &quot;Nombre&quot; en Sheets"
            />
            <p className="text-xs text-muted-foreground">
              Debe coincidir con una opción válida de tu validación de datos en la columna D.
            </p>
          </div>

          <div className="space-y-2">
            <Label>Nombre del establecimiento (columna AL)</Label>
            <Input
              value={form.name}
              onChange={(e) => update("name", e.target.value)}
              required
              placeholder="Nombre del establecimiento en columna AL"
            />
          </div>

          <div className="space-y-2">
            <Label>Dirección</Label>
            <Input value={form.address} onChange={(e) => update("address", e.target.value)} required placeholder="Ej: Av. Principal 123" />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Latitud</Label>
              <Input type="number" step="any" value={form.latitude} onChange={(e) => update("latitude", e.target.value)} required placeholder="10.4880" />
            </div>
            <div className="space-y-2">
              <Label>Longitud</Label>
              <Input type="number" step="any" value={form.longitude} onChange={(e) => update("longitude", e.target.value)} required placeholder="-66.8792" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Teléfono</Label>
              <Input value={form.phone} onChange={(e) => update("phone", e.target.value)} placeholder="+584121234567" />
            </div>
            <div className="space-y-2">
              <Label>Contacto</Label>
              <Input value={form.contactName} onChange={(e) => update("contactName", e.target.value)} placeholder="Nombre del contacto" />
            </div>
          </div>

          <div className="space-y-2">
            <Label>Notas</Label>
            <Textarea value={form.notes} onChange={(e) => update("notes", e.target.value)} placeholder="Observaciones..." rows={3} />
          </div>

          <div className="flex gap-3 pt-2">
            <Button type="button" variant="outline" onClick={onClose} className="flex-1">
              Cancelar
            </Button>
            <Button type="submit" className="flex-1">
              {initial ? "Guardar cambios" : "Crear"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}

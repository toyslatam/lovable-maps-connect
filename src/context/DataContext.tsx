import { createContext, useContext, useState, ReactNode, useCallback } from "react";
import { Establishment } from "@/types/establishment";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

const SAMPLE_DATA: Establishment[] = [
  {
    id: "1",
    name: "Farmacia Central",
    address: "Av. Libertador 1240, Caracas",
    latitude: 10.4880,
    longitude: -66.8792,
    phone: "+584121234567",
    contactName: "María González",
    notes: "Horario extendido hasta las 10pm",
  },
  {
    id: "2",
    name: "Bodega Don Pedro",
    address: "Calle 5, San Cristóbal",
    latitude: 7.7669,
    longitude: -72.2250,
    phone: "+584149876543",
    contactName: "Pedro Ramírez",
    notes: "Solo atiende de lunes a viernes",
  },
  {
    id: "3",
    name: "Taller Mecánico Rápido",
    address: "Zona Industrial, Valencia",
    latitude: 10.1579,
    longitude: -67.9972,
    phone: "+584161112233",
    contactName: "Carlos Mendoza",
    notes: "Especialista en frenos y suspensión",
  },
  {
    id: "4",
    name: "Panadería La Espiga",
    address: "Av. Bolívar Norte 89, Maracay",
    latitude: 10.2469,
    longitude: -67.5958,
    phone: "+584244445566",
    contactName: "Ana Morales",
    notes: "",
  },
];

interface DataContextType {
  establishments: Establishment[];
  addEstablishment: (e: Omit<Establishment, "id">) => void;
  updateEstablishment: (e: Establishment) => void;
  deleteEstablishment: (id: string) => void;
  importFromSheets: () => Promise<void>;
  exportToSheets: () => Promise<void>;
  isSyncing: boolean;
}

const DataContext = createContext<DataContextType | null>(null);

export function DataProvider({ children }: { children: ReactNode }) {
  const [establishments, setEstablishments] = useState<Establishment[]>(SAMPLE_DATA);
  const [isSyncing, setIsSyncing] = useState(false);

  const addEstablishment = (e: Omit<Establishment, "id">) => {
    setEstablishments((prev) => [...prev, { ...e, id: crypto.randomUUID() }]);
  };

  const updateEstablishment = (e: Establishment) => {
    setEstablishments((prev) => prev.map((item) => (item.id === e.id ? e : item)));
  };

  const deleteEstablishment = (id: string) => {
    setEstablishments((prev) => prev.filter((item) => item.id !== id));
  };

  const importFromSheets = useCallback(async () => {
    setIsSyncing(true);
    try {
      const { data, error } = await supabase.functions.invoke("google-sheets", {
        body: { action: "read" },
      });

      if (error) throw new Error(error.message);
      if (!data?.success) throw new Error(data?.error || "Error desconocido");

      const imported: Establishment[] = (data.data || []).map(
        (row: Omit<Establishment, "id">) => ({
          ...row,
          id: crypto.randomUUID(),
        })
      );

      setEstablishments(imported);
      toast.success(`${imported.length} establecimientos importados desde Google Sheets`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Error al importar";
      toast.error(msg);
      console.error("Import error:", err);
    } finally {
      setIsSyncing(false);
    }
  }, []);

  const exportToSheets = useCallback(async () => {
    setIsSyncing(true);
    try {
      const rows = establishments.map(({ name, address, latitude, longitude, phone, contactName, notes }) => ({
        name, address, latitude, longitude, phone, contactName, notes,
      }));

      const { data, error } = await supabase.functions.invoke("google-sheets", {
        body: { action: "write", data: rows },
      });

      if (error) throw new Error(error.message);
      if (!data?.success) throw new Error(data?.error || "Error desconocido");

      toast.success(`${rows.length} establecimientos exportados a Google Sheets`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Error al exportar";
      toast.error(msg);
      console.error("Export error:", err);
    } finally {
      setIsSyncing(false);
    }
  }, [establishments]);

  return (
    <DataContext.Provider value={{ establishments, addEstablishment, updateEstablishment, deleteEstablishment, importFromSheets, exportToSheets, isSyncing }}>
      {children}
    </DataContext.Provider>
  );
}

export function useData() {
  const ctx = useContext(DataContext);
  if (!ctx) throw new Error("useData must be inside DataProvider");
  return ctx;
}

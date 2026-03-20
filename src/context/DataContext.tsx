import { createContext, useContext, useState, ReactNode, useCallback, useEffect, useRef } from "react";
import { Establishment } from "@/types/establishment";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface DataContextType {
  establishments: Establishment[];
  addEstablishment: (e: Omit<Establishment, "id">) => void;
  updateEstablishment: (e: Establishment) => void;
  deleteEstablishment: (id: string) => void;
  importFromSheets: () => Promise<void>;
  exportToSheets: () => Promise<void>;
  testConnection: () => Promise<void>;
  isSyncing: boolean;
  lastSyncTime: string | null;
  autoSync: boolean;
  setAutoSync: (v: boolean) => void;
  connectionStatus: "unknown" | "connected" | "error";
}

const DataContext = createContext<DataContextType | null>(null);

export function DataProvider({ children }: { children: ReactNode }) {
  const [establishments, setEstablishments] = useState<Establishment[]>([]);
  const [isSyncing, setIsSyncing] = useState(false);
  const [lastSyncTime, setLastSyncTime] = useState<string | null>(
    () => localStorage.getItem("geotrack_last_sync")
  );
  const [autoSync, setAutoSyncState] = useState<boolean>(
    () => localStorage.getItem("geotrack_auto_sync") !== "false"
  );
  const [connectionStatus, setConnectionStatus] = useState<"unknown" | "connected" | "error">("unknown");
  const didAutoSync = useRef(false);

  const setAutoSync = (v: boolean) => {
    setAutoSyncState(v);
    localStorage.setItem("geotrack_auto_sync", String(v));
  };

  const updateSyncTime = () => {
    const now = new Date().toLocaleString("es-VE");
    setLastSyncTime(now);
    localStorage.setItem("geotrack_last_sync", now);
  };

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
      setConnectionStatus("connected");
      updateSyncTime();
      toast.success(`${imported.length} establecimientos importados desde Google Sheets`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Error al importar";
      toast.error(msg);
      setConnectionStatus("error");
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

      setConnectionStatus("connected");
      updateSyncTime();
      toast.success(`${rows.length} establecimientos exportados a Google Sheets`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Error al exportar";
      toast.error(msg);
      setConnectionStatus("error");
      console.error("Export error:", err);
    } finally {
      setIsSyncing(false);
    }
  }, [establishments]);

  const testConnection = useCallback(async () => {
    try {
      const { data, error } = await supabase.functions.invoke("google-sheets", {
        body: { action: "read" },
      });

      if (error) throw new Error(error.message);
      if (!data?.success) throw new Error(data?.error || "Error desconocido");

      setConnectionStatus("connected");
      toast.success("Conexión exitosa con Google Sheets");
    } catch (err: unknown) {
      setConnectionStatus("error");
      const msg = err instanceof Error ? err.message : "Error de conexión";
      toast.error(msg);
    }
  }, []);

  // Auto-sync on app load
  useEffect(() => {
    if (autoSync && !didAutoSync.current) {
      didAutoSync.current = true;
      importFromSheets();
    }
  }, [autoSync, importFromSheets]);

  return (
    <DataContext.Provider value={{
      establishments, addEstablishment, updateEstablishment, deleteEstablishment,
      importFromSheets, exportToSheets, testConnection,
      isSyncing, lastSyncTime, autoSync, setAutoSync, connectionStatus,
    }}>
      {children}
    </DataContext.Provider>
  );
}

export function useData() {
  const ctx = useContext(DataContext);
  if (!ctx) throw new Error("useData must be inside DataProvider");
  return ctx;
}

import { createContext, useContext, useState, ReactNode, useCallback, useEffect, useRef } from "react";
import { Establishment } from "@/types/establishment";
import { toast } from "sonner";
import { invokeGoogleSheets } from "@/lib/invokeGoogleSheets";

interface DataContextType {
  establishments: Establishment[];
  addEstablishment: (e: Omit<Establishment, "id">) => void;
  updateEstablishment: (e: Establishment, options?: { skipAutoSync?: boolean }) => void;
  deleteEstablishment: (id: string) => void;
  saveToSheets: (rowsOverride?: Establishment[]) => Promise<void>;
  connectToSheet: (sheetId: string, sheetTab?: string) => Promise<void>;
  syncNow: () => Promise<void>;
  testConnection: () => Promise<void>;
  loadSheetTabs: (spreadsheetId: string) => Promise<string[]>;
  connectedSheetId: string;
  setConnectedSheetId: (sheetId: string) => void;
  connectedSheetTab: string;
  setConnectedSheetTab: (tabTitle: string) => void;
  isSyncing: boolean;
  lastSyncTime: string | null;
  autoSync: boolean;
  setAutoSync: (v: boolean) => void;
  connectionStatus: "unknown" | "connected" | "error";
  /** Lee A:DC tal como está en Google Sheets (texto crudo, para vista previa). */
  fetchSheetPreview: () => Promise<{ range: string; values: string[][] }>;
}

const DataContext = createContext<DataContextType | null>(null);

export function DataProvider({ children }: { children: ReactNode }) {
  const HOURLY_SYNC_MS = 60 * 60 * 1000;
  const [establishments, setEstablishments] = useState<Establishment[]>([]);
  const [isSyncing, setIsSyncing] = useState(false);
  const [connectedSheetId, setConnectedSheetIdState] = useState<string>(
    () => localStorage.getItem("geotrack_sheet_id") || ""
  );
  const [connectedSheetTab, setConnectedSheetTabState] = useState<string>(
    () => localStorage.getItem("geotrack_sheet_tab") || ""
  );
  const [lastSyncTime, setLastSyncTime] = useState<string | null>(
    () => localStorage.getItem("geotrack_last_sync")
  );
  const [autoSync, setAutoSyncState] = useState<boolean>(
    () => localStorage.getItem("geotrack_auto_sync") !== "false"
  );
  const [connectionStatus, setConnectionStatus] = useState<"unknown" | "connected" | "error">("unknown");
  const didAutoSync = useRef(false);
  const shouldPushChanges = useRef(false);

  const setAutoSync = (v: boolean) => {
    setAutoSyncState(v);
    localStorage.setItem("geotrack_auto_sync", String(v));
  };

  const setConnectedSheetId = (sheetId: string) => {
    const cleanId = sheetId.trim();
    setConnectedSheetIdState(cleanId);
    localStorage.setItem("geotrack_sheet_id", cleanId);
  };

  const setConnectedSheetTab = (tabTitle: string) => {
    const tab = tabTitle.trim();
    setConnectedSheetTabState(tab);
    localStorage.setItem("geotrack_sheet_tab", tab);
  };

  const updateSyncTime = () => {
    const now = new Date().toLocaleString("es-VE");
    setLastSyncTime(now);
    localStorage.setItem("geotrack_last_sync", now);
  };

  const addEstablishment = (e: Omit<Establishment, "id">) => {
    shouldPushChanges.current = true;
    const today = new Date().toISOString().slice(0, 10);
    setEstablishments((prev) => [...prev, {
      ...e,
      listaNombre: e.listaNombre?.trim() ?? "",
      facadePhotoUrl: e.facadePhotoUrl?.trim() ?? "",
      city: e.city?.trim() ?? "",
      localizedStatus: e.localizedStatus?.trim() ?? "",
      localizedBy: e.localizedBy?.trim() ?? "",
      contentStatus: e.contentStatus?.trim() ?? "",
      flourTotalText: e.flourTotalText?.trim() ?? "",
      bakeryQtyText: e.bakeryQtyText?.trim() ?? "",
      pastryQtyText: e.pastryQtyText?.trim() ?? "",
      flourKgStandardText: e.flourKgStandardText?.trim() ?? "",
      controlCGText: e.controlCGText?.trim() ?? "",
      controlCHText: e.controlCHText?.trim() ?? "",
      dbStatus: e.dbStatus?.trim() ?? "",
      dcStatus: e.dcStatus?.trim() ?? "",
      recordDate: e.recordDate?.trim() || today,
      id: crypto.randomUUID(),
    }]);
  };

  const updateEstablishment = (e: Establishment, options?: { skipAutoSync?: boolean }) => {
    shouldPushChanges.current = !options?.skipAutoSync;
    setEstablishments((prev) => prev.map((item) => (item.id === e.id ? e : item)));
  };

  const deleteEstablishment = (id: string) => {
    shouldPushChanges.current = true;
    setEstablishments((prev) => prev.filter((item) => item.id !== id));
  };

  const loadSheetTabs = useCallback(async (spreadsheetId: string) => {
    const id = spreadsheetId.trim();
    if (!id) {
      throw new Error("Indica el libro (URL o ID) primero");
    }
    const data = await invokeGoogleSheets({ action: "listTabs", sheetId: id });
    const tabs = (data.tabs || []) as Array<{ title?: string }>;
    const titles = tabs.map((t) => t.title || "").filter(Boolean);
    return titles;
  }, []);

  const importFromSheets = useCallback(async (sheetIdOverride?: string, tabOverride?: string) => {
    const activeSheetId = sheetIdOverride || connectedSheetId;
    if (!activeSheetId) {
      throw new Error("Debes conectar una hoja de Google Sheets");
    }
    const tab =
      tabOverride !== undefined ? tabOverride.trim() : connectedSheetTab.trim();

    setIsSyncing(true);
    try {
      const body: Record<string, unknown> = {
        action: "read",
        sheetId: activeSheetId,
      };
      if (tab) body.sheetTab = tab;

      const data = await invokeGoogleSheets(body);

      const importedRaw: Establishment[] = (data.data || []).map(
        (row: Omit<Establishment, "id">) => ({
          recordDate: row.recordDate ?? "",
          listaNombre: row.listaNombre ?? "",
          name: row.name ?? "",
          facadePhotoUrl: row.facadePhotoUrl ?? "",
          city: row.city ?? "",
          localizedStatus: row.localizedStatus ?? "",
          localizedBy: row.localizedBy ?? "",
          contentStatus: row.contentStatus ?? "",
          flourTotalText: row.flourTotalText ?? "",
          bakeryQtyText: row.bakeryQtyText ?? "",
          pastryQtyText: row.pastryQtyText ?? "",
          flourKgStandardText: row.flourKgStandardText ?? "",
          controlCGText: row.controlCGText ?? "",
          controlCHText: row.controlCHText ?? "",
          dbStatus: row.dbStatus ?? "",
          dcStatus: row.dcStatus ?? "",
          address: row.address ?? "",
          latitude: typeof row.latitude === "number" ? row.latitude : 0,
          longitude: typeof row.longitude === "number" ? row.longitude : 0,
          phone: row.phone ?? "",
          contactName: row.contactName ?? "",
          notes: row.notes ?? "",
          id: crypto.randomUUID(),
        })
      );

      // Safety dedupe: if Sheets has accidental repeated rows, keep only first occurrence.
      const seen = new Set<string>();
      const imported: Establishment[] = importedRaw.filter((row) => {
        const key = [
          row.recordDate,
          row.listaNombre,
          row.name,
          row.address,
          row.latitude,
          row.longitude,
          row.city,
        ].join("||");
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });

      // Prevent immediate write-back after loading data from Sheets.
      shouldPushChanges.current = false;
      setEstablishments(imported);
      setConnectionStatus("connected");
      updateSyncTime();
      toast.success(`${imported.length} establecimientos sincronizados desde Google Sheets`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Error al importar";
      toast.error(msg);
      setConnectionStatus("error");
      console.error("Import error:", err);
    } finally {
      setIsSyncing(false);
    }
  }, [connectedSheetId, connectedSheetTab]);

  const exportToSheets = useCallback(async (silent = false, rowsOverride?: Establishment[]) => {
    if (!connectedSheetId) {
      throw new Error("Debes conectar una hoja de Google Sheets");
    }

    setIsSyncing(true);
    try {
      const source = rowsOverride ?? establishments;
      const rows = source.map(({
        recordDate,
        listaNombre,
        name,
        facadePhotoUrl,
        city,
        localizedStatus,
        localizedBy,
        contentStatus,
        flourTotalText,
        bakeryQtyText,
        pastryQtyText,
        flourKgStandardText,
        controlCGText,
        controlCHText,
        dbStatus,
        dcStatus,
        address,
        latitude,
        longitude,
        phone,
        contactName,
        notes,
      }) => ({
        recordDate,
        listaNombre,
        name,
        facadePhotoUrl,
        city,
        localizedStatus,
        localizedBy,
        contentStatus,
        flourTotalText,
        bakeryQtyText,
        pastryQtyText,
        flourKgStandardText,
        controlCGText,
        controlCHText,
        dbStatus,
        dcStatus,
        address,
        latitude,
        longitude,
        phone,
        contactName,
        notes,
      }));

      const writeBody: Record<string, unknown> = {
        action: "write",
        sheetId: connectedSheetId,
        data: rows,
      };
      if (connectedSheetTab.trim()) writeBody.sheetTab = connectedSheetTab.trim();

      await invokeGoogleSheets(writeBody);

      setConnectionStatus("connected");
      updateSyncTime();
      if (!silent) {
        toast.success(`${rows.length} establecimientos sincronizados hacia Google Sheets`);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Error al exportar";
      if (!silent) {
        toast.error(msg);
      }
      setConnectionStatus("error");
      console.error("Export error:", err);
    } finally {
      setIsSyncing(false);
    }
  }, [connectedSheetId, connectedSheetTab, establishments]);

  const saveToSheets = useCallback(async (rowsOverride?: Establishment[]) => {
    await exportToSheets(false, rowsOverride);
  }, [exportToSheets]);

  const connectToSheet = useCallback(async (sheetId: string, sheetTab?: string) => {
    setConnectedSheetId(sheetId);
    if (sheetTab !== undefined) {
      setConnectedSheetTab(sheetTab);
    }
    const tabToUse = sheetTab !== undefined ? sheetTab.trim() : connectedSheetTab.trim();
    await importFromSheets(sheetId, tabToUse);
  }, [importFromSheets, connectedSheetTab]);

  const syncNow = useCallback(async () => {
    await importFromSheets();
  }, [importFromSheets]);

  const fetchSheetPreview = useCallback(async () => {
    if (!connectedSheetId) {
      throw new Error("Debes conectar una hoja de Google Sheets (Conexiones)");
    }
    const body: Record<string, unknown> = {
      action: "readPreview",
      sheetId: connectedSheetId,
    };
    if (connectedSheetTab.trim()) body.sheetTab = connectedSheetTab.trim();

    const data = await invokeGoogleSheets(body);

    return {
      range: typeof data.range === "string" ? data.range : "A:DC",
      values: Array.isArray(data.values) ? (data.values as string[][]) : [],
    };
  }, [connectedSheetId, connectedSheetTab]);

  const testConnection = useCallback(async () => {
    if (!connectedSheetId) {
      toast.error("Debes conectar una hoja de Google Sheets");
      return;
    }

    try {
      const body: Record<string, unknown> = {
        action: "read",
        sheetId: connectedSheetId,
      };
      if (connectedSheetTab.trim()) body.sheetTab = connectedSheetTab.trim();

      await invokeGoogleSheets(body);

      setConnectionStatus("connected");
      toast.success("Conexión exitosa con Google Sheets");
    } catch (err: unknown) {
      setConnectionStatus("error");
      const msg = err instanceof Error ? err.message : "Error de conexión";
      toast.error(msg);
    }
  }, [connectedSheetId, connectedSheetTab]);

  // Auto-sync on app load
  useEffect(() => {
    if (autoSync && connectedSheetId && !didAutoSync.current) {
      didAutoSync.current = true;
      importFromSheets();
    }
  }, [autoSync, connectedSheetId, importFromSheets]);

  // Hourly sync to avoid syncing on every local change (improves UI responsiveness).
  useEffect(() => {
    if (!autoSync || !connectedSheetId) return;

    const runSync = () => {
      // If there are pending local edits, push them first.
      if (shouldPushChanges.current) {
        shouldPushChanges.current = false;
        exportToSheets(true);
        return;
      }
      // Otherwise pull latest rows from Sheets.
      importFromSheets();
    };

    const interval = setInterval(runSync, HOURLY_SYNC_MS);
    return () => clearInterval(interval);
  }, [autoSync, connectedSheetId, connectedSheetTab, exportToSheets, importFromSheets]);

  return (
    <DataContext.Provider value={{
      establishments, addEstablishment, updateEstablishment, deleteEstablishment,
      saveToSheets, connectToSheet, syncNow, testConnection, loadSheetTabs, fetchSheetPreview,
      connectedSheetId, setConnectedSheetId,
      connectedSheetTab, setConnectedSheetTab,
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

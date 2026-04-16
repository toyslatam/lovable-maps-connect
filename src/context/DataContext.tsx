import { createContext, useContext, useState, ReactNode, useCallback, useEffect, useRef } from "react";
import { Establishment } from "@/types/establishment";
import { toast } from "sonner";
import { invokeGoogleSheets } from "@/lib/invokeGoogleSheets";
import {
  deleteEstablishmentsNotInSheetRows,
  fetchEstablishmentsFromSupabase,
  mergeEstablishmentIds,
  upsertEstablishmentsToSupabase,
} from "@/lib/supabaseEstablishments";

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

/** Intervalo de sincronización automática en segundo plano (1 h). */
const HOURLY_SYNC_MS = 60 * 60 * 1000;

export function DataProvider({ children }: { children: ReactNode }) {
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
  /** Evita import duplicado desde Sheets cuando `connectToSheet` ya marcó esta clave libro|pestaña. */
  const sheetImportHandledRef = useRef<string>("");
  const importInFlightRef = useRef<Promise<void> | null>(null);
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
      locality: e.locality?.trim() ?? "",
      facadePhotoUrl: e.facadePhotoUrl?.trim() ?? "",
      city: e.city?.trim() ?? "",
      localizedStatus: e.localizedStatus?.trim() ?? "",
      localizedBy: e.localizedBy?.trim() ?? "",
      contentStatus: e.contentStatus?.trim() ?? "",
      contentStateBR: e.contentStateBR?.trim() ?? "",
      phoneStatus: e.phoneStatus?.trim() ?? "",
      flourTotalText: e.flourTotalText?.trim() ?? "",
      bakeryQtyText: e.bakeryQtyText?.trim() ?? "",
      pastryQtyText: e.pastryQtyText?.trim() ?? "",
      flourUnitBE: e.flourUnitBE?.trim() ?? "",
      levapanText: e.levapanText?.trim() ?? "",
      fleischmanText: e.fleischmanText?.trim() ?? "",
      levasafText: e.levasafText?.trim() ?? "",
      otherYeastText: e.otherYeastText?.trim() ?? "",
      yeastAngelText: e.yeastAngelText?.trim() ?? "",
      yeastPanificadorText: e.yeastPanificadorText?.trim() ?? "",
      yeastFermipanText: e.yeastFermipanText?.trim() ?? "",
      yeastGloripanText: e.yeastGloripanText?.trim() ?? "",
      yeastInstafermText: e.yeastInstafermText?.trim() ?? "",
      yeastInstantSuccText: e.yeastInstantSuccText?.trim() ?? "",
      yeastMauripanText: e.yeastMauripanText?.trim() ?? "",
      yeastSafInstantText: e.yeastSafInstantText?.trim() ?? "",
      yeastSantillanaText: e.yeastSantillanaText?.trim() ?? "",
      yeastOtherDryText: e.yeastOtherDryText?.trim() ?? "",
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
    if (importInFlightRef.current) {
      await importInFlightRef.current;
      return;
    }

    const run = async () => {
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
          sheetRowNumber: typeof row.sheetRowNumber === "number" ? row.sheetRowNumber : undefined,
          recordDate: row.recordDate ?? "",
          listaNombre: row.listaNombre ?? "",
          name: row.name ?? "",
          locality: row.locality ?? "",
          facadePhotoUrl: row.facadePhotoUrl ?? "",
          city: row.city ?? "",
          localizedStatus: row.localizedStatus ?? "",
          localizedBy: row.localizedBy ?? "",
          contentStatus: row.contentStatus ?? "",
          contentStateBR: row.contentStateBR ?? "",
          phoneStatus: row.phoneStatus ?? "",
          flourTotalText: row.flourTotalText ?? "",
          bakeryQtyText: row.bakeryQtyText ?? "",
          pastryQtyText: row.pastryQtyText ?? "",
          flourUnitBE: row.flourUnitBE ?? "",
          levapanText: row.levapanText ?? "",
          fleischmanText: row.fleischmanText ?? "",
          levasafText: row.levasafText ?? "",
          otherYeastText: row.otherYeastText ?? "",
          yeastAngelText: row.yeastAngelText ?? "",
          yeastPanificadorText: row.yeastPanificadorText ?? "",
          yeastFermipanText: row.yeastFermipanText ?? "",
          yeastGloripanText: row.yeastGloripanText ?? "",
          yeastInstafermText: row.yeastInstafermText ?? "",
          yeastInstantSuccText: row.yeastInstantSuccText ?? "",
          yeastMauripanText: row.yeastMauripanText ?? "",
          yeastSafInstantText: row.yeastSafInstantText ?? "",
          yeastSantillanaText: row.yeastSantillanaText ?? "",
          yeastOtherDryText: row.yeastOtherDryText ?? "",
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
          businessTypeText: row.businessTypeText ?? row.notes ?? "",
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

      let merged = imported;
      try {
        const ids = await upsertEstablishmentsToSupabase(activeSheetId, tab, imported);
        merged = mergeEstablishmentIds(imported, ids);
        const rowNums = merged
          .map((r) => r.sheetRowNumber)
          .filter((n): n is number => typeof n === "number");
        await deleteEstablishmentsNotInSheetRows(activeSheetId, tab, rowNums);
      } catch (e) {
        console.warn("Supabase (tras importar Sheets):", e);
      }

      // Prevent immediate write-back after loading data from Sheets.
      shouldPushChanges.current = false;
      setEstablishments(merged);
      setConnectionStatus("connected");
      updateSyncTime();
      toast.success(`${merged.length} establecimientos sincronizados desde Google Sheets`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Error al importar";
      toast.error(msg);
      setConnectionStatus("error");
      console.error("Import error:", err);
    } finally {
      setIsSyncing(false);
    }
    };

    const p = run();
    importInFlightRef.current = p;
    try {
      await p;
    } finally {
      importInFlightRef.current = null;
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
        sheetRowNumber,
        recordDate,
        listaNombre,
        name,
        locality,
        facadePhotoUrl,
        city,
        localizedStatus,
        localizedBy,
        contentStatus,
        contentStateBR,
        phoneStatus,
        flourTotalText,
        bakeryQtyText,
        pastryQtyText,
        flourUnitBE,
        levapanText,
        fleischmanText,
        levasafText,
        otherYeastText,
        yeastAngelText,
        yeastPanificadorText,
        yeastFermipanText,
        yeastGloripanText,
        yeastInstafermText,
        yeastInstantSuccText,
        yeastMauripanText,
        yeastSafInstantText,
        yeastSantillanaText,
        yeastOtherDryText,
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
        businessTypeText,
      }) => ({
        sheetRowNumber,
        recordDate,
        listaNombre,
        name,
        locality,
        facadePhotoUrl,
        city,
        localizedStatus,
        localizedBy,
        contentStatus,
        contentStateBR,
        phoneStatus,
        flourTotalText,
        bakeryQtyText,
        pastryQtyText,
        flourUnitBE,
        levapanText,
        fleischmanText,
        levasafText,
        otherYeastText,
        yeastAngelText,
        yeastPanificadorText,
        yeastFermipanText,
        yeastGloripanText,
        yeastInstafermText,
        yeastInstantSuccText,
        yeastMauripanText,
        yeastSafInstantText,
        yeastSantillanaText,
        yeastOtherDryText,
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
        businessTypeText,
      }));

      const writeBody: Record<string, unknown> = {
        action: "write",
        sheetId: connectedSheetId,
        data: rows,
      };
      if (connectedSheetTab.trim()) writeBody.sheetTab = connectedSheetTab.trim();

      await invokeGoogleSheets(writeBody);

      try {
        await upsertEstablishmentsToSupabase(connectedSheetId, connectedSheetTab.trim(), source);
      } catch (e) {
        console.warn("Supabase (tras exportar a Sheets):", e);
      }

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

  const importFromSheetsRef = useRef(importFromSheets);
  importFromSheetsRef.current = importFromSheets;
  const exportToSheetsRef = useRef(exportToSheets);
  exportToSheetsRef.current = exportToSheets;

  const saveToSheets = useCallback(async (rowsOverride?: Establishment[]) => {
    await exportToSheets(false, rowsOverride);
  }, [exportToSheets]);

  const connectToSheet = useCallback(async (sheetId: string, sheetTab?: string) => {
    const tabToUse = sheetTab !== undefined ? sheetTab.trim() : connectedSheetTab.trim();
    sheetImportHandledRef.current = `${sheetId.trim()}|${tabToUse}`;
    setConnectedSheetId(sheetId);
    if (sheetTab !== undefined) {
      setConnectedSheetTab(sheetTab);
    }
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

  // Carga rápida desde Supabase; solo importa desde Sheets al abrir si no hay caché en BD.
  useEffect(() => {
    let cancelled = false;
    const sheetId = connectedSheetId.trim();
    if (!sheetId) {
      setEstablishments([]);
      sheetImportHandledRef.current = "";
      return;
    }
    const tab = connectedSheetTab.trim();
    const sheetKey = `${sheetId}|${tab}`;

    (async () => {
      const fromDb = await fetchEstablishmentsFromSupabase(sheetId, tab);
      if (cancelled) return;
      if (fromDb.length > 0) {
        shouldPushChanges.current = false;
        setEstablishments(fromDb);
        setConnectionStatus("connected");
        sheetImportHandledRef.current = sheetKey;
      } else if (autoSync) {
        if (sheetImportHandledRef.current === sheetKey) return;
        sheetImportHandledRef.current = sheetKey;
        await importFromSheetsRef.current();
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [connectedSheetId, connectedSheetTab, autoSync]);

  // Hourly sync: refs keep the interval stable so edits to establishments
  // (which recreate exportToSheets) do not reset the timer.
  useEffect(() => {
    if (!autoSync || !connectedSheetId) return;

    const runSync = () => {
      if (shouldPushChanges.current) {
        shouldPushChanges.current = false;
        void exportToSheetsRef.current(true);
        return;
      }
      void importFromSheetsRef.current();
    };

    const interval = setInterval(runSync, HOURLY_SYNC_MS);
    return () => clearInterval(interval);
  }, [autoSync, connectedSheetId]);

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

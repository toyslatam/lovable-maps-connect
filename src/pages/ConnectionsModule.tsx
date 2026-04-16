import { useState, useEffect, useMemo } from "react";
import { useData } from "@/context/DataContext";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  RefreshCw,
  CheckCircle2,
  XCircle,
  Loader2,
  FileSpreadsheet,
  Clock,
} from "lucide-react";
import { toast } from "sonner";

const extractSheetId = (value: string) => {
  const trimmed = value.trim();
  const urlMatch = trimmed.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  if (urlMatch?.[1]) return urlMatch[1];
  return trimmed;
};

const SHEET_TABS_CACHE_KEY = "geotrack_sheet_tabs_cache";

function readTabsCache(sheetId: string): string[] | null {
  try {
    const raw = localStorage.getItem(SHEET_TABS_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { sheetId?: string; tabs?: unknown };
    if (parsed.sheetId !== sheetId || !Array.isArray(parsed.tabs)) return null;
    return parsed.tabs.filter((t): t is string => typeof t === "string" && t.length > 0);
  } catch {
    return null;
  }
}

function writeTabsCache(sheetId: string, tabs: string[]) {
  try {
    localStorage.setItem(SHEET_TABS_CACHE_KEY, JSON.stringify({ sheetId, tabs }));
  } catch {
    /* ignore quota */
  }
}

const ConnectionsModule = () => {
  const {
    connectToSheet,
    syncNow,
    loadSheetTabs,
    isSyncing,
    lastSyncTime,
    autoSync,
    setAutoSync,
    connectionStatus,
    testConnection,
    connectedSheetId,
    connectedSheetTab,
    setConnectedSheetTab,
  } = useData();
  const [testing, setTesting] = useState(false);
  const [sheetInput, setSheetInput] = useState(connectedSheetId);
  const [connecting, setConnecting] = useState(false);
  const [loadingTabs, setLoadingTabs] = useState(false);
  const [tabOptions, setTabOptions] = useState<string[]>([]);

  const tabOptionsForSelect = useMemo(() => {
    if (!connectedSheetTab || tabOptions.includes(connectedSheetTab)) {
      return tabOptions;
    }
    return [connectedSheetTab, ...tabOptions];
  }, [tabOptions, connectedSheetTab]);

  useEffect(() => {
    setSheetInput(connectedSheetId);
  }, [connectedSheetId]);

  // Restaurar pestañas desde caché y refrescar en segundo plano cuando ya hay libro guardado.
  useEffect(() => {
    const id = connectedSheetId.trim();
    if (!id) {
      setTabOptions([]);
      return;
    }

    const cached = readTabsCache(id);
    if (cached?.length) {
      setTabOptions(cached);
    }

    let cancelled = false;
    (async () => {
      try {
        const titles = await loadSheetTabs(id);
        if (cancelled || !titles.length) return;
        setTabOptions(titles);
        writeTabsCache(id, titles);
      } catch {
        // Mantener caché / lista vacía; el usuario puede usar "Cargar pestañas".
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [connectedSheetId, loadSheetTabs]);

  const handleTestConnection = async () => {
    setTesting(true);
    try {
      await testConnection();
    } finally {
      setTesting(false);
    }
  };

  const handleConnect = async () => {
    const parsedId = extractSheetId(sheetInput);
    if (!parsedId) return;
    setConnecting(true);
    try {
      await connectToSheet(parsedId, connectedSheetTab);
    } finally {
      setConnecting(false);
    }
  };

  const handleLoadTabs = async () => {
    const parsedId = extractSheetId(sheetInput);
    if (!parsedId) return;
    setLoadingTabs(true);
    try {
      const titles = await loadSheetTabs(parsedId);
      setTabOptions(titles);
      writeTabsCache(parsedId, titles);
      if (titles.length === 0) {
        toast.warning("No se encontraron pestañas en este libro");
        return;
      }
      if (!connectedSheetTab || !titles.includes(connectedSheetTab)) {
        setConnectedSheetTab(titles[0]);
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Error al cargar pestañas";
      toast.error(msg);
    } finally {
      setLoadingTabs(false);
    }
  };

  const statusColor = connectionStatus === "connected"
    ? "bg-emerald-500/15 text-emerald-700 border-emerald-200"
    : connectionStatus === "error"
    ? "bg-destructive/15 text-destructive border-destructive/30"
    : "bg-muted text-muted-foreground border-border";

  const statusLabel = connectionStatus === "connected"
    ? "Conectado"
    : connectionStatus === "error"
    ? "Error"
    : "Sin verificar";

  return (
    <div className="space-y-6">
      <div className="reveal-up">
        <h1 className="text-2xl font-bold">Conexiones</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Administra tus integraciones externas
        </p>
      </div>

      <Card className="reveal-up reveal-up-delay-1">
        <CardHeader className="pb-4">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-emerald-500/10 flex items-center justify-center">
                <FileSpreadsheet className="w-5 h-5 text-emerald-600" />
              </div>
              <div>
                <CardTitle className="text-lg">Google Sheets</CardTitle>
                <CardDescription>
                  Sincronización automática de establecimientos
                </CardDescription>
              </div>
            </div>
            <Badge variant="outline" className={statusColor}>
              {connectionStatus === "connected" ? (
                <CheckCircle2 className="w-3 h-3 mr-1" />
              ) : connectionStatus === "error" ? (
                <XCircle className="w-3 h-3 mr-1" />
              ) : null}
              {statusLabel}
            </Badge>
          </div>
        </CardHeader>

        <CardContent className="space-y-6">
          {/* Auto-sync toggle */}
          <div className="flex items-center justify-between rounded-lg border p-4">
            <div className="space-y-0.5">
              <p className="text-sm font-medium">Sincronización automática</p>
              <p className="text-xs text-muted-foreground">
                Con el interruptor activo, la app intenta sincronizar con la hoja cada 1 hora
                (importar cambios o enviar ediciones locales pendientes), para no saturar la API.
              </p>
            </div>
            <Switch
              checked={autoSync}
              onCheckedChange={setAutoSync}
            />
          </div>

          <div className="space-y-2">
            <p className="text-sm font-medium">Libro de Google Sheets</p>
            <p className="text-xs text-muted-foreground">
              Pega el URL del libro o el ID (spreadsheetId). Luego elige la pestaña donde están los datos.
            </p>
            <div className="flex flex-col sm:flex-row gap-2">
              <Input
                value={sheetInput}
                onChange={(e) => setSheetInput(e.target.value)}
                placeholder="https://docs.google.com/spreadsheets/d/... o ID"
              />
              <Button
                type="button"
                variant="secondary"
                onClick={handleLoadTabs}
                disabled={!sheetInput.trim() || loadingTabs || isSyncing}
                className="gap-2 shrink-0"
              >
                {loadingTabs ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                Cargar pestañas
              </Button>
              <Button
                type="button"
                onClick={handleConnect}
                disabled={!sheetInput.trim() || connecting || isSyncing}
                className="gap-2 shrink-0"
              >
                {(connecting || isSyncing) ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileSpreadsheet className="w-4 h-4" />}
                Conectar
              </Button>
            </div>
          </div>

          <div className="space-y-2">
            <Label className="text-sm font-medium">Pestaña del libro (hoja)</Label>
            <p className="text-xs text-muted-foreground">
              Si ya conectaste antes, las pestañas se recuerdan en este navegador o se recargan solas.
              Elige en qué pestaña están las columnas A-G. Si no eliges, se usa la primera hoja del libro.
            </p>
            <Select
              value={connectedSheetTab || "__first__"}
              onValueChange={(v) => setConnectedSheetTab(v === "__first__" ? "" : v)}
            >
              <SelectTrigger className="w-full sm:max-w-md">
                <SelectValue
                  placeholder={
                    tabOptionsForSelect.length
                      ? "Elige una pestaña"
                      : "Sin pestañas aún — usa Cargar pestañas o conecta el libro"
                  }
                />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__first__">Primera hoja (predeterminado)</SelectItem>
                {tabOptionsForSelect.map((t) => (
                  <SelectItem key={t} value={t}>
                    {t}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Last sync */}
          {lastSyncTime && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Clock className="w-3.5 h-3.5" />
              <span>Última sincronización: {lastSyncTime}</span>
            </div>
          )}

          {/* Actions */}
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleTestConnection}
              disabled={testing || !connectedSheetId}
              className="gap-2"
            >
              {testing ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <RefreshCw className="w-4 h-4" />
              )}
              Probar conexión
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={syncNow}
              disabled={isSyncing || !connectedSheetId}
              className="gap-2"
            >
              {isSyncing ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
              Sincronizar ahora
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default ConnectionsModule;

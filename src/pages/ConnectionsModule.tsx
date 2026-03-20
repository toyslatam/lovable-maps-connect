import { useState, useEffect } from "react";
import { useData } from "@/context/DataContext";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
  RefreshCw,
  CheckCircle2,
  XCircle,
  Loader2,
  FileSpreadsheet,
  Clock,
} from "lucide-react";

const ConnectionsModule = () => {
  const { importFromSheets, exportToSheets, isSyncing, lastSyncTime, autoSync, setAutoSync, connectionStatus, testConnection } = useData();
  const [testing, setTesting] = useState(false);

  const handleTestConnection = async () => {
    setTesting(true);
    await testConnection();
    setTesting(false);
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
                Importar datos de Google Sheets al iniciar la aplicación
              </p>
            </div>
            <Switch
              checked={autoSync}
              onCheckedChange={setAutoSync}
            />
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
              disabled={testing}
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
              onClick={importFromSheets}
              disabled={isSyncing}
              className="gap-2"
            >
              {isSyncing ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
              Importar ahora
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={exportToSheets}
              disabled={isSyncing}
              className="gap-2"
            >
              {isSyncing ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
              Exportar ahora
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default ConnectionsModule;
